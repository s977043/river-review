import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { buildFeedbackEntry } from '../src/lib/feedback.mjs';
import { buildReviewResolution } from '../src/lib/review-resolution.mjs';
import {
  buildReviewResolutionFeedbackProposals,
  RESOLUTION_FEEDBACK_PROPOSAL_STATUSES,
} from '../src/lib/review-resolution-feedback.mjs';

const FP = '0123456789abcdef';
const OTHER = 'abcdef0123456789';

function revision(runId, hex) {
  return {
    reviewRunId: runId,
    executionManifestId: 'RR-EXM-' + hex.slice(0, 12),
    artifactRefs: [{ name: 'diff', sha256: hex.repeat(4) }],
  };
}
const SOURCE = revision('run-source', 'a'.repeat(16));
const TARGET = revision('run-target', 'b'.repeat(16));

function item({
  fingerprint = FP,
  authorState = 'will_fix',
  rationale = 'Fixed the reported bug',
  resolutionState = 'action_submitted',
  verificationState = 'verified_resolved',
  coverage = 'complete',
  verifier = 'verifier-1',
  evidenceRefs = [{ ref: 'test:case-42', sha256: null }],
  target = TARGET,
} = {}) {
  return {
    findingRef: {
      findingId: 'finding-1',
      fingerprint,
      fingerprintAlgo: 'v1',
      sources: [
        { findingId: 'finder-1', reviewerId: 'reviewer-a' },
        { findingId: 'finder-2', reviewerId: 'reviewer-b' },
        { findingId: 'finder-3', reviewerId: 'reviewer-a' },
      ],
    },
    systemJudgment: { disposition: 'blocking', source: 'legacy-policy' },
    authorResponse: { state: authorState, rationale },
    resolution: { state: resolutionState, target, decisionRefs: [] },
    verification: {
      state: verificationState,
      verifier,
      coverageStatus: coverage,
      evidenceRefs,
    },
  };
}

function document(items) {
  return buildReviewResolution({
    resolutionId: 'RR-RES-pr-42',
    source: SOURCE,
    items,
  });
}

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

describe('Resolution -> Feedback proposals (#2575)', () => {
  test('proposes accepted only for explicit verified_resolved evidence and trusted skill mapping', () => {
    const doc = deepFreeze(document([item()]));
    const before = JSON.stringify(doc);
    const [proposal] = buildReviewResolutionFeedbackProposals({
      reviewResolution: doc,
      skillIdByFingerprint: { [FP]: 'midstream/sample-skill' },
    });

    assert.equal(proposal.status, 'candidate');
    assert.equal(proposal.feedbackType, 'accepted');
    assert.equal(proposal.requiresHumanApproval, true);
    assert.equal(proposal.reviewRunId, SOURCE.reviewRunId);
    assert.equal(proposal.executionManifestId, SOURCE.executionManifestId);
    assert.deepEqual(proposal.reviewerIds, ['reviewer-a', 'reviewer-b']);
    assert.deepEqual(proposal.verification.evidenceRefs, [
      { ref: 'test:case-42', sha256: null },
    ]);
    assert.deepEqual(proposal.verification.target, TARGET);
    assert.equal(JSON.stringify(doc), before);
    assert.notEqual(proposal.findingRef, doc.items[0].findingRef);
    assert.notEqual(proposal.verification.evidenceRefs, doc.items[0].verification.evidenceRefs);
  });

  test('proposes accepted_risk only with author risk acceptance and a rationale', () => {
    const doc = document([
      item({
        fingerprint: OTHER,
        authorState: 'accepts_risk',
        rationale: 'Known compatibility tradeoff',
        resolutionState: 'risk_accepted',
        verificationState: 'not_requested',
        coverage: 'unknown',
        verifier: null,
        evidenceRefs: [],
        target: null,
      }),
    ]);
    const [proposal] = buildReviewResolutionFeedbackProposals({
      reviewResolution: doc,
      skillIdByFingerprint: { [OTHER]: 'review/skill' },
    });
    assert.equal(proposal.status, 'candidate');
    assert.equal(proposal.feedbackType, 'accepted_risk');
    assert.equal(proposal.authorRationale, 'Known compatibility tradeoff');
  });

  test('holds a risk acceptance without explicit human rationale', () => {
    const doc = document([
      item({
        authorState: 'accepts_risk',
        rationale: null,
        resolutionState: 'risk_accepted',
        verificationState: 'not_requested',
        coverage: 'unknown',
        verifier: null,
        evidenceRefs: [],
        target: null,
      }),
    ]);
    const [proposal] = buildReviewResolutionFeedbackProposals({
      reviewResolution: doc,
      skillIdByFingerprint: { [FP]: 'review/skill' },
    });
    assert.equal(proposal.status, 'needs_human');
    assert.equal(proposal.reasonCode, 'human_rationale_missing');
    assert.equal(proposal.feedbackType, null);
  });

  test('does not classify not_reproduced, disputes, or human_dismissed as false positive', () => {
    const variants = [
      { verificationState: 'not_reproduced', coverage: 'complete' },
      {
        authorState: 'disputes',
        resolutionState: 'open',
        verificationState: 'not_requested',
        coverage: 'unknown',
        target: null,
      },
      {
        resolutionState: 'human_dismissed',
        verificationState: 'not_requested',
        coverage: 'unknown',
        target: null,
      },
    ];
    for (const variant of variants) {
      const [proposal] = buildReviewResolutionFeedbackProposals({
        reviewResolution: document([item(variant)]),
        skillIdByFingerprint: { [FP]: 'review/skill' },
      });
      assert.equal(proposal.status, 'needs_human');
      assert.equal(proposal.feedbackType, null);
    }
  });

  test('holds incompatible feedback fingerprints and missing skill mappings', () => {
    const bad = buildReviewResolutionFeedbackProposals({
      reviewResolution: document([item({ fingerprint: 'fp:legacy-id' })]),
      skillIdByFingerprint: { 'fp:legacy-id': 'review/skill' },
    });
    assert.equal(bad[0].reasonCode, 'incompatible_feedback_fingerprint');
    assert.equal(bad[0].feedbackType, null);

    const [missing] = buildReviewResolutionFeedbackProposals({
      reviewResolution: document([item()]),
    });
    assert.equal(missing.reasonCode, 'missing_trusted_skill_mapping');
    assert.equal(missing.feedbackType, null);
  });

  test('does not create a proposal from absent or ambiguous outcomes', () => {
    const [proposal] = buildReviewResolutionFeedbackProposals({
      reviewResolution: document([
        item({
          resolutionState: 'open',
          verificationState: 'not_requested',
          coverage: 'unknown',
          target: null,
        }),
      ]),
      skillIdByFingerprint: { [FP]: 'review/skill' },
    });
    assert.equal(proposal.status, 'no_proposal');
    assert.equal(proposal.reasonCode, 'no_confirmed_outcome');
  });

  test('proposals cannot be canonical feedback without a separate human-approved adapter', () => {
    const [proposal] = buildReviewResolutionFeedbackProposals({
      reviewResolution: document([item()]),
      skillIdByFingerprint: { [FP]: 'review/skill' },
    });
    assert.equal(proposal.requiresHumanApproval, true);
    assert.equal('timestamp' in proposal, false);
    assert.equal('trigger' in proposal, false);
    assert.equal('review_run_id' in proposal, false);
    // Existing builder can create a canonical entry only when separately and
    // deliberately invoked. Proposal generation never does so.
    const entry = buildFeedbackEntry({
      feedbackType: proposal.feedbackType,
      skillId: proposal.skillId,
      findingFingerprint: proposal.findingRef.fingerprint,
      reviewRunId: proposal.reviewRunId,
      now: new Date('2026-10-08T00:00:00Z'),
    });
    assert.equal(entry.feedbackType, 'accepted');
    assert.equal(entry.review_run_id, SOURCE.reviewRunId);
  });

  test('keeps statuses closed and rejects invalid documents / mappings', () => {
    assert.deepEqual(RESOLUTION_FEEDBACK_PROPOSAL_STATUSES, [
      'candidate',
      'needs_human',
      'no_proposal',
    ]);
    assert.throws(() => buildReviewResolutionFeedbackProposals({ reviewResolution: {} }));
    assert.throws(() =>
      buildReviewResolutionFeedbackProposals({
        reviewResolution: document([item()]),
        skillIdByFingerprint: [],
      })
    );
  });
});
