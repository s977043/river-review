/**
 * Review execution coverage contract (#2212).
 *
 * Coverage answers whether the review work that was expected to run actually
 * completed. It is deliberately independent from finding count, skill routing,
 * context supply, and gate policy.
 */

export const REVIEW_UNIT_STATUSES = Object.freeze(['completed', 'failed', 'timed_out']);
export const REVIEW_COVERAGE_STATUSES = Object.freeze(['complete', 'partial', 'not_executed']);

function isCompleted(unit) {
  return unit?.status === 'completed';
}

function normalizeRequired(unit) {
  // Fail-safe default: an execution unit is required unless policy explicitly
  // marks it optional. Materialize the default in the returned unit as well so
  // the derived coverage object conforms to review-coverage.schema.json.
  return { ...unit, required: unit?.required !== false };
}

function isRequired(unit) {
  return unit?.required === true;
}

/**
 * Derive machine-readable review execution coverage from already-planned units.
 *
 * This function is intentionally pure and has no gate side effects. Runtime
 * wiring in reviewer-orchestrator is a separate step so observe-only telemetry
 * can land before any policy change.
 *
 * @param {Array<object>} units planned/executed review units
 * @returns {{
 *   schemaVersion: '1',
 *   status: 'complete'|'partial'|'not_executed',
 *   expectedUnits: number,
 *   completedUnits: number,
 *   requiredUnits: number,
 *   completedRequiredUnits: number,
 *   incompleteRequiredUnitIds: string[],
 *   units: Array<object>
 * }}
 */
export function deriveReviewCoverage(units = []) {
  const normalizedUnits = Array.isArray(units)
    ? units.filter(Boolean).map((unit) => normalizeRequired(unit))
    : [];
  const expectedUnits = normalizedUnits.length;
  const completedUnits = normalizedUnits.filter(isCompleted).length;
  const required = normalizedUnits.filter(isRequired);
  const requiredUnits = required.length;
  const completedRequiredUnits = required.filter(isCompleted).length;
  const incompleteRequiredUnitIds = required
    .filter((unit) => !isCompleted(unit))
    .map((unit) => unit.id)
    .filter((id) => typeof id === 'string' && id.length > 0);

  let status;
  if (expectedUnits === 0) {
    status = 'not_executed';
  } else if (requiredUnits === 0) {
    // Defensive path for future policies that may make every unit optional.
    status =
      completedUnits === expectedUnits
        ? 'complete'
        : completedUnits > 0
          ? 'partial'
          : 'not_executed';
  } else if (completedRequiredUnits === requiredUnits) {
    status = 'complete';
  } else if (completedRequiredUnits === 0) {
    status = 'not_executed';
  } else {
    status = 'partial';
  }

  return {
    schemaVersion: '1',
    status,
    expectedUnits,
    completedUnits,
    requiredUnits,
    completedRequiredUnits,
    incompleteRequiredUnitIds,
    units: normalizedUnits,
  };
}
