import {
  assertReviewResolutionSemantics,
  isSameReviewResolutionRevision,
  reviewResolutionRevisionArtifactKey,
} from './review-resolution.mjs';
import { FEEDBACK_TYPES } from './feedback.mjs';

/**
 * Host-neutral, read-only proposal builder for #2322 Phase 5 / #2575.
 *
 * Resolution is a record of what happened to a finding, not Feedback about
 * review quality. This module never writes canonical feedback, calls an LLM,
 * approves a proposal, or changes a review decision or Gate.
 */
export const RESOLUTION_FEEDBACK_PROPOSAL_STATUSES = Object.freeze([
  'candidate',
  'needs_human',
  'no_proposal',
]);

const FEEDBACK_FINGERPRINT_V1 = /^[0-9a-f]{16}$/;
const SKILL_ID = /^[A-Za-z0-9._:/-]+$/;

function copy(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function reviewerIdsFor(item) {
  return [
    ...new Set(
      (Array.isArray(item?.findingRef?.sources) ? item.findingRef.sources : [])
        .map((source) => source?.reviewerId)
        .filter(nonEmpty)
    ),
  ];
}

function hasTargetedVerification(item, sourceRevision) {
  const verification = item?.verification;
  const target = item?.resolution?.target;
  return (
    verification?.state === 'verified_resolved' &&
    verification?.coverageStatus === 'complete' &&
    nonEmpty(verification?.verifier) &&
    Array.isArray(verification?.evidenceRefs) &&
    verification.evidenceRefs.length > 0 &&
    verification.evidenceRefs.every((entry) => nonEmpty(entry?.ref)) &&
    reviewResolutionRevisionArtifactKey(target) !== null &&
    !isSameReviewResolutionRevision(sourceRevision, target)
  );
}

function proposedType(item, sourceRevision) {
  if (item?.verification?.state === 'verified_resolved') {
    return hasTargetedVerification(item, sourceRevision)
      ? { feedbackType: 'accepted', reasonCode: null }
      : { feedbackType: null, reasonCode: 'verification_evidence_insufficient' };
  }

  if (item?.resolution?.state === 'risk_accepted') {
    return item?.authorResponse?.state === 'accepts_risk' &&
      nonEmpty(item?.authorResponse?.rationale)
      ? { feedbackType: 'accepted_risk', reasonCode: null }
      : { feedbackType: null, reasonCode: 'human_rationale_missing' };
  }

  if (
    item?.verification?.state === 'not_reproduced' ||
    item?.verification?.state === 'inconclusive' ||
    item?.authorResponse?.state === 'disputes' ||
    item?.resolution?.state === 'human_dismissed'
  ) {
    return { feedbackType: null, reasonCode: 'requires_human_classification' };
  }
  return { feedbackType: null, reasonCode: 'no_confirmed_outcome' };
}

/**
 * Build one immutable-by-convention observation per resolution item.
 *
 * skillIdByFingerprint is an explicit, caller-controlled mapping from the
 * canonical 16-hex feedback fingerprint to a trusted Skill ID. This function
 * never infers a Skill from reviewerRole, ruleId, or model metadata.
 *
 * The output is deliberately NOT a FeedbackEntry. Human approval and the
 * existing buildFeedbackEntry / appendFeedbackEntry writer remain separate.
 *
 * @param {{
 *   reviewResolution: object,
 *   skillIdByFingerprint?: Record<string,string>,
 * }} options
 * @returns {{status: string, reasonCode: string|null, feedbackType: string|null,
 *   requiresHumanApproval: true, findingRef: object, reviewRunId: string|null,
 *   executionManifestId: string|null, reviewerIds: string[], skillId: string|null,
 *   authorRationale: string|null, verification: object}[]}
 */
export function buildReviewResolutionFeedbackProposals({
  reviewResolution,
  skillIdByFingerprint = {},
} = {}) {
  assertReviewResolutionSemantics(reviewResolution);
  if (!skillIdByFingerprint || typeof skillIdByFingerprint !== 'object' ||
      Array.isArray(skillIdByFingerprint)) {
    throw new TypeError('skillIdByFingerprint must be a record');
  }

  // Feedback v1 keys by fingerprint only. The Resolution sidecar can carry
  // distinct fingerprint algorithms, so hold any collision across items
  // rather than emitting multiple canonical candidates for one feedback key.
  const fingerprintCounts = new Map();
  for (const item of reviewResolution.items) {
    const fingerprint = item?.findingRef?.fingerprint;
    if (typeof fingerprint === 'string') {
      fingerprintCounts.set(fingerprint, (fingerprintCounts.get(fingerprint) ?? 0) + 1);
    }
  }

  return reviewResolution.items.map((item) => {
    const fingerprint = item?.findingRef?.fingerprint;
    const reviewers = reviewerIdsFor(item);
    const mapping = proposedType(item, reviewResolution.source);
    const hasMapping =
      typeof fingerprint === 'string' && Object.hasOwn(skillIdByFingerprint, fingerprint);
    const skillId = hasMapping ? skillIdByFingerprint[fingerprint] : null;

    let status = 'candidate';
    let reasonCode = null;

    if (mapping.reasonCode === 'no_confirmed_outcome') {
      status = 'no_proposal';
      reasonCode = mapping.reasonCode;
    } else if (mapping.reasonCode !== null) {
      status = 'needs_human';
      reasonCode = mapping.reasonCode;
    } else if (!FEEDBACK_TYPES.includes(mapping.feedbackType)) {
      status = 'needs_human';
      reasonCode = 'unsupported_feedback_type';
    } else if (
      !FEEDBACK_FINGERPRINT_V1.test(fingerprint ?? '') ||
      item?.findingRef?.fingerprintAlgo !== 'v1'
    ) {
      status = 'needs_human';
      reasonCode = 'incompatible_feedback_fingerprint';
    } else if (fingerprintCounts.get(fingerprint) > 1) {
      status = 'needs_human';
      reasonCode = 'ambiguous_feedback_fingerprint';
    } else if (!nonEmpty(reviewResolution?.source?.reviewRunId) || reviewers.length === 0) {
      status = 'needs_human';
      reasonCode = 'missing_review_provenance';
    } else if (!nonEmpty(skillId) || !SKILL_ID.test(skillId)) {
      status = 'needs_human';
      reasonCode = 'missing_trusted_skill_mapping';
    }

    return {
      status,
      reasonCode,
      // No Feedback type is emitted for a held/ambiguous item.
      feedbackType: status === 'candidate' ? mapping.feedbackType : null,
      requiresHumanApproval: true,
      findingRef: copy(item.findingRef),
      reviewRunId: nonEmpty(reviewResolution?.source?.reviewRunId)
        ? reviewResolution.source.reviewRunId
        : null,
      executionManifestId: reviewResolution?.source?.executionManifestId ?? null,
      reviewerIds: reviewers,
      skillId: status === 'candidate' ? skillId : null,
      authorRationale: item?.authorResponse?.rationale ?? null,
      verification: {
        state: item?.verification?.state ?? null,
        verifier: item?.verification?.verifier ?? null,
        coverageStatus: item?.verification?.coverageStatus ?? null,
        evidenceRefs: copy(item?.verification?.evidenceRefs ?? []),
        target: copy(item?.resolution?.target ?? null),
      },
    };
  });
}
