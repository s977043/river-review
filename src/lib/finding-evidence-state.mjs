import { FINAL_STATUS } from './finding-critic.mjs';

/**
 * Epistemic state projected from an existing finding-validation result.
 *
 * This is a derived view for Security Audit and future structured reporting.
 * It is NOT a replacement lifecycle for `validation.finalStatus`,
 * `validatedStatus`, finding `status`, Semantic Precision `disposition`,
 * `scope`, or `askRelevance`.
 */
export const EVIDENCE_STATE = Object.freeze({
  ESTABLISHED: 'established',
  UNRESOLVED: 'unresolved',
  REFUTED: 'refuted',
});

/** Stable reason codes for the projection. */
export const EVIDENCE_STATE_REASON = Object.freeze({
  CONFIRMED: 'validation-confirmed',
  REFUTED: 'validation-refuted',
  UNRESOLVED: 'validation-unresolved',
  REVIEWER_WITHDRAWAL: 'truth-not-established-reviewer-withdrawal',
  OUT_OF_ASK: 'truth-not-adjudicated-out-of-ask',
  STATUS_MISSING: 'validation-status-missing',
  STATUS_UNKNOWN: 'validation-status-unknown',
});

const REFUTED_FINAL_STATUSES = new Set([
  FINAL_STATUS.DISMISSED_BY_EVIDENCE,
  FINAL_STATUS.DISMISSED_HALLUCINATION,
]);

const UNRESOLVED_FINAL_STATUSES = new Set([
  FINAL_STATUS.NEEDS_HUMAN_JUDGMENT,
  FINAL_STATUS.CRITIC_TIMEOUT,
]);

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function normalizeText(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized === '' ? null : normalized;
}

/**
 * Project an existing #1978 validation result onto the security-audit Evidence
 * State vocabulary without creating a second validation state machine.
 *
 * `validation.finalStatus` is the only truth-state source in v1. In particular,
 * a legacy/synthesis `validatedStatus`, finding lifecycle `status`, `scope`,
 * `disposition`, severity, confidence, or reviewer agreement MUST NOT establish
 * or refute a finding through this helper.
 *
 * Reviewer withdrawal is not evidence of falsity in #1978. A withdrawn claim is
 * dropped from routing, but remains epistemically unresolved unless evidence or
 * deterministic hallucination rejection actually refutes it.
 *
 * `out-of-ask` is relevance routing, not a truth rejection. Because #1978 can
 * terminate at the ask-relevance gate before truth adjudication completes, it
 * projects fail-safe to `unresolved` rather than `refuted`.
 *
 * An unresolved record is operationally complete only when the caller supplies
 * both an exact blocker and a validation plan. This helper never invents either
 * value from free-form reasons.
 *
 * @param {unknown} [input]
 * @returns {{
 *   state: 'established' | 'unresolved' | 'refuted',
 *   source: 'validation.finalStatus',
 *   sourceStatus: string | null,
 *   reasonCode: string,
 *   blocker: string | null,
 *   validationPlan: string | null,
 *   unresolvedContextComplete: boolean | null
 * }}
 */
export function projectFindingEvidenceState(input = {}) {
  const record = input && typeof input === 'object' ? input : {};
  const validation =
    record.validation && typeof record.validation === 'object' ? record.validation : {};
  const sourceStatus = normalizeText(validation.finalStatus);
  const blocker = normalizeText(record.blocker);
  const validationPlan = normalizeText(record.validationPlan);

  if (sourceStatus === FINAL_STATUS.CONFIRMED) {
    return {
      state: EVIDENCE_STATE.ESTABLISHED,
      source: 'validation.finalStatus',
      sourceStatus,
      reasonCode: EVIDENCE_STATE_REASON.CONFIRMED,
      blocker: null,
      validationPlan: null,
      unresolvedContextComplete: null,
    };
  }

  if (REFUTED_FINAL_STATUSES.has(sourceStatus)) {
    return {
      state: EVIDENCE_STATE.REFUTED,
      source: 'validation.finalStatus',
      sourceStatus,
      reasonCode: EVIDENCE_STATE_REASON.REFUTED,
      blocker: null,
      validationPlan: null,
      unresolvedContextComplete: null,
    };
  }

  if (sourceStatus === FINAL_STATUS.WITHDRAWN_BY_REVIEWER) {
    return {
      state: EVIDENCE_STATE.UNRESOLVED,
      source: 'validation.finalStatus',
      sourceStatus,
      reasonCode: EVIDENCE_STATE_REASON.REVIEWER_WITHDRAWAL,
      blocker,
      validationPlan,
      unresolvedContextComplete: blocker !== null && validationPlan !== null,
    };
  }

  if (sourceStatus === FINAL_STATUS.OUT_OF_ASK) {
    return {
      state: EVIDENCE_STATE.UNRESOLVED,
      source: 'validation.finalStatus',
      sourceStatus,
      reasonCode: EVIDENCE_STATE_REASON.OUT_OF_ASK,
      blocker,
      validationPlan,
      unresolvedContextComplete: blocker !== null && validationPlan !== null,
    };
  }

  if (UNRESOLVED_FINAL_STATUSES.has(sourceStatus)) {
    return {
      state: EVIDENCE_STATE.UNRESOLVED,
      source: 'validation.finalStatus',
      sourceStatus,
      reasonCode: EVIDENCE_STATE_REASON.UNRESOLVED,
      blocker,
      validationPlan,
      unresolvedContextComplete: blocker !== null && validationPlan !== null,
    };
  }

  return {
    state: EVIDENCE_STATE.UNRESOLVED,
    source: 'validation.finalStatus',
    sourceStatus,
    reasonCode:
      sourceStatus === null
        ? EVIDENCE_STATE_REASON.STATUS_MISSING
        : EVIDENCE_STATE_REASON.STATUS_UNKNOWN,
    blocker,
    validationPlan,
    unresolvedContextComplete: blocker !== null && validationPlan !== null,
  };
}
