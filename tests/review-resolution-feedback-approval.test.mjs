import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import {
  approveReviewResolutionFeedbackProposal,
  ReviewResolutionFeedbackApprovalError,
  reviewResolutionFeedbackProposalDigest,
} from '../src/lib/review-resolution-feedback-approval.mjs';

const FP = '0123456789abcdef';
const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);

function revision(runId, letter, sha) {
  return {
    reviewRunId: runId,
    executionManifestId: `RR-EXM-${letter.repeat(12)}`,
    artifactRefs: [{ name: 'diff', sha256: sha }],
  };
}
const TARGET = revision('target-run', 'b', SHA_B);
const SOURCE = revision('source-run', 'a', SHA_A);
const STALE = revision('older-run', 'a', SHA_A);
const APPROVED_AT = '2026-10-09T04:00:00.000Z';

function candidate(overrides = {}) {
  return {
    status: 'candidate',
    reasonCode: null,
    feedbackType: 'accepted',
    requiresHumanApproval: true,
    findingRef: {
      findingId: 'finding-1',
      fingerprint: FP,
      fingerprintAlgo: 'v1',
      sources: [{ findingId: 'orig-1', reviewerId: 'bug-hunter' }],
    },
    reviewRunId: 'source-run',
    executionManifestId: 'RR-EXM-aaaaaaaaaaaa',
    reviewerIds: ['bug-hunter', 'security-scanner'],
    skillId: 'midstream/test-skill',
    authorRationale: 'Fixed the finding',
    verification: {
      state: 'verified_resolved',
      verifier: 'finding-critic',
      coverageStatus: 'complete',
      evidenceRefs: [{ ref: 'critic:finding-1@target-run', sha256: SHA_B }],
      target: TARGET,
    },
    ...overrides,
  };
}

function approvalFor(proposal, overrides = {}) {
  return {
    actor: 'maintainer-1',
    rationale: 'Reviewed the targeted verification evidence.',
    approvedAt: APPROVED_AT,
    proposalDigest: reviewResolutionFeedbackProposalDigest(proposal),
    findingId: proposal.findingRef.findingId,
    findingFingerprint: proposal.findingRef.fingerprint,
    reviewRunId: proposal.reviewRunId,
    feedbackType: proposal.feedbackType,
    skillId: proposal.skillId,
    ...overrides,
  };
}

function execute(proposal, options = {}) {
  return approveReviewResolutionFeedbackProposal({
    proposal,
    currentProposal: structuredClone(proposal),
    currentRevision: TARGET,
    approval: approvalFor(proposal),
    ...options,
  });
}

function expectRejected(fn, code) {
  assert.throws(
    fn,
    (error) => error instanceof ReviewResolutionFeedbackApprovalError && error.code === code
  );
}

describe('Review Resolution explicit Feedback approval (#2591)', () => {
  test('approved verified finding produces one canonical FeedbackEntry and separate audit', () => {
    const proposed = candidate();
    const result = execute(proposed, { trigger: 'fix-pr', pr: 42 });
    assert.equal(result.status, 'ready');
    assert.deepEqual(result.feedbackEntry, {
      timestamp: APPROVED_AT,
      trigger: 'fix-pr',
      feedbackType: 'accepted',
      skillId: 'midstream/test-skill',
      findingFingerprint: FP,
      evidence: 'Reviewed the targeted verification evidence.',
      pr: 42,
      review_run_id: 'source-run',
    });
    assert.deepEqual(result.audit.source.reviewerIds, ['bug-hunter', 'security-scanner']);
    assert.deepEqual(
      result.audit.source.verification.evidenceRefs,
      proposed.verification.evidenceRefs
    );
    assert.equal(result.audit.proposalDigest, reviewResolutionFeedbackProposalDigest(proposed));
    assert.equal('actor' in result.feedbackEntry, false);
    assert.equal('verification' in result.feedbackEntry, false);
  });

  test('single original reviewer keeps attribution without guessing Skill ownership', () => {
    const result = execute(candidate({ reviewerIds: ['bug-hunter'] }));
    assert.equal(result.feedbackEntry.reviewer, 'bug-hunter');
    assert.equal(result.feedbackEntry.skillId, 'midstream/test-skill');
  });

  test('approved human risk response can create accepted_risk without a target revision', () => {
    const proposed = candidate({
      feedbackType: 'accepted_risk',
      authorRationale: 'Maintainer accepts compatibility risk for this release.',
      verification: {
        state: 'not_requested',
        verifier: null,
        coverageStatus: 'unknown',
        evidenceRefs: [],
        target: null,
      },
    });
    const result = execute(proposed, { currentRevision: SOURCE });
    assert.equal(result.status, 'ready');
    assert.equal(result.feedbackEntry.feedbackType, 'accepted_risk');
    assert.equal(result.audit.source.verification.state, 'not_requested');
    expectRejected(() => execute(proposed, { currentRevision: null }), 'stale_or_unknown_revision');
    expectRejected(
      () => execute(proposed, { currentRevision: TARGET }),
      'stale_or_unknown_revision'
    );
  });

  test('exact proposal digest does not depend on object key insertion order', () => {
    const proposed = candidate();
    const reordered = Object.fromEntries(Object.entries(proposed).reverse());
    assert.equal(
      reviewResolutionFeedbackProposalDigest(proposed),
      reviewResolutionFeedbackProposalDigest(reordered)
    );
  });

  test('rejects implicit, incomplete, forged or stale approval', () => {
    const proposed = candidate();
    expectRejected(() => execute(proposed, { approval: null }), 'invalid_human_approval');
    expectRejected(
      () => execute(proposed, { approval: approvalFor(proposed, { actor: ' ' }) }),
      'invalid_human_approval'
    );
    expectRejected(
      () => execute(proposed, { approval: approvalFor(proposed, { rationale: '' }) }),
      'invalid_human_approval'
    );
    expectRejected(
      () =>
        execute(proposed, {
          approval: approvalFor(proposed, { approvedAt: '2026-02-30T00:00:00.000Z' }),
        }),
      'invalid_human_approval'
    );
    expectRejected(
      () => execute(proposed, { approval: approvalFor(proposed, { approvedAt: 'yesterday' }) }),
      'invalid_human_approval'
    );
    expectRejected(
      () =>
        execute(proposed, { approval: approvalFor(proposed, { proposalDigest: '0'.repeat(64) }) }),
      'approval_digest_mismatch'
    );
    expectRejected(
      () =>
        execute(proposed, { approval: approvalFor(proposed, { findingId: 'another-finding' }) }),
      'approval_target_mismatch'
    );
    expectRejected(
      () => execute(proposed, { approval: approvalFor(proposed, { reviewRunId: 'other-run' }) }),
      'approval_target_mismatch'
    );
    expectRejected(
      () =>
        execute(proposed, {
          currentProposal: candidate({ authorRationale: 'Changed after approval' }),
        }),
      'stale_or_swapped_proposal'
    );
    expectRejected(
      () =>
        approveReviewResolutionFeedbackProposal({
          proposal: proposed,
          approval: approvalFor(proposed),
        }),
      'current_proposal_required'
    );
    expectRejected(
      () => execute(proposed, { currentRevision: STALE }),
      'stale_or_unknown_revision'
    );
    expectRejected(() => execute(proposed, { currentRevision: null }), 'stale_or_unknown_revision');
  });

  test('rejects unapprovable statuses, malformed fingerprints and missing evidence', () => {
    for (const value of ['needs_human', 'no_proposal']) {
      expectRejected(
        () => reviewResolutionFeedbackProposalDigest(candidate({ status: value })),
        'not_an_approvable_candidate'
      );
    }
    expectRejected(
      () => reviewResolutionFeedbackProposalDigest(candidate({ feedbackType: 'false_positive' })),
      'unsupported_feedback_type'
    );
    expectRejected(
      () =>
        reviewResolutionFeedbackProposalDigest(
          candidate({
            findingRef: { findingId: 'finding-1', fingerprint: 'not-v1', fingerprintAlgo: 'v2' },
          })
        ),
      'incompatible_fingerprint'
    );
    expectRejected(
      () => reviewResolutionFeedbackProposalDigest(candidate({ reviewerIds: [] })),
      'missing_reviewer_provenance'
    );
    expectRejected(
      () =>
        reviewResolutionFeedbackProposalDigest(
          candidate({
            verification: { ...candidate().verification, evidenceRefs: [] },
          })
        ),
      'insufficient_verification_evidence'
    );
    expectRejected(
      () =>
        reviewResolutionFeedbackProposalDigest(
          candidate({
            feedbackType: 'accepted_risk',
            authorRationale: '',
          })
        ),
      'missing_risk_acceptance_rationale'
    );
  });

  test('existing canonical feedback returns explicit duplicate without a new entry', () => {
    const proposed = candidate();
    const first = execute(proposed);
    const result = execute(proposed, {
      existingFeedback: [{ ...first.feedbackEntry, timestamp: '2026-10-08T12:00:00.000Z' }],
    });
    assert.equal(result.status, 'duplicate');
    assert.equal(result.feedbackEntry, null);
    assert.equal(result.audit.status, 'duplicate');
  });

  test('only exact four-field duplicate identity is deduplicated', () => {
    const proposed = candidate();
    const existing = execute(proposed).feedbackEntry;
    for (const record of [
      { ...existing, review_run_id: 'other-run' },
      { ...existing, findingFingerprint: 'abcdef0123456789' },
      { ...existing, feedbackType: 'accepted_risk' },
      { ...existing, skillId: 'other-skill' },
    ]) {
      assert.equal(execute(proposed, { existingFeedback: [record] }).status, 'ready');
    }
  });

  test('invalid existingFeedback and trigger fail closed', () => {
    const proposed = candidate();
    expectRejected(
      () => execute(proposed, { existingFeedback: null }),
      'invalid_existing_feedback'
    );
    expectRejected(
      () => execute(proposed, { trigger: 'untrusted-event' }),
      'invalid_feedback_trigger'
    );
    expectRejected(() => execute(proposed, { pr: -1 }), 'invalid_pr');
  });

  test('does not mutate inputs or perform writes, even with frozen proposal and feedback', () => {
    const proposed = Object.freeze(candidate());
    const current = Object.freeze(structuredClone(proposed));
    const approval = Object.freeze(approvalFor(proposed));
    const feedback = Object.freeze([]);
    const input = JSON.stringify({ proposed, current, approval, feedback });
    const output = approveReviewResolutionFeedbackProposal({
      proposal: proposed,
      currentProposal: current,
      approval,
      existingFeedback: feedback,
      currentRevision: TARGET,
    });
    assert.equal(output.status, 'ready');
    assert.equal(JSON.stringify({ proposed, current, approval, feedback }), input);
    assert.equal('writeEffects' in output, false);
  });
});
