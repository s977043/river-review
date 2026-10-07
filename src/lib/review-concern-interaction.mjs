const SCHEMA_VERSION = '1';

function mapLimitations(reviewConcernMap) {
  return Array.isArray(reviewConcernMap?.analysis?.limitations)
    ? [...reviewConcernMap.analysis.limitations]
    : [];
}

function buildUnavailableObservation({
  reviewConcernMap,
  reviewConcernCoverage,
  reason,
}) {
  return {
    schemaVersion: SCHEMA_VERSION,
    kind: 'review-concern-interaction-observation',
    status: 'unavailable',
    source: {
      concernMapStatus: reviewConcernMap?.analysis?.status ?? null,
      concernCoverageStatus: reviewConcernCoverage?.status ?? null,
      limitations: mapLimitations(reviewConcernMap),
      reason,
    },
    interactions: [],
    summary: null,
    applied: false,
  };
}

function normalizeConcernIds(reviewConcernMap) {
  const seen = new Set();
  const concerns = new Map();

  for (const concern of reviewConcernMap.concerns) {
    const id =
      typeof concern?.id === 'string' && concern.id.trim()
        ? concern.id.trim()
        : null;
    if (!id || seen.has(id)) return null;
    seen.add(id);
    concerns.set(id, concern);
  }

  return concerns;
}

function canonicalPair(left, right) {
  return left <= right ? [left, right] : [right, left];
}

function buildCoverageIndex(reviewConcernCoverage) {
  if (
    !reviewConcernCoverage ||
    reviewConcernCoverage.kind !== 'review-concern-coverage-observation' ||
    reviewConcernCoverage.schemaVersion !== '1' ||
    !['observed', 'partial'].includes(reviewConcernCoverage.status) ||
    !Array.isArray(reviewConcernCoverage.concerns)
  ) {
    return {
      status: 'unavailable',
      sourceStatus: reviewConcernCoverage?.status ?? null,
      byConcern: new Map(),
    };
  }

  const byConcern = new Map();
  for (const concern of reviewConcernCoverage.concerns) {
    const concernRef =
      typeof concern?.concernRef === 'string' && concern.concernRef.trim()
        ? concern.concernRef.trim()
        : null;
    if (!concernRef || byConcern.has(concernRef)) {
      return {
        status: 'unavailable',
        sourceStatus: reviewConcernCoverage.status,
        byConcern: new Map(),
      };
    }
    byConcern.set(concernRef, concern);
  }

  return {
    status: reviewConcernCoverage.status === 'partial' ? 'partial' : 'available',
    sourceStatus: reviewConcernCoverage.status,
    byConcern,
  };
}

function endpointCoverage(coverageIndex, concernRef) {
  const observed = coverageIndex.byConcern.get(concernRef);
  const mappingStatus = observed?.mappingStatus;
  const executionCoverage = observed?.executionCoverage ?? null;
  const validMappedExecution =
    mappingStatus === 'mapped' &&
    ['complete', 'partial', 'not_executed'].includes(executionCoverage);
  const validUnmappedExecution =
    mappingStatus === 'unmapped' && executionCoverage === null;
  const valid =
    observed &&
    (validMappedExecution || validUnmappedExecution) &&
    typeof observed.blindSpotCandidate === 'boolean';

  if (!valid) {
    return {
      concernRef,
      mappingStatus: null,
      executionCoverage: null,
      blindSpotCandidate: null,
    };
  }

  return {
    concernRef,
    mappingStatus,
    executionCoverage,
    blindSpotCandidate: observed.blindSpotCandidate,
  };
}

function interactionCoverage(coverageIndex, concernRefs) {
  const concerns = concernRefs.map((concernRef) =>
    endpointCoverage(coverageIndex, concernRef)
  );
  const hasEveryEndpoint = concerns.every(
    (concern) => concern.mappingStatus !== null
  );

  if (!hasEveryEndpoint || coverageIndex.status === 'unavailable') {
    return {
      status: 'unavailable',
      concerns,
    };
  }

  return {
    status: coverageIndex.status,
    concerns,
  };
}

/**
 * Build a deterministic, observe-only plan for explicit cross-concern
 * interactions.
 *
 * Only explicit Concern Map interactionRefs are represented. This module does
 * not infer relationships, generate findings, route reviewers, or affect Gate.
 *
 * @returns {object|null}
 */
export function buildReviewConcernInteractionObservation({
  reviewConcernMap,
  reviewConcernCoverage,
} = {}) {
  if (!reviewConcernMap) return null;

  if (
    reviewConcernMap.kind !== 'review-concern-map' ||
    reviewConcernMap.schemaVersion !== '1' ||
    !Array.isArray(reviewConcernMap.concerns)
  ) {
    return buildUnavailableObservation({
      reviewConcernMap,
      reviewConcernCoverage,
      reason: 'invalid-concern-map',
    });
  }

  const concernMapStatus = reviewConcernMap.analysis?.status ?? null;
  if (concernMapStatus === 'failed') {
    return buildUnavailableObservation({
      reviewConcernMap,
      reviewConcernCoverage,
      reason: 'concern-map-failed',
    });
  }
  if (concernMapStatus !== 'completed' && concernMapStatus !== 'partial') {
    return buildUnavailableObservation({
      reviewConcernMap,
      reviewConcernCoverage,
      reason: 'invalid-concern-map-status',
    });
  }

  const concernsById = normalizeConcernIds(reviewConcernMap);
  if (!concernsById) {
    return buildUnavailableObservation({
      reviewConcernMap,
      reviewConcernCoverage,
      reason: 'invalid-concern-id',
    });
  }

  const pairMap = new Map();
  for (const [sourceRef, concern] of concernsById) {
    const refs = concern?.interactionRefs;
    if (refs == null) continue;
    if (!Array.isArray(refs)) {
      return buildUnavailableObservation({
        reviewConcernMap,
        reviewConcernCoverage,
        reason: 'invalid-interaction-refs',
      });
    }

    for (const rawTargetRef of refs) {
      const targetRef =
        typeof rawTargetRef === 'string' && rawTargetRef.trim()
          ? rawTargetRef.trim()
          : null;
      if (!targetRef) {
        return buildUnavailableObservation({
          reviewConcernMap,
          reviewConcernCoverage,
          reason: 'invalid-interaction-ref',
        });
      }
      if (targetRef === sourceRef) {
        return buildUnavailableObservation({
          reviewConcernMap,
          reviewConcernCoverage,
          reason: 'self-interaction-ref',
        });
      }
      if (!concernsById.has(targetRef)) {
        return buildUnavailableObservation({
          reviewConcernMap,
          reviewConcernCoverage,
          reason: 'missing-interaction-target',
        });
      }

      const pair = canonicalPair(sourceRef, targetRef);
      pairMap.set(JSON.stringify(pair), pair);
    }
  }

  const pairs = [...pairMap.values()].sort((a, b) => {
    const left = JSON.stringify(a);
    const right = JSON.stringify(b);
    if (left < right) return -1;
    if (left > right) return 1;
    return 0;
  });
  const coverageIndex = buildCoverageIndex(reviewConcernCoverage);

  const interactions = pairs.map((concernRefs, index) => ({
    interactionRef: `interaction-${index + 1}`,
    concernRefs,
    coverage: interactionCoverage(coverageIndex, concernRefs),
    integrationCheckCandidate: true,
  }));

  const withAvailableCoverageContext = interactions.filter(
    (interaction) => interaction.coverage.status === 'available'
  ).length;
  const withPartialCoverageContext = interactions.filter(
    (interaction) => interaction.coverage.status === 'partial'
  ).length;
  const withUnavailableCoverageContext = interactions.filter(
    (interaction) => interaction.coverage.status === 'unavailable'
  ).length;

  return {
    schemaVersion: SCHEMA_VERSION,
    kind: 'review-concern-interaction-observation',
    status: concernMapStatus === 'partial' ? 'partial' : 'observed',
    source: {
      concernMapStatus,
      concernCoverageStatus: coverageIndex.sourceStatus,
      limitations: mapLimitations(reviewConcernMap),
      reason: null,
    },
    interactions,
    summary: {
      observedInteractions: interactions.length,
      withAvailableCoverageContext,
      withPartialCoverageContext,
      withUnavailableCoverageContext,
    },
    applied: false,
  };
}
