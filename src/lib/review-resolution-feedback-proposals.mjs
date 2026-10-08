import { FEEDBACK_TYPES } from './feedback.mjs';
import { resolveReviewResolutionFindingRef } from './review-resolution-organizer.mjs';
import {
  assertReviewResolutionSemantics,
  isSameReviewResolutionRevision,
  reviewResolutionRevisionArtifactKey,
} from './review-resolution.mjs';

/**
 * Review Resolution -> Feedback proposal bridge (#2575, #2322 Phase 5 PR 1).
 *
 * This pure builder never writes feedback, approves a proposal, or promotes a
 * Skill. The existing feedback builder/writer own those steps. In particular,
 * a resolved PR finding is NOT itself evidence that review feedback is true.
 *
 * The caller must supply sourceFindings from the canonical Review Artifact and
 * skillIdByFingerprint from a trusted mapping. The adapter does not establish
 * authenticity of those caller inputs. Reviewer roles are never Skill IDs.
 */

export const FEEDBACK_PROPOSAL_STATUS = Object.freeze({
  PROPOSED: 'proposed',
  NEEDS_HUMAN: 'needs_human',
  NO_PROPOSAL: 'no_proposal',
});

export class ReviewResolutionFeedbackProposalError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ReviewResolutionFeedbackProposalError';
  }
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isVerifiableEvidenceRef(ref) {
  return nonEmptyString(ref?.ref) && /^[0-9a-f]{64}$/.test(ref?.sha256 ?? '');
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function uniqueReviewerIds(item) {
  const sources = Array.isArray(item?.findingRef?.sources) ? item.findingRef.sources : [];
  return [...new Set(sources.map((source) => source?.reviewerId).filter(nonEmptyString))];
}

/**
 * Build read-only candidates from the canonical Review Resolution sidecar.
 *
 * Every returned item preserves identity/revision/evidence provenance, even
 * when no automatic Feedback proposal is permitted. Only 'proposed' items have
 * a feedbackType and skillId. Approval and persistence are deliberately absent.
 *
 * @param {{
 *   reviewResolution: object,
 *   currentRevision?: object,
 *   sourceFindings?: object[],
 *   skillIdByFingerprint?: Record<string, string>
 * }} input
 * @returns {object} Deep-frozen, JSON-serializable proposal observation.
 */
export function buildReviewResolutionFeedbackProposals({
  reviewResolution,
  currentRevision = null,
  sourceFindings = [],
  skillIdByFingerprint = {},
} = {}) {
  if (!reviewResolution || typeof reviewResolution !== 'object' || Array.isArray(reviewResolution)) {
    throw new ReviewResolutionFeedbackProposalError('reviewResolution must be an object');
  }
  assertReviewResolutionSemantics(reviewResolution);
  if (reviewResolutionRevisionArtifactKey(reviewResolution.source) === null) {
    throw new ReviewResolutionFeedbackProposalError('source revision is invalid');
  }
  if (!Array.isArray(reviewResolution.items) || !Array.isArray(sourceFindings)) {
    throw new ReviewResolutionFeedbackProposalError(
      'reviewResolution.items and sourceFindings must be arrays'
    );
  }
  if (
    !skillIdByFingerprint ||
    typeof skillIdByFingerprint !== 'object' ||
    Array.isArray(skillIdByFingerprint)
  ) {
    throw new ReviewResolutionFeedbackProposalError('skillIdByFingerprint must be an object');
  }

  const items = reviewResolution.items.map((item, itemIndex) => {
    const finding = item.findingRef ?? {};
    const fingerprint = finding.fingerprint;
    const reviewerIds = uniqueReviewerIds(item);
    const verification = item.verification ?? {};
    const resolution = item.resolution ?? {};
    const authorResponse = item.authorResponse ?? {};
    const base = {
      itemIndex,
      findingRef: clone(finding),
      reviewRunId: reviewResolution.source.reviewRunId,
      sourceRevision: clone(reviewResolution.source),
      targetRevision: clone(resolution.target ?? null),
      reviewerIds,
      verifier: nonEmptyString(verification.verifier) ? verification.verifier : null,
      verificationState: verification.state ?? null,
      verificationEvidenceRefs: clone(verification.evidenceRefs ?? []),
      resolutionState: resolution.state ?? null,
      authorRationale: nonEmptyString(authorResponse.rationale)
        ? authorResponse.rationale.trim()
        : null,
    };
    const classify = (status, reasonCode, feedbackType = null, skillId = null) => ({
      ...base,
      status,
      reasonCode,
      feedbackType,
      skillId,
      requiresHumanApproval: status === FEEDBACK_PROPOSAL_STATUS.PROPOSED,
    });
    const noProposal = (reason) => classify(FEEDBACK_PROPOSAL_STATUS.NO_PROPOSAL, reason);
    const needsHuman = (reason) => classify(FEEDBACK_PROPOSAL_STATUS.NEEDS_HUMAN, reason);

    // Absence in a full run is not targeted evidence that the finding was fixed.
    if (verification.state === 'not_reproduced') return noProposal('not_reproduced_not_verified');
    if (authorResponse.state === 'disputes' || resolution.state === 'human_dismissed') {
      return needsHuman('disputed_or_dismissed');
    }

    const candidateType =
      resolution.state === 'risk_accepted'
        ? 'accepted_risk'
        : verification.state === 'verified_resolved'
          ? 'accepted'
          : null;
    if (candidateType === null) {
      if (verification.state === 'inconclusive' || verification.state === 'pending') {
        return needsHuman('verification_incomplete');
      }
      return noProposal('no_eligible_resolution');
    }
    if (!FEEDBACK_TYPES.includes(candidateType)) {
      throw new ReviewResolutionFeedbackProposalError(
        'Feedback taxonomy is missing expected type ' + candidateType
      );
    }
    // Canonical Feedback v1 uses exactly 16 lowercase hexadecimal characters.
    // Neither a v2 fingerprint nor an invalid value can be coerced or rehashed.
    if (finding.fingerprintAlgo !== 'v1' || !/^[0-9a-f]{16}$/.test(fingerprint ?? '')) {
      return needsHuman('unsupported_fingerprint');
    }
    const match = resolveReviewResolutionFindingRef(sourceFindings, finding);
    const originalFinding =
      match.status === 'matched' && !match.identityMismatch
        ? sourceFindings[match.findingIndex]
        : null;
    if (
      !originalFinding ||
      originalFinding.id !== finding.findingId ||
      originalFinding.fingerprint !== fingerprint
    ) {
      return needsHuman('unverified_source_finding');
    }
    if (reviewerIds.length === 0 || !nonEmptyString(reviewResolution.source.reviewRunId)) {
      return needsHuman('missing_reviewer_provenance');
    }
    const skillId = Object.hasOwn(skillIdByFingerprint, fingerprint)
      ? skillIdByFingerprint[fingerprint]
      : null;
    if (!nonEmptyString(skillId)) return needsHuman('missing_skill_mapping');

    if (candidateType === 'accepted_risk') {
      if (authorResponse.state !== 'accepts_risk' || !nonEmptyString(authorResponse.rationale)) {
        return needsHuman('missing_human_risk_rationale');
      }
      return classify(
        FEEDBACK_PROPOSAL_STATUS.PROPOSED,
        'risk_acceptance_requires_approval',
        candidateType,
        skillId.trim()
      );
    }

    if (
      resolution.state !== 'action_submitted' ||
      authorResponse.state !== 'will_fix' ||
      verification.coverageStatus !== 'complete' ||
      !nonEmptyString(verification.verifier) ||
      !Array.isArray(verification.evidenceRefs) ||
      verification.evidenceRefs.length === 0 ||
      !verification.evidenceRefs.every(isVerifiableEvidenceRef)
    ) {
      return needsHuman('insufficient_verification_evidence');
    }
    if (
      reviewResolutionRevisionArtifactKey(resolution.target) === null ||
      reviewResolutionRevisionArtifactKey(currentRevision) === null ||
      !isSameReviewResolutionRevision(resolution.target, currentRevision)
    ) {
      return needsHuman('stale_or_unknown_target_revision');
    }
    return classify(
      FEEDBACK_PROPOSAL_STATUS.PROPOSED,
      'verified_resolution_requires_approval',
      candidateType,
      skillId.trim()
    );
  });

  return deepFreeze({
    kind: 'review-resolution-feedback-proposals',
    schemaVersion: '1',
    resolutionId: reviewResolution.resolutionId,
    reviewRunId: reviewResolution.source.reviewRunId,
    items,
  });
}
