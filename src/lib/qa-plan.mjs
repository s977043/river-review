// QA plan builder (ADR-017 D6). Field meanings and limits:
// docs/development/qa-evidence-contract.md §11, schemas/qa-plan.schema.json.
import { normalizeSeverity, severityToPriority } from './finding-factory.mjs';
import { nonEmptyNfcString } from './promotion-candidates.mjs';
import { normalizeQaId } from './qa-evidence.mjs';

export const QA_PLAN_SCHEMA_VERSION = '1';
export const QA_PLAN_MAX_ACCEPTANCE_CRITERIA = 200;
export const QA_PLAN_MAX_FINDINGS = 500;

const MAX_FINDING_ID_LENGTH = 160;

const basicItemId = (acId) => `ac:${acId}`;
const additionalItemId = (findingId) => `finding:${findingId}`;

function normalizeAcId(raw, index) {
  const id = normalizeQaId(raw);
  if (id === null) {
    throw new TypeError(`acceptanceCriteria[${index}].id is not a valid AC id`);
  }
  return id;
}

function normalizeFindingId(raw, index) {
  const id = nonEmptyNfcString(raw);
  if (id === null || id.length > MAX_FINDING_ID_LENGTH) {
    throw new TypeError(`findings[${index}].id is not a valid finding id`);
  }
  return id;
}

/**
 * Build a QA plan from the confirmed AC list and the review findings.
 *
 * Basic QA has exactly one item per AC, so it is never empty and does not
 * depend on the findings. Additional QA has one item per finding, keyed by the
 * finding's existing `id`. Invalid or duplicate ids and inputs over the limits
 * throw instead of being dropped, so the plan never silently loses an AC.
 *
 * @param {object} input
 * @param {Array<{ id: string, required?: boolean }>} input.acceptanceCriteria
 *   Confirmed AC list. `required` other than `false` is treated as required.
 * @param {Array<{ id: string, severity?: string, criterionRefs?: string[] }>} [input.findings]
 * @returns {{
 *   schemaVersion: '1',
 *   basic: Array<{ id: string, origin: 'acceptance-criterion', acId: string, priority: string, duplicateOf: null }>,
 *   additional: Array<{ id: string, origin: 'review-finding', findingId: string, priority: string, duplicateOf: string|null }>,
 * }}
 */
export function buildQaPlan({ acceptanceCriteria, findings = [] }) {
  if (!Array.isArray(acceptanceCriteria) || acceptanceCriteria.length === 0) {
    throw new TypeError('acceptanceCriteria must be a non-empty array');
  }
  if (acceptanceCriteria.length > QA_PLAN_MAX_ACCEPTANCE_CRITERIA) {
    throw new RangeError(
      `acceptanceCriteria has more than ${QA_PLAN_MAX_ACCEPTANCE_CRITERIA} entries`
    );
  }
  if (!Array.isArray(findings)) throw new TypeError('findings must be an array');
  if (findings.length > QA_PLAN_MAX_FINDINGS) {
    throw new RangeError(`findings has more than ${QA_PLAN_MAX_FINDINGS} entries`);
  }

  const acIds = new Set();
  const basic = acceptanceCriteria.map((ac, index) => {
    const acId = normalizeAcId(ac?.id, index);
    if (acIds.has(acId)) throw new TypeError(`acceptanceCriteria[${index}].id is duplicated`);
    acIds.add(acId);
    return {
      id: basicItemId(acId),
      origin: 'acceptance-criterion',
      acId,
      priority: ac.required === false ? 'P3' : 'P1',
      duplicateOf: null,
    };
  });

  const findingIds = new Set();
  const additional = findings.map((finding, index) => {
    const findingId = normalizeFindingId(finding?.id, index);
    if (findingIds.has(findingId)) throw new TypeError(`findings[${index}].id is duplicated`);
    findingIds.add(findingId);
    const refs = Array.isArray(finding.criterionRefs) ? finding.criterionRefs : [];
    const coveredAc = refs.map(nonEmptyNfcString).find((ref) => ref !== null && acIds.has(ref));
    return {
      id: additionalItemId(findingId),
      origin: 'review-finding',
      findingId,
      priority: severityToPriority(normalizeSeverity(finding.severity)),
      duplicateOf: coveredAc === undefined ? null : basicItemId(coveredAc),
    };
  });

  return { schemaVersion: QA_PLAN_SCHEMA_VERSION, basic, additional };
}
