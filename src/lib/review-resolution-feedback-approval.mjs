import { FEEDBACK_TRIGGERS, buildFeedbackEntry } from './feedback.mjs';
import { canonicalJson } from './promotion-candidates.mjs';
import { sha256Hex } from './shadow-aggregate.mjs';
import {
  reviewResolutionRevisionArtifactKey,
  isSameReviewResolutionRevision,
} from './review-resolution.mjs';

/**
 * Explicit, read-only approval boundary for #2591.
 *
 * A feedback candidate is not an authorization. The host must identify the
 * human approver, bind that approval to the exact CURRENT proposal, and decide
 * whether to persist the resulting canonical FeedbackEntry. No file writes,
 * reviewer calls, promotion, Gate changes, or network requests happen here.
 *
 * The digest is a replay/mix-up guard, NOT proof of the actor's identity or a
 * signature. Authentication and persisted approval records belong to the host.
 */

const FINGERPRINT_V1 = /^[0-9a-f]{16}$/;
const SKILL_ID = /^[A-Za-z0-9._:/-]+$/;
const APPROVABLE_TYPES = new Set(['accepted', 'accepted_risk']);

export class ReviewResolutionFeedbackApprovalError extends Error {
  constructor(code) {
    super(`Review Resolution feedback approval rejected: ${code}`);
    this.name = 'ReviewResolutionFeedbackApprovalError';
    this.code = code;
  }
}

function reject(code) {
  throw new ReviewResolutionFeedbackApprovalError(code);
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function validTimestamp(timestamp) {
  if (
    typeof timestamp !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(timestamp)
  ) {
    return false;
  }
  const time = new Date(timestamp);
  return Number.isFinite(time.getTime()) && time.toISOString() === timestamp;
}

function assertCandidate(proposal) {
  if (!proposal || typeof proposal !== 'object' || Array.isArray(proposal)) {
    reject('invalid_proposal');
  }
  if (proposal.status !== 'candidate' || proposal.requiresHumanApproval !== true) {
    reject('not_an_approvable_candidate');
  }
  if (!APPROVABLE_TYPES.has(proposal.feedbackType)) {
    reject('unsupported_feedback_type');
  }
  if (!nonEmpty(proposal.reviewRunId) || !nonEmpty(proposal.executionManifestId)) {
    reject('missing_source_provenance');
  }
  if (
    !nonEmpty(proposal.findingRef?.findingId) ||
    proposal.findingRef?.fingerprintAlgo !== 'v1' ||
    !FINGERPRINT_V1.test(proposal.findingRef?.fingerprint ?? '')
  ) {
    reject('incompatible_fingerprint');
  }
  if (!nonEmpty(proposal.skillId) || !SKILL_ID.test(proposal.skillId)) {
    reject('missing_trusted_skill_mapping');
  }
  if (
    !Array.isArray(proposal.reviewerIds) ||
    proposal.reviewerIds.length === 0 ||
    !proposal.reviewerIds.every(nonEmpty)
  ) {
    reject('missing_reviewer_provenance');
  }
  if (proposal.feedbackType === 'accepted') {
    const verification = proposal.verification;
    if (
      verification?.state !== 'verified_resolved' ||
      verification?.coverageStatus !== 'complete' ||
      !nonEmpty(verification?.verifier) ||
      !Array.isArray(verification?.evidenceRefs) ||
      verification.evidenceRefs.length === 0 ||
      !verification.evidenceRefs.every((ref) => nonEmpty(ref?.ref)) ||
      reviewResolutionRevisionArtifactKey(verification.target) === null
    ) {
      reject('insufficient_verification_evidence');
    }
  } else if (!nonEmpty(proposal.authorRationale)) {
    reject('missing_risk_acceptance_rationale');
  }
}

/** A canonical digest of the entire observation, including revision, evidence
 * and reviewer lineage. Reuse the existing JSON/hash SSoTs. */
export function reviewResolutionFeedbackProposalDigest(proposal) {
  assertCandidate(proposal);
  return sha256Hex(canonicalJson(proposal));
}

/**
 * Only an explicit, traceable, current human approval can produce a canonical
 * FeedbackEntry. The result is data for a caller-owned write, not persistence.
 *
 * @param {{
 *   proposal: object,
 *   approval: {
 *     actor: string, rationale: string, approvedAt: string,
 *     proposalDigest: string, findingId: string, findingFingerprint: string,
 *     reviewRunId: string, skillId: string, feedbackType: string
 *   },
 *   existingFeedback?: object[],
 *   currentProposal?: object,
 *   currentRevision?: object|null,
 *   trigger?: string,
 *   pr?: number|null
 * }} params
 * @returns {{status: 'ready'|'duplicate', feedbackEntry: object|null, audit: object}}
 */
export function approveReviewResolutionFeedbackProposal({
  proposal,
  approval,
  existingFeedback = [],
  currentProposal,
  currentRevision,
  trigger = 'pr-comment',
  pr = null,
} = {}) {
  // Passing a stale snapshot by itself would give the host no way to detect
  // a newer candidate. Require a distinct caller-supplied CURRENT proposal.
  if (currentProposal === undefined) reject('current_proposal_required');
  const digest = reviewResolutionFeedbackProposalDigest(proposal);
  const currentDigest = reviewResolutionFeedbackProposalDigest(currentProposal);
  if (currentDigest !== digest) reject('stale_or_swapped_proposal');

  if (
    !approval ||
    typeof approval !== 'object' ||
    Array.isArray(approval) ||
    !nonEmpty(approval.actor) ||
    !nonEmpty(approval.rationale) ||
    approval.rationale.length > 4000 ||
    !validTimestamp(approval.approvedAt)
  ) {
    reject('invalid_human_approval');
  }
  if (!/^[0-9a-f]{64}$/.test(approval.proposalDigest ?? '') || approval.proposalDigest !== digest) {
    reject('approval_digest_mismatch');
  }
  if (
    approval.findingId !== proposal.findingRef.findingId ||
    approval.findingFingerprint !== proposal.findingRef.fingerprint ||
    approval.reviewRunId !== proposal.reviewRunId ||
    approval.skillId !== proposal.skillId ||
    approval.feedbackType !== proposal.feedbackType
  ) {
    reject('approval_target_mismatch');
  }
  if (reviewResolutionRevisionArtifactKey(currentRevision) === null) {
    reject('stale_or_unknown_revision');
  }
  if (proposal.feedbackType === 'accepted') {
    if (!isSameReviewResolutionRevision(proposal.verification.target, currentRevision)) {
      reject('stale_or_unknown_revision');
    }
  } else if (
    currentRevision.reviewRunId !== proposal.reviewRunId ||
    currentRevision.executionManifestId !== proposal.executionManifestId
  ) {
    // A risk acceptance belongs to its reviewed revision. Unlike a verified
    // fix, it has no target revision in the proposal, so bind it to the
    // source run and manifest rather than letting the host apply it after a
    // later change without a fresh human decision.
    reject('stale_or_unknown_revision');
  }
  if (!Array.isArray(existingFeedback)) reject('invalid_existing_feedback');
  if (!FEEDBACK_TRIGGERS.includes(trigger)) reject('invalid_feedback_trigger');
  if (pr !== null && (!Number.isInteger(pr) || pr <= 0)) reject('invalid_pr');

  const existing = existingFeedback.some(
    (entry) =>
      (entry?.review_run_id ?? entry?.reviewRunId) === proposal.reviewRunId &&
      entry?.findingFingerprint === proposal.findingRef.fingerprint &&
      entry?.feedbackType === proposal.feedbackType &&
      entry?.skillId === proposal.skillId
  );

  // Do not add novel fields to the published FeedbackEntry. This separate
  // audit projection preserves approval and verifier details for host storage.
  const audit = {
    actor: approval.actor.trim(),
    rationale: approval.rationale.trim(),
    approvedAt: approval.approvedAt,
    proposalDigest: digest,
    source: {
      reviewRunId: proposal.reviewRunId,
      executionManifestId: proposal.executionManifestId,
      findingRef: clone(proposal.findingRef),
      reviewerIds: clone(proposal.reviewerIds),
      verification: clone(proposal.verification),
    },
    feedbackType: proposal.feedbackType,
    skillId: proposal.skillId,
    status: existing ? 'duplicate' : 'ready',
  };

  if (existing) {
    return { status: 'duplicate', feedbackEntry: null, audit };
  }

  // The only creator of the canonical format remains feedback.mjs.
  const feedbackEntry = buildFeedbackEntry({
    feedbackType: proposal.feedbackType,
    skillId: proposal.skillId,
    findingFingerprint: proposal.findingRef.fingerprint,
    reviewRunId: proposal.reviewRunId,
    evidence: approval.rationale.trim(),
    trigger,
    pr,
    now: new Date(approval.approvedAt),
    // A multi-reviewer finding must not be attributed arbitrarily to one role.
    ...(proposal.reviewerIds.length === 1 ? { reviewer: proposal.reviewerIds[0] } : {}),
  });
  return { status: 'ready', feedbackEntry, audit };
}
