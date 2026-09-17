/**
 * Repeat-run security audit coverage carry-over (#2267 Phase 9 / Epic Phase 11).
 *
 * A second audit of the same repository should not re-investigate surfaces whose
 * source has not moved, but `prior covered != current safe`. The Epic DoD states
 * it directly: "repeat-run で changed source を stale coverage 扱いしない". So a
 * prior `covered` unit is carried over ONLY when every path it reviewed still
 * hashes to the same content digest as the run that covered it. Any other
 * outcome — a changed path, a removed path, a path whose digest the caller could
 * not supply — returns the unit to `planned`, i.e. back onto the current
 * validation path.
 *
 * Boundaries this module deliberately keeps:
 * - It never promotes a unit. Carry-over can only preserve or demote.
 * - It derives no digests of its own from disk; the caller supplies the
 *   path → content digest map, which keeps this module source-only and free of
 *   any target execution.
 * - It is separate from #1574 (River Review's own reviewer capability
 *   evolution): this accumulates audit coverage of a *target repository*.
 *
 * Content hashing reuses the repo-wide SSoT (`canonicalJson` + `sha256Hex`)
 * rather than spelling a fourth private hash.
 */

import { canonicalJson, nonEmptyNfcString } from './promotion-candidates.mjs';
import { deriveSecurityAuditCoverage } from './security-audit-coverage.mjs';
import { sha256Hex } from './shadow-aggregate.mjs';

/** Digest placeholder for a reviewed path the caller could not hash. */
export const UNKNOWN_SOURCE_DIGEST = null;

/** Why a prior `covered` unit was not carried over into this run. */
export const REPEAT_RUN_REVALIDATION_REASONS = Object.freeze([
  'source_changed',
  'source_digest_unavailable',
  'reviewed_paths_changed',
  'no_prior_source_revision',
]);

function normalizePathList(paths) {
  if (!Array.isArray(paths)) return [];
  const normalized = paths.map((p) => nonEmptyNfcString(p)).filter((p) => p !== null);
  return [...new Set(normalized)].sort();
}

function semanticKey(unit) {
  return canonicalJson([
    nonEmptyNfcString(unit?.subsystem),
    nonEmptyNfcString(unit?.trustBoundary),
    nonEmptyNfcString(unit?.attackClassId),
  ]);
}

/**
 * Content-address the source a coverage unit claims to have reviewed.
 *
 * The digest covers the reviewed path set AND each path's content digest, so
 * both "the file changed" and "a different set of files was reviewed" move the
 * revision. A path missing from `sourceDigests` is recorded as `null` rather
 * than skipped: an unknown path must not hash the same as an unchanged one.
 *
 * @param {string[]} reviewedPaths
 * @param {Record<string, string>} sourceDigests path → content digest
 * @returns {{ revision: string, unknownPaths: string[] }}
 */
export function deriveUnitSourceRevision(reviewedPaths, sourceDigests = {}) {
  const paths = normalizePathList(reviewedPaths);
  const unknownPaths = [];
  const entries = paths.map((path) => {
    const digest = nonEmptyNfcString(sourceDigests?.[path]);
    if (digest === null) unknownPaths.push(path);
    return [path, digest ?? UNKNOWN_SOURCE_DIGEST];
  });
  return { revision: sha256Hex(canonicalJson(entries)), unknownPaths };
}

function carryOverDecision(priorUnit, currentUnit, sourceDigests) {
  const priorRevision = nonEmptyNfcString(priorUnit?.sourceRevision);
  if (priorRevision === null) {
    return { carry: false, reason: 'no_prior_source_revision' };
  }

  const priorPaths = normalizePathList(priorUnit?.reviewedPaths);
  const currentPaths = normalizePathList(currentUnit?.reviewedPaths);
  // A current planned unit usually carries no reviewedPaths yet; it inherits the
  // prior unit's path set. When it does declare paths, they must match, or the
  // carried-over evidence describes a different surface.
  if (currentPaths.length > 0 && canonicalJson(currentPaths) !== canonicalJson(priorPaths)) {
    return { carry: false, reason: 'reviewed_paths_changed' };
  }

  const { revision, unknownPaths } = deriveUnitSourceRevision(priorPaths, sourceDigests);
  if (unknownPaths.length > 0) {
    return { carry: false, reason: 'source_digest_unavailable', unknownPaths };
  }
  if (revision !== priorRevision) {
    return { carry: false, reason: 'source_changed' };
  }
  return { carry: true, revision };
}

/**
 * Reconcile this run's planned units against a prior run's coverage.
 *
 * Units the current run already classified as anything other than `planned` are
 * this run's own observation and pass through untouched. A `planned` unit whose
 * semantic key (subsystem × trustBoundary × attackClassId) matches a prior
 * `covered` unit is carried over only when `carryOverDecision` confirms the
 * reviewed source is byte-identical; otherwise it stays `planned` and is listed
 * in `revalidationRequired` with the reason.
 *
 * @param {object} input
 * @param {Array<object>} input.priorUnits units of the prior SecurityAuditCoverage
 * @param {Array<object>} input.currentUnits units planned/observed by this run
 * @param {Record<string, string>} input.sourceDigests current path → content digest
 * @param {string} input.taxonomyVersion attack class registry version
 * @returns {{
 *   coverage: object,
 *   repeatRun: {
 *     kind: 'SecurityAuditRepeatRun',
 *     priorUnitCount: number,
 *     carriedOverUnitIds: string[],
 *     revalidationRequired: Array<{unitId: string, reason: string, unknownPaths?: string[]}>,
 *     freshUnitIds: string[]
 *   }
 * }}
 */
export function reconcileRepeatRunCoverage({
  priorUnits = [],
  currentUnits = [],
  sourceDigests = {},
  taxonomyVersion,
} = {}) {
  if (!Array.isArray(priorUnits) || !Array.isArray(currentUnits)) {
    throw new TypeError('priorUnits and currentUnits must be arrays');
  }

  const priorCovered = new Map();
  for (const unit of priorUnits) {
    if (unit?.state === 'covered') priorCovered.set(semanticKey(unit), unit);
  }

  const carriedOverUnitIds = [];
  const revalidationRequired = [];
  const freshUnitIds = [];

  const units = currentUnits.map((unit) => {
    if (unit === null || typeof unit !== 'object' || Array.isArray(unit)) {
      throw new TypeError('each current unit must be an object');
    }
    const next = { ...unit };
    if (next.state !== 'planned') {
      if (next.state === 'covered' && typeof next.id === 'string') freshUnitIds.push(next.id);
      return next;
    }

    const prior = priorCovered.get(semanticKey(next));
    if (!prior) return next;

    const decision = carryOverDecision(prior, next, sourceDigests);
    if (!decision.carry) {
      revalidationRequired.push({
        unitId: next.id,
        reason: decision.reason,
        ...(decision.unknownPaths ? { unknownPaths: decision.unknownPaths } : {}),
      });
      return next;
    }

    carriedOverUnitIds.push(next.id);
    return {
      ...next,
      state: 'covered',
      reasonCode: null,
      reviewedPaths: normalizePathList(prior.reviewedPaths),
      evidenceRefs: Array.isArray(prior.evidenceRefs) ? prior.evidenceRefs : [],
      validationPlan: null,
      sourceRevision: decision.revision,
      carriedOverFrom: nonEmptyNfcString(prior.id) ?? prior.id,
    };
  });

  return {
    coverage: deriveSecurityAuditCoverage(units, { taxonomyVersion }),
    repeatRun: {
      kind: 'SecurityAuditRepeatRun',
      priorUnitCount: priorCovered.size,
      carriedOverUnitIds,
      revalidationRequired,
      freshUnitIds,
    },
  };
}
