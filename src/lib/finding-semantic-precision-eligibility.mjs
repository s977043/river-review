import { EVIDENCE_STATE, projectFindingEvidenceState } from './finding-evidence-state.mjs';

/**
 * Derive whether a finding is eligible to enter Semantic Precision.
 *
 * Phase 7A intentionally does not execute the #1857 Judge. It only fixes the
 * responsibility boundary between epistemic validation and materiality:
 *
 *   established -> eligible for Semantic Precision
 *   unresolved  -> not eligible; validation obligation remains
 *   refuted     -> not eligible; the claim does not proceed to materiality
 *
 * `projectFindingEvidenceState()` remains the single source of truth for the
 * Evidence State mapping. This helper does not re-declare validation statuses,
 * dispositions, severity, confidence, scope, or Gate policy.
 *
 * @param {unknown} [input]
 * @returns {{
 *   semanticPrecisionEligible: boolean,
 *   evidence: ReturnType<typeof projectFindingEvidenceState>
 * }}
 */
export function evaluateSemanticPrecisionEligibility(input = {}) {
  const evidence = projectFindingEvidenceState(input);

  return {
    semanticPrecisionEligible: evidence.state === EVIDENCE_STATE.ESTABLISHED,
    evidence,
  };
}
