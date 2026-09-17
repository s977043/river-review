import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { deriveSecurityAuditCoverage } from '../src/lib/security-audit-coverage.mjs';
import {
  SECURITY_AUDIT_ARTIFACT_DIR,
  buildSecurityAuditArtifactSet,
  buildSecurityAuditRunRecord,
  renderNeedsValidation,
  renderSecurityAuditReport,
} from '../src/lib/security-audit-report.mjs';
import { compileSecurityAuditRunRecordValidator } from './helpers/schema-validator.mjs';

const validateRecord = compileSecurityAuditRunRecordValidator();
const validationErrors = () => JSON.stringify(validateRecord.errors, null, 2);

const attackRegistry = JSON.parse(
  readFileSync(
    new URL(
      '../skills/agent-skills/river-review-security-audit/references/attack-classes.json',
      import.meta.url
    ),
    'utf8'
  )
);

function unit(id, state = 'covered', extra = {}) {
  return {
    id,
    subsystem: 'auth',
    trustBoundary: 'tenant-user -> tenant-resource',
    attackClassId: 'authn-authz',
    state,
    reasonCode: null,
    reviewedPaths: state === 'covered' ? ['src/auth/session.mjs'] : [],
    evidenceRefs:
      state === 'covered'
        ? [
            {
              kind: 'source',
              path: 'src/auth/session.mjs',
              lineStart: 42,
              lineEnd: 44,
              note: 'authorization enforcement evidence',
            },
          ]
        : [],
    relatedFindingIds: [],
    validationPlan: null,
    explanation: null,
    ...extra,
  };
}

const coverage = deriveSecurityAuditCoverage(
  [
    unit('auth/authn'),
    unit('auth/tenant', 'blocked', {
      attackClassId: 'tenant-isolation',
      reasonCode: 'unsafe_execution_required',
      validationPlan: 'run the multi-tenant probe suite inside a sandbox',
      explanation: 'cross-tenant behavior cannot be established from source alone',
    }),
  ],
  { taxonomyVersion: attackRegistry.version }
);

const establishedFinding = {
  id: 'SA-001',
  title: 'session token is compared non-constant-time',
  evidenceState: 'established',
  severity: 'major',
  attackClassId: 'authn-authz',
  subsystem: 'auth',
  scope: 'repository',
  askRelevance: 'unrelated to the current change',
  evidenceRefs: [],
};

const unresolvedFinding = {
  id: 'SA-002',
  title: 'tenant id may be attacker controlled',
  evidenceState: 'unresolved',
  blocker: 'the caller of resolveTenant() could not be traced from source',
  validationPlan: 'trace every resolveTenant() call site in the request pipeline',
  attackClassId: 'tenant-isolation',
  subsystem: 'auth',
};

function record(overrides = {}) {
  return buildSecurityAuditRunRecord({
    runId: 'audit-2026-09-18-1',
    target: { repository: 'example/app', revision: 'deadbeef' },
    generatedAt: '2026-09-18T00:00:00Z',
    coverage,
    repeatRun: {
      kind: 'SecurityAuditRepeatRun',
      priorUnitCount: 2,
      carriedOverUnitIds: ['auth/authn'],
      revalidationRequired: [{ unitId: 'auth/tenant', reason: 'source_changed' }],
      freshUnitIds: [],
    },
    candidates: [{ id: 'C-1', title: 'candidate token comparison', promotedFindingId: 'SA-001' }],
    findings: [establishedFinding, unresolvedFinding],
    architectureNotes: ['request -> auth middleware -> tenant resolver -> datastore'],
    ...overrides,
  });
}

describe('buildSecurityAuditRunRecord', () => {
  it('produces a schema-valid, source-only experimental record', () => {
    const built = record();
    assert.equal(built.executionPolicy, 'source-only');
    assert.equal(built.status, 'experimental');
    assert.deepEqual(built.findingCountsByEvidenceState, {
      established: 1,
      unresolved: 1,
      refuted: 0,
    });
    assert.match(built.recordDigest, /^[0-9a-f]{64}$/);
    assert.ok(validateRecord(built), validationErrors());
  });

  it('rejects an unresolved finding that carries a severity', () => {
    assert.throws(
      () => record({ findings: [{ ...unresolvedFinding, severity: 'critical' }] }),
      /must not carry a severity/
    );
  });

  it('rejects an unresolved finding with no exact blocker or validation plan', () => {
    assert.throws(
      () => record({ findings: [{ ...unresolvedFinding, blocker: '  ' }] }),
      /blocker must be a non-empty string/
    );
  });

  it('rejects a severity outside the output-schema vocabulary', () => {
    assert.throws(
      () => record({ findings: [{ ...establishedFinding, severity: 'CATASTROPHIC' }] }),
      /not a known severity/
    );
  });

  it('rejects a coverage block whose counters disagree with its own units', () => {
    const forged = {
      ...coverage,
      coveredUnits: 100,
      totalUnits: 100,
      applicableUnits: 100,
      units: [],
    };
    assert.throws(() => record({ coverage: forged }), /failed semantic validation/);
  });

  it('enforces taxonomy and attack-class checks when an attack registry is supplied', () => {
    assert.throws(
      () => record({ attackRegistry: { version: '99.0.0', classes: attackRegistry.classes } }),
      /taxonomyVersion/
    );
    assert.ok(record({ attackRegistry }));
  });

  it('rejects a syntactically valid but impossible calendar instant', () => {
    assert.throws(() => record({ generatedAt: '2026-13-45T99:99:99Z' }), /ISO-8601 UTC instant/);
  });

  it('rejects an unknown evidence state rather than defaulting it', () => {
    assert.throws(
      () => record({ findings: [{ ...establishedFinding, evidenceState: 'confirmed' }] }),
      /not a known evidence state/
    );
  });
});

describe('security audit prose rendering', () => {
  it('reads severity from the record instead of recomputing it', () => {
    const report = renderSecurityAuditReport(record());
    assert.match(report, /severity: major/);

    const critical = renderSecurityAuditReport(
      record({ findings: [{ ...establishedFinding, severity: 'critical' }] })
    );
    assert.match(critical, /severity: critical/);
    assert.doesNotMatch(critical, /severity: major/);
  });

  it('does not invent a severity for an established finding that was never given one', () => {
    const report = renderSecurityAuditReport(
      record({ findings: [{ ...establishedFinding, severity: null }] })
    );
    assert.match(report, /severity: \(not recorded\)/);
    assert.doesNotMatch(report, /unresolved\)/);
    assert.doesNotMatch(report, /severity: (critical|major|minor|info)/);
  });

  it('never prints a severity for an unresolved finding', () => {
    const needs = renderNeedsValidation(record());
    assert.match(needs, /SA-002/);
    assert.match(needs, /exact blocker: the caller of resolveTenant\(\)/);
    assert.doesNotMatch(needs, /severity/);
  });

  it('states that zero findings is not a safety proof', () => {
    const report = renderSecurityAuditReport(record({ findings: [] }));
    assert.match(report, /`0 findings` is not a proof of safety/);
    assert.match(report, /## Established findings\n\nNone recorded in this run\./);
  });

  it('lists refuted findings by id rather than collapsing them to a count', () => {
    const report = renderSecurityAuditReport(
      record({
        findings: [
          { ...establishedFinding, id: 'SA-009', evidenceState: 'refuted', severity: null },
        ],
      })
    );
    assert.match(report, /## Refuted findings\n\n- `SA-009` — /);
  });

  it('lists open coverage units and repeat-run revalidation in NEEDS-VALIDATION', () => {
    const needs = renderNeedsValidation(record());
    assert.match(needs, /`auth\/tenant` \(blocked, unsafe_execution_required\)/);
    assert.match(needs, /`auth\/tenant` — source_changed/);
  });
});

describe('buildSecurityAuditArtifactSet', () => {
  it('emits the Epic-pinned artifact layout with machine-readable payloads split out', () => {
    const artifacts = buildSecurityAuditArtifactSet(record());
    assert.deepEqual(Object.keys(artifacts).sort(), [
      `${SECURITY_AUDIT_ARTIFACT_DIR}/NEEDS-VALIDATION.md`,
      `${SECURITY_AUDIT_ARTIFACT_DIR}/REPORT.md`,
      `${SECURITY_AUDIT_ARTIFACT_DIR}/architecture.md`,
      `${SECURITY_AUDIT_ARTIFACT_DIR}/audit-coverage.json`,
      `${SECURITY_AUDIT_ARTIFACT_DIR}/candidates.json`,
      `${SECURITY_AUDIT_ARTIFACT_DIR}/findings.json`,
      `${SECURITY_AUDIT_ARTIFACT_DIR}/run-metadata.json`,
    ]);

    const metadata = JSON.parse(artifacts[`${SECURITY_AUDIT_ARTIFACT_DIR}/run-metadata.json`]);
    assert.equal(metadata.coverage, undefined);
    assert.equal(metadata.findings, undefined);
    assert.equal(metadata.executionPolicy, 'source-only');

    const findings = JSON.parse(artifacts[`${SECURITY_AUDIT_ARTIFACT_DIR}/findings.json`]);
    assert.equal(findings[1].severity, null);
    assert.equal(
      JSON.parse(artifacts[`${SECURITY_AUDIT_ARTIFACT_DIR}/audit-coverage.json`]).kind,
      'SecurityAuditCoverage'
    );
  });

  it('refuses anything that is not a run record', () => {
    assert.throws(
      () => buildSecurityAuditArtifactSet({ kind: 'nope' }),
      /must be a SecurityAuditRunRecord/
    );
  });
});
