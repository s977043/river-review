import { FEEDBACK_TYPES } from './feedback.mjs';

/**
 * Review Resolution sidecar contract (#2505, Epic #2322 Phase 1).
 *
 * This module is intentionally pure and host-neutral. It does not discover
 * findings, recompute Semantic Precision disposition, invoke reviewers, write
 * files, change Gate decisions, append canonical Feedback, or merge/release.
 * It only builds and semantically checks the human/author handling state that
 * sits beside an immutable Review Artifact.
 */

export const REVIEW_RESOLUTION_SCHEMA_VERSION = '1';
export const REVIEW_RESOLUTION_KIND = 'review-resolution';

export const AUTHOR_RESPONSE_STATES = Object.freeze([
  'none',
  'will_fix',
  'disputes',
  'accepts_risk',
  'postpones',
  'wont_fix',
  'escalates',
  'agrees_spec_decision',
]);

export const RESOLUTION_STATES = Object.freeze([
  'open',
  'action_submitted',
  'risk_accepted',
  'human_dismissed',
  'postponed',
  'decision_agreed',
  'needs_human',
]);

export const VERIFICATION_STATES = Object.freeze([
  'not_requested',
  'pending',
  'not_reproduced',
  'verified_resolved',
  'persists',
  'inconclusive',
]);

export const SYSTEM_DISPOSITIONS = Object.freeze([
  'blocking',
  'advisory',
  'suppressed',
  'unknown',
]);

export const COVERAGE_STATUSES = Object.freeze([
  'complete',
  'partial',
  'not_executed',
  'unknown',
]);

// feedback.mjs owns this vocabulary. Review Resolution imports that SSoT so a
// future feedback addition cannot silently collide with these state machines.

export class ReviewResolutionError extends Error {
  constructor(message, errors = []) {
    super(message);
    this.name = 'ReviewResolutionError';
    this.errors = errors;
  }
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isRevisionRef(value) {
  return (
    value &&
    typeof value === 'object' &&
    nonEmptyString(value.reviewRunId) &&
    nonEmptyString(value.executionManifestId) &&
    Array.isArray(value.artifactRefs) &&
    value.artifactRefs.length > 0
  );
}

function revisionArtifactKey(value) {
  if (!isRevisionRef(value)) return null;
  return value.artifactRefs
    .map((ref) => `${ref?.name ?? ''}:${ref?.sha256 ?? ''}`)
    .sort()
    .join('|');
}

function isSameRevision(left, right) {
  const leftKey = revisionArtifactKey(left);
  const rightKey = revisionArtifactKey(right);
  return leftKey !== null && rightKey !== null && leftKey === rightKey;
}

function hasVerificationEvidence(item) {
  return (
    nonEmptyString(item?.verification?.verifier) &&
    Array.isArray(item?.verification?.evidenceRefs) &&
    item.verification.evidenceRefs.length > 0 &&
    isRevisionRef(item?.resolution?.target)
  );
}

/**
 * Cross-field checks the JSON Schema cannot safely express without coupling
 * unrelated vocabularies. Structural validation remains the schema's job.
 *
 * @param {object} document
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateReviewResolutionSemantics(document) {
  const errors = [];
  const items = Array.isArray(document?.items) ? document.items : [];

  if (document?.schemaVersion !== REVIEW_RESOLUTION_SCHEMA_VERSION) {
    errors.push(`schemaVersion must be ${REVIEW_RESOLUTION_SCHEMA_VERSION}`);
  }
  if (document?.kind !== REVIEW_RESOLUTION_KIND) {
    errors.push(`kind must be ${REVIEW_RESOLUTION_KIND}`);
  }
  if (!nonEmptyString(document?.resolutionId)) {
    errors.push('resolutionId must be a non-empty string');
  }
  if (!isRevisionRef(document?.source)) {
    errors.push('source must carry reviewRunId, executionManifestId, and artifactRefs');
  }

  const feedbackWords = new Set(FEEDBACK_TYPES);
  for (const state of [...AUTHOR_RESPONSE_STATES, ...RESOLUTION_STATES, ...VERIFICATION_STATES]) {
    if (feedbackWords.has(state)) {
      errors.push(`Review Resolution state collides with feedback taxonomy: ${state}`);
    }
  }

  const fingerprints = new Set();
  items.forEach((item, index) => {
    const prefix = `items[${index}]`;
    const fingerprint = item?.findingRef?.fingerprint;
    const algo = item?.findingRef?.fingerprintAlgo;
    const key =
      nonEmptyString(fingerprint) && nonEmptyString(algo) ? `${algo}:${fingerprint}` : null;
    if (key && fingerprints.has(key)) {
      errors.push(`${prefix} duplicates finding fingerprint ${key}`);
    }
    if (key) fingerprints.add(key);

    if (!AUTHOR_RESPONSE_STATES.includes(item?.authorResponse?.state)) {
      errors.push(`${prefix}.authorResponse.state is outside the closed vocabulary`);
    }
    if (!RESOLUTION_STATES.includes(item?.resolution?.state)) {
      errors.push(`${prefix}.resolution.state is outside the closed vocabulary`);
    }
    if (!VERIFICATION_STATES.includes(item?.verification?.state)) {
      errors.push(`${prefix}.verification.state is outside the closed vocabulary`);
    }
    if (!SYSTEM_DISPOSITIONS.includes(item?.systemJudgment?.disposition)) {
      errors.push(`${prefix}.systemJudgment.disposition is outside the closed vocabulary`);
    }
    if (!COVERAGE_STATUSES.includes(item?.verification?.coverageStatus)) {
      errors.push(`${prefix}.verification.coverageStatus is outside the closed vocabulary`);
    }

    const verificationState = item?.verification?.state;
    const coverageStatus = item?.verification?.coverageStatus;
    const target = item?.resolution?.target;

    if (verificationState === 'verified_resolved' || verificationState === 'persists') {
      if (!hasVerificationEvidence(item)) {
        errors.push(
          `${prefix}.${verificationState} requires target revision, verifier, and evidenceRefs`
        );
      }
    }

    if (verificationState === 'not_reproduced') {
      if (!isRevisionRef(target)) {
        errors.push(`${prefix}.not_reproduced requires a target revision`);
      }
      if (coverageStatus !== 'complete') {
        errors.push(`${prefix}.not_reproduced requires complete review coverage`);
      }
      if (isSameRevision(document?.source, target)) {
        errors.push(`${prefix}.not_reproduced requires a revision different from source`);
      }
    }

    if (coverageStatus === 'partial' || coverageStatus === 'not_executed') {
      if (verificationState !== 'inconclusive' && verificationState !== 'pending') {
        errors.push(
          `${prefix}.${coverageStatus} coverage cannot support verification state ${verificationState}`
        );
      }
    }

    if (item?.resolution?.state === 'action_submitted') {
      if (!isRevisionRef(target)) {
        errors.push(`${prefix}.action_submitted requires a target revision`);
      } else if (isSameRevision(document?.source, target)) {
        errors.push(`${prefix}.action_submitted requires a revision different from source`);
      }
    }

    if (verificationState === 'verified_resolved' && isSameRevision(document?.source, target)) {
      errors.push(`${prefix}.verified_resolved requires a revision different from source`);
    }

    if (item?.resolution?.state === 'decision_agreed') {
      if (item?.authorResponse?.state !== 'agrees_spec_decision') {
        errors.push(`${prefix}.decision_agreed requires authorResponse agrees_spec_decision`);
      }
      if (
        !Array.isArray(item?.resolution?.decisionRefs) ||
        item.resolution.decisionRefs.length === 0
      ) {
        errors.push(`${prefix}.decision_agreed requires at least one human decision reference`);
      }
    }
  });

  return { valid: errors.length === 0, errors };
}

export function assertReviewResolutionSemantics(document) {
  const result = validateReviewResolutionSemantics(document);
  if (!result.valid) {
    throw new ReviewResolutionError('Review Resolution semantic validation failed', result.errors);
  }
  return document;
}

/**
 * Build a sidecar document without mutating caller-owned objects.
 * IDs/hashes are never derived here: reviewRunId, Execution Manifest identity,
 * and artifact sha256 values come from their existing SSoTs.
 *
 * @param {{resolutionId: string, source: object, items?: object[]}} input
 * @returns {object}
 */
export function buildReviewResolution({ resolutionId, source, items = [] } = {}) {
  const document = {
    schemaVersion: REVIEW_RESOLUTION_SCHEMA_VERSION,
    kind: REVIEW_RESOLUTION_KIND,
    resolutionId,
    source: clone(source),
    items: clone(Array.isArray(items) ? items : []),
  };
  return assertReviewResolutionSemantics(document);
}
