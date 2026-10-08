import assert from 'node:assert/strict';
import test, { describe } from 'node:test';

import { FEEDBACK_TYPES } from '../src/lib/feedback.mjs';
import {
  FEEDBACK_PROPOSAL_STATUS,
  ReviewResolutionFeedbackProposalError,
  buildReviewResolutionFeedbackProposals,
} from '../src/lib/review-resolution-feedback-proposals.mjs';
import { ReviewResolutionError } from '../src/lib/review-resolution.mjs';

const FINGERPRINT = 'abcdef0123456789';
const HASH = 'a'.repeat(64);
const TARGET_HASH = 'b'.repeat(64);

const SOURCE = {
  reviewRunId: 'run-source',
  executionManifestId: 'RR-EXM-aaaaaaaaaaaa',
  artifactRefs: [{ name: 'diff', sha256: HASH }],
};
const TARGET = {
  reviewRunId: 'run-target',
  executionManifestId: 'RR-EXM-bbbbbbbbbbbb',
  artifactRefs: [{ name: 'diff', sha256: TARGET_HASH }],
};

function item(overrides = {}) {
  return {
    findingRef: {
      findingId: 'rr-1',
      fingerprint: FINGERPRINT,
      fingerprintAlgo: 'v1',
      sources: [{ findingId: 'reviewer:rr-1', reviewerId: 'bug-hunter' }],
    },
    systemJudgment: { disposition: 'blocking', source: 'legacy-policy' },
    authorResponse: { state: 'will_fix', rationale: 'Addressed in new revision' },
    resolution: { state: 'action_submitted', target: TARGET, decisionRefs: [] },
    verification: {
      state: 'verified_resolved',
      verifier: 'independent-verifier',
      coverageStatus: 'complete',
      evidenceRefs: [{ ref: 'verification:rr-1', sha256: HASH }],
    },
    ...overrides,
  };
}

function document(items = [item()]) {
  return {
    kind: 'review-resolution',
    schemaVersion: '1',
    resolutionId: 'RR-RES-pr-42',
    source: SOURCE,
    items,
  };
}

function build(doc = document(), options = {}) {
  return buildReviewResolutionFeedbackProposals({
    reviewResolution: doc,
    currentRevision: TARGET,
    sourceFindings: [{ id: 'rr-1', fingerprint: FINGERPRINT }],
    skillIdByFingerprint: { [FINGERPRINT]: 'security-basic' },
    ...options,
  });
}

describe('Review Resolution Feedback proposals (#2575 Phase 5 PR1)', () => {
  test('verified_resolved creates only a human-approval-required accepted proposal', () => {
    const before = JSON.stringify(document());
    const proposal = build();
    const [candidate] = proposal.items;

    assert.equal(proposal.kind, 'review-resolution-feedback-proposals');
    assert.equal(proposal.schemaVersion, '1');
    assert.equal(candidate.status, FEEDBACK_PROPOSAL_STATUS.PROPOSED);
    assert.equal(candidate.feedbackType, 'accepted');
    assert.equal(candidate.skillId, 'security-basic');
    assert.equal(candidate.requiresHumanApproval, true);
    assert.equal(candidate.reviewRunId, 'run-source');
    assert.equal(candidate.findingRef.fingerprint, FINGERPRINT);
    assert.equal(candidate.findingRef.fingerprintAlgo, 'v1');
    assert.deepEqual(candidate.reviewerIds, ['bug-hunter']);
    assert.equal(candidate.verifier, 'independent-verifier');
    assert.deepEqual(candidate.verificationEvidenceRefs, [
      { ref: 'verification:rr-1', sha256: HASH },
    ]);
    assert.deepEqual(candidate.sourceRevision, SOURCE);
    assert.deepEqual(candidate.targetRevision, TARGET);
    assert.equal(JSON.stringify(document()), before);
    assert.equal(Object.isFrozen(proposal), true);
    assert.equal(Object.isFrozen(candidate.findingRef.sources), true);
    assert.equal(FEEDBACK_TYPES.includes(candidate.feedbackType), true);
    assert.equal(Object.hasOwn(proposal, 'approved'), false);
    assert.equal(Object.hasOwn(proposal, 'feedbackEntries'), false);
  });

  test('risk acceptance creates accepted_risk proposal only with author rationale', () => {
    const risk = item({
      authorResponse: {
        state: 'accepts_risk',
        rationale: '  Approved as a documented exception  ',
      },
      resolution: { state: 'risk_accepted', target: null, decisionRefs: [] },
      verification: {
        state: 'not_requested',
        verifier: null,
        coverageStatus: 'unknown',
        evidenceRefs: [],
      },
    });
    const proposal = build(document([risk]), { currentRevision: null }).items[0];

    assert.equal(proposal.status, 'proposed');
    assert.equal(proposal.feedbackType, 'accepted_risk');
    assert.equal(proposal.requiresHumanApproval, true);
    assert.equal(proposal.authorRationale, 'Approved as a documented exception');
    assert.equal(proposal.verifier, null);
    assert.deepEqual(proposal.verificationEvidenceRefs, []);
  });

  test('missing risk rationale does not become accepted_risk', () => {
    const risk = item({
      authorResponse: { state: 'accepts_risk', rationale: null },
      resolution: { state: 'risk_accepted', target: null, decisionRefs: [] },
      verification: {
        state: 'not_requested',
        verifier: null,
        coverageStatus: 'unknown',
        evidenceRefs: [],
      },
    });
    const [candidate] = build(document([risk])).items;
    assert.equal(candidate.status, 'needs_human');
    assert.equal(candidate.reasonCode, 'missing_human_risk_rationale');
    assert.equal(candidate.feedbackType, null);
    assert.equal(candidate.requiresHumanApproval, false);
  });

  test('not_reproduced does not imply accepted or false_positive', () => {
    const noEvidence = item({
      verification: {
        state: 'not_reproduced',
        verifier: null,
        coverageStatus: 'complete',
        evidenceRefs: [],
      },
    });
    const [candidate] = build(document([noEvidence])).items;
    assert.equal(candidate.status, 'no_proposal');
    assert.equal(candidate.reasonCode, 'not_reproduced_not_verified');
    assert.equal(candidate.feedbackType, null);
  });

  test('disputed and human-dismissed findings do not imply false positives', () => {
    const dispute = item({
      authorResponse: { state: 'disputes', rationale: 'Not applicable here' },
      verification: {
        state: 'inconclusive',
        verifier: null,
        coverageStatus: 'unknown',
        evidenceRefs: [],
      },
    });
    const dismissed = item({
      resolution: { state: 'human_dismissed', target: null, decisionRefs: [] },
      verification: {
        state: 'not_requested',
        verifier: null,
        coverageStatus: 'unknown',
        evidenceRefs: [],
      },
    });
    const distinctDismissed = {
      ...dismissed,
      findingRef: {
        ...dismissed.findingRef,
        findingId: 'rr-2',
        fingerprint: '0123456789abcdef',
      },
    };
    const proposals = build(document([dispute, distinctDismissed]), {
      skillIdByFingerprint: {
        [FINGERPRINT]: 'security-basic',
        '0123456789abcdef': 'security-basic',
      },
    }).items;

    assert.deepEqual(proposals.map((entry) => entry.status), ['needs_human', 'needs_human']);
    assert.ok(proposals.every((entry) => entry.feedbackType === null));
  });

  test('inconclusive remains needs_human, pending never becomes accepted', () => {
    for (const state of ['inconclusive', 'pending']) {
      const candidate = build(
        document([
          item({
            verification: {
              state,
              verifier: null,
              coverageStatus: 'unknown',
              evidenceRefs: [],
            },
          }),
        ])
      ).items[0];

      assert.equal(candidate.status, 'needs_human', state);
      assert.equal(candidate.feedbackType, null, state);
    }
  });

  test('non-v1, malformed, or missing canonical fingerprints fail closed', () => {
    for (const [algo, fingerprint] of [
      ['v2', 'a'.repeat(64)],
      ['v1', 'noncanonical'],
      ['v1', 'A'.repeat(16)],
    ]) {
      const sourceItem = item({
        findingRef: { ...item().findingRef, fingerprintAlgo: algo, fingerprint },
      });
      const candidate = build(document([sourceItem])).items[0];
      assert.equal(candidate.status, 'needs_human', fingerprint);
      assert.equal(candidate.reasonCode, 'unsupported_fingerprint', fingerprint);
      assert.equal(candidate.feedbackType, null);
    }
  });

  test('Skill ID must be supplied explicitly and never inferred from reviewer role', () => {
    const [candidate] = build(document(), { skillIdByFingerprint: {} }).items;
    assert.equal(candidate.status, 'needs_human');
    assert.equal(candidate.reasonCode, 'missing_skill_mapping');
    assert.equal(candidate.skillId, null);
  });

  test('canonical source finding identity is required for proposed feedback', () => {
    const missing = build(document(), { sourceFindings: [] }).items[0];
    const mismatch = build(document(), {
      sourceFindings: [{ id: 'rr-1', fingerprint: 'fedcba9876543210' }],
    }).items[0];
    const ambiguous = build(document(), {
      sourceFindings: [
        { id: 'rr-1', fingerprint: FINGERPRINT },
        { id: 'rr-1', fingerprint: FINGERPRINT },
      ],
    }).items[0];
    for (const candidate of [missing, mismatch, ambiguous]) {
      assert.equal(candidate.status, 'needs_human');
      assert.equal(candidate.reasonCode, 'unverified_source_finding');
      assert.equal(candidate.feedbackType, null);
    }
  });

  test('reviewer provenance must be present', () => {
    const sourceItem = item({
      findingRef: { ...item().findingRef, sources: [] },
    });
    const candidate = build(document([sourceItem])).items[0];
    assert.equal(candidate.status, 'needs_human');
    assert.equal(candidate.reasonCode, 'missing_reviewer_provenance');
  });

  test('partial or unhashed verification evidence cannot prove resolution', () => {
    const cases = [
      { ...item().verification, coverageStatus: 'partial', state: 'inconclusive' },
      { ...item().verification, evidenceRefs: [{ ref: 'unhashed', sha256: null }] },
      { ...item().verification, state: 'inconclusive', evidenceRefs: [] },
    ];
    for (const verification of cases) {
      const candidate = build(document([item({ verification })])).items[0];
      assert.notEqual(candidate.status, 'proposed');
      assert.equal(candidate.feedbackType, null);
    }
  });

  test('verified_resolved with no evidence is an invalid sidecar, not a positive proposal', () => {
    assert.throws(
      () =>
        build(
          document([
            item({
              verification: { ...item().verification, evidenceRefs: [] },
            }),
          ])
        ),
      ReviewResolutionError
    );
  });

  test('target freshness is required for accepted proposals', () => {
    const unknown = build(document(), { currentRevision: null }).items[0];
    const stale = build(document(), { currentRevision: SOURCE }).items[0];
    for (const candidate of [unknown, stale]) {
      assert.equal(candidate.status, 'needs_human');
      assert.equal(candidate.reasonCode, 'stale_or_unknown_target_revision');
    }
  });

  test('duplicate fingerprints fail instead of yielding repeated proposals', () => {
    assert.throws(
      () => build(document([item(), item()])),
      (error) => error instanceof ReviewResolutionError
    );
  });

  test('invalid input and invalid mapping fail loudly without producing feedback', () => {
    assert.throws(
      () => buildReviewResolutionFeedbackProposals(),
      ReviewResolutionFeedbackProposalError
    );
    assert.throws(
      () => build(document(), { skillIdByFingerprint: [] }),
      ReviewResolutionFeedbackProposalError
    );
  });

  test('producer does not mutate input objects', () => {
    const source = document();
    const mapping = { [FINGERPRINT]: 'security-basic' };
    const beforeSource = JSON.stringify(source);
    const beforeMapping = JSON.stringify(mapping);
    const sourceFindings = [{ id: 'rr-1', fingerprint: FINGERPRINT }];
    const beforeFindings = JSON.stringify(sourceFindings);
    const observation = build(source, { skillIdByFingerprint: mapping, sourceFindings });

    assert.equal(JSON.stringify(source), beforeSource);
    assert.equal(JSON.stringify(mapping), beforeMapping);
    assert.equal(JSON.stringify(sourceFindings), beforeFindings);
    assert.equal(Object.isFrozen(source), false);
    assert.equal(observation.items[0].status, 'proposed');
  });
});
