// Partial projection of a QA evidence result onto completion-assessment (ADR-017 D3).
//
// The SSoT is docs/development/qa-evidence-contract.md §8. Only the acceptance-criterion counts and
// the completion reasonCode are projected: `state` belongs to completion-judge (§8.2), the tests
// evidence is never made `present`, and the QA_* reasonCodes stay in the audit result (§8.1).
import { readFileSync } from 'node:fs';

const UNVERIFIED_REASON_CODE = 'ACCEPTANCE_CRITERION_UNVERIFIED';

let checkedReasonCode = null;
function unverifiedReasonCode() {
  if (checkedReasonCode === null) {
    const schema = JSON.parse(
      readFileSync(
        new URL('../../schemas/completion-assessment.schema.json', import.meta.url),
        'utf8'
      )
    );
    if (!schema.$defs.completionReasonCode.enum.includes(UNVERIFIED_REASON_CODE)) {
      throw new Error(`${UNVERIFIED_REASON_CODE} is not a completion reasonCode`);
    }
    checkedReasonCode = UNVERIFIED_REASON_CODE;
  }
  return checkedReasonCode;
}

/**
 * §8.1: project a `judgeQaEvidence` / `auditQaEvidence` result. Pure apart from the one-time
 * schema read.
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
    reasonCodes: unverified > 0 ? [unverifiedReasonCode()] : [],
  };
}
