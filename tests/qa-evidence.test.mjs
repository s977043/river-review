// Deterministic QA evidence validator (src/lib/qa-evidence.mjs) against the contract in
// docs/development/qa-evidence-contract.md. Fixtures under tests/fixtures/qa-evidence/ patch
// base.json; each file under cases/ carries one failure shape and its exact expected result.
//
// The module reads artifacts only where the open itself refuses symlinks (macOS 11+). The fixture
// judgements therefore feed `judgeQaEvidence` with hashes the test computes, so stage 5 runs on
// every platform; the reading path is tested separately with platform-specific expectations.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  linkSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  truncateSync,
  writeFileSync,
} from 'node:fs';
import { open } from 'node:fs/promises';
import { release, tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  AC_REASON_ORDER,
  PRODUCTION_INDEPENDENCE,
  QA_EVIDENCE_LIMITS,
  QA_REASON_CODES,
  auditQaEvidence,
  checkQaEvidence,
  determineAcPopulation,
  evaluateQaEvidence,
  judgeQaEvidence,
  resolveQaArtifacts,
} from '../src/lib/qa-evidence.mjs';

// Platforms where the module reads artifacts at all (§3.5). Elsewhere every artifact is unresolved.
const CAN_READ_ARTIFACTS = process.platform === 'darwin' && Number.parseInt(release(), 10) >= 20;

const FIXTURES = new URL('./fixtures/qa-evidence/', import.meta.url);
const CASE_COUNT = 80;
const VALID_CASE_COUNT = 7;
const REASON_CODE_ROW_COUNT = 52;

const readJson = (url) => JSON.parse(readFileSync(url, 'utf8'));
const BASE = readJson(new URL('base.json', FIXTURES));
const clone = (value) => structuredClone(value);

function applyPatch(target, ops = []) {
  for (const { op, path, value } of ops) {
    const segments = path.slice(1).split('/');
    const key = segments.pop();
    const parent = segments.reduce((node, segment) => node[segment], target);
    if (op === 'set') parent[key] = clone(value);
    else if (Array.isArray(parent)) parent.splice(Number(key), 1);
    else delete parent[key];
  }
  return target;
}

function rawEvidence(fixture, evidence) {
  const raw = fixture.raw;
  if (!raw) return JSON.stringify(evidence);
  if (raw.kind === 'text') return raw.text;
  if (raw.kind === 'nested') return `${'['.repeat(raw.depth)}${']'.repeat(raw.depth)}`;
  const text = JSON.stringify(evidence);
  return text + ' '.repeat(raw.bytes - Buffer.byteLength(text));
}

function buildInput(fixture) {
  const evidence = applyPatch(clone(BASE.evidence), fixture.evidencePatch);
  const context = applyPatch(clone(BASE.context), fixture.contextPatch);
  const roots = Object.fromEntries(
    Object.entries(context.roots).map(([name, dir]) => [
      name,
      fileURLToPath(new URL(dir, FIXTURES)),
    ])
  );
  return {
    evidence: rawEvidence(fixture, evidence),
    population: context.population,
    observed: context.observed,
    roots,
    independence: context.independence,
    trustedSourceIds: context.trustedSourceIds,
    ...(context.limits ? { limits: context.limits } : {}),
    ...(context.redaction === 'fail'
      ? {
          redact: () => {
            throw new Error('redactor failure');
          },
        }
      : {}),
  };
}

// Plain hashing of the fixture files, standing in for the platform-dependent reader.
function fixtureResolutions(refs = [], roots, limits = QA_EVIDENCE_LIMITS) {
  const resolutions = new Map();
  for (const ref of refs) {
    const id = ref.id.trim();
    let content = null;
    try {
      content = readFileSync(join(roots[ref.root], ref.path));
    } catch {
      content = null;
    }
    if (!roots[ref.root] || content === null) resolutions.set(id, { state: 'unresolved' });
    else if (content.length > limits.artifactBytes) resolutions.set(id, { state: 'too-large' });
    else {
      const sha256 = createHash('sha256').update(content).digest('hex');
      resolutions.set(id, { state: 'ok', sha256, size: content.length });
    }
  }
  return resolutions;
}

// Stages 0-5 with the fixture hashes in place of the reader.
function judgeFixture(input) {
  const population = determineAcPopulation(input.population);
  const redact = input.redact ? { redact: input.redact } : {};
  const checked = checkQaEvidence(input.evidence, { population, ...redact });
  return judgeQaEvidence({
    checked,
    population,
    observed: input.observed,
    artifactResolutions: checked.accepted
      ? fixtureResolutions(checked.evidence.artifacts?.refs, input.roots, input.limits)
      : new Map(),
    independence: input.independence,
    trustedSourceIds: input.trustedSourceIds,
    ...redact,
  });
}

function summarize(result) {
  if (!result.accepted) {
    return {
      rejected: { stage: result.stage, reasons: result.rejectReasons },
      projection: result.projection,
    };
  }
  const criteria = {};
  for (const criterion of result.criteria) {
    const entry = { reasonCodes: criterion.reasonCodes, records: criterion.records };
    if (criterion.subcases.length) {
      entry.subcases = Object.fromEntries(
        criterion.subcases.map((s) => [s.id, { reasonCodes: s.reasonCodes, records: s.records }])
      );
    }
    criteria[criterion.acId] = entry;
  }
  return { globalReasonCodes: result.globalReasonCodes, criteria, projection: result.projection };
}

function emittedCodes(result) {
  const codes = new Set([...result.rejectReasons, ...result.globalReasonCodes]);
  for (const criterion of result.criteria) {
    [...criterion.reasonCodes, ...criterion.records].forEach((code) => codes.add(code));
    for (const subcase of criterion.subcases) {
      [...subcase.reasonCodes, ...subcase.records].forEach((code) => codes.add(code));
    }
  }
  return codes;
}

const listFixtures = (dir) =>
  readdirSync(new URL(`${dir}/`, FIXTURES))
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((file) => ({
      name: file.replace(/\.json$/, ''),
      fixture: readJson(new URL(`${dir}/${file}`, FIXTURES)),
    }));
const CASES = listFixtures('cases');
const VALID_CASES = listFixtures('valid');

function contractTable() {
  const text = readFileSync(
    new URL('../docs/development/qa-evidence-contract.md', import.meta.url),
    'utf8'
  );
  const section = text.slice(text.indexOf('## 12. reasonCode 一覧'));
  const treatments = {
    全体を拒否: 'reject',
    '全 AC を数えない': 'uncount-all',
    記録のみ: 'record',
  };
  const rows = [...section.matchAll(/^\| `(QA_[A-Z_]+)`\s*\| ([^|]+?)\s*\|/gm)];
  return rows.map(([, code, label]) => [
    code,
    treatments[label] ?? (label.startsWith('数えない') ? 'uncount' : `unmapped:${label}`),
  ]);
}

describe('reason code vocabulary', () => {
  test('the module table equals §12 of the contract, row for row', () => {
    const rows = contractTable();
    assert.equal(rows.length, REASON_CODE_ROW_COUNT);
    assert.deepEqual(Object.fromEntries(rows), { ...QA_REASON_CODES });
    assert.equal(Object.keys(QA_REASON_CODES).length, REASON_CODE_ROW_COUNT);
  });

  test('AC_REASON_ORDER lists exactly the codes that stop an AC from being counted', () => {
    const counting = Object.keys(QA_REASON_CODES).filter((code) =>
      ['uncount', 'uncount-all'].includes(QA_REASON_CODES[code])
    );
    assert.equal(AC_REASON_ORDER.length, new Set(AC_REASON_ORDER).size);
    assert.deepEqual([...AC_REASON_ORDER].sort(), counting.sort());
  });
});

describe('negative fixtures (CASES)', () => {
  test('fixture count is pinned', () => assert.equal(CASES.length, CASE_COUNT));

  for (const { name, fixture } of CASES) {
    test(`${name}: ${fixture.description}`, () => {
      assert.deepEqual(summarize(judgeFixture(buildInput(fixture))), fixture.expect);
    });
  }

  test('the codes the fixtures emit equal §12 in both directions', () => {
    const emitted = new Set();
    for (const { fixture } of CASES) {
      emittedCodes(judgeFixture(buildInput(fixture))).forEach((code) => emitted.add(code));
    }
    const table = new Set(contractTable().map(([code]) => code));
    assert.deepEqual(
      [...table].filter((code) => !emitted.has(code)),
      [],
      'never emitted'
    );
    assert.deepEqual(
      [...emitted].filter((code) => !table.has(code)),
      [],
      'not in §12'
    );
  });
});

describe('positive fixtures (VALID_CASES)', () => {
  test('fixture count is pinned', () => assert.equal(VALID_CASES.length, VALID_CASE_COUNT));

  for (const { name, fixture } of VALID_CASES) {
    test(`${name}: ${fixture.description}`, () => {
      const result = judgeFixture(buildInput(fixture));
      assert.equal(result.accepted, true);
      assert.deepEqual(result.globalReasonCodes, []);
      assert.deepEqual(
        result.criteria.map(({ acId, verified, reasonCodes, records }) => ({
          acId,
          verified,
          reasonCodes,
          records,
        })),
        [{ acId: 'AC-1', verified: true, reasonCodes: [], records: [] }]
      );
      assert.deepEqual(result.projection, {
        total: 1,
        verified: 1,
        unverified: 0,
      });
    });
  }
});

describe('evaluateQaEvidence reads artifacts through resolveQaArtifacts', () => {
  const fixtures = [...VALID_CASES, ...CASES];

  test(
    'where the platform can read, the result equals the fixture judgement',
    { skip: !CAN_READ_ARTIFACTS },
    async () => {
      for (const { name, fixture } of fixtures) {
        const input = buildInput(fixture);
        assert.deepEqual(await evaluateQaEvidence(input), judgeFixture(input), name);
      }
    }
  );

  test(
    'where it cannot, every artifact is unresolved and nothing is verified',
    { skip: CAN_READ_ARTIFACTS },
    async () => {
      for (const { name, fixture } of fixtures) {
        const input = buildInput(fixture);
        const result = await evaluateQaEvidence(input);
        assert.equal(result.accepted, judgeFixture(input).accepted, name);
        assert.ok(
          result.artifacts.every((artifact) => artifact.state === 'unresolved'),
          name
        );
        assert.equal(result.criteria.filter((criterion) => criterion.verified).length, 0, name);
      }
    }
  );
});

describe('independence and the production path (§4.1, §5 condition 8, §9)', () => {
  const basic = () => buildInput(VALID_CASES.find(({ name }) => name === 'valid-basic').fixture);
  const CONDITION_6 = [
    'QA_TARGET_EXPECTED_SOURCE_MISSING',
    'QA_TARGET_EXPECTED_SOURCE_UNRESOLVED',
    'QA_TARGET_EXPECTED_DERIVED',
    'QA_TARGET_EXPECTED_REPRODUCED',
    'QA_TARGET_EXPECTED_SOURCE_UNTRUSTED',
  ];

  test('the production value is unknown', () => assert.equal(PRODUCTION_INDEPENDENCE, 'unknown'));

  test('injecting known verifies the base case', () => {
    assert.equal(judgeFixture({ ...basic(), independence: 'known' }).criteria[0].verified, true);
  });

  test('judgeQaEvidence defaults to unknown when nothing is injected', () => {
    const { independence, ...input } = basic();
    assert.equal(independence, 'known');
    assert.deepEqual(judgeFixture(input).criteria[0].reasonCodes, ['QA_INDEPENDENCE_UNKNOWN']);
  });

  test('evaluateQaEvidence defaults to unknown when nothing is injected', async () => {
    const { independence, ...input } = basic();
    assert.equal(independence, 'known');
    const { reasonCodes } = (await evaluateQaEvidence(input)).criteria[0];
    if (CAN_READ_ARTIFACTS) assert.deepEqual(reasonCodes, ['QA_INDEPENDENCE_UNKNOWN']);
    else assert.ok(reasonCodes.includes('QA_INDEPENDENCE_UNKNOWN'));
  });

  test('auditQaEvidence ignores injected independence, trusted sources and population trust', async () => {
    const input = basic();
    assert.equal(input.population.trusted, true);
    const result = await auditQaEvidence(input);
    assert.deepEqual(result.globalReasonCodes, ['QA_AC_POPULATION_UNKNOWN']);
    assert.equal(result.projection, null);
    assert.deepEqual(
      result.criteria[0].reasonCodes,
      CAN_READ_ARTIFACTS
        ? [
            'QA_AC_POPULATION_UNKNOWN',
            'QA_TARGET_EXPECTED_SOURCE_UNTRUSTED',
            'QA_INDEPENDENCE_UNKNOWN',
          ]
        : [
            'QA_AC_POPULATION_UNKNOWN',
            'QA_ARTIFACT_UNRESOLVED',
            'QA_TARGET_EXPECTED_SOURCE_UNRESOLVED',
            'QA_INDEPENDENCE_UNKNOWN',
          ]
    );
  });

  test('the production path verifies 0 ACs and keeps conditions 6 and 8 unmet for every fixture', async () => {
    for (const { name, fixture } of [...VALID_CASES, ...CASES]) {
      const result = await auditQaEvidence(buildInput(fixture));
      assert.equal(result.projection === null || result.projection.verified === 0, true, name);
      for (const criterion of result.criteria) {
        const label = `${name} ${criterion.acId}`;
        assert.equal(criterion.verified, false, label);
        assert.ok(criterion.reasonCodes.includes('QA_AC_POPULATION_UNKNOWN'), label);
        assert.ok(criterion.reasonCodes.includes('QA_INDEPENDENCE_UNKNOWN'), label);
        assert.ok(
          CONDITION_6.some((code) => criterion.reasonCodes.includes(code)),
          label
        );
      }
    }
  });
});

describe('subcase aggregation (§3.4.1: FAIL → NOT_RUN → SKIP → PASS)', () => {
  const STATUSES = ['FAIL', 'NOT_RUN', 'SKIP', 'PASS'];
  const subcase = (id, status) => {
    if (status === 'PASS' || status === 'FAIL') {
      const pass = status === 'PASS';
      return {
        id,
        status,
        basis: 'verified',
        attempts: [
          {
            startedAt: '2026-11-20T00:00:00Z',
            status,
            logRef: pass ? 'log-pass' : 'log-fail',
            assertions: { total: 3, passed: pass ? 3 : 2 },
            command: 'npm test',
            exitCode: pass ? 0 : 1,
          },
        ],
      };
    }
    return { id, status, basis: 'verified', notRunReason: 'out-of-scope' };
  };
  const combos = [];
  for (const first of STATUSES) {
    combos.push([first]);
    for (const second of STATUSES) combos.push([first, second]);
  }

  test('every combination of one or two subcases against every AC status', () => {
    let checked = 0;
    for (const statuses of combos) {
      const worst = STATUSES.find((status) => statuses.includes(status));
      for (const acStatus of STATUSES) {
        const result = judgeFixture(
          buildInput({
            evidencePatch: [
              { op: 'delete', path: '/verification/0/basis' },
              { op: 'delete', path: '/verification/0/attempts' },
              { op: 'set', path: '/verification/0/status', value: acStatus },
              {
                op: 'set',
                path: '/verification/0/subcases',
                value: statuses.map((status, index) => subcase(`S${index + 1}`, status)),
              },
            ],
          })
        );
        const label = `${statuses.join('+')} as ${acStatus}`;
        if (acStatus === worst) {
          assert.equal(result.accepted, true, label);
          assert.equal(result.criteria[0].verified, worst === 'PASS', label);
        } else {
          assert.deepEqual(
            result.rejectReasons,
            ['QA_VERIFICATION_SUBCASE_STATUS_MISMATCH'],
            label
          );
        }
        checked += 1;
      }
    }
    assert.equal(checked, 80);
  });
});

describe('document limits (§2.1)', () => {
  test('a document of exactly 1 MiB is accepted', () => {
    const fixture = {
      raw: { kind: 'padded', bytes: QA_EVIDENCE_LIMITS.evidenceBytes },
    };
    assert.equal(judgeFixture(buildInput(fixture)).accepted, true);
  });

  test('nesting depth 16 passes the depth check and reaches the schema', () => {
    const result = judgeFixture(buildInput({ raw: { kind: 'nested', depth: 16 } }));
    assert.deepEqual(result.rejectReasons, ['QA_EVIDENCE_MALFORMED']);
  });
});

describe('redaction and output (§3.5, §7)', () => {
  const token = `ghp_${'A'.repeat(36)}`;

  test('outputs carry only the redacted copy; comparisons use the original value', () => {
    const result = judgeFixture(
      buildInput({
        evidencePatch: [
          {
            op: 'set',
            path: '/verification/0/attempts/0/command',
            value: `npm test --token=${token}`,
          },
          {
            op: 'set',
            path: '/target/acceptanceCriteria/0/expected/value',
            value: `header ${token}`,
          },
        ],
        contextPatch: [
          {
            op: 'set',
            path: '/population/criteria/0/expected',
            value: `header ${token}`,
          },
          {
            op: 'set',
            path: '/observed/changedFiles',
            value: [`fixtures/${token}.json`],
          },
        ],
      })
    );
    assert.equal(result.criteria[0].verified, true);
    assert.equal(result.redaction.replaced, 2);
    assert.equal(result.revision.changedFiles.length, 1);
    assert.equal(JSON.stringify(result).includes(token), false);
  });

  test('no restricted artifact path or size appears anywhere in the result', async () => {
    const input = buildInput({
      evidencePatch: [
        { op: 'set', path: '/artifacts/refs/4/sensitivity', value: 'public' },
        {
          op: 'set',
          path: '/artifacts/refs/0/sensitivity',
          value: 'restricted',
        },
      ],
    });
    const restrictedPaths = ['logs/pass.txt', 'logs/fail.txt', 'logs/control.txt', 'spec/ac-1.txt'];
    for (const result of [judgeFixture(input), await evaluateQaEvidence(input)]) {
      const strings = [];
      const walk = (value) => {
        if (typeof value === 'string') strings.push(value);
        else if (value && typeof value === 'object') Object.values(value).forEach(walk);
      };
      walk(result);
      for (const path of restrictedPaths) {
        assert.equal(
          strings.some((text) => text.includes(path)),
          false,
          path
        );
      }
      const restricted = result.artifacts.filter((artifact) => artifact.id !== 'ci-pass');
      assert.equal(restricted.length, 4);
      for (const artifact of restricted) assert.deepEqual(Object.keys(artifact), ['id', 'state']);
      const shown = result.artifacts.find((artifact) => artifact.id === 'ci-pass');
      assert.equal(shown.path, 'ci/pass.txt');
    }
  });

  test('a public path is output after redaction', () => {
    const result = judgeFixture(
      buildInput({
        evidencePatch: [
          { op: 'set', path: '/artifacts/refs/4/sensitivity', value: 'public' },
          {
            op: 'set',
            path: '/artifacts/refs/4/path',
            value: `ci/${token}.txt`,
          },
        ],
      })
    );
    const shown = result.artifacts.find((artifact) => artifact.id === 'ci-pass');
    assert.match(shown.path, /^ci\/<REDACTED:/);
    assert.equal(JSON.stringify(result).includes(token), false);
  });
});

describe('artifact read rules (§3.5)', () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'qa-evidence-')));
  after(() => rmSync(dir, { recursive: true, force: true }));
  const repo = join(dir, 'repo');
  const outside = join(dir, 'outside');
  mkdirSync(join(repo, 'logs'), { recursive: true });
  mkdirSync(join(repo, '.git'));
  mkdirSync(outside);
  writeFileSync(join(repo, 'logs', 'a.txt'), 'inside');
  writeFileSync(join(repo, '.git', 'config'), 'git');
  writeFileSync(join(outside, 'a.txt'), 'outside');
  const sha = (text) => createHash('sha256').update(text).digest('hex');
  const UNRESOLVED = { state: 'unresolved' };
  // Expected state where this platform reads at all; elsewhere every artifact is unresolved.
  const readable = (expected) => (CAN_READ_ARTIFACTS ? expected : UNRESOLVED);
  const resolveOne = async (path, options = {}) => {
    const resolutions = await resolveQaArtifacts([{ id: 'x', root: 'repository', path }], {
      roots: { repository: repo },
      ...options,
    });
    return resolutions.get('x');
  };
  const spyOpen = () => {
    const calls = [];
    const openFile = (path, flags) => {
      calls.push(path);
      return open(path, flags);
    };
    return { calls, openFile };
  };

  test('a regular file inside the root is hashed from the opened descriptor', async () => {
    assert.deepEqual(
      await resolveOne('logs/a.txt'),
      readable({ state: 'ok', sha256: sha('inside'), size: 6 })
    );
  });

  test('a symlink as the final component is refused', async () => {
    symlinkSync(join(repo, 'logs', 'a.txt'), join(repo, 'logs', 'final-link.txt'));
    assert.deepEqual(await resolveOne('logs/final-link.txt'), UNRESOLVED);
  });

  test('a symlink as an intermediate component is refused even when it stays inside the root', async () => {
    symlinkSync(join(repo, 'logs'), join(repo, 'logs-link'));
    assert.deepEqual(await resolveOne('logs-link/a.txt'), UNRESOLVED);
  });

  test('a directory swapped for a symlink right before the open is refused', async () => {
    mkdirSync(join(repo, 'race'));
    writeFileSync(join(repo, 'race', 'a.txt'), 'inside');
    assert.equal((await resolveOne('race/a.txt')).state, readable({ state: 'ok' }).state);
    const swap = () => {
      renameSync(join(repo, 'race'), join(repo, 'race-moved'));
      symlinkSync(outside, join(repo, 'race'));
    };
    assert.deepEqual(await resolveOne('race/a.txt', { onBeforeOpen: swap }), UNRESOLVED);
  });

  test('refused paths never reach the open', async () => {
    const { calls, openFile } = spyOpen();
    assert.deepEqual(await resolveOne('logs-link/a.txt', { openFile }), UNRESOLVED);
    assert.deepEqual(await resolveOne('logs/final-link.txt', { openFile }), UNRESOLVED);
    assert.deepEqual(await resolveOne('.git/config', { openFile }), UNRESOLVED);
    assert.deepEqual(await resolveOne('logs/a.txt', { openFile, platform: 'linux' }), UNRESOLVED);
    assert.deepEqual(calls, []);
  });

  test('the open spy sees a readable file, so the empty result above is not vacuous', async () => {
    const { calls, openFile } = spyOpen();
    await resolveOne('logs/a.txt', { openFile });
    assert.deepEqual(calls, CAN_READ_ARTIFACTS ? [join(repo, 'logs', 'a.txt')] : []);
  });

  test('a FIFO is refused without blocking', async () => {
    execFileSync('mkfifo', [join(repo, 'logs', 'fifo')]);
    assert.deepEqual(await resolveOne('logs/fifo'), UNRESOLVED);
  });

  test('a directory is refused', async () => {
    assert.deepEqual(await resolveOne('logs'), UNRESOLVED);
  });

  test('a hard link (link count 2) is refused under both names', async () => {
    writeFileSync(join(repo, 'logs', 'hard.txt'), 'hard');
    linkSync(join(repo, 'logs', 'hard.txt'), join(repo, 'logs', 'hard-2.txt'));
    assert.deepEqual(await resolveOne('logs/hard.txt'), UNRESOLVED);
    assert.deepEqual(await resolveOne('logs/hard-2.txt'), UNRESOLVED);
  });

  test('a file one byte over 100 MiB is too large and is not read', async () => {
    const path = join(repo, 'logs', 'big.bin');
    writeFileSync(path, '');
    truncateSync(path, QA_EVIDENCE_LIMITS.artifactBytes + 1);
    assert.deepEqual(await resolveOne('logs/big.bin'), readable({ state: 'too-large' }));
  });

  test('the total budget stops the artifact that would exceed it', async () => {
    writeFileSync(join(repo, 'logs', 'b.txt'), 'second');
    const resolutions = await resolveQaArtifacts(
      [
        { id: 'one', root: 'repository', path: 'logs/a.txt' },
        { id: 'two', root: 'repository', path: 'logs/b.txt' },
      ],
      {
        roots: { repository: repo },
        limits: { artifactBytes: 100, artifactTotalBytes: 10 },
      }
    );
    assert.equal(resolutions.get('one').state, readable({ state: 'ok' }).state);
    assert.deepEqual(resolutions.get('two'), readable({ state: 'too-large' }));
  });

  test('root: artifacts without a host directory is unresolved', async () => {
    const resolutions = await resolveQaArtifacts(
      [{ id: 'x', root: 'artifacts', path: 'logs/a.txt' }],
      { roots: { repository: repo } }
    );
    assert.deepEqual(resolutions.get('x'), UNRESOLVED);
  });
});
