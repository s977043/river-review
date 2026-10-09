/**
 * Review Resolution → canonical Feedback proposal bridge (#2575, Phase 5 PR 1).
 *
 * Pure, host-neutral and observation-only. Proposals are NOT feedback entries:
 * they confer no approval, never append JSONL, never promote a Skill, and
 * never change the source Review Artifact, Review Resolution, or Gate.
 */
import { FEEDBACK_TYPES } from './feedback.mjs';
import {
  assertReviewResolutionSemantics,
  isSameReviewResolutionRevision,
  reviewResolutionRevisionArtifactKey,
} from './review-resolution.mjs';

export const RESOLUTION_FEEDBACK_OUTCOMES = Object.freeze([
  'candidate',
  'needs_human',
  'no_proposal',
]);

const V1_FINGERPRINT = /^[0-9a-f]{16}$/;
const SHA256 = /^[0-9a-f]{64}$/;

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function readOnly(value) {
  if (Array.isArray(value)) {
    value.forEach(readOnly);
  } else if (value !== null && typeof value === 'object') {
    Object.values(value).forEach(readOnly);
  }
  return Object.freeze(value);
}

function summary(item, itemIndex) {
  return {
    itemIndex,
    findingId: item?.findingRef?.findingId ?? null,
    fingerprint: item?.findingRef?.fingerprint ?? null,
    fingerprintAlgo: item?.findingRef?.fingerprintAlgo ?? null,
  };
}

function result(base, outcome, reasonCode, extra = {}) {
  return { ...base, outcome, reasonCode, ...extra };
}

function matchBinding(item, bindings) {
  const key = item?.findingRef;
  const matches = bindings.filter(
    (entry) =>
      entry?.findingId === key?.findingId &&
      entry?.fingerprint === key?.fingerprint &&
      entry?.fingerprintAlgo === key?.fingerprintAlgo
  );
  return matches.length === 1
    ? { binding: matches[0] }
    : { reasonCode: matches.length === 0 ? 'skill_binding_missing' : 'skill_binding_ambiguous' };
}

function resolveReviewer(item, binding) {
  const sources = Array.isArray(item?.findingRef?.sources) ? item.findingRef.sources : [];
  const ids = [...new Set(sources.map((s) => s?.reviewerId).filter(nonEmpty))];
  if (ids.length === 0) return { reasonCode: 'reviewer_provenance_missing' };
  if (nonEmpty(binding?.reviewerId)) {
    return ids.includes(binding.reviewerId)
      ? { reviewerId: binding.reviewerId }
      : { reasonCode: 'reviewer_binding_mismatch' };
  }
  return ids.length === 1
    ? { reviewerId: ids[0] }
    : { reasonCode: 'reviewer_binding_ambiguous' };
}

// Checks complete evidence references only. A digest is not an authenticity proof.
function hasCompleteEvidenceReferences(verification) {
  return (
    nonEmpty(verification?.verifier) &&
    verification?.coverageStatus === 'complete' &&
    Array.isArray(verification?.evidenceRefs) &&
    verification.evidenceRefs.length > 0 &&
    verification.evidenceRefs.every(
      (entry) => nonEmpty(entry?.ref) && SHA256.test(entry?.sha256 ?? '')
    )
  );
}

/**
 * Build read-only proposals, not canonical Feedback entries.
 *
 * `bindings` are explicit caller-provided finding→Skill mappings, NOT
 * proof of trusted Skill ownership. Hashed evidence references are also
 * not independent attestation. A future approval adapter must check their
 * authority before calling the existing buildFeedbackEntry writer.
 *
 * @param {{reviewResolution: object, bindings?: object[]}} options
 * @returns {{kind:string, resolutionId:string, reviewRunId:string, proposals:object[]}}
 */
export function buildReviewResolutionFeedbackProposals({ reviewResolution, bindings = [] } = {}) {
  // Reuse the sidecar SSoT, not a shadow Resolution vocabulary.
  assertReviewResolutionSemantics(reviewResolution);
  if (reviewResolutionRevisionArtifactKey(reviewResolution?.source) === null) {
    throw new TypeError('Review Resolution source revision is incomplete');
  }
  if (!Array.isArray(bindings)) {
    throw new TypeError('bindings must be an array of explicit finding-to-Skill mappings');
  }

  const sourceReviewRunId = reviewResolution.source.reviewRunId;
  const proposals = reviewResolution.items.map((item, itemIndex) => {
    const base = summary(item, itemIndex);
    const verification = item?.verification;
    const resolution = item?.resolution;
    const author = item?.authorResponse;

    // A full-run miss is never equivalent to a targeted fix verification.
    if (verification?.state === 'not_reproduced') {
      return result(base, 'no_proposal', 'not_reproduced');
    }
    if (resolution?.state === 'human_dismissed' || author?.state === 'disputes') {
      return result(base, 'needs_human', 'ambiguous_human_judgment');
    }

    const verified = verification?.state === 'verified_resolved';
    const riskAccepted = resolution?.state === 'risk_accepted';
    if (!verified && !riskAccepted) {
      return result(base, 'no_proposal', 'no_confirmed_feedback_mapping');
    }

    // Canonical feedback v1 understands only 16-hex v1 fingerprints.
    // Do not silently hash or reinterpret Resolution v2 fingerprints.
    if (
      item?.findingRef?.fingerprintAlgo !== 'v1' ||
      !V1_FINGERPRINT.test(item?.findingRef?.fingerprint ?? '')
    ) {
      return result(base, 'needs_human', 'feedback_fingerprint_incompatible');
    }

    const matched = matchBinding(item, bindings);
    if (!matched.binding) return result(base, 'needs_human', matched.reasonCode);
    const binding = matched.binding;
    if (!nonEmpty(binding.skillId)) {
      return result(base, 'needs_human', 'skill_id_missing');
    }
    const reviewer = resolveReviewer(item, binding);
    if (!reviewer.reviewerId) return result(base, 'needs_human', reviewer.reasonCode);

    let feedbackType;
    let evidenceRefs = [];
    let rationale = null;
    let decisionRefs = [];

    if (verified) {
      if (
        reviewResolutionRevisionArtifactKey(resolution?.target) === null ||
        isSameReviewResolutionRevision(reviewResolution.source, resolution.target) ||
        !hasCompleteEvidenceReferences(verification)
      ) {
        return result(base, 'needs_human', 'verification_evidence_incomplete');
      }
      feedbackType = 'accepted';
      evidenceRefs = verification.evidenceRefs.map((ref) => ({
        ref: ref.ref,
        sha256: ref.sha256,
      }));
    } else {
      if (
        author?.state !== 'accepts_risk' ||
        !nonEmpty(author?.rationale) ||
        !Array.isArray(resolution?.decisionRefs) ||
        resolution.decisionRefs.length === 0 ||
        !resolution.decisionRefs.every((ref) => nonEmpty(ref?.kind) && nonEmpty(ref?.ref))
      ) {
        return result(base, 'needs_human', 'human_risk_acceptance_missing');
      }
      feedbackType = 'accepted_risk';
      rationale = author.rationale;
      decisionRefs = resolution.decisionRefs.map((ref) => ({
        kind: ref.kind,
        ref: ref.ref,
      }));
    }

    if (!FEEDBACK_TYPES.includes(feedbackType)) {
      throw new TypeError('Feedback type is missing from canonical FEEDBACK_TYPES');
    }

    return result(base, 'candidate', 'requires_explicit_human_approval', {
      candidate: {
        feedbackType,
        skillId: binding.skillId.trim(),
        reviewer: reviewer.reviewerId,
        // This is the Review Resolution source ID, NOT proof that it equals
        // the saved-run id required for canonical feedback's review_run_id.
        // The future approval adapter must explicitly resolve that join.
        reviewRunId: sourceReviewRunId,
        findingFingerprint: item.findingRef.fingerprint,
        fingerprintAlgo: item.findingRef.fingerprintAlgo,
        verificationEvidenceRefs: evidenceRefs,
        humanRationale: rationale,
        humanDecisionRefs: decisionRefs,
        // This is advisory and cannot be passed to appendFeedbackEntry
        // without a future separately reviewed approval adapter.
        requiresApproval: true,
      },
    });
  });

  return readOnly({
    kind: 'review-resolution-feedback-proposals',
    resolutionId: reviewResolution.resolutionId,
    reviewRunId: sourceReviewRunId,
    proposals,
  });
}
