// Structural contract for schemas/qa-evidence.schema.json (ADR-017 D3 / D5).
// Semantics the schema leaves to the deterministic module (docs/development/qa-evidence-contract.md
// §4.3, §5, hash and HEAD checks) are not tested here.
import assert from 'node:assert/strict';
import test from 'node:test';

import { compileSchemaFile } from './helpers/schema-validator.mjs';

const validate = compileSchemaFile('qa-evidence.schema.json', {
  ajvOptions: { allErrors: true, allowUnionTypes: true },
});

const SHA1 = 'a'.repeat(40);

const minimal = () => ({
  schemaVersion: '1',
  target: {
    repository: 'owner/name',
    subjectRevision: SHA1,
    acceptanceCriteria: [{ id: 'AC-1' }],
  },
  verification: [],
});

const full = () => ({
  schemaVersion: '1',
  target: {
    repository: 'owner/name',
    subjectRevision: SHA1,
    acceptanceCriteria: [
      {
        id: 'AC-1',
        required: true,
        expected: { value: 'returns 200', source: 'sourced', sourceRef: 'spec' },
      },
    ],
  },
  execution: { runner: 'node-test', ciRun: 'run-1' },
  environment: {
    os: 'linux',
    runtimes: [{ name: 'node', version: '22.22.2' }],
    browser: 'chromium',
    viewport: '1280x720',
    locale: 'ja-JP',
    timezone: 'Asia/Tokyo',
  },
  verification: [
    {
      acId: 'AC-1',
      status: 'PASS',
      basis: 'verified',
      attempts: [
        {
          startedAt: '2026-11-20T00:00:00Z',
          status: 'PASS',
          logRef: 'log-1',
          assertions: { total: 3, passed: 3 },
          command: 'npm test',
          exitCode: 0,
          exitCodeSource: 'wrapper',
        },
      ],
    },
    { acId: 'AC-2', status: 'NOT_RUN', notRunReason: 'out-of-scope' },
  ],
  artifacts: {
    refs: [
      { id: 'log-1', root: 'artifacts', path: 'logs/run.txt', sha256: 'b'.repeat(64) },
      {
        id: 'spec',
        root: 'repository',
        path: 'docs/spec.md',
        sha256: 'c'.repeat(64),
        sensitivity: 'public',
      },
    ],
    reproduction: 'npm ci && npm test',
  },
  gaps: { items: ['browser matrix not covered'] },
});

const accepts = (doc) => assert.equal(validate(doc), true, JSON.stringify(validate.errors));
const rejects = (doc) => assert.equal(validate(doc), false, JSON.stringify(doc).slice(0, 200));

const attempt0 = (d) => d.verification[0].attempts[0];
const ac0 = (d) => d.target.acceptanceCriteria[0];
const ref0 = (d) => d.artifacts.refs[0];

test('minimal and full documents are accepted', () => {
  accepts(minimal());
  accepts(full());
});

const STRING_LIMITS = [
  [
    'target.repository',
    140,
    (d, n) => (d.target.repository = `${'o'.repeat(39)}/${'r'.repeat(n - 40)}`),
  ],
  ['expected.value', 4096, (d, n) => (ac0(d).expected.value = 'x'.repeat(n))],
  ['expected.source', 32, (d, n) => (ac0(d).expected.source = 'x'.repeat(n))],
  ['execution.runner', 128, (d, n) => (d.execution.runner = 'x'.repeat(n))],
  ['execution.ciRun', 512, (d, n) => (d.execution.ciRun = 'x'.repeat(n))],
  ['environment.os', 128, (d, n) => (d.environment.os = 'x'.repeat(n))],
  ['runtimes.name', 64, (d, n) => (d.environment.runtimes[0].name = 'x'.repeat(n))],
  ['runtimes.version', 64, (d, n) => (d.environment.runtimes[0].version = 'x'.repeat(n))],
  ['environment.browser', 128, (d, n) => (d.environment.browser = 'x'.repeat(n))],
  ['environment.viewport', 32, (d, n) => (d.environment.viewport = 'x'.repeat(n))],
  ['environment.locale', 64, (d, n) => (d.environment.locale = 'x'.repeat(n))],
  ['environment.timezone', 64, (d, n) => (d.environment.timezone = 'x'.repeat(n))],
  ['verification.basis', 32, (d, n) => (d.verification[0].basis = 'x'.repeat(n))],
  ['notRunReason', 64, (d, n) => (d.verification[1].notRunReason = 'x'.repeat(n))],
  ['attempt.command', 8192, (d, n) => (attempt0(d).command = 'x'.repeat(n))],
  ['attempt.exitCodeSource', 256, (d, n) => (attempt0(d).exitCodeSource = 'x'.repeat(n))],
  ['artifact.path', 1024, (d, n) => (ref0(d).path = 'x'.repeat(n))],
  ['artifact.sha256', 64, (d, n) => (ref0(d).sha256 = 'x'.repeat(n))],
  ['artifacts.reproduction', 8192, (d, n) => (d.artifacts.reproduction = 'x'.repeat(n))],
  ['gaps.items[]', 2048, (d, n) => (d.gaps.items[0] = 'x'.repeat(n))],
  ['id (normalized)', 128, (d, n) => (ac0(d).id = 'a'.repeat(n))],
  [
    'id (raw, with whitespace)',
    160,
    (d, n) => (ac0(d).id = ` ${'a'.repeat(128)}${' '.repeat(n - 129)}`),
  ],
];

test('every bounded string accepts its limit and rejects limit + 1', () => {
  for (const [label, max, set] of STRING_LIMITS) {
    const atLimit = full();
    set(atLimit, max);
    assert.equal(validate(atLimit), true, `${label} at ${max}: ${JSON.stringify(validate.errors)}`);
    const over = full();
    set(over, max + 1);
    assert.equal(validate(over), false, `${label} at ${max + 1} should be rejected`);
  }
});

const ARRAY_LIMITS = [
  [
    'target.acceptanceCriteria',
    200,
    (d, n) => {
      d.target.acceptanceCriteria = Array.from({ length: n }, (_, i) => ({ id: `AC-${i}` }));
    },
  ],
  [
    'verification',
    200,
    (d, n) => {
      d.verification = Array.from({ length: n }, (_, i) => ({
        acId: `AC-${i}`,
        status: 'NOT_RUN',
      }));
    },
  ],
  [
    'attempts',
    20,
    (d, n) => {
      d.verification[0].attempts = Array.from({ length: n }, () => ({ ...attempt0(d) }));
    },
  ],
  [
    'environment.runtimes',
    20,
    (d, n) => {
      d.environment.runtimes = Array.from({ length: n }, () => ({ name: 'node', version: '22' }));
    },
  ],
  [
    'artifacts.refs',
    500,
    (d, n) => {
      d.artifacts.refs = Array.from({ length: n }, (_, i) => ({
        id: `r${i}`,
        root: 'repository',
        path: 'a',
      }));
    },
  ],
  [
    'gaps.items',
    100,
    (d, n) => {
      d.gaps.items = Array.from({ length: n }, () => 'gap');
    },
  ],
];

test('every bounded array accepts its limit and rejects limit + 1', () => {
  for (const [label, max, set] of ARRAY_LIMITS) {
    const atLimit = full();
    set(atLimit, max);
    assert.equal(validate(atLimit), true, `${label} at ${max}: ${JSON.stringify(validate.errors)}`);
    const over = full();
    set(over, max + 1);
    assert.equal(validate(over), false, `${label} at ${max + 1} should be rejected`);
  }
});

test('integer bounds: exitCode 0..255 or null, assertions 0..1,000,000', () => {
  for (const ok of [0, 255, null]) {
    const d = full();
    attempt0(d).exitCode = ok;
    accepts(d);
  }
  for (const bad of [-1, 256, 1.5, '0']) {
    const d = full();
    attempt0(d).exitCode = bad;
    rejects(d);
  }
  const atLimit = full();
  attempt0(atLimit).assertions = { total: 1000000, passed: 1000000 };
  accepts(atLimit);
  for (const bad of [
    { total: 1000001, passed: 0 },
    { total: 1, passed: -1 },
    { total: 1.5, passed: 1 },
  ]) {
    const d = full();
    attempt0(d).assertions = bad;
    rejects(d);
  }
});

const OBJECTS = [
  ['root', (d) => d],
  ['target', (d) => d.target],
  ['acceptanceCriterion', ac0],
  ['expected', (d) => ac0(d).expected],
  ['execution', (d) => d.execution],
  ['environment', (d) => d.environment],
  ['runtime', (d) => d.environment.runtimes[0]],
  ['verificationResult', (d) => d.verification[0]],
  ['attempt', attempt0],
  ['assertions', (d) => attempt0(d).assertions],
  ['artifacts', (d) => d.artifacts],
  ['artifactRef', ref0],
  ['gaps', (d) => d.gaps],
];

test('a field the schema does not define is rejected at every object level', () => {
  for (const [label, pick] of OBJECTS) {
    const d = full();
    pick(d).flaky = false;
    assert.equal(validate(d), false, `${label} accepted an undefined field`);
  }
});

const ID_SITES = [
  ['acceptanceCriteria[].id', (d, v) => (ac0(d).id = v)],
  ['expected.sourceRef', (d, v) => (ac0(d).expected.sourceRef = v)],
  ['verification[].acId', (d, v) => (d.verification[0].acId = v)],
  ['attempts[].logRef', (d, v) => (attempt0(d).logRef = v)],
  ['artifacts.refs[].id', (d, v) => (ref0(d).id = v)],
];

test('ids outside [A-Za-z0-9._-] are rejected at every id site', () => {
  for (const [label, set] of ID_SITES) {
    for (const bad of ['', '   ', 'AC 1', 'AC@1', 'AC/1', '`AC`', 'ＡＣ1', '\u212A', 'AC-1\n@x']) {
      const d = full();
      set(d, bad);
      assert.equal(validate(d), false, `${label} accepted ${JSON.stringify(bad)}`);
    }
    const d = full();
    set(d, ' AC.1_x-2 ');
    assert.equal(validate(d), true, `${label}: ${JSON.stringify(validate.errors)}`);
  }
});

test('values outside a whole-document enum or const are rejected', () => {
  const cases = [
    (d) => (d.schemaVersion = '2'),
    (d) => (d.verification[0].status = 'pass'),
    (d) => (d.verification[0].status = 'PASSED'),
    (d) => (attempt0(d).status = 'SKIP'),
    (d) => (ref0(d).root = 'home'),
    (d) => (ref0(d).sensitivity = 'private'),
  ];
  for (const change of cases) {
    const d = full();
    change(d);
    rejects(d);
  }
});

test('whole-document patterns: repository, subjectRevision, startedAt, artifact path', () => {
  const cases = [
    (d) => (d.target.repository = 'name-only'),
    (d) => (d.target.repository = 'owner/name/extra'),
    (d) => (d.target.repository = '-owner/name'),
    (d) => (d.target.subjectRevision = 'abc1234'),
    (d) => (d.target.subjectRevision = 'g'.repeat(40)),
    (d) => (d.target.subjectRevision = 'a'.repeat(41)),
    (d) => (d.target.acceptanceCriteria = []),
    (d) => (attempt0(d).startedAt = 'yesterday'),
    (d) => (ref0(d).path = '/etc/passwd'),
    (d) => (ref0(d).path = '../outside'),
    (d) => (ref0(d).path = 'logs/../../outside'),
    (d) => (ref0(d).path = 'logs\\run.txt'),
    (d) => (ref0(d).path = 'logs/\u0000'),
    (d) => (ref0(d).path = 'https://example.com/log'),
    (d) => (ref0(d).path = 'C:/log'),
    (d) => (ref0(d).path = ''),
  ];
  for (const change of cases) {
    const d = full();
    change(d);
    rejects(d);
  }
  const ok = full();
  ok.target.subjectRevision = 'A'.repeat(64);
  ref0(ok).path = 'logs/..hidden/run..txt';
  accepts(ok);
});

test('fields the contract counts as unverified are not rejected by the schema', () => {
  const cases = [
    (d) => (d.verification[0].basis = 'observed'),
    (d) => delete d.verification[0].basis,
    (d) => (ac0(d).expected.source = 'guessed'),
    (d) => (ac0(d).expected = {}),
    (d) => (d.verification[1].notRunReason = 'other'),
    (d) => delete d.verification[1].notRunReason,
    (d) => (d.verification[0].attempts = []),
    (d) => delete d.execution,
    (d) => delete d.environment,
    (d) => delete attempt0(d).command,
    (d) => delete attempt0(d).exitCode,
    (d) => (ref0(d).sha256 = 'not-a-hash'),
    (d) => delete ref0(d).sha256,
  ];
  for (const change of cases) {
    const d = full();
    change(d);
    accepts(d);
  }
});
