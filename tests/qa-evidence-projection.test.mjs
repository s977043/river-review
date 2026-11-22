// Partial projection of QA evidence onto completion-assessment (src/lib/qa-evidence-projection.mjs)
// against docs/development/qa-evidence-contract.md §8.1. Inputs come from the validator itself
// (src/lib/qa-evidence.mjs), built on tests/fixtures/qa-evidence/base.json.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  auditQaEvidence,
  checkQaEvidence,
  determineAcPopulation,
  evaluateQaEvidence,
  judgeQaEvidence,
} from '../src/lib/qa-evidence.mjs';
import { projectQaEvidence } from '../src/lib/qa-evidence-projection.mjs';
import { compileSchema } from './helpers/schema-validator.mjs';

const FIXTURES = new URL('./fixtures/qa-evidence/', import.meta.url);
const BASE = JSON.parse(readFileSync(new URL('base.json', FIXTURES), 'utf8'));
const ROOTS = Object.fromEntries(
  Object.entries(BASE.context.roots).map(([name, dir]) => [
    name,
    fileURLToPath(new URL(dir, FIXTURES)),
  ])
);

const SCHEMA = JSON.parse(
  readFileSync(new URL('../schemas/completion-assessment.schema.json', import.meta.url), 'utf8')
);
const COMPLETION_REASON_CODES = SCHEMA.$defs.completionReasonCode.enum;
// The projection is the counts sub-schema plus reasonCodes items from the completion vocabulary.
const validateProjection = compileSchema(
  {
    type: 'object',
    additionalProperties: false,
    required: ['acceptanceCriteria', 'reasonCodes'],
    properties: {
      acceptanceCriteria: {
        $ref: `${SCHEMA.$id}#/properties/verification/properties/acceptanceCriteria`,
      },
      reasonCodes: {
        type: 'array',
        uniqueItems: true,
        items: { $ref: `${SCHEMA.$id}#/$defs/completionReasonCode` },
      },
    },
  },
  { ajvOptions: { allErrors: true }, refs: [{ schema: SCHEMA }] }
);

// AC-1 meets §5 once independence is known; AC-2 is a reported FAIL.
function twoCriteria() {
  const evidence = structuredClone(BASE.evidence);
  evidence.target.acceptanceCriteria.push({
    id: 'AC-2',
    expected: { value: 'returns 404', source: 'sourced', sourceRef: 'spec-ac-1' },
  });
  evidence.verification.push({
    ...structuredClone(evidence.verification[0]),
    acId: 'AC-2',
    status: 'FAIL',
    attempts: [
      {
        ...structuredClone(evidence.verification[0].attempts[0]),
        status: 'FAIL',
        logRef: 'log-fail',
        assertions: { total: 3, passed: 2 },
        exitCode: 1,
      },
    ],
  });
  const population = structuredClone(BASE.context.population);
  population.criteria.push({ id: 'AC-2', required: true, expected: 'returns 404' });
  return { evidence, population };
}

function fixtureResolutions(refs) {
  const resolutions = new Map();
  for (const ref of refs) {
    const content = readFileSync(join(ROOTS[ref.root], ref.path));
    const sha256 = createHash('sha256').update(content).digest('hex');
    resolutions.set(ref.id, { state: 'ok', sha256, size: content.length });
  }
  return resolutions;
}

// Stages 0-5 with fixture hashes in place of the platform-dependent reader.
function judge({ evidence, population, independence = 'known' }) {
  const settled = determineAcPopulation(population);
  const checked = checkQaEvidence(
    typeof evidence === 'string' ? evidence : JSON.stringify(evidence),
    { population: settled }
  );
  return judgeQaEvidence({
    checked,
    population: settled,
    observed: BASE.context.observed,
    artifactResolutions: checked.accepted
      ? fixtureResolutions(checked.evidence.artifacts.refs)
      : new Map(),
    independence,
    trustedSourceIds: BASE.context.trustedSourceIds,
  });
}

function assertProjectionContract(projected) {
  assert.ok(validateProjection(projected), JSON.stringify(validateProjection.errors));
  for (const code of projected.reasonCodes) {
    assert.ok(COMPLETION_REASON_CODES.includes(code), code);
    assert.doesNotMatch(code, /^QA_/);
  }
}

const UNVERIFIED = 'ACCEPTANCE_CRITERION_UNVERIFIED';

describe('production path (auditQaEvidence)', () => {
  const inputs = {
    'base evidence with a trusted-looking population': {
      evidence: JSON.stringify(BASE.evidence),
      population: BASE.context.population,
    },
    'two criteria': {
      evidence: JSON.stringify(twoCriteria().evidence),
      population: twoCriteria().population,
    },
    'whole rejection': { evidence: '{', population: BASE.context.population },
    'no population': { evidence: JSON.stringify(BASE.evidence), population: undefined },
  };

  for (const [name, input] of Object.entries(inputs)) {
    test(`${name}: nothing is projected`, async () => {
      const result = await auditQaEvidence({
        ...input,
        observed: BASE.context.observed,
        roots: ROOTS,
      });
      assert.equal(projectQaEvidence(result), null);
    });
  }
});

describe('injected path with a determined population', () => {
  test('counts equal the validator result and fit the schema', () => {
    const result = judge(twoCriteria());
    const verified = result.criteria.filter((criterion) => criterion.verified).length;
    assert.equal(verified, 1);
    const projected = projectQaEvidence(result);
    assertProjectionContract(projected);
    assert.deepEqual(projected, {
      acceptanceCriteria: { total: 2, verified, unverified: 1 },
      reasonCodes: [UNVERIFIED],
    });
  });

  test('every criterion verified: no reasonCode', () => {
    const projected = projectQaEvidence(
      judge({ evidence: BASE.evidence, population: BASE.context.population })
    );
    assertProjectionContract(projected);
    assert.deepEqual(projected, {
      acceptanceCriteria: { total: 1, verified: 1, unverified: 0 },
      reasonCodes: [],
    });
  });

  test('production independence through evaluateQaEvidence: verified is 0', async () => {
    const { evidence, population } = twoCriteria();
    const result = await evaluateQaEvidence({
      evidence: JSON.stringify(evidence),
      population,
      observed: BASE.context.observed,
      roots: ROOTS,
      trustedSourceIds: BASE.context.trustedSourceIds,
    });
    const projected = projectQaEvidence(result);
    assertProjectionContract(projected);
    assert.deepEqual(projected, {
      acceptanceCriteria: { total: 2, verified: 0, unverified: 2 },
      reasonCodes: [UNVERIFIED],
    });
  });

  test('whole rejection still projects verified = 0, unverified = total', () => {
    const { population } = twoCriteria();
    const result = judge({ evidence: '{', population });
    assert.equal(result.accepted, false);
    const projected = projectQaEvidence(result);
    assertProjectionContract(projected);
    assert.deepEqual(projected, {
      acceptanceCriteria: { total: 2, verified: 0, unverified: 2 },
      reasonCodes: [UNVERIFIED],
    });
  });

  test('no state and no tests evidence leave the projection', () => {
    const projected = projectQaEvidence(judge(twoCriteria()));
    assert.equal('state' in projected, false);
    assert.equal('evidence' in projected, false);
    assert.doesNotMatch(JSON.stringify(projected), /"tests"|"present"/);
  });

  test('the schema check itself rejects a state, a QA_ code and a negative count', () => {
    const projected = projectQaEvidence(judge(twoCriteria()));
    assert.equal(validateProjection({ ...projected, state: 'UNVERIFIED' }), false);
    assert.equal(
      validateProjection({ ...projected, reasonCodes: ['QA_INDEPENDENCE_UNKNOWN'] }),
      false
    );
    assert.equal(
      validateProjection({
        ...projected,
        acceptanceCriteria: { ...projected.acceptanceCriteria, unverified: -1 },
      }),
      false
    );
  });
});
