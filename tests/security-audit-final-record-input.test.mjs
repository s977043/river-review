import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import * as auditPreflight from '../scripts/security-audit-final-record-input.mjs';
import { deriveSecurityAuditCoverage } from '../src/lib/security-audit-coverage.mjs';
import { buildSecurityAuditRunRecord } from '../src/lib/security-audit-report.mjs';

const inspect = auditPreflight.inspectSecurityAuditFinalRecordInput;

const frozenTarget = { repository: 'example/app', revision: 'deadbeef' };
const sourceAnchor = {
  kind: 'source',
  path: 'src/auth/session.mjs',
  lineStart: 12,
  lineEnd: 15,
};

function record(findings = [], target = frozenTarget) {
  return buildSecurityAuditRunRecord({
    runId: 'security-audit-1',
    target,
    generatedAt: '2026-10-27T00:00:00Z',
    coverage: deriveSecurityAuditCoverage([], { taxonomyVersion: '1.0.0' }),
    findings,
  });
}

function established(evidenceRefs = [sourceAnchor]) {
  return {
    id: 'SA-1',
    title: 'cross-tenant access',
    evidenceState: 'established',
    severity: 'major',
    evidenceRefs,
  };
}

describe('Phase 8 frozen audit record input (no verifier execution)', () => {
  it('accepts a consistent digest, exact target and anchored established finding', () => {
    const result = inspect(record([established()]), frozenTarget);
    assert.deepEqual(result, { inputReady: true, blockers: [] });
  });

  it('does not claim safety from zero findings', () => {
    assert.deepEqual(inspect(record(), frozenTarget), {
      inputReady: true,
      blockers: [],
    });
  });

  it('rejects malformed and missing run records', () => {
    assert.deepEqual(inspect(null, frozenTarget), {
      inputReady: false,
      blockers: ['record_missing'],
    });
    const mismatched = { ...record(), executionPolicy: 'unrestricted' };
    const result = inspect(mismatched, frozenTarget);
    assert.equal(result.inputReady, false);
    assert.ok(result.blockers.includes('unsupported_record_contract'));
  });

  it('rejects changed source revision even when the producer recalculates a valid digest', () => {
    const changed = record([established()], { ...frozenTarget, revision: 'new-revision' });
    assert.equal(inspect(changed, frozenTarget).inputReady, false);
    assert.deepEqual(inspect(changed, frozenTarget).blockers, ['target_revision_mismatch']);
  });

  it('rejects a modified record and a forged digest', () => {
    const original = record([established()]);
    const changed = { ...original, findings: [] };
    assert.ok(inspect(changed, frozenTarget).blockers.includes('record_digest_mismatch'));
    const malformed = { ...original, recordDigest: '0'.repeat(64) };
    assert.ok(inspect(malformed, frozenTarget).blockers.includes('record_digest_mismatch'));
  });

  it('requires a repository-relative source anchor for established findings', () => {
    for (const evidenceRefs of [
      [],
      [{ kind: 'source', path: '../secrets', lineStart: 1, lineEnd: 2 }],
      [{ kind: 'source', path: '/etc/passwd', lineStart: 1, lineEnd: 2 }],
      [{ kind: 'source', path: 'C:\\secrets.txt', lineStart: 1, lineEnd: 2 }],
      [{ kind: 'source', path: 'src/./auth.mjs', lineStart: 1, lineEnd: 2 }],
      [{ kind: 'source', path: 'src/auth/session.mjs', lineStart: 0, lineEnd: 2 }],
      [{ kind: 'source', path: 'src/auth/session.mjs', lineStart: 10, lineEnd: 9 }],
      [{ kind: 'documentation', path: 'README.md', lineStart: 1, lineEnd: 2 }],
    ]) {
      const result = inspect(record([established(evidenceRefs)]), frozenTarget);
      assert.deepEqual(result.blockers, ['established_source_anchor_missing']);
    }
  });

  it('does not promote unresolved or refuted findings through this input gate', () => {
    const result = inspect(
      record([
        {
          id: 'SA-2',
          title: 'needs deployment evidence',
          evidenceState: 'unresolved',
          blocker: 'deployment policy not available in source',
          validationPlan: 'ask owner to inspect policy offline',
        },
        { id: 'SA-3', title: 'disproven claim', evidenceState: 'refuted' },
      ]),
      frozenTarget
    );
    assert.deepEqual(result, { inputReady: true, blockers: [] });
  });

  it('refuses a missing frozen host target rather than trusting the producer target', () => {
    const result = inspect(record([established()]), undefined);
    assert.equal(result.inputReady, false);
    assert.deepEqual(result.blockers, ['target_revision_mismatch']);
  });
});
