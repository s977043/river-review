import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { evaluateSelfDismissalShadow } from '../src/lib/self-dismissal-shadow-eval.mjs';

function sample(id, oracle, changes = {}) {
  return {
    id,
    oracle,
    initialDisposition: 'dismissed',
    subjectRevision: 'commit-a',
    finderRunId: 'finder-' + id,
    verification: {
      verifierRunId: 'verifier-' + id,
      subjectRevision: 'commit-a',
      claim: 'bug',
      evidenceRefs: [{ path: 'src/example.mjs', lineStart: 12 }],
    },
    ...changes,
  };
}

describe('Sashiko-inspired self-dismissal shadow evaluation', () => {
  it('measures recovered true-bug candidates and false alarms separately', () => {
    const result = evaluateSelfDismissalShadow({
      cases: [sample('real', 'bug'), sample('false', 'not-bug')],
    });
    assert.equal(result.shadowOnly, true);
    assert.deepEqual(result.metrics, {
      cases: 2,
      knownDismissedBugs: 1,
      knownDismissedNonBugs: 1,
      recoveredBugCandidates: 1,
      missedBugCandidates: 0,
      falseAlarmCandidates: 1,
      candidateRecall: 1,
      candidateFalseAlarmRate: 1,
    });
    assert.ok(result.records.every((record) => record.requiresHumanEvidenceAudit));
  });

  it('does not accept a self-verification with the same execution id', () => {
    const result = evaluateSelfDismissalShadow({
      cases: [
        sample('same-run', 'bug', {
          verification: {
            verifierRunId: 'finder-same-run',
            subjectRevision: 'commit-a',
            claim: 'bug',
            evidenceRefs: [{ path: 'src/example.mjs', lineStart: 12 }],
          },
        }),
      ],
    });
    assert.equal(result.metrics.recoveredBugCandidates, 0);
    assert.deepEqual(result.records[0].reasonCodes, ['logical-independence-unverified']);
  });

  it('keeps stale, uncited, missing and unresolved verification out of candidates', () => {
    const cases = [
      sample('stale', 'bug', {
        verification: {
          verifierRunId: 'v1',
          subjectRevision: 'old',
          claim: 'bug',
          evidenceRefs: [{ path: 'x', lineStart: 1 }],
        },
      }),
      sample('uncited', 'bug', {
        verification: {
          verifierRunId: 'v2',
          subjectRevision: 'commit-a',
          claim: 'bug',
          evidenceRefs: [{ path: 'x', lineStart: 0 }],
        },
      }),
      sample('not-run', 'bug', { verification: undefined }),
      sample('unresolved', 'bug', {
        verification: {
          verifierRunId: 'v4',
          subjectRevision: 'commit-a',
          claim: 'unresolved',
          evidenceRefs: [{ path: 'x', lineStart: 1 }],
        },
      }),
    ];
    const result = evaluateSelfDismissalShadow({ cases });
    assert.equal(result.metrics.missedBugCandidates, 4);
    assert.ok(result.records.every((record) => !record.auditCandidate));
    assert.ok(result.records[0].reasonCodes.includes('revision-unverified-or-stale'));
    assert.ok(result.records[1].reasonCodes.includes('citation-missing'));
    assert.ok(result.records[2].reasonCodes.includes('verifier-result-unavailable'));
    assert.ok(result.records[3].reasonCodes.includes('verifier-unresolved'));
  });

  it('rejects malformed input, duplicate cases and unknown truth rather than claiming clean', () => {
    assert.throws(() => evaluateSelfDismissalShadow(), /cases must be an array/);
    assert.throws(
      () => evaluateSelfDismissalShadow({ cases: [sample('x', 'bug'), sample('x', 'bug')] }),
      /duplicate case id/
    );
    assert.throws(
      () => evaluateSelfDismissalShadow({ cases: [sample('x', 'unknown')] }),
      /frozen human oracle/
    );
    assert.throws(
      () =>
        evaluateSelfDismissalShadow({
          cases: Array.from({ length: 101 }, (_, index) => sample(String(index), 'bug')),
        }),
      /explicit limit/
    );
  });

  it('does not invent rates when a denominator is zero', () => {
    const zero = evaluateSelfDismissalShadow({ cases: [] });
    assert.equal(zero.metrics.candidateRecall, null);
    assert.equal(zero.metrics.candidateFalseAlarmRate, null);
    assert.equal(zero.metrics.cases, 0);
  });
});
