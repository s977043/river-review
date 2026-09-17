/**
 * Reviewer execution independence contract (#2286 / #2267 Phase 5A).
 *
 * This module answers one narrow question:
 *
 *   Did the finder and verifier run under different logical execution ids?
 *
 * It does NOT prove that the actors are different humans/models/providers, that
 * either run is trustworthy, or that a finding is correct. The ids are logical
 * provenance only. Cryptographic identity and stronger reviewer provenance stay
 * with #1760.
 *
 * The helper is intentionally not wired into the runtime in Phase 5A. #1978's
 * finding-critic state machine remains evaluation-gated, so a future Phase 5B
 * adapter must call this predicate before claiming independent verification.
 */

/** Logical independence state. This is not a finding lifecycle vocabulary. */
export const REVIEWER_INDEPENDENCE_STATUS = Object.freeze({
  INDEPENDENT: 'independent',
  SAME_EXECUTION: 'same-execution',
  UNKNOWN: 'unknown',
});

/** Stable reason codes for diagnostics and future audit artifacts. */
export const REVIEWER_INDEPENDENCE_REASON = Object.freeze({
  DISTINCT_RUN_IDS: 'distinct-run-ids',
  SAME_RUN_ID: 'same-run-id',
  FINDER_RUN_ID_MISSING: 'finder-run-id-missing',
  VERIFIER_RUN_ID_MISSING: 'verifier-run-id-missing',
  BOTH_RUN_IDS_MISSING: 'both-run-ids-missing',
});

/**
 * Normalize an opaque run id without inventing identity from another type.
 *
 * Run ids are case-sensitive opaque strings. Only surrounding whitespace is
 * removed. Numbers, objects, booleans, and whitespace-only strings are treated
 * as missing instead of being coerced into a plausible identity.
 *
 * @param {unknown} value
 * @returns {string | null}
 */
function normalizeRunId(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized === '' ? null : normalized;
}

/**
 * Evaluate the minimum logical finder/verifier separation required by #2267.
 *
 * Fail-safe behavior:
 * - missing identity is UNKNOWN, never independent
 * - equal identities are SAME_EXECUTION, never independent
 * - only two present, distinct ids are INDEPENDENT
 *
 * A true `independent` value means only that `finderRunId != verifierRunId`
 * after normalization. It is not evidence that the validation is correct or
 * that the ids are tamper-evident.
 *
 * @param {{ finderRunId?: unknown, verifierRunId?: unknown }} [input]
 * @returns {{
 *   status: string,
 *   independent: boolean,
 *   finderRunId: string | null,
 *   verifierRunId: string | null,
 *   reasonCode: string
 * }}
 */
export function evaluateReviewerIndependence({ finderRunId, verifierRunId } = {}) {
  const finder = normalizeRunId(finderRunId);
  const verifier = normalizeRunId(verifierRunId);

  if (finder === null && verifier === null) {
    return {
      status: REVIEWER_INDEPENDENCE_STATUS.UNKNOWN,
      independent: false,
      finderRunId: null,
      verifierRunId: null,
      reasonCode: REVIEWER_INDEPENDENCE_REASON.BOTH_RUN_IDS_MISSING,
    };
  }

  if (finder === null) {
    return {
      status: REVIEWER_INDEPENDENCE_STATUS.UNKNOWN,
      independent: false,
      finderRunId: null,
      verifierRunId: verifier,
      reasonCode: REVIEWER_INDEPENDENCE_REASON.FINDER_RUN_ID_MISSING,
    };
  }

  if (verifier === null) {
    return {
      status: REVIEWER_INDEPENDENCE_STATUS.UNKNOWN,
      independent: false,
      finderRunId: finder,
      verifierRunId: null,
      reasonCode: REVIEWER_INDEPENDENCE_REASON.VERIFIER_RUN_ID_MISSING,
    };
  }

  if (finder === verifier) {
    return {
      status: REVIEWER_INDEPENDENCE_STATUS.SAME_EXECUTION,
      independent: false,
      finderRunId: finder,
      verifierRunId: verifier,
      reasonCode: REVIEWER_INDEPENDENCE_REASON.SAME_RUN_ID,
    };
  }

  return {
    status: REVIEWER_INDEPENDENCE_STATUS.INDEPENDENT,
    independent: true,
    finderRunId: finder,
    verifierRunId: verifier,
    reasonCode: REVIEWER_INDEPENDENCE_REASON.DISTINCT_RUN_IDS,
  };
}
