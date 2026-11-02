import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildReviewResolution, ReviewResolutionError } from '../src/lib/review-resolution.mjs';
import { buildReviewResolutionFeedbackProposals } from '../src/lib/review-resolution-feedback.mjs';
import {
  approveReviewResolutionFeedbackProposal,
  reviewResolutionFeedbackProposalDigest,
  ReviewResolutionFeedbackApprovalError,
} from '../src/lib/review-resolution-feedback-approval.mjs';

// Synthetic contract fixtures, NOT authenticated Human decisions or dogfood.
// Exercise the actual producer and consumer without translating proposal shapes.
const FP = '0123456789abcdef';
const SOURCE = revision('synthetic-source', 'a');
const TARGET = revision('synthetic-target', 'b');
const APPROVED_AT = '2026-11-03T00:00:00.000Z';

function revision(reviewRunId, hex) {
  return {
    reviewRunId,
    executionManifestId: `RR-EXM-${hex.repeat(12)}`,
    artifactRefs: [{ name: 'diff', sha256: hex.repeat(64) }],
  };
}

function inputFixture() {
  return {
    reviewResolution: buildReviewResolution({
      resolutionId: 'RR-RES-synthetic-integration',
      source: SOURCE,
      items: [
        {
          findingRef: {
            findingId: 'finding-1',
            fingerprint: FP,
            fingerprintAlgo: 'v1',
            sources: [
              { findingId: 'original-1', reviewerId: 'reviewer-a' },
              { findingId: 'original-2', reviewerId: 'reviewer-b' },
            ],
          },
          systemJudgment: { disposition: 'blocking', source: 'legacy-policy' },
          authorResponse: { state: 'will_fix', rationale: 'Synthetic fix response' },
          resolution: { state: 'action_submitted', target: TARGET, decisionRefs: [] },
          verification: {
            state: 'verified_resolved',
            verifier: 'synthetic-targeted-verifier',
            coverageStatus: 'complete',
            evidenceRefs: [{ ref: 'fixture:verification', sha256: 'c'.repeat(64) }],
          },
        },
      ],
    }),
    // Kept independent of the sidecar so forged/missing source tests are meaningful.
    sourceFindings: [{ id: 'finding-1', fingerprint: FP }],
    skillIdByFingerprint: { [FP]: 'test/synthetic-skill' },
    currentRevision: structuredClone(TARGET),
  };
}

function propose(input) {
  const proposals = buildReviewResolutionFeedbackProposals(input);
  assert.equal(proposals.length, 1);
  return proposals[0];
}

function syntheticApproval(proposal) {
  return {
    actor: 'synthetic-test-actor-not-authenticated',
    rationale: 'Synthetic contract assertion only; not real Human approval.',
    approvedAt: APPROVED_AT,
    proposalDigest: reviewResolutionFeedbackProposalDigest(proposal),
    findingId: proposal.findingRef.findingId,
    findingFingerprint: proposal.findingRef.fingerprint,
    reviewRunId: proposal.reviewRunId,
    skillId: proposal.skillId,
    feedbackType: proposal.feedbackType,
  };
}

function approve(input, proposal, overrides = {}) {
  return approveReviewResolutionFeedbackProposal({
    proposal,
    // Re-run the real producer: a clone would hide source or state changes.
    currentProposal: propose(input),
    currentRevision: input.currentRevision,
    approval: syntheticApproval(proposal),
    trigger: 'eval-regression',
    ...overrides,
  });
}

function rejectsWith(callback, code) {
  assert.throws(
    callback,
    (error) => error instanceof ReviewResolutionFeedbackApprovalError && error.code === code
  );
}

test('producer output survives JSON transport and needs explicit approval', () => {
  const input = inputFixture();
  const proposal = JSON.parse(JSON.stringify(propose(input)));
  assert.equal(proposal.status, 'candidate');
  assert.equal(proposal.requiresHumanApproval, true);
  assert.equal('review_run_id' in proposal, false);
  rejectsWith(() => approve(input, proposal, { approval: undefined }), 'invalid_human_approval');

  const result = approve(input, proposal);
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.feedbackEntry, {
    timestamp: APPROVED_AT,
    trigger: 'eval-regression',
    feedbackType: 'accepted',
    skillId: 'test/synthetic-skill',
    findingFingerprint: FP,
    evidence: syntheticApproval(proposal).rationale,
    pr: null,
    review_run_id: SOURCE.reviewRunId,
  });
  assert.deepEqual(result.audit.source.reviewerIds, ['reviewer-a', 'reviewer-b']);
  assert.equal(result.audit.source.executionManifestId, SOURCE.executionManifestId);
  assert.deepEqual(
    result.audit.source.verification.evidenceRefs,
    proposal.verification.evidenceRefs
  );
  assert.equal('reviewer' in result.feedbackEntry, false);
});

test('risk acceptance uses the reviewed source rather than a nonexistent fix revision', () => {
  const input = inputFixture();
  const item = input.reviewResolution.items[0];
  item.authorResponse = { state: 'accepts_risk', rationale: 'Synthetic risk acceptance' };
  item.resolution = {
    state: 'risk_accepted',
    target: null,
    decisionRefs: [{ kind: 'pr', ref: 'fixture:risk-decision' }],
  };
  item.verification = {
    state: 'not_requested',
    verifier: null,
    coverageStatus: 'unknown',
    evidenceRefs: [],
  };
  input.currentRevision = structuredClone(SOURCE);
  const proposal = propose(input);
  assert.equal(proposal.status, 'candidate');
  assert.equal(proposal.verification.target, null);
  const result = approve(input, proposal);
  assert.equal(result.feedbackEntry.feedbackType, 'accepted_risk');
  assert.equal(result.audit.source.verification.state, 'not_requested');
  rejectsWith(
    () => approve(input, proposal, { currentRevision: TARGET }),
    'stale_or_unknown_revision'
  );
});

const heldCases = [
  [
    'missing original finding',
    (input) => {
      input.sourceFindings = [];
    },
  ],
  [
    'mismatched original finding',
    (input) => {
      input.sourceFindings[0].id = 'other';
    },
  ],
  [
    'colliding source fingerprints',
    (input) => {
      input.sourceFindings.push({ id: 'finding-2', fingerprint: FP });
    },
  ],
  [
    'missing Skill mapping',
    (input) => {
      input.skillIdByFingerprint = {};
    },
  ],
  [
    'stale target',
    (input) => {
      input.currentRevision = structuredClone(SOURCE);
    },
  ],
  [
    'author disputes',
    (input) => {
      input.reviewResolution.items[0].authorResponse.state = 'disputes';
    },
  ],
  [
    'author postpones',
    (input) => {
      input.reviewResolution.items[0].authorResponse.state = 'postpones';
    },
  ],
  [
    'finding not reproduced',
    (input) => {
      input.reviewResolution.items[0].verification.state = 'not_reproduced';
    },
  ],
  [
    'partial verification',
    (input) => {
      input.reviewResolution.items[0].verification.state = 'inconclusive';
      input.reviewResolution.items[0].verification.coverageStatus = 'partial';
    },
  ],
  [
    'unexecuted verification',
    (input) => {
      input.reviewResolution.items[0].verification.state = 'pending';
      input.reviewResolution.items[0].verification.coverageStatus = 'not_executed';
    },
    'no_proposal',
  ],
];

for (const [name, change, expectedStatus = 'needs_human'] of heldCases) {
  test(`a fresh producer hold cannot reuse an earlier approval: ${name}`, () => {
    const input = inputFixture();
    const previous = propose(input);
    const approval = syntheticApproval(previous);
    change(input);
    const current = propose(input);
    assert.equal(current.status, expectedStatus);
    assert.equal(current.feedbackType, null);
    rejectsWith(
      () =>
        approveReviewResolutionFeedbackProposal({
          proposal: previous,
          currentProposal: current,
          currentRevision: input.currentRevision,
          approval,
        }),
      'not_an_approvable_candidate'
    );
    rejectsWith(
      () => reviewResolutionFeedbackProposalDigest(current),
      'not_an_approvable_candidate'
    );
  });
}

test('an unverified response produces no approvable feedback', () => {
  const input = inputFixture();
  const item = input.reviewResolution.items[0];
  item.resolution = { state: 'open', target: null, decisionRefs: [] };
  item.verification = {
    state: 'not_requested',
    verifier: null,
    coverageStatus: 'unknown',
    evidenceRefs: [],
  };
  const proposal = propose(input);
  assert.equal(proposal.status, 'no_proposal');
  assert.equal(proposal.feedbackType, null);
  rejectsWith(
    () => reviewResolutionFeedbackProposalDigest(proposal),
    'not_an_approvable_candidate'
  );
});

test('malformed strong verification is rejected before candidate generation', () => {
  const input = inputFixture();
  input.reviewResolution.items[0].verification.evidenceRefs = [];
  assert.throws(() => propose(input), ReviewResolutionError);
});

test('recomputed candidates bind approval to current evidence, reviewer and Skill', () => {
  for (const change of [
    (input) => {
      input.reviewResolution.items[0].verification.evidenceRefs[0].ref = 'fixture:new';
    },
    (input) => {
      input.reviewResolution.items[0].findingRef.sources[0].reviewerId = 'reviewer-c';
    },
    (input) => {
      input.skillIdByFingerprint[FP] = 'test/another-synthetic-skill';
    },
  ]) {
    const input = inputFixture();
    const original = propose(input);
    const approval = syntheticApproval(original);
    change(input);
    const current = propose(input);
    assert.equal(current.status, 'candidate');
    assert.notEqual(
      reviewResolutionFeedbackProposalDigest(original),
      reviewResolutionFeedbackProposalDigest(current)
    );
    rejectsWith(() => approve(input, original, { approval }), 'stale_or_swapped_proposal');
    rejectsWith(() => approve(input, current, { approval }), 'approval_digest_mismatch');
  }
});

test('current content hashes matter even when run and manifest IDs are unchanged', () => {
  const input = inputFixture();
  const proposal = propose(input);
  const changedRevision = structuredClone(TARGET);
  changedRevision.artifactRefs[0].sha256 = 'd'.repeat(64);
  rejectsWith(
    () => approve(input, proposal, { currentRevision: changedRevision }),
    'stale_or_unknown_revision'
  );
  input.currentRevision = changedRevision;
  const stale = propose(input);
  assert.equal(stale.status, 'needs_human');
  assert.equal(stale.reasonCode, 'stale_or_unknown_target_revision');
});

function freezeTree(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freezeTree);
    Object.freeze(value);
  }
  return value;
}

test('round-tripped canonical feedback suppresses replay without mutating caller data', () => {
  const input = freezeTree(inputFixture());
  const proposal = freezeTree(propose(input));
  const approval = freezeTree(syntheticApproval(proposal));
  const before = JSON.stringify({ input, proposal, approval });
  const first = approve(input, proposal, { approval });
  const entries = freezeTree(JSON.parse(JSON.stringify([first.feedbackEntry])));
  const entriesBefore = JSON.stringify(entries);
  const second = approve(input, proposal, { approval, existingFeedback: entries });
  assert.equal(first.status, 'ready');
  assert.equal(second.status, 'duplicate');
  assert.equal(second.feedbackEntry, null);
  assert.equal(second.audit.status, 'duplicate');
  assert.equal(JSON.stringify(entries), entriesBefore);
  assert.equal(JSON.stringify({ input, proposal, approval }), before);
  assert.deepEqual(second.audit.source.findingRef, proposal.findingRef);
  assert.notEqual(second.audit.source.findingRef, proposal.findingRef);
  assert.notEqual(second.audit.source.verification, proposal.verification);
});
