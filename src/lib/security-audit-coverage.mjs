/**
 * Observe-only semantic coverage contract for security audits (#2267 Phase 3).
 *
 * This is intentionally separate from ReviewCoverage (#2212):
 * - ReviewCoverage answers whether planned reviewer execution completed.
 * - SecurityAuditCoverage answers which subsystem × trust-boundary × attack-class
 *   surfaces were investigated or remain open.
 *
 * Finding lifecycle is also separate. Related finding ids can be attached for
 * traceability, but they never determine semantic coverage state.
 * Gate behavior is deliberately out of scope here.
 */

export const SECURITY_AUDIT_UNIT_STATES = Object.freeze([
  'planned',
  'covered',
  'blocked',
  'deferred',
  'out_of_scope',
]);

const SEMVER_PATTERN = /^[0-9]+\.[0-9]+\.[0-9]+$/;
const OPEN_STATES = new Set(['planned', 'blocked', 'deferred']);

function unitsInState(units, state) {
  return units.filter((unit) => unit?.state === state);
}

function semanticKey(unit) {
  return JSON.stringify([unit?.subsystem, unit?.trustBoundary, unit?.attackClassId]);
}

function sameStringArray(left, right) {
  return (
    Array.isArray(left) &&
    Array.isArray(right) &&
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

/**
 * Derive observe-only semantic coverage counters from caller-classified units.
 *
 * This function does not infer `covered` from finding count, reviewer success,
 * candidate state, or evidence volume. State classification remains explicit;
 * the JSON Schema enforces the evidence required for a unit already marked
 * `covered`.
 *
 * @param {Array<object>} units semantic security audit units
 * @param {{ taxonomyVersion: string }} options Phase 2 attack registry version
 * @returns {{
 *   kind: 'SecurityAuditCoverage',
 *   schemaVersion: '1',
 *   taxonomyVersion: string,
 *   executionPolicy: 'source-only',
 *   totalUnits: number,
 *   applicableUnits: number,
 *   coveredUnits: number,
 *   plannedUnits: number,
 *   blockedUnits: number,
 *   deferredUnits: number,
 *   outOfScopeUnits: number,
 *   openUnitIds: string[],
 *   units: Array<object>
 * }}
 */
export function deriveSecurityAuditCoverage(units = [], { taxonomyVersion } = {}) {
  if (typeof taxonomyVersion !== 'string' || !SEMVER_PATTERN.test(taxonomyVersion)) {
    throw new TypeError('taxonomyVersion must be an explicit semantic version');
  }

  const normalizedUnits = Array.isArray(units)
    ? units.filter(Boolean).map((unit) => ({ ...unit }))
    : [];
  const coveredUnits = unitsInState(normalizedUnits, 'covered').length;
  const plannedUnits = unitsInState(normalizedUnits, 'planned').length;
  const blockedUnits = unitsInState(normalizedUnits, 'blocked').length;
  const deferredUnits = unitsInState(normalizedUnits, 'deferred').length;
  const outOfScopeUnits = unitsInState(normalizedUnits, 'out_of_scope').length;
  const openUnitIds = normalizedUnits
    .filter((unit) => OPEN_STATES.has(unit?.state))
    .map((unit) => unit.id)
    .filter((id) => typeof id === 'string' && id.length > 0);

  return {
    kind: 'SecurityAuditCoverage',
    schemaVersion: '1',
    taxonomyVersion,
    executionPolicy: 'source-only',
    totalUnits: normalizedUnits.length,
    applicableUnits: normalizedUnits.length - outOfScopeUnits,
    coveredUnits,
    plannedUnits,
    blockedUnits,
    deferredUnits,
    outOfScopeUnits,
    openUnitIds,
    units: normalizedUnits,
  };
}

/**
 * Validate cross-record semantics that JSON Schema cannot express cleanly.
 *
 * The returned issues are observe-only diagnostics. This function has no Gate
 * side effects and does not validate finding truth.
 *
 * @param {object} coverage derived SecurityAuditCoverage object
 * @param {object} attackRegistry Phase 2 SecurityAttackClassRegistry
 * @returns {Array<{code: string, unitId?: string, message: string}>}
 */
export function validateSecurityAuditCoverageSemantics(coverage, attackRegistry) {
  const issues = [];
  const units = Array.isArray(coverage?.units) ? coverage.units : [];
  const classes = Array.isArray(attackRegistry?.classes) ? attackRegistry.classes : [];
  const knownAttackClassIds = new Set(classes.map(({ id }) => id).filter(Boolean));

  if (coverage?.taxonomyVersion !== attackRegistry?.version) {
    issues.push({
      code: 'taxonomy_version_mismatch',
      message: `coverage taxonomyVersion ${coverage?.taxonomyVersion ?? '<missing>'} does not match registry version ${attackRegistry?.version ?? '<missing>'}`,
    });
  }

  const seenIds = new Set();
  const seenSemanticKeys = new Set();
  for (const unit of units) {
    if (seenIds.has(unit?.id)) {
      issues.push({
        code: 'duplicate_unit_id',
        unitId: unit?.id,
        message: `duplicate security audit coverage unit id: ${unit?.id}`,
      });
    } else if (unit?.id) {
      seenIds.add(unit.id);
    }

    const key = semanticKey(unit);
    if (seenSemanticKeys.has(key)) {
      issues.push({
        code: 'duplicate_semantic_unit',
        unitId: unit?.id,
        message: 'duplicate subsystem × trustBoundary × attackClassId coverage unit',
      });
    } else {
      seenSemanticKeys.add(key);
    }

    if (!knownAttackClassIds.has(unit?.attackClassId)) {
      issues.push({
        code: 'unknown_attack_class',
        unitId: unit?.id,
        message: `unknown attack class: ${unit?.attackClassId ?? '<missing>'}`,
      });
    }
  }

  if (SEMVER_PATTERN.test(coverage?.taxonomyVersion ?? '')) {
    const expected = deriveSecurityAuditCoverage(units, {
      taxonomyVersion: coverage.taxonomyVersion,
    });
    const scalarFields = [
      'totalUnits',
      'applicableUnits',
      'coveredUnits',
      'plannedUnits',
      'blockedUnits',
      'deferredUnits',
      'outOfScopeUnits',
    ];

    for (const field of scalarFields) {
      if (coverage?.[field] !== expected[field]) {
        issues.push({
          code: 'summary_mismatch',
          message: `${field}=${coverage?.[field]} does not match derived value ${expected[field]}`,
        });
      }
    }

    if (!sameStringArray(coverage?.openUnitIds, expected.openUnitIds)) {
      issues.push({
        code: 'summary_mismatch',
        message: 'openUnitIds does not match the derived open semantic units',
      });
    }
  }

  return issues;
}
