// schemas/qa-plan.schema.json and src/lib/qa-plan.mjs (ADR-017 D6,
// docs/development/qa-evidence-contract.md §11).
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  QA_PLAN_MAX_ACCEPTANCE_CRITERIA,
  QA_PLAN_MAX_FINDINGS,
  buildQaPlan,
} from '../src/lib/qa-plan.mjs';
import { normalizeQaId } from '../src/lib/qa-evidence.mjs';

import { compileSchemaFile } from './helpers/schema-validator.mjs';

const validate = compileSchemaFile('qa-plan.schema.json', {
  ajvOptions: { allErrors: true, strict: true },
});

const full = () => ({
  schemaVersion: '1',
  basic: [
    {
      id: 'ac:AC-1',
      origin: 'acceptance-criterion',
      acId: 'AC-1',
      priority: 'P1',
      duplicateOf: null,
    },
  ],
  additional: [
    {
      id: 'finding:rr-1',
      origin: 'review-finding',
      findingId: 'rr-1',
      priority: 'P2',
      duplicateOf: 'ac:AC-1',
    },
  ],
});

const accepts = (doc) => assert.equal(validate(doc), true, JSON.stringify(validate.errors));
const basic0 = (d) => d.basic[0];
const additional0 = (d) => d.additional[0];

test('a full plan and a plan without additional QA are accepted', () => {
  accepts(full());
  const noFindings = full();
  noFindings.additional = [];
  accepts(noFindings);
});

const STRING_LIMITS = [
  ['basic.id', 168, (d, n) => (basic0(d).id = 'x'.repeat(n))],
  ['basic.acId', 160, (d, n) => (basic0(d).acId = 'x'.repeat(n))],
  ['basic.duplicateOf', 168, (d, n) => (basic0(d).duplicateOf = 'x'.repeat(n))],
  ['additional.id', 168, (d, n) => (additional0(d).id = 'x'.repeat(n))],
  ['additional.findingId', 160, (d, n) => (additional0(d).findingId = 'x'.repeat(n))],
  ['additional.duplicateOf', 168, (d, n) => (additional0(d).duplicateOf = 'x'.repeat(n))],
];

test('every bounded string accepts its limit and rejects limit + 1 and the empty string', () => {
  for (const [label, max, set] of STRING_LIMITS) {
    const atLimit = full();
    set(atLimit, max);
    assert.equal(validate(atLimit), true, `${label} at ${max}: ${JSON.stringify(validate.errors)}`);
    for (const bad of [max + 1, 0]) {
      const d = full();
      set(d, bad);
      assert.equal(validate(d), false, `${label} at ${bad} should be rejected`);
    }
  }
});

const ARRAY_LIMITS = [
  ['basic', 1000, (d, n) => (d.basic = Array.from({ length: n }, () => ({ ...basic0(d) })))],
  [
    'additional',
    500,
    (d, n) => (d.additional = Array.from({ length: n }, () => ({ ...additional0(d) }))),
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

const REQUIRED = [
  ['root', (d) => d, ['schemaVersion', 'basic', 'additional']],
  ['basicItem', basic0, ['id', 'origin', 'acId', 'priority', 'duplicateOf']],
  ['additionalItem', additional0, ['id', 'origin', 'findingId', 'priority', 'duplicateOf']],
];

test('removing any one required field rejects the plan', () => {
  for (const [label, pick, fields] of REQUIRED) {
    for (const field of fields) {
      const d = full();
      delete pick(d)[field];
      assert.equal(validate(d), false, `${label}.${field} missing was accepted`);
    }
  }
});

test('a field the schema does not define is rejected at every object level', () => {
  for (const [label, pick] of [
    ['root', (d) => d],
    ['basicItem', basic0],
    ['additionalItem', additional0],
  ]) {
    const d = full();
    pick(d).title = 'x';
    assert.equal(validate(d), false, `${label} accepted an undefined field`);
  }
});

test('values outside an enum, const or type are rejected', () => {
  const cases = [
    (d) => (d.schemaVersion = '2'),
    (d) => (d.basic = []),
    (d) => (basic0(d).origin = 'review-finding'),
    (d) => (additional0(d).origin = 'acceptance-criterion'),
    (d) => (basic0(d).priority = 'P0'),
    (d) => (additional0(d).priority = 'high'),
    (d) => (basic0(d).duplicateOf = 1),
    (d) => (additional0(d).findingId = 1),
  ];
  for (const change of cases) {
    const d = full();
    change(d);
    assert.equal(validate(d), false, JSON.stringify(d).slice(0, 200));
  }
});

test('with no findings, basic QA has one item per AC and additional QA is empty', () => {
  const acceptanceCriteria = [{ id: 'AC-1' }, { id: 'AC-2', required: false }, { id: 'AC-3' }];
  for (const findings of [undefined, []]) {
    const plan = buildQaPlan({ acceptanceCriteria, findings });
    accepts(plan);
    assert.equal(plan.basic.length, acceptanceCriteria.length);
    assert.deepEqual(plan.additional, []);
    assert.deepEqual(plan.basic, [
      {
        id: 'ac:AC-1',
        origin: 'acceptance-criterion',
        acId: 'AC-1',
        priority: 'P1',
        duplicateOf: null,
      },
      {
        id: 'ac:AC-2',
        origin: 'acceptance-criterion',
        acId: 'AC-2',
        priority: 'P3',
        duplicateOf: null,
      },
      {
        id: 'ac:AC-3',
        origin: 'acceptance-criterion',
        acId: 'AC-3',
        priority: 'P1',
        duplicateOf: null,
      },
    ]);
  }
});

test('additional QA carries the existing finding id, its priority and the covered AC', () => {
  const plan = buildQaPlan({
    acceptanceCriteria: [{ id: 'AC-1' }, { id: 'AC-2' }],
    findings: [
      { id: 'rr-1', severity: 'critical', criterionRefs: ['TC-9', 'AC-2', 'AC-1'] },
      { id: 'rr-2', severity: 'nit' },
      { id: 'rr-3', severity: 'info', criterionRefs: ['AC-9'] },
      { id: 'rr-4' },
    ],
  });
  accepts(plan);
  assert.equal(plan.basic.length, 2);
  assert.deepEqual(plan.additional, [
    {
      id: 'finding:rr-1',
      origin: 'review-finding',
      findingId: 'rr-1',
      priority: 'P1',
      duplicateOf: 'ac:AC-2',
    },
    {
      id: 'finding:rr-2',
      origin: 'review-finding',
      findingId: 'rr-2',
      priority: 'P3',
      duplicateOf: null,
    },
    {
      id: 'finding:rr-3',
      origin: 'review-finding',
      findingId: 'rr-3',
      priority: 'P4',
      duplicateOf: null,
    },
    // Unknown severity falls back to `major` (P2), as normalizeSeverity does for findings.
    {
      id: 'finding:rr-4',
      origin: 'review-finding',
      findingId: 'rr-4',
      priority: 'P2',
      duplicateOf: null,
    },
  ]);
});

test('ids are compared after nonEmptyNfcString, and the finding id is otherwise copied as is', () => {
  const kelvin = String.fromCodePoint(0x212a);
  const plan = buildQaPlan({
    acceptanceCriteria: [{ id: ` ${kelvin}-1 ` }],
    findings: [{ id: ' rr-1 ', criterionRefs: [' K-1 '] }],
  });
  accepts(plan);
  assert.equal(plan.basic[0].acId, 'K-1');
  assert.equal(plan.additional[0].findingId, 'rr-1');
  assert.equal(plan.additional[0].duplicateOf, 'ac:K-1');
});

test('buildQaPlan accepts exactly the AC ids that the QA evidence validator accepts', () => {
  const kelvin = String.fromCodePoint(0x212a);
  const inputs = [
    'AC-1',
    'a.b_c-D9',
    ` ${kelvin}-1 `,
    `${kelvin}${'a'.repeat(127)}`,
    'AC 1',
    'ac:1',
    'AC/1',
    'e\u0301',
    '',
    '   ',
    'a'.repeat(128),
    'a'.repeat(129),
    42,
    null,
  ];
  for (const raw of inputs) {
    const expected = normalizeQaId(raw);
    const label = JSON.stringify(raw)?.slice(0, 40);
    if (expected === null) {
      assert.throws(() => buildQaPlan({ acceptanceCriteria: [{ id: raw }] }), label);
    } else {
      assert.equal(
        buildQaPlan({ acceptanceCriteria: [{ id: raw }] }).basic[0].acId,
        expected,
        label
      );
    }
  }
  assert.equal(normalizeQaId(` ${kelvin}-1 `), 'K-1');
  assert.equal(normalizeQaId('a'.repeat(129)), null);
});

test('invalid input throws instead of dropping an AC or a finding', () => {
  const ac = [{ id: 'AC-1' }];
  const cases = [
    { acceptanceCriteria: [] },
    { acceptanceCriteria: undefined },
    { acceptanceCriteria: [{ id: '' }] },
    { acceptanceCriteria: [{ id: 'AC 1' }] },
    { acceptanceCriteria: [{ id: 'ac:1' }] },
    { acceptanceCriteria: [{ id: 'a'.repeat(129) }] },
    { acceptanceCriteria: [{ id: 'AC-1' }, { id: ' AC-1' }] },
    { acceptanceCriteria: ac, findings: null },
    { acceptanceCriteria: ac, findings: [{ id: '  ' }] },
    { acceptanceCriteria: ac, findings: [{ id: 'x'.repeat(161) }] },
    { acceptanceCriteria: ac, findings: [{ id: 'rr-1' }, { id: 'rr-1' }] },
    {
      acceptanceCriteria: Array.from({ length: QA_PLAN_MAX_ACCEPTANCE_CRITERIA + 1 }, (_, i) => ({
        id: `AC-${i}`,
      })),
    },
    {
      acceptanceCriteria: ac,
      findings: Array.from({ length: QA_PLAN_MAX_FINDINGS + 1 }, (_, i) => ({ id: `rr-${i}` })),
    },
  ];
  for (const input of cases) {
    assert.throws(() => buildQaPlan(input), JSON.stringify(input).slice(0, 120));
  }
});

test('the builder output at its input limits still fits the schema', () => {
  const plan = buildQaPlan({
    acceptanceCriteria: Array.from({ length: QA_PLAN_MAX_ACCEPTANCE_CRITERIA }, (_, i) => ({
      id: `${'a'.repeat(120)}-${i}`,
    })),
    findings: Array.from({ length: QA_PLAN_MAX_FINDINGS }, (_, i) => ({
      id: `${'f'.repeat(156)}${String(i).padStart(4, '0')}`,
    })),
  });
  accepts(plan);
  assert.equal(plan.basic.length, QA_PLAN_MAX_ACCEPTANCE_CRITERIA);
  assert.equal(plan.additional.length, QA_PLAN_MAX_FINDINGS);
});
