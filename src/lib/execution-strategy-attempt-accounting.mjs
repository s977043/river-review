/**
 * #2564 Phase 3: read-only, non-authoritative accounting preflight for a
 * Host-declared execution strategy and provider transport-attempt inventory.
 *
 * The Host owns execution. A complete Host declaration is not independently
 * verified execution evidence and MUST NOT enable routing, Gate or approval.
 * No network, provider billing API, disk write or clock read occurs here.
 */

const STRATEGIES = new Set(['single', 'cascade', 'critique']);

function identifier(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= 256;
}

function finiteNonnegative(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function hasDuplicate(ids) {
  return new Set(ids).size !== ids.length;
}

/**
 * @param {object} [input]
 * @param {object|null} [input.hostExecution] A Host declaration, not verified provenance.
 * @param {Array|null} [input.legs] Host logical operations, not individual HTTP retries.
 * @param {Array|null} [input.attempts] Host provider transport attempts, including failures.
 * @param {string[]|null} [input.expectedAttemptIds] Host-declared exhaustive transport IDs.
 * @returns {object} Fail-closed observation only; never an adoption decision.
 */
export function buildHostAttemptAccountingObservation({
  hostExecution = null,
  legs = null,
  attempts = null,
  expectedAttemptIds = null,
} = {}) {
  const actualStrategy =
    hostExecution?.source === 'host-execution-log' && STRATEGIES.has(hostExecution.actualStrategy)
      ? hostExecution.actualStrategy
      : null;
  const reasons = [];

  if (actualStrategy === null) reasons.push('actual-host-strategy-unobserved');
  if (hostExecution?.inventoryScope !== 'complete') reasons.push('inventory-scope-unverified');

  const validLegs =
    Array.isArray(legs) &&
    legs.length > 0 &&
    legs.every((leg) => identifier(leg?.legId)) &&
    !hasDuplicate(legs.map((leg) => leg.legId));
  if (!validLegs) reasons.push('leg-inventory-invalid-or-empty');

  const validExpected =
    Array.isArray(expectedAttemptIds) &&
    expectedAttemptIds.length > 0 &&
    expectedAttemptIds.every(identifier) &&
    !hasDuplicate(expectedAttemptIds);
  if (!validExpected) reasons.push('expected-attempt-inventory-invalid-or-empty');

  const validAttempts =
    Array.isArray(attempts) &&
    attempts.length > 0 &&
    attempts.every((attempt) => identifier(attempt?.attemptId) && identifier(attempt?.legId)) &&
    !hasDuplicate(attempts.map((attempt) => attempt.attemptId));
  if (!validAttempts) reasons.push('transport-attempt-inventory-invalid-or-empty');

  const legIds = validLegs ? new Set(legs.map((leg) => leg.legId)) : new Set();
  const expectedIds = validExpected ? new Set(expectedAttemptIds) : new Set();
  const belongsToInventory = (attempt) =>
    legIds.has(attempt.legId) && expectedIds.has(attempt.attemptId);
  const attemptsAccountedFor =
    validLegs &&
    validExpected &&
    validAttempts &&
    attempts.length === expectedAttemptIds.length &&
    attempts.every(belongsToInventory);

  if (!attemptsAccountedFor) reasons.push('transport-attempt-inventory-mismatch');

  // The Host's closed inventory is only a claim. No verifier is wired here.
  const hostDeclaredComplete =
    actualStrategy !== null && hostExecution?.inventoryScope === 'complete' && attemptsAccountedFor;

  let totalEstimatedCostUsd = null;
  if (hostDeclaredComplete) {
    const priced = attempts.every(
      (attempt) =>
        finiteNonnegative(attempt.estimatedCostUsd) &&
        attempt.currency === 'USD' &&
        identifier(attempt.pricingSource)
    );
    if (priced) {
      totalEstimatedCostUsd = attempts.reduce((sum, attempt) => sum + attempt.estimatedCostUsd, 0);
      if (!Number.isFinite(totalEstimatedCostUsd)) totalEstimatedCostUsd = null;
    }
  }
  if (totalEstimatedCostUsd === null) reasons.push('complete-priced-cost-unavailable');

  // End-to-end latency uses a single Host run boundary. Never sum parallel legs.
  const wallClockMs =
    hostExecution?.source === 'host-execution-log' &&
    identifier(hostExecution?.clockSource) &&
    finiteNonnegative(hostExecution?.startedAtMs) &&
    finiteNonnegative(hostExecution?.endedAtMs) &&
    hostExecution.endedAtMs >= hostExecution.startedAtMs
      ? hostExecution.endedAtMs - hostExecution.startedAtMs
      : null;
  if (wallClockMs === null) reasons.push('host-run-wall-clock-unavailable');

  // Deliberately no "verified" status: a self-declared inventory cannot
  // demonstrate provider completeness, billing accuracy or independent trust.
  return {
    kind: 'host-execution-attempt-accounting-observation',
    schemaVersion: '1',
    status: hostDeclaredComplete ? 'host-declared-complete' : 'incomplete',
    actualStrategy,
    attemptCount: validAttempts ? attempts.length : null,
    legCount: validLegs ? legs.length : null,
    inventoryMatchesHostDeclaration: hostDeclaredComplete,
    inventoryTrust: 'unverified',
    totalEstimatedCostUsd,
    costTrust: totalEstimatedCostUsd === null ? 'unknown' : 'host-estimate-unverified',
    wallClockMs,
    wallClockTrust: wallClockMs === null ? 'unknown' : 'host-declared-unverified',
    eligibleForAdoption: false,
    recommendationApplied: false,
    reasons,
  };
}
