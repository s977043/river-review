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

function uniqueStrings(values) {
  return [
    ...new Set(
      (Array.isArray(values) ? values : []).filter(
        (value) => typeof value === 'string' && value.length > 0
      )
    ),
  ];
}

/**
 * Add the deterministic file-scope ledger to an already-derived coverage object.
 *
 * `selected` comes from the LLM-facing diff scope. `covered` is stricter: a
 * selected file is covered only when at least one effective execution unit
 * names it and every effective unit that names it completed. Required units are
 * authoritative when present; the all-optional defensive path falls back to all
 * units, mirroring deriveReviewCoverage(). Optional reviewer failures therefore
 * do not make a file uncovered when required coverage completed.
 *
 * The helper is pure and does not alter coverage.status or Gate behavior.
 *
 * @param {object} coverage result of deriveReviewCoverage()
 * @param {{selected?: string[], excluded?: Array<{path?: string, reasonCode?: string}>}} fileScope
 * @returns {object}
 */
export function attachReviewFileCoverage(coverage, fileScope = {}) {
  const units = Array.isArray(coverage?.units) ? coverage.units : [];
  const requiredUnits = units.filter(isRequired);
  const effectiveUnits = requiredUnits.length > 0 ? requiredUnits : units;
  const selected = uniqueStrings(fileScope?.selected);
  const covered = selected.filter((path) => {
    const unitsForPath = effectiveUnits.filter(
      (unit) => Array.isArray(unit?.subjects) && unit.subjects.includes(path)
    );
    return unitsForPath.length > 0 && unitsForPath.every(isCompleted);
  });
  const excluded = [];
  const seenExcluded = new Set();
  for (const entry of Array.isArray(fileScope?.excluded) ? fileScope.excluded : []) {
    const path = typeof entry?.path === 'string' ? entry.path : '';
    const reasonCode = typeof entry?.reasonCode === 'string' ? entry.reasonCode : '';
    if (!path || !reasonCode || seenExcluded.has(path)) continue;
    seenExcluded.add(path);
    excluded.push({ path, reasonCode });
  }

  return {
    ...coverage,
    files: {
      selected,
      covered,
      excluded,
    },
  };
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
