/**
 * Observe-only semantic coverage contract for security audits (#2267 Phase 3).
 *
 * This is intentionally separate from ReviewCoverage (#2212):
 * - ReviewCoverage answers whether planned reviewer execution completed.
 * - SecurityAuditCoverage answers which subsystem × trust-boundary × attack-class
 *   surfaces were investigated or remain incomplete.
 *
 * Finding count never determines semantic coverage. A zero-finding investigation
 * can be `covered` only when the caller supplies traceable reviewed paths and
 * evidence references. Gate behavior is deliberately out of scope here.
 */

export const SECURITY_AUDIT_UNIT_STATUSES = Object.freeze([
  'planned',
  'covered',
  'candidate',
  'blocked',
  'deferred',
  'out-of-scope',
]);

export const SECURITY_AUDIT_COVERAGE_STATUSES = Object.freeze([
  'complete',
  'partial',
  'not_started',
]);

const INVESTIGATED_STATUSES = new Set(['covered', 'candidate']);
const GAP_STATUSES = new Set(['planned', 'blocked', 'deferred']);

function isOutOfScope(unit) {
  return unit?.status === 'out-of-scope';
}

function isInvestigated(unit) {
  return INVESTIGATED_STATUSES.has(unit?.status);
}

function isGap(unit) {
  return GAP_STATUSES.has(unit?.status);
}

/**
 * Derive aggregate semantic coverage from caller-supplied security audit units.
 *
 * Unit status is authoritative input. This function does not infer `covered`
 * from finding count, reviewer success, or evidence volume; it only summarizes
 * already-classified semantic units.
 *
 * @param {Array<object>} units semantic security audit units
 * @returns {{
 *   schemaVersion: '1',
 *   status: 'complete'|'partial'|'not_started',
 *   totalUnits: number,
 *   applicableUnits: number,
 *   investigatedUnits: number,
 *   gapUnitIds: string[],
 *   units: Array<object>
 * }}
 */
export function deriveSecurityAuditCoverage(units = []) {
  const normalizedUnits = Array.isArray(units) ? units.filter(Boolean).map((unit) => ({ ...unit })) : [];
  const applicable = normalizedUnits.filter((unit) => !isOutOfScope(unit));
  const investigated = applicable.filter(isInvestigated);
  const gapUnitIds = applicable
    .filter(isGap)
    .map((unit) => unit.id)
    .filter((id) => typeof id === 'string' && id.length > 0);

  let status;
  if (applicable.length === 0 || investigated.length === 0) {
    status = 'not_started';
  } else if (gapUnitIds.length === 0 && investigated.length === applicable.length) {
    status = 'complete';
  } else {
    status = 'partial';
  }

  return {
    schemaVersion: '1',
    status,
    totalUnits: normalizedUnits.length,
    applicableUnits: applicable.length,
    investigatedUnits: investigated.length,
    gapUnitIds,
    units: normalizedUnits,
  };
}
