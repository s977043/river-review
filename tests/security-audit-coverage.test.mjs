import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import {
  SECURITY_AUDIT_COVERAGE_STATUSES,
  SECURITY_AUDIT_UNIT_STATUSES,
  deriveSecurityAuditCoverage,
} from '../src/lib/security-audit-coverage.mjs';
import { compileSecurityAuditCoverageValidator } from './helpers/schema-validator.mjs';

const validateCoverage = compileSecurityAuditCoverageValidator();
const validationErrors = () => JSON.stringify(validateCoverage.errors, null, 2);

const attackRegistry = JSON.parse(
  readFileSync(
    new URL(
      '../skills/agent-skills/river-review-security-audit/references/attack-classes.json',
      import.meta.url
    ),
    'utf8'
  )
);

function unit(id, status = 'covered', extra = {}) {
  return {
    id,
    subsystem: 'auth',
    trustBoundary: 'tenant-user -> tenant-resource',
    attackClassId: 'authn-authz',
    status,
    reasonCode: null,
    reviewedPaths: status === 'covered' || status === 'candidate' ? ['src/auth/session.mjs'] : [],
    evidenceRefs: status === 'covered' || status === 'candidate' ? ['src/auth/session.mjs:42'] : [],
    candidateFindingIds: status === 'candidate' ? [`finding:${id}`] : [],
    validationPlan: null,
    explanation: null,
    ...extra,
  };
}

describe('deriveSecurityAuditCoverage', () => {
  it('reports complete when every applicable semantic unit was investigated', () => {
    const result = deriveSecurityAuditCoverage([
      unit('auth/authn'),
      unit('auth/injection', 'candidate', { attackClassId: 'injection' }),
      unit('browser/not-applicable', 'out-of-scope', {
        subsystem: 'api',
        attackClassId: 'browser-client',
        reasonCode: 'not_applicable',
        explanation: 'No browser or client execution surface exists in the scoped subsystem.',
      }),
    ]);

    assert.equal(result.status, 'complete');
    assert.equal(result.totalUnits, 3);
    assert.equal(result.applicableUnits, 2);
    assert.equal(result.investigatedUnits, 2);
    assert.deepEqual(result.gapUnitIds, []);
    assert.equal(validateCoverage(result), true, validationErrors());
  });

  it('reports partial when an investigated unit coexists with a planned gap', () => {
    const result = deriveSecurityAuditCoverage([
      unit('auth/authn'),
      unit('auth/tenant', 'planned', {
        attackClassId: 'tenant-isolation',
        reviewedPaths: [],
        evidenceRefs: [],
      }),
    ]);

    assert.equal(result.status, 'partial');
    assert.equal(result.investigatedUnits, 1);
    assert.deepEqual(result.gapUnitIds, ['auth/tenant']);
    assert.equal(validateCoverage(result), true, validationErrors());
  });

  it('reports not_started when applicable units exist but none was investigated', () => {
    const result = deriveSecurityAuditCoverage([
      unit('auth/authn', 'planned', { reviewedPaths: [], evidenceRefs: [] }),
      unit('auth/runtime', 'blocked', {
        attackClassId: 'resource-exhaustion',
        reasonCode: 'unsafe_execution_required',
        reviewedPaths: [],
        evidenceRefs: [],
        validationPlan: 'Reproduce only after a sandboxed execution adapter is available.',
      }),
    ]);

    assert.equal(result.status, 'not_started');
    assert.equal(result.investigatedUnits, 0);
    assert.deepEqual(result.gapUnitIds, ['auth/authn', 'auth/runtime']);
    assert.equal(validateCoverage(result), true, validationErrors());
  });

  it('does not use finding count to infer covered status', () => {
    const coveredWithoutCandidates = deriveSecurityAuditCoverage([unit('auth/authn')]);

    assert.equal(coveredWithoutCandidates.units[0].candidateFindingIds.length, 0);
    assert.equal(coveredWithoutCandidates.status, 'complete');
    assert.equal(validateCoverage(coveredWithoutCandidates), true, validationErrors());
  });
});

describe('security audit coverage schema', () => {
  it('stays aligned with runtime status vocabularies', () => {
    const schema = JSON.parse(
      readFileSync(new URL('../schemas/security-audit-coverage.schema.json', import.meta.url), 'utf8')
    );

    assert.deepEqual(schema.properties.status.enum, [...SECURITY_AUDIT_COVERAGE_STATUSES]);
    assert.deepEqual(schema.$defs.securityAuditUnit.properties.status.enum, [
      ...SECURITY_AUDIT_UNIT_STATUSES,
    ]);
  });

  it('accepts every Phase 2 attack-class id as a semantic coverage reference', () => {
    const units = attackRegistry.classes.map((attackClass, index) =>
      unit(`surface:${index}`, 'planned', {
        attackClassId: attackClass.id,
        reviewedPaths: [],
        evidenceRefs: [],
      })
    );
    const coverage = deriveSecurityAuditCoverage(units);

    assert.equal(validateCoverage(coverage), true, validationErrors());
    assert.deepEqual(
      coverage.units.map((item) => item.attackClassId),
      attackRegistry.classes.map((attackClass) => attackClass.id)
    );
  });

  it('rejects covered status without traceable reviewed paths and evidence', () => {
    const coverage = deriveSecurityAuditCoverage([
      unit('auth/authn', 'covered', { reviewedPaths: [], evidenceRefs: [] }),
    ]);

    assert.equal(validateCoverage(coverage), false);
  });

  it('rejects candidate status without a candidate finding reference', () => {
    const coverage = deriveSecurityAuditCoverage([
      unit('auth/authn', 'candidate', { candidateFindingIds: [] }),
    ]);

    assert.equal(validateCoverage(coverage), false);
  });

  it('rejects blocked status without a concrete validation plan', () => {
    const coverage = deriveSecurityAuditCoverage([
      unit('auth/runtime', 'blocked', {
        reasonCode: 'unsafe_execution_required',
        reviewedPaths: [],
        evidenceRefs: [],
        validationPlan: null,
      }),
    ]);

    assert.equal(validateCoverage(coverage), false);
  });

  it('rejects unexplained out-of-scope units', () => {
    const coverage = deriveSecurityAuditCoverage([
      unit('browser/not-applicable', 'out-of-scope', {
        attackClassId: 'browser-client',
        reasonCode: 'not_applicable',
        reviewedPaths: [],
        evidenceRefs: [],
        explanation: null,
      }),
    ]);

    assert.equal(validateCoverage(coverage), false);
  });
});
