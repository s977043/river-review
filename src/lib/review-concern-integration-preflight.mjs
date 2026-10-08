/**
 * Phase 5B preflight. Pure, bounded and non-authoritative.
 *
 * This module never calls a model, emits findings, changes review routing,
 * or supplies Gate inputs. "eligible" is permission to enter a future
 * opt-in experiment, not evidence that an interaction was checked.
 */

const MAX_PAIR_LIMIT = 20;
const DEFAULT_PAIR_LIMIT = 3;

function observation(
  status,
  reason,
  selectedPairs = [],
  skippedPairs = [],
  sourceStatus = null,
  sourceLimitations = []
) {
  return {
    schemaVersion: '1',
    kind: 'review-concern-integration-preflight',
    status,
    reason,
    sourceStatus,
    sourceLimitations,
    selectedPairs,
    skippedPairs,
    selectedCount: selectedPairs.length,
    skippedCount: skippedPairs.length,
    executed: false,
    applied: false,
  };
}

function validatePairs(interactions) {
  const refs = new Set();
  const pairs = new Set();
  for (const item of interactions) {
    const ref = item?.interactionRef;
    const ids = item?.concernRefs;
    if (typeof ref !== 'string' || ref.length === 0 || refs.has(ref)) {
      return { valid: false, reason: 'invalid-interaction-ref' };
    }
    if (
      !Array.isArray(ids) ||
      ids.length !== 2 ||
      ids.some((id) => typeof id !== 'string' || !id.trim()) ||
      ids[0] === ids[1]
    ) {
      return { valid: false, reason: 'invalid-concern-pair' };
    }
    if (item.integrationCheckCandidate !== true) {
      return { valid: false, reason: 'not-an-integration-candidate' };
    }
    const pairKey = JSON.stringify([...ids].sort());
    if (pairs.has(pairKey)) {
      return { valid: false, reason: 'duplicate-interaction-pair' };
    }
    refs.add(ref);
    pairs.add(pairKey);
  }
  return { valid: true };
}

/**
 * Resolve activation of future Phase 5B provider-backed candidate generation.
 *
 * @param {object} args
 * @param {object} args.interactionObservation - Phase 5A debug observation
 * @param {boolean} [args.enabled=false] - explicit user opt-in
 * @param {boolean} [args.dryRun=false]
 * @param {boolean} [args.offline=false]
 * @param {string} [args.provider='openai']
 * @param {boolean} [args.apiKeyAvailable=false] - presence only, not secret
 * @param {number} [args.maxPairs=3] - hard-bounded positive integer (<=20)
 */
export function selectReviewConcernIntegrationPreflight({
  interactionObservation,
  enabled = false,
  dryRun = false,
  offline = false,
  provider = 'openai',
  apiKeyAvailable = false,
  maxPairs = DEFAULT_PAIR_LIMIT,
} = {}) {
  if (!enabled) {
    return observation('not-executed', 'default-off');
  }

  if (
    !interactionObservation ||
    interactionObservation.kind !== 'review-concern-interaction-observation' ||
    interactionObservation.schemaVersion !== '1' ||
    !Array.isArray(interactionObservation.interactions)
  ) {
    return observation('unavailable', 'invalid-interaction-observation');
  }

  const sourceStatus = interactionObservation.status;
  const sourceLimitations = Array.isArray(interactionObservation.source?.limitations)
    ? [...interactionObservation.source.limitations]
    : [];
  if (interactionObservation.applied !== false) {
    return observation('unavailable', 'non-observational-source', [], [], sourceStatus, sourceLimitations);
  }
  if (!['observed', 'partial'].includes(sourceStatus)) {
    return observation('unavailable', 'interaction-observation-not-usable', [], [], sourceStatus, sourceLimitations);
  }

  const checked = validatePairs(interactionObservation.interactions);
  if (!checked.valid) {
    return observation('unavailable', checked.reason, [], [], sourceStatus, sourceLimitations);
  }

  if (!Number.isSafeInteger(maxPairs) || maxPairs < 1 || maxPairs > MAX_PAIR_LIMIT) {
    return observation('unavailable', 'invalid-pair-budget', [], [], sourceStatus, sourceLimitations);
  }

  if (dryRun) {
    return observation('not-executed', 'dry-run', [], [], sourceStatus, sourceLimitations);
  }
  if (offline) {
    return observation('not-executed', 'offline', [], [], sourceStatus, sourceLimitations);
  }
  if (provider !== 'openai') {
    return observation('not-executed', 'unsupported-provider', [], [], sourceStatus, sourceLimitations);
  }
  if (apiKeyAvailable !== true) {
    return observation('not-executed', 'missing-provider-authorization', [], [], sourceStatus, sourceLimitations);
  }

  // Phase 5A constructs canonical interaction order. Do not sort by perceived
  // coverage quality, reviewer agreement, severity, or model confidence.
  const pairs = interactionObservation.interactions;
  const selected = pairs.slice(0, maxPairs).map((pair) => ({
    interactionRef: pair.interactionRef,
    concernRefs: [...pair.concernRefs],
  }));
  const skipped = pairs.slice(maxPairs).map((pair) => ({
    interactionRef: pair.interactionRef,
    reason: 'pair-budget',
  }));

  // Even a zero-pair or complete selection has not verified a defect.
  return observation(
    'eligible-not-executed',
    pairs.length === 0 ? 'no-explicit-interactions' : null,
    selected,
    skipped,
    sourceStatus,
    sourceLimitations
  );
}
