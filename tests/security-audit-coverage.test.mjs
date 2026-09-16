import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import {
  SECURITY_AUDIT_UNIT_STATES,
  deriveSecurityAuditCoverage,
  validateSecurityAuditCoverageSemantics,
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

function sourceRef(path = 'src/auth/session.mjs', line = 42) {
  return {
    kind: 'source',
    path,
    lineStart: line,
    lineEnd: line,
    note: 'authorization enforcement evidence',
  };
}

function unit(id, state = 'covered', extra = {}) {
  return {
    id,
    subsystem: 'auth',
    trustBoundary: 'tenant-user -> tenant-resource',
    attackClassId: 'authn-authz',
    state,
    reasonCode: null,
    reviewedPaths: state === 'covered' ? ['src/auth/session.mjs'] : [],
    evidenceRefs: state === 'covered' ? [sourceRef()] : [],
    relatedFindingIds: [],
    validationPlan: null,
    explanation: null,
    ...extra,
  };
}

function derive(units) {
  return deriveSecurityAuditCoverage(units, { taxonomyVersion: attackRegistry.version });
}

describe('deriveSecurityAuditCoverage', () => {
  it('derives state counters without emitting a security-complete verdict', () => {
    const result = derive([
      unit('auth/authn'),
      unit('auth/injection', 'covered', {
        attackClassId: 'injection',
        relatedFindingIds: ['finding:auth-injection'],
      }),
      unit('browser/not-applicable', 'out_of_scope', {
        subsystem: 'api',
        attackClassId: 'browser-client',
        reasonCode: 'not_applicable',
        explanation: 'No browser or client execution surface exists in the scoped subsystem.',
      }),
    ]);

    assert.equal(result.kind, 'SecurityAuditCoverage');
    assert.equal(result.executionPolicy, 'source-only');
    assert.equal(result.taxonomyVersion, attackRegistry.version);
    assert.equal(result.totalUnits, 3);
    assert.equal(result.applicableUnits, 2);
    assert.equal(result.coveredUnits, 2);
    assert.equal(result.outOfScopeUnits, 1);
    assert.deepEqual(result.openUnitIds, []);
    assert.equal('status' in result, false);
    assert.equal(validateCoverage(result), true, validationErrors());
  });

  it('keeps planned, blocked, and deferred units open', () => {
    const result = derive([
      unit('auth/planned', 'planned'),
      unit('auth/runtime', 'blocked', {
        attackClassId: 'resource-exhaustion',
        reasonCode: 'unsafe_execution_required',
        explanation: 'Runtime amplification cannot be established safely from source alone.',
        validationPlan: 'Reproduce only after a sandboxed execution adapter is available.',
      }),
      unit('auth/deferred', 'deferred', {
        attackClassId: 'data-lifecycle',
        reasonCode: 'budget_deferred',
        explanation: 'Backup lifecycle inspection is outside the current audit budget.',
        validationPlan: 'Inspect backup and deletion configuration in the next audit slice.',
      }),
    ]);

    assert.equal(result.coveredUnits, 0);
    assert.equal(result.plannedUnits, 1);
    assert.equal(result.blockedUnits, 1);
    assert.equal(result.deferredUnits, 1);
    assert.deepEqual(result.openUnitIds, ['auth/planned', 'auth/runtime', 'auth/deferred']);
    assert.equal(validateCoverage(result), true, validationErrors());
  });

  it('does not use related findings to infer coverage state', () => {
    const plannedWithFinding = derive([
      unit('auth/planned', 'planned', { relatedFindingIds: ['finding:candidate-1'] }),
    ]);

    assert.equal(plannedWithFinding.coveredUnits, 0);
    assert.equal(plannedWithFinding.plannedUnits, 1);
    assert.deepEqual(plannedWithFinding.openUnitIds, ['auth/planned']);
    assert.equal(validateCoverage(plannedWithFinding), true, validationErrors());
  });

  it('requires explicit taxonomy provenance', () => {
    assert.throws(
      () => deriveSecurityAuditCoverage([unit('auth/authn')]),
      /taxonomyVersion must be an explicit semantic version/
    );
  });
});

describe('security audit coverage schema', () => {
  it('stays aligned with the runtime unit-state vocabulary', () => {
    const schema = JSON.parse(
      readFileSync(new URL('../schemas/security-audit-coverage.schema.json', import.meta.url), 'utf8')
    );

    assert.deepEqual(schema.$defs.securityAuditUnit.properties.state.enum, [
      ...SECURITY_AUDIT_UNIT_STATES,
    ]);
  });

  it('accepts every Phase 2 attack-class id as a semantic coverage reference', () => {
    const units = attackRegistry.classes.map((attackClass, index) =>
      unit(`surface:${index}`, 'planned', {
        subsystem: `subsystem:${index}`,
        trustBoundary: `boundary:${index}`,
        attackClassId: attackClass.id,
      })
    );
    const coverage = derive(units);

    assert.equal(validateCoverage(coverage), true, validationErrors());
    assert.deepEqual(
      coverage.units.map((item) => item.attackClassId),
      attackRegistry.classes.map((attackClass) => attackClass.id)
    );
    assert.deepEqual(validateSecurityAuditCoverageSemantics(coverage, attackRegistry), []);
  });

  it('rejects covered state without traceable reviewed paths and evidence', () => {
    const coverage = derive([
      unit('auth/authn', 'covered', { reviewedPaths: [], evidenceRefs: [] }),
    ]);

    assert.equal(validateCoverage(coverage), false);
  });

  it('rejects candidate as a coverage state because finding lifecycle is separate', () => {
    const coverage = derive([
      unit('auth/authn', 'candidate', {
        reviewedPaths: ['src/auth/session.mjs'],
        evidenceRefs: [sourceRef()],
        relatedFindingIds: ['finding:candidate-1'],
      }),
    ]);

    assert.equal(validateCoverage(coverage), false);
  });

  it('rejects blocked state without explanation and a concrete validation plan', () => {
    const coverage = derive([
      unit('auth/runtime', 'blocked', {
        reasonCode: 'unsafe_execution_required',
        validationPlan: null,
        explanation: null,
      }),
    ]);

    assert.equal(validateCoverage(coverage), false);
  });

  it('rejects deferred state without an explicit explanation', () => {
    const coverage = derive([
      unit('auth/deferred', 'deferred', {
        reasonCode: 'manual_defer',
        validationPlan: 'Review this boundary in the next audit run.',
        explanation: null,
      }),
    ]);

    assert.equal(validateCoverage(coverage), false);
  });

  it('rejects unexplained out-of-scope units', () => {
    const coverage = derive([
      unit('browser/not-applicable', 'out_of_scope', {
        attackClassId: 'browser-client',
        reasonCode: 'not_applicable',
        explanation: null,
      }),
    ]);

    assert.equal(validateCoverage(coverage), false);
  });
});

describe('validateSecurityAuditCoverageSemantics', () => {
  it('detects unknown attack classes and taxonomy drift', () => {
    const coverage = derive([
      unit('auth/unknown', 'planned', { attackClassId: 'unknown-security-class' }),
    ]);
    coverage.taxonomyVersion = '9.9.9';

    const codes = validateSecurityAuditCoverageSemantics(coverage, attackRegistry).map(
      ({ code }) => code
    );

    assert.ok(codes.includes('taxonomy_version_mismatch'));
    assert.ok(codes.includes('unknown_attack_class'));
  });

  it('detects duplicate ids and duplicate semantic units', () => {
    const coverage = derive([
      unit('same-id'),
      unit('same-id', 'planned'),
    ]);
    const codes = validateSecurityAuditCoverageSemantics(coverage, attackRegistry).map(
      ({ code }) => code
    );

    assert.ok(codes.includes('duplicate_unit_id'));
    assert.ok(codes.includes('duplicate_semantic_unit'));
  });

  it('detects manually corrupted summary counters', () => {
    const coverage = derive([unit('auth/authn')]);
    coverage.coveredUnits = 0;
    coverage.openUnitIds = ['auth/authn'];

    const issues = validateSecurityAuditCoverageSemantics(coverage, attackRegistry);

    assert.ok(issues.filter(({ code }) => code === 'summary_mismatch').length >= 2);
  });
});
