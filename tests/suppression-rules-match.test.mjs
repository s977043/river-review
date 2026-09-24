// tests/suppression-rules-match.test.mjs
//
// #2202 Phase 2: a suppression issued under different project rules stops
// suppressing — opt-in via `config.memory.suppressionRequireRulesMatch`.
//
// What is pinned here (design: issue #2202 comment 5791695031):
//   1. No provenance is "undetermined", never "stale" (an entry without
//      rulesDigest keeps suppressing).
//   2. The comparison uses the entry's own digest version: absent → 'v1'
//      (unnormalized), 'v2' → normalized (CRLF / trailing whitespace ignored),
//      unknown → warned and not judged.
//   3. The verdict is a separate predicate; isSuppressionExpired is untouched.
//   4. Off by default, and off changes nothing — not the result, not the
//      warnings.
//
// Expected digests are derived here with node:crypto over hand-written text,
// never through computeRulesDigest, so a regression in the digest cannot make
// the expectations agree with it.

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import test, { describe } from 'node:test';

import { applySuppressions } from '../src/lib/suppression-apply.mjs';
import {
  createSuppression,
  evaluateSuppressionRulesMatch,
  formatRulesDigestMismatchWarning,
  formatUnknownRulesDigestAlgoWarning,
  isSuppressionExpired,
  resolveSuppressionProvenance,
} from '../src/lib/suppression.mjs';
import { loadMemory } from '../src/lib/riverbed-memory.mjs';
import { planLocalReview, runLocalReview } from '../src/lib/local-runner.mjs';
import { createTempMemory } from './helpers/memory.mjs';
import { compileSuppressionContextValidator } from './helpers/schema-validator.mjs';
import { createRepoWithSilentCatchChange } from './helpers/temp-repo.mjs';

const sha256 = (text) => crypto.createHash('sha256').update(text, 'utf8').digest('hex');

const ON = { memory: { suppressionRequireRulesMatch: true } };

// Issuance-time rules and their digests. The text carries trailing whitespace
// and CRLF on purpose, so its v1 and v2 digests differ.
const ISSUED_RULES = '- no silent catch  \r\n- prefer early return';
const ISSUED_V1 = sha256(ISSUED_RULES);
const ISSUED_V2 = sha256('- no silent catch\n- prefer early return');
const CHANGED_RULES = '- no silent catch\n- prefer early return\n- new rule';

let seq = 0;
function suppression(contextOverride = {}) {
  seq += 1;
  const fp = seq.toString(16).padStart(16, '0');
  return {
    id: `suppression-${fp}`,
    type: 'suppression',
    content: 'rationale',
    metadata: { createdAt: '2026-09-01T00:00:00Z', author: 't', tags: ['suppression'] },
    context: { scope: 'file', active: true, fingerprint: fp, ...contextOverride },
  };
}

function findingFor(s) {
  return { id: `f-${s.id}`, fingerprint: s.context.fingerprint, severity: 'minor', file: 'a.js' };
}

function run(suppressions, opts) {
  const warnings = [];
  const r = applySuppressions(
    suppressions.map(findingFor),
    { suppressions },
    { ...opts, warn: (m) => warnings.push(m) }
  );
  return { ...r, warnings };
}

// ---------------------------------------------------------------------------
// Principle 4: off by default, and off changes nothing
// ---------------------------------------------------------------------------

describe('opt-in off: the pre-Phase-2 gate, bit for bit', () => {
  // Every kind of entry the gate distinguishes when on, against rules that
  // match none of them.
  const entries = () => [
    suppression({ rulesDigest: ISSUED_V2, rulesDigestAlgo: 'v2' }),
    suppression({ rulesDigest: ISSUED_V1 }),
    suppression({ rulesDigest: ISSUED_V1, rulesDigestAlgo: 'v1' }),
    suppression({ rulesDigest: 'f'.repeat(64), rulesDigestAlgo: 'v9' }),
    suppression({}),
  ];

  for (const [name, config] of [
    ['no config', undefined],
    ['config without memory', {}],
    ['memory without the key', { memory: {} }],
    ['key false', { memory: { suppressionRequireRulesMatch: false } }],
    ['key "true" (string, not boolean)', { memory: { suppressionRequireRulesMatch: 'true' } }],
    ['key 1', { memory: { suppressionRequireRulesMatch: 1 } }],
  ]) {
    test(`${name}: every entry suppresses, no warning, same result as without rulesText`, () => {
      const list = entries();
      const withRules = run(list, { config, rulesText: CHANGED_RULES });
      const withoutRules = run(list, { config });
      assert.equal(withRules.suppressedFindings.length, list.length);
      assert.equal(withRules.keptFindings.length, 0);
      assert.deepEqual(withRules.warnings, []);
      assert.deepEqual(withRules, withoutRules);
      assert.ok(withRules.applied.every((a) => a.action === 'suppressed'));
    });
  }

  test('off never hashes the rules; on does', (t) => {
    const list = entries();
    const createHash = t.mock.method(crypto, 'createHash');
    run(list, { config: { memory: {} }, rulesText: CHANGED_RULES });
    assert.equal(createHash.mock.callCount(), 0);
    run(list, { config: ON, rulesText: CHANGED_RULES });
    assert.ok(createHash.mock.callCount() > 0);
  });
});

// ---------------------------------------------------------------------------
// Opt-in on
// ---------------------------------------------------------------------------

describe('opt-in on', () => {
  test('1. rules changed: a v2 entry stops suppressing, recorded and warned once', () => {
    const s = suppression({ rulesDigest: ISSUED_V2, rulesDigestAlgo: 'v2' });
    const findings = [findingFor(s), { ...findingFor(s), id: 'second' }];
    const warnings = [];
    const r = applySuppressions(
      findings,
      { suppressions: [s] },
      { config: ON, rulesText: CHANGED_RULES, warn: (m) => warnings.push(m) }
    );
    assert.equal(r.suppressedFindings.length, 0);
    assert.equal(r.keptFindings.length, 2);
    assert.deepEqual(
      r.applied.map((a) => [a.action, a.reason, a.suppressionId]),
      [
        ['skipped', 'rules-digest-mismatch', s.id],
        ['skipped', 'rules-digest-mismatch', s.id],
      ]
    );
    assert.deepEqual(warnings, [formatRulesDigestMismatchWarning({ id: s.id })]);
  });

  test('2. rules unchanged: the v2 entry keeps suppressing', () => {
    const s = suppression({ rulesDigest: ISSUED_V2, rulesDigestAlgo: 'v2' });
    const r = run([s], { config: ON, rulesText: ISSUED_RULES });
    assert.equal(r.suppressedFindings.length, 1);
    assert.deepEqual(r.warnings, []);
  });

  test('3. only CRLF / trailing whitespace differ: the v2 entry keeps suppressing', () => {
    const s = suppression({ rulesDigest: ISSUED_V2, rulesDigestAlgo: 'v2' });
    for (const rulesText of [
      '- no silent catch\n- prefer early return',
      '- no silent catch\r\n- prefer early return',
      '- no silent catch \t\n- prefer early return   ',
      '- no silent catch\r- prefer early return',
    ]) {
      const r = run([s], { config: ON, rulesText });
      assert.equal(r.suppressedFindings.length, 1, JSON.stringify(rulesText));
      assert.deepEqual(r.warnings, []);
    }
  });

  test('4. rulesDigestAlgo absent is v1: compared against the unnormalized digest', () => {
    // Recorded before Phase 2: a v1 digest and no rulesDigestAlgo.
    const legacy = suppression({ rulesDigest: ISSUED_V1 });
    // Same rules text byte for byte: v1 matches. (A v2 comparison would not:
    // ISSUED_V1 !== ISSUED_V2 because the text has CRLF and trailing spaces.)
    assert.notEqual(ISSUED_V1, ISSUED_V2);
    const same = run([legacy], { config: ON, rulesText: ISSUED_RULES });
    assert.equal(same.suppressedFindings.length, 1);
    assert.deepEqual(same.warnings, []);
    // v1 is not normalized, so a CRLF → LF change alone is a mismatch for it.
    const lf = run([legacy], {
      config: ON,
      rulesText: '- no silent catch  \n- prefer early return',
    });
    assert.equal(lf.suppressedFindings.length, 0);
    assert.equal(lf.applied[0].reason, 'rules-digest-mismatch');
    // An explicit 'v1' behaves the same as absent.
    const explicit = suppression({ rulesDigest: ISSUED_V1, rulesDigestAlgo: 'v1' });
    assert.equal(
      run([explicit], { config: ON, rulesText: ISSUED_RULES }).suppressedFindings.length,
      1
    );
  });

  test('5. no rulesDigest: keeps suppressing whatever the rules are', () => {
    const s = suppression({});
    const withAlgoOnly = suppression({ rulesDigestAlgo: 'v2' });
    for (const rulesText of [CHANGED_RULES, ISSUED_RULES, '- anything']) {
      const r = run([s, withAlgoOnly], { config: ON, rulesText });
      assert.equal(r.suppressedFindings.length, 2);
      assert.deepEqual(r.warnings, []);
    }
  });

  test('6. unknown rulesDigestAlgo: warned, not judged, keeps suppressing', () => {
    for (const algo of ['v9', 'V2', '', 2, null]) {
      const s = suppression({ rulesDigest: ISSUED_V2, rulesDigestAlgo: algo });
      const r = run([s], { config: ON, rulesText: CHANGED_RULES });
      if (algo === null) {
        // `?? 'v1'`: null is read as absent, like fingerprintAlgo. The v2
        // digest then does not match the v1 digest of the changed rules.
        assert.equal(r.suppressedFindings.length, 0);
        continue;
      }
      assert.equal(r.suppressedFindings.length, 1, JSON.stringify(algo));
      assert.deepEqual(r.warnings, [
        formatUnknownRulesDigestAlgoWarning({ id: s.id, rulesDigestAlgo: algo }),
      ]);
    }
  });

  test('7. no current rules (absent / unreadable → no rulesText): keeps suppressing', () => {
    const entries = [
      suppression({ rulesDigest: ISSUED_V2, rulesDigestAlgo: 'v2' }),
      suppression({ rulesDigest: ISSUED_V1 }),
    ];
    for (const rulesText of [undefined, null, '']) {
      const r = run(entries, { config: ON, rulesText });
      assert.equal(r.suppressedFindings.length, 2, JSON.stringify(rulesText));
      assert.deepEqual(r.warnings, []);
    }
  });

  test('the expiry gate still decides first: an expired, mismatched entry reads suppression-expired', () => {
    const s = suppression({
      rulesDigest: ISSUED_V2,
      rulesDigestAlgo: 'v2',
      expiresAt: '2000-01-01T00:00:00Z',
    });
    const r = run([s], { config: ON, rulesText: CHANGED_RULES });
    assert.equal(r.applied[0].reason, 'suppression-expired');
    assert.deepEqual(r.warnings, []);
  });

  test('an unknown fingerprintAlgo entry is dropped before the rules axis (no second warning)', () => {
    const s = suppression({ fingerprintAlgo: 'v9', rulesDigest: ISSUED_V2, rulesDigestAlgo: 'v9' });
    const r = run([s], { config: ON, rulesText: CHANGED_RULES });
    assert.equal(r.suppressedFindings.length, 0);
    assert.equal(r.warnings.length, 1);
    assert.match(r.warnings[0], /fingerprintAlgo/);
  });
});

// ---------------------------------------------------------------------------
// Principle 3: separate predicate; the calendar rule does not read rules
// ---------------------------------------------------------------------------

describe('evaluateSuppressionRulesMatch / isSuppressionExpired separation', () => {
  test('predicate verdicts', () => {
    const v2 = suppression({ rulesDigest: ISSUED_V2, rulesDigestAlgo: 'v2' });
    assert.deepEqual(evaluateSuppressionRulesMatch(v2, ISSUED_RULES), { status: 'match' });
    assert.deepEqual(evaluateSuppressionRulesMatch(v2, CHANGED_RULES), { status: 'mismatch' });
    assert.deepEqual(evaluateSuppressionRulesMatch(v2, null), { status: 'undetermined' });
    assert.deepEqual(evaluateSuppressionRulesMatch(suppression({}), CHANGED_RULES), {
      status: 'undetermined',
    });
    assert.deepEqual(
      evaluateSuppressionRulesMatch(
        suppression({ rulesDigest: ISSUED_V2, rulesDigestAlgo: 'v3' }),
        null
      ),
      { status: 'unknown-algo', rulesDigestAlgo: 'v3' }
    );
    assert.deepEqual(evaluateSuppressionRulesMatch(undefined, CHANGED_RULES), {
      status: 'undetermined',
    });
  });

  test('isSuppressionExpired ignores rulesDigest / rulesDigestAlgo', () => {
    const now = new Date('2026-09-23T00:00:00Z');
    for (const ctx of [
      { rulesDigest: 'f'.repeat(64), rulesDigestAlgo: 'v2' },
      { rulesDigest: 'f'.repeat(64), rulesDigestAlgo: 'bogus' },
    ]) {
      assert.equal(isSuppressionExpired(suppression(ctx), now), false);
      assert.equal(
        isSuppressionExpired(suppression({ ...ctx, expiresAt: '2000-01-01T00:00:00Z' }), now),
        true
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Issuance: new suppressions record 'v2'
// ---------------------------------------------------------------------------

describe('issuance records rulesDigestAlgo', () => {
  const validate = compileSuppressionContextValidator();

  test('createSuppression writes rulesDigestAlgo only together with rulesDigest', () => {
    const cases = [
      [{ rulesDigest: ISSUED_V2, rulesDigestAlgo: 'v2' }, { rulesDigestAlgo: 'v2' }],
      [{ rulesDigest: ISSUED_V1 }, {}],
      [{ rulesDigestAlgo: 'v2' }, {}],
      [{ rulesDigest: '', rulesDigestAlgo: 'v2' }, {}],
      [{ rulesDigest: ISSUED_V2, rulesDigestAlgo: '' }, {}],
    ];
    for (const [input, expected] of cases) {
      const { cleanup, indexPath } = createTempMemory({ layout: 'nested', prefix: 'river-rdm-' });
      try {
        const entry = createSuppression({
          indexPath,
          filePaths: ['a.js'],
          rationale: 'r',
          ...input,
        });
        const persisted = loadMemory(indexPath).entries[0].context;
        assert.equal(persisted.rulesDigestAlgo, expected.rulesDigestAlgo, JSON.stringify(input));
        assert.equal('rulesDigestAlgo' in entry.context, 'rulesDigestAlgo' in expected);
        assert.ok(validate(entry.context), JSON.stringify(validate.errors));
      } finally {
        cleanup();
      }
    }
  });

  test('schema accepts v1 / v2 and rejects other values (write-side contract)', () => {
    const base = { scope: 'file', active: true, rulesDigest: ISSUED_V2 };
    assert.equal(validate({ ...base, rulesDigestAlgo: 'v1' }), true);
    assert.equal(validate({ ...base, rulesDigestAlgo: 'v2' }), true);
    assert.equal(validate(base), true);
    for (const bad of ['v3', '', 'V2', 2]) {
      assert.equal(validate({ ...base, rulesDigestAlgo: bad }), false, JSON.stringify(bad));
    }
  });
});

// ---------------------------------------------------------------------------
// Wiring: issue through the real provenance path, gate through runLocalReview
// ---------------------------------------------------------------------------

describe('runLocalReview wiring (issuance → .river/memory → review)', () => {
  async function reviewOnce(dir, config) {
    writeFileSync(path.join(dir, '.river-review.json'), JSON.stringify(config));
    const context = await planLocalReview({ cwd: dir, dryRun: true });
    assert.equal(context.status, 'ok');
    return runLocalReview({ cwd: dir, context, dryRun: true, quiet: true });
  }

  test('a suppression issued under rules.md stops only when opted in and the rules change', async (t) => {
    const { dir, cleanup } = await createRepoWithSilentCatchChange({ prefix: 'river-rdm-wire-' });
    t.after(cleanup);
    mkdirSync(path.join(dir, '.river'), { recursive: true });
    const rulesPath = path.join(dir, '.river', 'rules.md');
    writeFileSync(rulesPath, '- no silent catch  \r\n- prefer early return\r\n');

    // A finding to suppress, from the real pipeline.
    const first = await reviewOnce(dir, {});
    assert.ok(first.findings.length > 0, 'dry-run must yield a finding for this diff');
    const target = first.findings[0];

    // Issue exactly the way `river suppression add` does.
    const provenance = await resolveSuppressionProvenance({ repoRoot: dir });
    assert.equal(provenance.rulesDigestAlgo, 'v2');
    const indexPath = path.join(dir, '.river', 'memory', 'index.json');
    createSuppression({
      indexPath,
      fingerprint: target.fingerprint,
      feedbackType: 'accepted_risk',
      filePaths: [target.file],
      rationale: 'wiring',
      ...provenance,
    });
    // createSuppression writes no metadata.phase; since #2418 loadReviewMemory
    // loads such a suppression in every phase, so the entry is used as issued.
    assert.equal(JSON.parse(readFileSync(indexPath, 'utf8')).entries[0].metadata.phase, undefined);

    const isSuppressed = (r) =>
      r.suppressedFindings.some((f) => f.fingerprint === target.fingerprint);
    const on = { memory: { suppressionRequireRulesMatch: true } };

    // Unchanged rules: suppressed with the gate off and on.
    assert.ok(isSuppressed(await reviewOnce(dir, {})));
    assert.ok(isSuppressed(await reviewOnce(dir, on)));

    // Line endings / trailing whitespace only: still suppressed when on (v2).
    writeFileSync(rulesPath, '- no silent catch\n- prefer early return\n');
    assert.ok(isSuppressed(await reviewOnce(dir, on)));

    // A real rules change: off keeps suppressing, on stops.
    writeFileSync(rulesPath, '- no silent catch\n- prefer early return\n- new rule\n');
    assert.ok(isSuppressed(await reviewOnce(dir, {})));
    const stopped = await reviewOnce(dir, on);
    assert.equal(isSuppressed(stopped), false);
    assert.ok(stopped.findings.some((f) => f.fingerprint === target.fingerprint));
    assert.ok(
      stopped.reviewDebug.suppressionsApplied.some(
        (a) => a.fingerprint === target.fingerprint && a.reason === 'rules-digest-mismatch'
      )
    );
  });
});

// ---------------------------------------------------------------------------
// #2418: phase filter on the runLocalReview path
// ---------------------------------------------------------------------------

describe('runLocalReview phase filter for suppressions (#2418)', () => {
  async function reviewOnce(dir) {
    writeFileSync(path.join(dir, '.river-review.json'), JSON.stringify({}));
    const context = await planLocalReview({ cwd: dir, dryRun: true });
    assert.equal(context.status, 'ok');
    return runLocalReview({ cwd: dir, context, dryRun: true, quiet: true });
  }

  async function issueFor(dir, target) {
    const indexPath = path.join(dir, '.river', 'memory', 'index.json');
    createSuppression({
      indexPath,
      fingerprint: target.fingerprint,
      feedbackType: 'accepted_risk',
      filePaths: [target.file],
      rationale: 'phase filter',
      ...(await resolveSuppressionProvenance({ repoRoot: dir })),
    });
    return indexPath;
  }

  const isSuppressed = (r, fp) => r.suppressedFindings.some((f) => f.fingerprint === fp);

  test('a suppression issued by createSuppression (no phase) suppresses on the midstream review', async (t) => {
    const { dir, cleanup } = await createRepoWithSilentCatchChange({
      prefix: 'river-2418-nophase-',
    });
    t.after(cleanup);
    const target = (await reviewOnce(dir)).findings[0];
    assert.ok(target, 'dry-run must yield a finding for this diff');
    const indexPath = await issueFor(dir, target);
    assert.equal(JSON.parse(readFileSync(indexPath, 'utf8')).entries[0].metadata.phase, undefined);

    const result = await reviewOnce(dir);
    assert.ok(isSuppressed(result, target.fingerprint));
    assert.equal(
      result.findings.some((f) => f.fingerprint === target.fingerprint),
      false
    );
  });

  test('a suppression that names a different phase is still excluded', async (t) => {
    const { dir, cleanup } = await createRepoWithSilentCatchChange({
      prefix: 'river-2418-otherphase-',
    });
    t.after(cleanup);
    const target = (await reviewOnce(dir)).findings[0];
    assert.ok(target, 'dry-run must yield a finding for this diff');
    const indexPath = await issueFor(dir, target);
    const index = JSON.parse(readFileSync(indexPath, 'utf8'));
    index.entries[0].metadata.phase = 'upstream';
    writeFileSync(indexPath, JSON.stringify(index));

    const result = await reviewOnce(dir);
    assert.equal(isSuppressed(result, target.fingerprint), false);
    assert.ok(result.findings.some((f) => f.fingerprint === target.fingerprint));
  });
});
