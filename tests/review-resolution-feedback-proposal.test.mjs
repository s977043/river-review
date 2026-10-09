import assert from 'node:assert/strict';
import test from 'node:test';

import { buildFeedbackEntry } from '../src/lib/feedback.mjs';
import { buildReviewResolution } from '../src/lib/review-resolution.mjs';
import {
  RESOLUTION_FEEDBACK_OUTCOMES,
  RESOLUTION_FEEDBACK_REASON_CODES,
  buildReviewResolutionFeedbackProposals,
} from '../src/lib/review-resolution-feedback-proposal.mjs';
import { deriveRunGate } from '../src/lib/run-gate.mjs';

const A = 'a'.repeat(64);
const B = 'b'.repeat(64);
const C = 'c'.repeat(64);
const FP = 'deadbeef12345678';
const SOURCE = {
  reviewRunId: 'run-original',
  executionManifestId: 'RR-EXM-aaaaaaaaaaaa',
  artifactRefs: [{ name: 'diff', sha256: A }],
};
const TARGET = {
  reviewRunId: 'run-target',
  executionManifestId: 'RR-EXM-bbbbbbbbbbbb',
  artifactRefs: [{ name: 'diff', sha256: B }],
};

function resolutionItem(patch = {}) {
  return {
    findingRef: {
      findingId: 'rr-17',
      fingerprint: FP,
      fingerprintAlgo: 'v1',
      sources: [{ findingId: 'role-a:17', reviewerId: 'bug-hunter' }],
    },
    systemJudgment: { disposition: 'blocking', source: 'semantic-precision' },
    authorResponse: { state: 'will_fix', rationale: null },
    resolution: { state: 'action_submitted', target: TARGET, decisionRefs: [] },
    verification: {
      state: 'verified_resolved',
      verifier: 'verifier-3',
      coverageStatus: 'complete',
      evidenceRefs: [{ ref: 'ci://test/123', sha256: C }],
    },
    ...patch,
  };
}

function sidecar(item = resolutionItem()) {
  return buildReviewResolution({
    resolutionId: 'RR-RES-2575-proposal',
    source: SOURCE,
    items: [item],
  });
}

const BINDING = {
  findingId: 'rr-17',
  fingerprint: FP,
  fingerprintAlgo: 'v1',
  skillId: 'river-review-security',
};

const emitted = [];

function evaluate(reviewResolution = sidecar(), bindings = [BINDING]) {
  const out = buildReviewResolutionFeedbackProposals({ reviewResolution, bindings });
  emitted.push(...out.proposals);
  return out;
}

test('canonical feedback vocabulary is not copied into the Resolution state machine', () => {
  assert.deepEqual(RESOLUTION_FEEDBACK_OUTCOMES, ['candidate', 'needs_human', 'no_proposal']);
});

test('verified_resolved with targeted evidence yields an unapproved accepted candidate', () => {
  const document = sidecar();
  const original = JSON.stringify(document);
  const out = evaluate(document);
  assert.equal(out.kind, 'review-resolution-feedback-proposals');
  assert.equal(out.reviewRunId, 'run-original');
  assert.equal(out.proposals.length, 1);
  const row = out.proposals[0];
  assert.equal(row.outcome, 'candidate');
  assert.equal(row.reasonCode, 'requires_explicit_human_approval');
  assert.deepEqual(row.candidate, {
    feedbackType: 'accepted',
    skillId: 'river-review-security',
    reviewer: 'bug-hunter',
    reviewRunId: 'run-original',
    findingFingerprint: FP,
    fingerprintAlgo: 'v1',
    verificationEvidenceRefs: [{ ref: 'ci://test/123', sha256: C }],
    humanRationale: null,
    humanDecisionRefs: [],
    requiresApproval: true,
  });
  assert.equal(JSON.stringify(document), original);
  assert.equal(Object.isFrozen(out), true);
  assert.equal(Object.isFrozen(row.candidate.verificationEvidenceRefs[0]), true);
  assert.throws(() => {
    out.proposals[0].candidate.skillId = 'modified';
  }, TypeError);
});

test('risk_accepted only proposes an unapproved accepted_risk candidate', () => {
  const item = resolutionItem({
    authorResponse: { state: 'accepts_risk', rationale: 'Trade-off approved after discussion' },
    resolution: {
      state: 'risk_accepted',
      target: null,
      decisionRefs: [{ kind: 'pr', ref: 'PR-72' }],
    },
    verification: {
      state: 'not_requested',
      verifier: null,
      coverageStatus: 'unknown',
      evidenceRefs: [],
    },
  });
  const row = evaluate(sidecar(item)).proposals[0];
  assert.equal(row.outcome, 'candidate');
  assert.equal(row.candidate.feedbackType, 'accepted_risk');
  assert.equal(row.candidate.humanRationale, 'Trade-off approved after discussion');
  assert.deepEqual(row.candidate.humanDecisionRefs, [{ kind: 'pr', ref: 'PR-72' }]);
  assert.equal(row.candidate.requiresApproval, true);
});

test('risk acceptance without human rationale or decision stays unresolved', () => {
  const item = resolutionItem({
    authorResponse: { state: 'accepts_risk', rationale: null },
    resolution: { state: 'risk_accepted', target: null, decisionRefs: [] },
    verification: {
      state: 'not_requested',
      verifier: null,
      coverageStatus: 'unknown',
      evidenceRefs: [],
    },
  });
  const row = evaluate(sidecar(item)).proposals[0];
  assert.equal(row.outcome, 'needs_human');
  assert.equal(row.reasonCode, 'human_risk_acceptance_missing');
});

test('full-run not_reproduced is no_proposal, never accepted', () => {
  const item = resolutionItem({
    verification: {
      state: 'not_reproduced',
      verifier: null,
      coverageStatus: 'complete',
      evidenceRefs: [],
    },
  });
  const row = evaluate(sidecar(item)).proposals[0];
  assert.equal(row.outcome, 'no_proposal');
  assert.equal(row.reasonCode, 'not_reproduced');
});

test('human_dismissed and disputes never become false_positive', () => {
  for (const patch of [
    { resolution: { state: 'human_dismissed', target: TARGET, decisionRefs: [] } },
    { authorResponse: { state: 'disputes', rationale: 'Claim may be false' } },
  ]) {
    const row = evaluate(sidecar(resolutionItem(patch))).proposals[0];
    assert.equal(row.outcome, 'needs_human');
    assert.equal(row.reasonCode, 'ambiguous_human_judgment');
    assert.equal(row.candidate, undefined);
  }
});

test('unsupported fingerprint schemes or invalid v1 hex are not hashed or reinterpreted', () => {
  for (const [fingerprint, fingerprintAlgo] of [
    ['sha256:' + A, 'v2'],
    ['not-a-16-hex-fingerprint', 'v1'],
  ]) {
    const item = resolutionItem({
      findingRef: {
        ...resolutionItem().findingRef,
        fingerprint,
        fingerprintAlgo,
      },
    });
    const binding = { ...BINDING, fingerprint, fingerprintAlgo };
    const row = evaluate(sidecar(item), [binding]).proposals[0];
    assert.equal(row.outcome, 'needs_human');
    assert.equal(row.reasonCode, 'feedback_fingerprint_incompatible');
  }
});

test('missing / ambiguous Skill mapping never infers a Skill from reviewer role', () => {
  for (const bindings of [[], [BINDING, BINDING], [{ ...BINDING, skillId: '' }]]) {
    const row = evaluate(sidecar(), bindings).proposals[0];
    assert.equal(row.outcome, 'needs_human');
    assert.equal(row.candidate, undefined);
  }
});

test('multiple reviewer sources need an explicit matching reviewer binding', () => {
  const item = resolutionItem({
    findingRef: {
      ...resolutionItem().findingRef,
      sources: [
        { findingId: 'role-a:17', reviewerId: 'bug-hunter' },
        { findingId: 'role-b:17', reviewerId: 'security-scanner' },
      ],
    },
  });
  const doc = sidecar(item);
  assert.equal(evaluate(doc).proposals[0].reasonCode, 'reviewer_binding_ambiguous');
  assert.equal(
    evaluate(doc, [{ ...BINDING, reviewerId: 'unknown' }]).proposals[0].reasonCode,
    'reviewer_binding_mismatch'
  );
  const row = evaluate(doc, [{ ...BINDING, reviewerId: 'security-scanner' }]).proposals[0];
  assert.equal(row.outcome, 'candidate');
  assert.equal(row.candidate.reviewer, 'security-scanner');
});

test('incomplete verification evidence refuses a candidate', () => {
  // Evidence references with null hash are structurally valid, but cannot
  // establish the integrity of evidence used to propose a Feedback entry.
  const item = resolutionItem({
    verification: {
      state: 'verified_resolved',
      verifier: 'verifier',
      coverageStatus: 'complete',
      evidenceRefs: [{ ref: 'CI-LOG-1', sha256: null }],
    },
  });
  const row = evaluate(sidecar(item)).proposals[0];
  assert.equal(row.outcome, 'needs_human');
  assert.equal(row.reasonCode, 'verification_evidence_incomplete');
});

test('same-revision verified_resolved and duplicate sidecar findings fail closed', () => {
  const sameRevision = resolutionItem({
    resolution: { state: 'action_submitted', target: SOURCE, decisionRefs: [] },
  });
  assert.throws(() => sidecar(sameRevision), /Review Resolution semantic validation failed/);

  assert.throws(
    () =>
      buildReviewResolution({
        resolutionId: 'RR-RES-duplicates',
        source: SOURCE,
        items: [resolutionItem(), resolutionItem()],
      }),
    /Review Resolution semantic validation failed/
  );
});

test('the pure bridge cannot write Feedback, promote Skills, or change Gate judgment', () => {
  const before = {
    status: 'ok',
    dryRun: false,
    findings: [],
    changedFiles: ['src/app.mjs'],
    plan: {},
    config: {},
  };
  const decisionBefore = deriveRunGate(before);
  const original = JSON.stringify(before);
  const out = evaluate();
  assert.equal(out.proposals[0].candidate.requiresApproval, true);
  assert.equal(JSON.stringify(before), original);
  assert.deepEqual(deriveRunGate(before), decisionBefore);
});

test('verified_resolved with a conflicting resolution or author state fails closed', () => {
  const riskWithoutDecision = resolutionItem({
    authorResponse: { state: 'accepts_risk', rationale: 'Accepted' },
    resolution: { state: 'risk_accepted', target: TARGET, decisionRefs: [] },
  });
  const openWontFix = resolutionItem({
    authorResponse: { state: 'wont_fix', rationale: null },
    resolution: { state: 'open', target: TARGET, decisionRefs: [] },
  });
  const submittedPostponed = resolutionItem({
    authorResponse: { state: 'postpones', rationale: null },
  });
  for (const item of [riskWithoutDecision, openWontFix, submittedPostponed]) {
    const row = evaluate(sidecar(item)).proposals[0];
    assert.equal(row.outcome, 'needs_human');
    assert.equal(row.reasonCode, 'resolution_state_conflict');
    assert.equal(row.candidate, undefined);
  }
  const noResponse = resolutionItem({ authorResponse: { state: 'none', rationale: null } });
  const row = evaluate(sidecar(noResponse)).proposals[0];
  assert.equal(row.outcome, 'candidate');
  assert.equal(row.candidate.feedbackType, 'accepted');
});

test('produced candidates are accepted by the production buildFeedbackEntry writer', () => {
  const now = new Date('2026-10-09T00:00:00.000Z');
  const riskItem = resolutionItem({
    authorResponse: { state: 'accepts_risk', rationale: 'Trade-off approved' },
    resolution: {
      state: 'risk_accepted',
      target: null,
      decisionRefs: [{ kind: 'pr', ref: 'PR-72' }],
    },
    verification: {
      state: 'not_requested',
      verifier: null,
      coverageStatus: 'unknown',
      evidenceRefs: [],
    },
  });
  for (const [item, type] of [
    [resolutionItem(), 'accepted'],
    [riskItem, 'accepted_risk'],
  ]) {
    const { candidate } = evaluate(sidecar(item)).proposals[0];
    const entry = buildFeedbackEntry({
      feedbackType: candidate.feedbackType,
      skillId: candidate.skillId,
      findingFingerprint: candidate.findingFingerprint,
      reviewer: candidate.reviewer,
      reviewRunId: candidate.reviewRunId,
      now,
    });
    assert.equal(entry.feedbackType, type);
    assert.equal(entry.skillId, 'river-review-security');
    assert.equal(entry.findingFingerprint, FP);
    assert.equal(entry.reviewer, 'bug-hunter');
    assert.equal(entry.review_run_id, 'run-original');
  }
});

test('reviewer IDs are trimmed and NFC-normalized; whitespace-only fails closed', () => {
  const nfd = 'café';
  const item = resolutionItem({
    findingRef: {
      ...resolutionItem().findingRef,
      sources: [{ findingId: 'role-a:17', reviewerId: `  ${nfd}  ` }],
    },
  });
  const doc = sidecar(item);
  assert.equal(evaluate(doc).proposals[0].candidate.reviewer, 'café');
  const bound = evaluate(doc, [{ ...BINDING, reviewerId: ' café ' }]).proposals[0];
  assert.equal(bound.candidate.reviewer, 'café');
  assert.equal(
    evaluate(doc, [{ ...BINDING, reviewerId: '   ' }]).proposals[0].reasonCode,
    'reviewer_binding_mismatch'
  );
  const blank = resolutionItem({
    findingRef: {
      ...resolutionItem().findingRef,
      sources: [{ findingId: 'role-a:17', reviewerId: '   ' }],
    },
  });
  assert.equal(evaluate(sidecar(blank)).proposals[0].reasonCode, 'reviewer_provenance_missing');
});

test('human rationale is trimmed and NFC-normalized', () => {
  const item = resolutionItem({
    authorResponse: { state: 'accepts_risk', rationale: '  Accepted café  ' },
    resolution: {
      state: 'risk_accepted',
      target: null,
      decisionRefs: [{ kind: 'pr', ref: 'PR-1' }],
    },
    verification: {
      state: 'not_requested',
      verifier: null,
      coverageStatus: 'unknown',
      evidenceRefs: [],
    },
  });
  assert.equal(evaluate(sidecar(item)).proposals[0].candidate.humanRationale, 'Accepted café');
});

test('duplicate evidence refs are de-duplicated in first-seen order', () => {
  const item = resolutionItem({
    verification: {
      state: 'verified_resolved',
      verifier: 'verifier-3',
      coverageStatus: 'complete',
      evidenceRefs: [
        { ref: 'ci://b', sha256: C },
        { ref: 'ci://a', sha256: C },
        { ref: 'ci://b', sha256: C },
        { ref: 'ci://b', sha256: A },
      ],
    },
  });
  assert.deepEqual(evaluate(sidecar(item)).proposals[0].candidate.verificationEvidenceRefs, [
    { ref: 'ci://b', sha256: C },
    { ref: 'ci://a', sha256: C },
    { ref: 'ci://b', sha256: A },
  ]);
});

test('read-only output never freezes or mutates caller-owned summary values', () => {
  const doc = sidecar();
  const findingId = { nested: ['rr-17'] };
  doc.items[0].findingRef.findingId = findingId;
  const original = JSON.stringify(doc);
  const out = buildReviewResolutionFeedbackProposals({ reviewResolution: doc, bindings: [] });
  assert.equal(Object.isFrozen(out.proposals[0]), true);
  assert.equal(Object.isFrozen(findingId), false);
  assert.equal(Object.isFrozen(findingId.nested), false);
  assert.equal(Object.isFrozen(doc), false);
  assert.equal(JSON.stringify(doc), original);
});

test('every emitted outcome and reasonCode is in the closed exported lists', () => {
  assert.ok(emitted.length > 0);
  for (const row of emitted) {
    assert.ok(RESOLUTION_FEEDBACK_OUTCOMES.includes(row.outcome), row.outcome);
    assert.ok(RESOLUTION_FEEDBACK_REASON_CODES.includes(row.reasonCode), row.reasonCode);
  }
  assert.equal(Object.isFrozen(RESOLUTION_FEEDBACK_REASON_CODES), true);
});
