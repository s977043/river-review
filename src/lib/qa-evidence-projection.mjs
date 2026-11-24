// Partial projection of a QA evidence result onto completion-assessment (ADR-017 D3).
//
// The SSoT is docs/development/qa-evidence-contract.md §8. Only the acceptance-criterion counts and
// the completion reasonCode are projected: `state` belongs to completion-judge (§8.2), the tests
// evidence is never made `present`, and the QA_* reasonCodes stay in the audit result (§8.1).

// A member of `$defs.completionReasonCode` in schemas/completion-assessment.schema.json;
// tests/qa-evidence-projection.test.mjs pins that against the schema.
export const QA_PROJECTION_REASON_CODE = 'ACCEPTANCE_CRITERION_UNVERIFIED';

/**
 * §8.1: project a `judgeQaEvidence` / `auditQaEvidence` result. Pure.
 *
 * @param {{ projection: { total: number, verified: number, unverified: number } | null }} result
 * @returns {{ acceptanceCriteria: { total: number, verified: number, unverified: number },
 *   reasonCodes: string[] } | null} null when the AC population is not determined
 */
export function projectQaEvidence(result) {
  const projection = result?.projection;
  if (projection === null || projection === undefined) return null;
  const { total, verified, unverified } = projection;
  return {
    acceptanceCriteria: { total, verified, unverified },
    reasonCodes: unverified > 0 ? [QA_PROJECTION_REASON_CODE] : [],
  };
}
