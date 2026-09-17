// Finding verification independence guard (#2287 / #2267 Phase 5).
//
// This module answers one deliberately narrow question:
// did the candidate finder and the verifier run under distinct reviewRunIds?
//
// A distinct reviewRunId is only the minimum fresh-run condition. It does not
// prove that the verifier is correct, provider-diverse, context-isolated, or
// cryptographically distinct. Those stronger identity guarantees remain in
// #1760. The #1978 Finding Critic state machine owns finding correctness and
// must not be duplicated here.

import { nonEmptyNfcString as nonEmptyString } from './promotion-candidates.mjs';

export const FRESH_VERIFIER_REASON = Object.freeze({
  DISTINCT_RUNS: 'distinct-review-runs',
  SAME_RUN: 'same-review-run',
  FINDER_RUN_ID_MISSING: 'finder-run-id-missing',
  VERIFIER_RUN_ID_MISSING: 'verifier-run-id-missing',
  BOTH_RUN_IDS_MISSING: 'finder-and-verifier-run-id-missing',
});

function reviewRunIdOf(provenance) {
  return nonEmptyString(provenance?.reviewRunId) ?? null;
}

/**
 * Assess the minimum fresh-run condition for finding verification.
 *
 * Provider, model, profile, agent and skill metadata are intentionally ignored
 * for the decision. A different provider in the same run is not an independent
 * verification run, while the same provider in a distinct run can still meet
 * this minimum execution-isolation condition.
 *
 * @param {object} [input]
 * @param {object|null} [input.finderProvenance]
 * @param {object|null} [input.verifierProvenance]
 * @returns {{
 *   minimumFreshRunSatisfied: boolean,
 *   reasonCode: string,
 *   finderRunId: string|null,
 *   verifierRunId: string|null,
 * }}
 */
export function assessFindingVerifierFreshRun({
  finderProvenance = null,
  verifierProvenance = null,
} = {}) {
  const finderRunId = reviewRunIdOf(finderProvenance);
  const verifierRunId = reviewRunIdOf(verifierProvenance);

  if (finderRunId == null && verifierRunId == null) {
    return {
      minimumFreshRunSatisfied: false,
      reasonCode: FRESH_VERIFIER_REASON.BOTH_RUN_IDS_MISSING,
      finderRunId,
      verifierRunId,
    };
  }

  if (finderRunId == null) {
    return {
      minimumFreshRunSatisfied: false,
      reasonCode: FRESH_VERIFIER_REASON.FINDER_RUN_ID_MISSING,
      finderRunId,
      verifierRunId,
    };
  }

  if (verifierRunId == null) {
    return {
      minimumFreshRunSatisfied: false,
      reasonCode: FRESH_VERIFIER_REASON.VERIFIER_RUN_ID_MISSING,
      finderRunId,
      verifierRunId,
    };
  }

  if (finderRunId === verifierRunId) {
    return {
      minimumFreshRunSatisfied: false,
      reasonCode: FRESH_VERIFIER_REASON.SAME_RUN,
      finderRunId,
      verifierRunId,
    };
  }

  return {
    minimumFreshRunSatisfied: true,
    reasonCode: FRESH_VERIFIER_REASON.DISTINCT_RUNS,
    finderRunId,
    verifierRunId,
  };
}
