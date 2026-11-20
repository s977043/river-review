// Structural contract for schemas/qa-evidence.schema.json (ADR-017 D3 / D5).
// Semantics the schema leaves to the deterministic module (docs/development/qa-evidence-contract.md
// §4.3, §5, hash and HEAD checks) are not tested here.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import Ajv2020 from 'ajv/dist/2020.js';

import { compileSchemaFile } from './helpers/schema-validator.mjs';

// The configuration the deterministic module is specified to use: Ajv 2020 + ajv-formats, strict.
const validate = compileSchemaFile('qa-evidence.schema.json', {
  ajvOptions: { allErrors: true, strict: true },
});

test('strict Ajv 2020 needs ajv-formats to compile the schema', () => {
  const schema = JSON.parse(
    readFileSync(new URL('../schemas/qa-evidence.schema.json', import.meta.url), 'utf8')
  );
  assert.throws(() => new Ajv2020({ strict: true }).compile(schema), /unknown format "date-time"/);
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
    {
      acId: 'AC-3',
      status: 'NOT_RUN',
      subcases: [
        {
          id: 'normal',
          status: 'PASS',
          basis: 'verified',
          attempts: [
            {
              startedAt: '2026-11-20T00:01:00Z',
              status: 'PASS',
              logRef: 'log-1',
              assertions: { total: 1, passed: 1 },
            },
          ],
        },
        { id: 'forbidden', status: 'NOT_RUN', notRunReason: 'requires-human-judgment' },
      ],
      controls: [{ revision: 'd'.repeat(40), status: 'FAIL', logRef: 'control-log' }],
    },
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
      { id: 'control-log', root: 'artifacts', path: 'logs/control.txt', sha256: 'e'.repeat(64) },
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
const ac3 = (d) => d.verification[2];
const subcase0 = (d) => ac3(d).subcases[0];
const control0 = (d) => ac3(d).controls[0];

test('minimal and full documents are accepted', () => {
  accepts(minimal());
  accepts(full());
});

// Each value below is rejected only by maxLength, never by a pattern or format as well.
// target.repository (140) and target.subjectRevision (64) are omitted: their patterns already
// cap the length, so no value can exceed maxLength without also failing the pattern.
const STRING_LIMITS = [
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
  ['subcase.basis', 32, (d, n) => (subcase0(d).basis = 'x'.repeat(n))],
  ['subcase.notRunReason', 64, (d, n) => (ac3(d).subcases[1].notRunReason = 'x'.repeat(n))],
  ['attempt.command', 8192, (d, n) => (attempt0(d).command = 'x'.repeat(n))],
  ['attempt.exitCodeSource', 256, (d, n) => (attempt0(d).exitCodeSource = 'x'.repeat(n))],
  ['artifact.path', 1024, (d, n) => (ref0(d).path = 'x'.repeat(n))],
  ['artifact.sha256', 64, (d, n) => (ref0(d).sha256 = 'x'.repeat(n))],
  ['artifacts.reproduction', 8192, (d, n) => (d.artifacts.reproduction = 'x'.repeat(n))],
  ['gaps.items[]', 2048, (d, n) => (d.gaps.items[0] = 'x'.repeat(n))],
  // A valid RFC 3339 value of length n: the fractional seconds absorb the padding.
  [
    'attempt.startedAt',
    64,
    (d, n) => (attempt0(d).startedAt = `2026-11-20T00:00:00.${'1'.repeat(n - 21)}Z`),
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
    'subcases',
    20,
    (d, n) => {
      ac3(d).subcases = Array.from({ length: n }, (_, i) => ({ id: `s${i}`, status: 'SKIP' }));
    },
  ],
  [
    'subcase.attempts',
    20,
    (d, n) => {
      subcase0(d).attempts = Array.from({ length: n }, () => ({ ...subcase0(d).attempts[0] }));
    },
  ],
  [
    'controls',
    10,
    (d, n) => {
      ac3(d).controls = Array.from({ length: n }, () => ({ ...control0(d) }));
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
    1000,
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

test('integer bounds: exitCode -2147483648..4294967295 or null, assertions 0..1,000,000', () => {
  for (const ok of [0, 255, 256, -1073741819, 3221225477, -2147483648, 4294967295, null]) {
    const d = full();
    attempt0(d).exitCode = ok;
    accepts(d);
  }
  for (const bad of [-2147483649, 4294967296, 1.5, '0']) {
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
  ['subcase', subcase0],
  ['subcase attempt', (d) => subcase0(d).attempts[0]],
  ['control', control0],
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
  ['subcases[].id', (d, v) => (subcase0(d).id = v)],
  ['controls[].logRef', (d, v) => (control0(d).logRef = v)],
];

test('every id site accepts a raw length of 160 and rejects 161', () => {
  for (const [label, set] of ID_SITES) {
    const atLimit = full();
    set(atLimit, 'a'.repeat(160));
    assert.equal(validate(atLimit), true, `${label}: ${JSON.stringify(validate.errors)}`);
    const over = full();
    set(over, 'a'.repeat(161));
    assert.equal(validate(over), false, `${label} accepted 161 characters`);
  }
});

test('id character set is left to the module, which judges the NFC-normalized value (§4.2)', () => {
  // KELVIN SIGN normalizes to "K", so rejecting it on the raw value would contradict §4.2.
  const kelvin = String.fromCodePoint(0x212a);
  assert.equal(kelvin.normalize('NFC'), 'K');
  for (const [label, set] of ID_SITES) {
    for (const raw of [kelvin, ' AC-1 ', 'AC@1', '']) {
      const d = full();
      set(d, raw);
      assert.equal(validate(d), true, `${label} rejected ${JSON.stringify(raw)}`);
    }
    for (const notString of [1, null, ['AC-1']]) {
      const d = full();
      set(d, notString);
      assert.equal(validate(d), false, `${label} accepted ${JSON.stringify(notString)}`);
    }
  }
});

const REQUIRED = [
  ['root', (d) => d, ['schemaVersion', 'target', 'verification']],
  ['target', (d) => d.target, ['repository', 'subjectRevision', 'acceptanceCriteria']],
  ['acceptanceCriterion', ac0, ['id']],
  ['runtime', (d) => d.environment.runtimes[0], ['name', 'version']],
  ['verificationResult', (d) => d.verification[0], ['acId', 'status']],
  ['attempt', attempt0, ['startedAt', 'status', 'logRef', 'assertions']],
  ['assertions', (d) => attempt0(d).assertions, ['total', 'passed']],
  ['artifactRef', ref0, ['id', 'root', 'path']],
  ['subcase', subcase0, ['id', 'status']],
  ['control', control0, ['revision', 'status', 'logRef']],
];

test('removing any one required field rejects the whole document', () => {
  for (const [label, pick, fields] of REQUIRED) {
    for (const field of fields) {
      const d = full();
      delete pick(d)[field];
      assert.equal(validate(d), false, `${label}.${field} missing was accepted`);
    }
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
    (d) => (subcase0(d).status = 'pass'),
    (d) => (control0(d).status = 'SKIP'),
    (d) => (control0(d).revision = 'abc1234'),
    (d) => (control0(d).revision = 'g'.repeat(40)),
    (d) => (control0(d).revision = 'd'.repeat(41)),
    (d) => (control0(d).revision = 'd'.repeat(63)),
    (d) => (control0(d).revision = 'd'.repeat(65)),
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
    (d) => (d.target.repository = `${'o'.repeat(40)}/name`),
    (d) => (d.target.repository = `owner/${'r'.repeat(101)}`),
    (d) => (d.target.subjectRevision = 'abc1234'),
    (d) => (d.target.subjectRevision = 'g'.repeat(40)),
    (d) => (d.target.subjectRevision = 'a'.repeat(41)),
    (d) => (d.target.acceptanceCriteria = []),
    (d) => (attempt0(d).startedAt = 'yesterday'),
    (d) => (attempt0(d).startedAt = '2026-11-20T00:00:00'),
    (d) => (attempt0(d).startedAt = '2026-11-20'),
    (d) => (ref0(d).path = '/etc/passwd'),
    (d) => (ref0(d).path = '../outside'),
    (d) => (ref0(d).path = 'logs/../../outside'),
    (d) => (ref0(d).path = 'logs\\run.txt'),
    (d) => (ref0(d).path = 'logs/\u0000'),
    (d) => (ref0(d).path = 'https://example.com/log'),
    (d) => (ref0(d).path = 'C:/log'),
    (d) => (ref0(d).path = 'trace:1.zip'),
    (d) => (ref0(d).path = ''),
  ];
  for (const change of cases) {
    const d = full();
    change(d);
    rejects(d);
  }
  const ok = full();
  ok.target.subjectRevision = 'A'.repeat(64);
  ok.target.repository = `${'o'.repeat(39)}/${'r'.repeat(100)}`;
  attempt0(ok).startedAt = '2026-11-20T09:00:00.123+09:00';
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
    (d) => delete ac3(d).controls,
    (d) => (control0(d).status = 'PASS'),
    (d) => (control0(d).revision = 'D'.repeat(64)),
    (d) => (control0(d).revision = d.target.subjectRevision),
    (d) => (subcase0(d).basis = 'observed'),
  ];
  for (const change of cases) {
    const d = full();
    change(d);
    accepts(d);
  }
});

test('an AC with subcases carries no basis, attempts or notRunReason of its own (§3.4.1)', () => {
  const fields = {
    basis: 'verified',
    attempts: [],
    notRunReason: 'out-of-scope',
  };
  for (const [field, value] of Object.entries(fields)) {
    const d = full();
    ac3(d)[field] = value;
    assert.equal(validate(d), false, `AC with subcases accepted its own ${field}`);
    const single = full();
    ac3(single).subcases = [subcase0(single)];
    ac3(single).status = 'PASS';
    ac3(single)[field] = value;
    assert.equal(validate(single), false, `AC with one subcase accepted its own ${field}`);
  }
  const empty = full();
  ac3(empty).subcases = [];
  Object.assign(ac3(empty), fields);
  accepts(empty);
});
