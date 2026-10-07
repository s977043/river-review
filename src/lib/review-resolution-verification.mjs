import {
  organizeReviewResolution,
  resolveReviewResolutionFindingRef,
} from './review-resolution-organizer.mjs';
import {
  assertReviewResolutionSemantics,
  isSameReviewResolutionRevision,
  reviewResolutionRevisionArtifactKey,
} from './review-resolution.mjs';

export const RESOLUTION_VERIFICATION_MODES = Object.freeze(['targeted', 'full_run']);
export const RESOLUTION_VERIFICATION_OUTCOMES = Object.freeze([
  'reproduced',
  'not_reproduced',
  'inconclusive',
]);

export class ReviewResolutionVerificationError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'ReviewResolutionVerificationError';
    this.code = code;
    this.details = details;
  }
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasEvidence(observation) {
  return (
    nonEmptyString(observation?.verifier) &&
    Array.isArray(observation?.evidenceRefs) &&
    observation.evidenceRefs.length > 0
  );
}

function requireRevision(value, label) {
  if (reviewResolutionRevisionArtifactKey(value) === null) {
    throw new ReviewResolutionVerificationError(
      'invalid_revision',
      `${label} must be a Review Resolution revision reference`
    );
  }
}

function verificationStateFor(observation) {
  const coverageStatus = observation.coverageStatus;
  if (coverageStatus !== 'complete') return 'inconclusive';
  if (observation.outcome === 'inconclusive') return 'inconclusive';

  if (observation.mode === 'targeted') {
    if (!hasEvidence(observation)) return 'inconclusive';
    return observation.outcome === 'not_reproduced' ? 'verified_resolved' : 'persists';
  }

  if (observation.outcome === 'not_reproduced') return 'not_reproduced';
  if (!hasEvidence(observation)) return 'inconclusive';
  return 'persists';
}

function findResolutionMatch({ findings, reviewResolution, findingTarget }) {
  const resolvedFinding = resolveReviewResolutionFindingRef(findings, findingTarget ?? {});
  if (resolvedFinding.status === 'ambiguous') {
    throw new ReviewResolutionVerificationError(
      'ambiguous_finding',
      'verification target matches multiple findings',
      resolvedFinding
    );
  }
  if (resolvedFinding.status === 'orphan') {
    throw new ReviewResolutionVerificationError(
      'orphan_finding',
      'verification target matches no finding',
      { findingTarget: clone(findingTarget ?? {}) }
    );
  }
  if (resolvedFinding.identityMismatch) {
    throw new ReviewResolutionVerificationError(
      'finding_identity_mismatch',
      'verification target findingId and fingerprint disagree',
      resolvedFinding
    );
  }

  const projection = organizeReviewResolution({ findings, reviewResolution });
  const matches = projection.findings[resolvedFinding.findingIndex]?.resolutionMatches ?? [];
  if (matches.length === 0) {
    throw new ReviewResolutionVerificationError(
      'orphan_resolution',
      'matched finding has no Review Resolution item',
      { findingIndex: resolvedFinding.findingIndex }
    );
  }
  if (matches.length > 1) {
    throw new ReviewResolutionVerificationError(
      'ambiguous_resolution',
      'matched finding has multiple Review Resolution items',
      {
        findingIndex: resolvedFinding.findingIndex,
        resolutionIndexes: matches.map((match) => match.resolutionIndex),
      }
    );
  }

  const match = matches[0];
  const mismatchedResolution = projection.warnings.some(
    (entry) =>
      entry?.code === 'identity_mismatch' && entry?.resolutionIndex === match.resolutionIndex
  );
  if (mismatchedResolution) {
    throw new ReviewResolutionVerificationError(
      'resolution_identity_mismatch',
      'Review Resolution item findingId and fingerprint disagree',
      { resolutionIndex: match.resolutionIndex }
    );
  }
  return match;
}

export function assessReviewResolutionFreshness(reviewResolution, currentRevision) {
  const currentKey = reviewResolutionRevisionArtifactKey(currentRevision);
  return (Array.isArray(reviewResolution?.items) ? reviewResolution.items : []).map(
    (item, itemIndex) => {
      const target = item?.resolution?.target ?? null;
      if (target === null) return { itemIndex, status: 'unbound' };
      if (currentKey === null || reviewResolutionRevisionArtifactKey(target) === null) {
        return { itemIndex, status: 'unknown' };
      }
      return {
        itemIndex,
        status: isSameReviewResolutionRevision(target, currentRevision) ? 'fresh' : 'stale',
      };
    }
  );
}

export function proposeReviewResolutionTargetBinding({
  findings = [],
  reviewResolution,
  findingTarget,
  targetRevision,
} = {}) {
  requireRevision(targetRevision, 'targetRevision');
  if (isSameReviewResolutionRevision(reviewResolution?.source, targetRevision)) {
    throw new ReviewResolutionVerificationError(
      'same_source_revision',
      'action submission requires a revision different from the source review'
    );
  }

  const match = findResolutionMatch({
    findings,
    reviewResolution,
    findingTarget,
  });
  const sourceItem = reviewResolution.items[match.resolutionIndex];
  if (sourceItem?.authorResponse?.state !== 'will_fix') {
    throw new ReviewResolutionVerificationError(
      'author_response_not_will_fix',
      'target binding requires authorResponse will_fix',
      { resolutionIndex: match.resolutionIndex }
    );
  }

  if (
    sourceItem?.resolution?.target !== null &&
    isSameReviewResolutionRevision(sourceItem.resolution.target, targetRevision) &&
    sourceItem?.resolution?.state === 'action_submitted'
  ) {
    return clone(reviewResolution);
  }

  const proposal = clone(reviewResolution);
  const item = proposal.items[match.resolutionIndex];
  item.resolution.state = 'action_submitted';
  item.resolution.target = clone(targetRevision);
  item.verification = {
    state: 'pending',
    verifier: null,
    coverageStatus: 'unknown',
    evidenceRefs: [],
  };

  assertReviewResolutionSemantics(proposal);
  return proposal;
}

/**
 * Apply one already-observed verification result to Review Resolution.
 *
 * This module does not execute a Reviewer, Critic, LLM, browser, or test. The
 * caller supplies the observation and target revision. That keeps evidence
 * collection separate from the deterministic state transition.
 */
export function proposeReviewResolutionVerificationUpdate({
  findings = [],
  reviewResolution,
  findingTarget,
  currentRevision,
  observation,
} = {}) {
  if (!RESOLUTION_VERIFICATION_MODES.includes(observation?.mode)) {
    throw new ReviewResolutionVerificationError(
      'invalid_mode',
      'verification mode must be targeted or full_run'
    );
  }
  if (!RESOLUTION_VERIFICATION_OUTCOMES.includes(observation?.outcome)) {
    throw new ReviewResolutionVerificationError(
      'invalid_outcome',
      'verification outcome is outside the closed vocabulary'
    );
  }
  if (!['complete', 'partial', 'not_executed', 'unknown'].includes(observation?.coverageStatus)) {
    throw new ReviewResolutionVerificationError(
      'invalid_coverage',
      'verification coverageStatus is outside the Review Resolution vocabulary'
    );
  }

  requireRevision(currentRevision, 'currentRevision');
  requireRevision(observation?.targetRevision, 'observation.targetRevision');

  if (!isSameReviewResolutionRevision(currentRevision, observation.targetRevision)) {
    throw new ReviewResolutionVerificationError(
      'stale_observation',
      'verification observation targets a revision different from currentRevision'
    );
  }
  if (isSameReviewResolutionRevision(reviewResolution?.source, currentRevision)) {
    throw new ReviewResolutionVerificationError(
      'same_source_revision',
      're-verification requires a revision different from the source review'
    );
  }

  const match = findResolutionMatch({
    findings,
    reviewResolution,
    findingTarget,
  });
  const sourceItem = reviewResolution.items[match.resolutionIndex];
  const existingTarget = sourceItem?.resolution?.target ?? null;
  if (existingTarget === null) {
    throw new ReviewResolutionVerificationError(
      'unbound_resolution_target',
      'Review Resolution must bind the submitted revision before verification',
      { resolutionIndex: match.resolutionIndex }
    );
  }
  if (!isSameReviewResolutionRevision(existingTarget, currentRevision)) {
    throw new ReviewResolutionVerificationError(
      'stale_resolution_target',
      'Review Resolution is bound to a different target revision',
      { resolutionIndex: match.resolutionIndex }
    );
  }

  const state = verificationStateFor(observation);
  const proposal = clone(reviewResolution);
  const item = proposal.items[match.resolutionIndex];
  item.verification = {
    state,
    verifier: nonEmptyString(observation.verifier) ? observation.verifier : null,
    coverageStatus: observation.coverageStatus,
    evidenceRefs: clone(Array.isArray(observation.evidenceRefs) ? observation.evidenceRefs : []),
  };

  assertReviewResolutionSemantics(proposal);
  return proposal;
}
