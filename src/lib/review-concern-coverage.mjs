import {
  deriveReviewCoverage,
  normalizeCoverageStatus,
} from './review-coverage.mjs';

const SCHEMA_VERSION = '1';

function uniqueStrings(values = []) {
  return [
    ...new Set(
      (Array.isArray(values) ? values : []).filter(
        (value) => typeof value === 'string' && value.length > 0
      )
    ),
  ];
}

function concernMapLimitations(reviewConcernMap) {
  return Array.isArray(reviewConcernMap?.analysis?.limitations)
    ? [...reviewConcernMap.analysis.limitations]
    : [];
}

function buildUnavailableObservation({
  reviewConcernMap,
  reviewCoverage,
  reason,
}) {
  return {
    schemaVersion: SCHEMA_VERSION,
    kind: 'review-concern-coverage-observation',
    status: 'unavailable',
    source: {
      concernMapStatus: reviewConcernMap?.analysis?.status ?? null,
      reviewCoverageStatus: normalizeCoverageStatus(reviewCoverage),
      limitations: concernMapLimitations(reviewConcernMap),
      reason,
    },
    concerns: [],
    summary: null,
    blindSpotConcernRefs: [],
    applied: false,
  };
}

function validateConcernIds(reviewConcernMap) {
  const seen = new Set();
  const ids = [];

  for (const concern of reviewConcernMap.concerns) {
    const id =
      typeof concern?.id === 'string' && concern.id.trim()
        ? concern.id.trim()
        : null;
    if (!id || seen.has(id)) return null;
    seen.add(id);
    ids.push(id);
  }

  return ids;
}

function mappedUnitsForConcern(reviewCoverage, concernRef) {
  return reviewCoverage.units.filter((unit) =>
    uniqueStrings(unit?.concernRefs).includes(concernRef)
  );
}

/**
 * Project existing Review Coverage execution evidence onto observed Concerns.
 *
 * This is observation-only. It does not mutate Review Coverage, does not infer
 * semantic completeness, and has no Gate or routing authority.
 *
 * @returns {object|null}
 */
export function buildReviewConcernCoverageObservation({
  reviewConcernMap,
  reviewCoverage,
} = {}) {
  if (!reviewConcernMap) return null;

  if (
    reviewConcernMap.kind !== 'review-concern-map' ||
    reviewConcernMap.schemaVersion !== '1' ||
    !Array.isArray(reviewConcernMap.concerns)
  ) {
    return buildUnavailableObservation({
      reviewConcernMap,
      reviewCoverage,
      reason: 'invalid-concern-map',
    });
  }

  const concernMapStatus = reviewConcernMap.analysis?.status ?? null;
  if (concernMapStatus === 'failed') {
    return buildUnavailableObservation({
      reviewConcernMap,
      reviewCoverage,
      reason: 'concern-map-failed',
    });
  }
  if (concernMapStatus !== 'completed' && concernMapStatus !== 'partial') {
    return buildUnavailableObservation({
      reviewConcernMap,
      reviewCoverage,
      reason: 'invalid-concern-map-status',
    });
  }

  const concernIds = validateConcernIds(reviewConcernMap);
  if (!concernIds) {
    return buildUnavailableObservation({
      reviewConcernMap,
      reviewCoverage,
      reason: 'invalid-concern-id',
    });
  }

  if (!reviewCoverage || !Array.isArray(reviewCoverage.units)) {
    return buildUnavailableObservation({
      reviewConcernMap,
      reviewCoverage,
      reason: 'review-coverage-unavailable',
    });
  }

  const reviewCoverageStatus = normalizeCoverageStatus(reviewCoverage);
  if (reviewCoverageStatus === 'unknown') {
    return buildUnavailableObservation({
      reviewConcernMap,
      reviewCoverage,
      reason: 'review-coverage-invalid',
    });
  }

  const concerns = concernIds.map((concernRef) => {
    const mappedUnits = mappedUnitsForConcern(reviewCoverage, concernRef);
    if (mappedUnits.length === 0) {
      return {
        concernRef,
        mappingStatus: 'unmapped',
        mappedReviewUnitIds: [],
        mappedReviewerRoles: [],
        executionCoverage: null,
        requiredMappedUnits: 0,
        completedRequiredMappedUnits: 0,
        incompleteRequiredUnitIds: [],
        blindSpotCandidate: true,
      };
    }

    const projected = deriveReviewCoverage(mappedUnits);
    return {
      concernRef,
      mappingStatus: 'mapped',
      mappedReviewUnitIds: uniqueStrings(mappedUnits.map((unit) => unit?.id)),
      mappedReviewerRoles: uniqueStrings(
        mappedUnits.map((unit) => unit?.reviewerRole)
      ),
      executionCoverage: projected.status,
      requiredMappedUnits: projected.requiredUnits,
      completedRequiredMappedUnits: projected.completedRequiredUnits,
      incompleteRequiredUnitIds: [...projected.incompleteRequiredUnitIds],
      blindSpotCandidate: false,
    };
  });

  const blindSpotConcernRefs = concerns
    .filter((concern) => concern.blindSpotCandidate)
    .map((concern) => concern.concernRef);
  const mapped = concerns.filter((concern) => concern.mappingStatus === 'mapped');
  const incompleteMapped = mapped.filter(
    (concern) => concern.executionCoverage !== 'complete'
  );

  return {
    schemaVersion: SCHEMA_VERSION,
    kind: 'review-concern-coverage-observation',
    status: concernMapStatus === 'partial' ? 'partial' : 'observed',
    source: {
      concernMapStatus,
      reviewCoverageStatus,
      limitations: concernMapLimitations(reviewConcernMap),
      reason: null,
    },
    concerns,
    summary: {
      observedConcerns: concerns.length,
      mappedConcerns: mapped.length,
      unmappedConcerns: blindSpotConcernRefs.length,
      incompleteMappedConcerns: incompleteMapped.length,
    },
    blindSpotConcernRefs,
    applied: false,
  };
}
