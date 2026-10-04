const EVALUATION_SCHEMA_VERSION = '1';

export class ReviewConcernEvalError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ReviewConcernEvalError';
  }
}

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ReviewConcernEvalError(`${label} must be an object.`);
  }
  return value;
}

function requireString(value, label) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ReviewConcernEvalError(`${label} must be a non-empty string.`);
  }
  return value.trim();
}

function requireNonNegativeInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    throw new ReviewConcernEvalError(`${label} must be a non-negative integer.`);
  }
  return value;
}

function ratio(numerator, denominator) {
  if (denominator === 0) return null;
  return numerator / denominator;
}

function nullableDelta(baseline, candidate) {
  if (baseline == null || candidate == null) return null;
  return candidate - baseline;
}

function normalizeObligations(oracle) {
  if (!Array.isArray(oracle.obligations) || oracle.obligations.length === 0) {
    throw new ReviewConcernEvalError('fixture.oracle.obligations must be a non-empty array.');
  }

  const seen = new Set();
  return oracle.obligations.map((item, index) => {
    requireObject(item, `fixture.oracle.obligations[${index}]`);
    const id = requireString(item.id, `fixture.oracle.obligations[${index}].id`);
    if (seen.has(id)) {
      throw new ReviewConcernEvalError(`duplicate obligation id: ${id}`);
    }
    seen.add(id);
    return {
      id,
      description: requireString(
        item.description,
        `fixture.oracle.obligations[${index}].description`
      ),
    };
  });
}

function normalizeKnownInteractions(oracle, obligationIds) {
  if (oracle.knownInteractions == null) return [];
  if (!Array.isArray(oracle.knownInteractions)) {
    throw new ReviewConcernEvalError('fixture.oracle.knownInteractions must be an array.');
  }

  const seen = new Set();
  return oracle.knownInteractions.map((item, index) => {
    requireObject(item, `fixture.oracle.knownInteractions[${index}]`);
    const from = requireString(item.from, `fixture.oracle.knownInteractions[${index}].from`);
    const to = requireString(item.to, `fixture.oracle.knownInteractions[${index}].to`);
    if (from === to) {
      throw new ReviewConcernEvalError(`interaction cannot reference itself: ${from}`);
    }
    if (!obligationIds.has(from) || !obligationIds.has(to)) {
      throw new ReviewConcernEvalError(
        `interaction must reference known obligations: ${from} -> ${to}`
      );
    }
    const key = [from, to].sort().join('::');
    if (seen.has(key)) {
      throw new ReviewConcernEvalError(`duplicate interaction: ${from} -> ${to}`);
    }
    seen.add(key);
    return { from, to };
  });
}

function normalizeGrouping(oracle) {
  const grouping = requireObject(oracle.acceptableGrouping, 'fixture.oracle.acceptableGrouping');
  const minConcerns = requireNonNegativeInteger(
    grouping.minConcerns,
    'fixture.oracle.acceptableGrouping.minConcerns'
  );
  const maxConcerns = requireNonNegativeInteger(
    grouping.maxConcerns,
    'fixture.oracle.acceptableGrouping.maxConcerns'
  );
  if (maxConcerns < minConcerns) {
    throw new ReviewConcernEvalError(
      'fixture.oracle.acceptableGrouping.maxConcerns must be >= minConcerns.'
    );
  }
  return { minConcerns, maxConcerns };
}

export function normalizeReviewConcernFixture(fixture) {
  requireObject(fixture, 'fixture');
  if (fixture.schemaVersion !== EVALUATION_SCHEMA_VERSION) {
    throw new ReviewConcernEvalError(
      `fixture.schemaVersion must be "${EVALUATION_SCHEMA_VERSION}".`
    );
  }

  const oracle = requireObject(fixture.oracle, 'fixture.oracle');
  const obligations = normalizeObligations(oracle);
  const obligationIds = new Set(obligations.map((item) => item.id));

  return {
    schemaVersion: EVALUATION_SCHEMA_VERSION,
    id: requireString(fixture.id, 'fixture.id'),
    category: requireString(fixture.category, 'fixture.category'),
    description: requireString(fixture.description, 'fixture.description'),
    oracle: {
      obligations,
      knownInteractions: normalizeKnownInteractions(oracle, obligationIds),
      acceptableGrouping: normalizeGrouping(oracle),
    },
  };
}

function normalizeConcernMap(map) {
  requireObject(map, 'map');
  if (map.schemaVersion !== '1' || map.kind !== 'review-concern-map') {
    throw new ReviewConcernEvalError(
      'map must be a schemaVersion "1" review-concern-map observation.'
    );
  }
  if (!Array.isArray(map.concerns)) {
    throw new ReviewConcernEvalError('map.concerns must be an array.');
  }

  const concernIds = new Set();
  for (const concern of map.concerns) {
    const id = requireString(concern?.id, 'map.concerns[].id');
    if (concernIds.has(id)) {
      throw new ReviewConcernEvalError(`duplicate concern id in map: ${id}`);
    }
    concernIds.add(id);
  }

  for (const concern of map.concerns) {
    if (concern.interactionRefs != null && !Array.isArray(concern.interactionRefs)) {
      throw new ReviewConcernEvalError(
        `map concern "${concern.id}" interactionRefs must be an array.`
      );
    }
    for (const target of concern.interactionRefs ?? []) {
      if (!concernIds.has(target)) {
        throw new ReviewConcernEvalError(
          `map concern "${concern.id}" references unknown interaction concern "${target}".`
        );
      }
    }
  }

  return { map, concernIds };
}

function normalizeAdjudication(adjudication, obligationIds, concernIds) {
  requireObject(adjudication, 'adjudication');
  const rawMatches = adjudication.obligationMatches ?? {};
  requireObject(rawMatches, 'adjudication.obligationMatches');

  const obligationMatches = new Map();
  for (const obligationId of obligationIds) {
    const matches = rawMatches[obligationId] ?? [];
    if (!Array.isArray(matches)) {
      throw new ReviewConcernEvalError(
        `adjudication.obligationMatches.${obligationId} must be an array.`
      );
    }
    const unique = [...new Set(matches)];
    for (const concernId of unique) {
      if (!concernIds.has(concernId)) {
        throw new ReviewConcernEvalError(
          `adjudication references unknown concern "${concernId}" for obligation "${obligationId}".`
        );
      }
    }
    obligationMatches.set(obligationId, unique);
  }

  for (const obligationId of Object.keys(rawMatches)) {
    if (!obligationIds.has(obligationId)) {
      throw new ReviewConcernEvalError(
        `adjudication references unknown obligation "${obligationId}".`
      );
    }
  }

  if (
    adjudication.nonActionableConcernIds != null &&
    !Array.isArray(adjudication.nonActionableConcernIds)
  ) {
    throw new ReviewConcernEvalError(
      'adjudication.nonActionableConcernIds must be an array.'
    );
  }
  const nonActionableConcernIds = [...new Set(adjudication.nonActionableConcernIds ?? [])];
  for (const concernId of nonActionableConcernIds) {
    if (!concernIds.has(concernId)) {
      throw new ReviewConcernEvalError(
        `adjudication.nonActionableConcernIds references unknown concern "${concernId}".`
      );
    }
  }

  const actionableConcernIds = new Set([...obligationMatches.values()].flatMap((items) => items));
  const contradictory = nonActionableConcernIds.find((concernId) =>
    actionableConcernIds.has(concernId)
  );
  if (contradictory) {
    throw new ReviewConcernEvalError(
      `adjudication concern "${contradictory}" cannot be both obligation-matched and non-actionable.`
    );
  }

  return {
    obligationMatches,
    nonActionableConcernIds,
    humanCorrectionCount: requireNonNegativeInteger(
      adjudication.humanCorrectionCount ?? 0,
      'adjudication.humanCorrectionCount'
    ),
  };
}

function concernInteractionSet(map) {
  const edges = new Set();
  for (const concern of map.concerns) {
    for (const target of concern.interactionRefs ?? []) {
      edges.add([concern.id, target].sort().join('::'));
    }
  }
  return edges;
}

function interactionDetected(interaction, matches, edges) {
  const fromMatches = matches.get(interaction.from) ?? [];
  const toMatches = matches.get(interaction.to) ?? [];

  for (const fromConcern of fromMatches) {
    for (const toConcern of toMatches) {
      if (fromConcern === toConcern) return true;
      if (edges.has([fromConcern, toConcern].sort().join('::'))) return true;
    }
  }
  return false;
}

function emptyEvaluation(fixture) {
  return {
    schemaVersion: EVALUATION_SCHEMA_VERSION,
    kind: 'review-concern-evaluation',
    fixtureId: fixture.id,
    evaluationStatus: 'not-observed',
    analysisStatus: null,
    analysisLimitations: [],
    metrics: {
      obligationTotal: fixture.oracle.obligations.length,
      obligationDetected: null,
      obligationRecall: null,
      missedObligationIds: [],
      interactionTotal: fixture.oracle.knownInteractions.length,
      interactionDetected: null,
      interactionRecall: null,
      missedInteractions: [],
      concernCount: null,
      groupingWithinRange: null,
      nonActionableConcernCount: null,
      nonActionableConcernRatio: null,
      unmappedConcernCount: null,
      humanCorrectionCount: null,
    },
  };
}

export function evaluateReviewConcernMap({ fixture, map, adjudication } = {}) {
  const normalizedFixture = normalizeReviewConcernFixture(fixture);
  if (map == null) return emptyEvaluation(normalizedFixture);

  const normalizedMap = normalizeConcernMap(map);
  const obligationIds = new Set(
    normalizedFixture.oracle.obligations.map((obligation) => obligation.id)
  );
  const normalizedAdjudication = normalizeAdjudication(
    adjudication,
    obligationIds,
    normalizedMap.concernIds
  );

  const detectedObligations = normalizedFixture.oracle.obligations.filter(
    (obligation) => (normalizedAdjudication.obligationMatches.get(obligation.id) ?? []).length > 0
  );
  const missedObligationIds = normalizedFixture.oracle.obligations
    .filter(
      (obligation) =>
        (normalizedAdjudication.obligationMatches.get(obligation.id) ?? []).length === 0
    )
    .map((obligation) => obligation.id);

  const edges = concernInteractionSet(normalizedMap.map);
  const detectedInteractions = normalizedFixture.oracle.knownInteractions.filter((interaction) =>
    interactionDetected(interaction, normalizedAdjudication.obligationMatches, edges)
  );
  const missedInteractions = normalizedFixture.oracle.knownInteractions
    .filter(
      (interaction) =>
        !interactionDetected(interaction, normalizedAdjudication.obligationMatches, edges)
    )
    .map((interaction) => `${interaction.from}->${interaction.to}`);

  const mappedConcernIds = new Set(
    [...normalizedAdjudication.obligationMatches.values()].flatMap((items) => items)
  );
  const concernCount = normalizedMap.map.concerns.length;
  const grouping = normalizedFixture.oracle.acceptableGrouping;

  return {
    schemaVersion: EVALUATION_SCHEMA_VERSION,
    kind: 'review-concern-evaluation',
    fixtureId: normalizedFixture.id,
    evaluationStatus: 'scored',
    analysisStatus: normalizedMap.map.analysis?.status ?? null,
    analysisLimitations: Array.isArray(normalizedMap.map.analysis?.limitations)
      ? [...normalizedMap.map.analysis.limitations]
      : [],
    metrics: {
      obligationTotal: normalizedFixture.oracle.obligations.length,
      obligationDetected: detectedObligations.length,
      obligationRecall: ratio(
        detectedObligations.length,
        normalizedFixture.oracle.obligations.length
      ),
      missedObligationIds,
      interactionTotal: normalizedFixture.oracle.knownInteractions.length,
      interactionDetected: detectedInteractions.length,
      interactionRecall: ratio(
        detectedInteractions.length,
        normalizedFixture.oracle.knownInteractions.length
      ),
      missedInteractions,
      concernCount,
      groupingWithinRange:
        concernCount >= grouping.minConcerns && concernCount <= grouping.maxConcerns,
      nonActionableConcernCount: normalizedAdjudication.nonActionableConcernIds.length,
      nonActionableConcernRatio: ratio(
        normalizedAdjudication.nonActionableConcernIds.length,
        concernCount
      ),
      unmappedConcernCount: normalizedMap.map.concerns.filter(
        (concern) => !mappedConcernIds.has(concern.id)
      ).length,
      humanCorrectionCount: normalizedAdjudication.humanCorrectionCount,
    },
  };
}

export function buildPairedReviewConcernEvaluation({
  fixture,
  baseline,
  candidate,
} = {}) {
  const normalizedFixture = normalizeReviewConcernFixture(fixture);
  const baselineEvaluation = evaluateReviewConcernMap({
    fixture: normalizedFixture,
    map: baseline?.map ?? null,
    adjudication: baseline?.adjudication,
  });
  const candidateEvaluation = evaluateReviewConcernMap({
    fixture: normalizedFixture,
    map: candidate?.map ?? null,
    adjudication: candidate?.adjudication,
  });

  return {
    schemaVersion: EVALUATION_SCHEMA_VERSION,
    kind: 'review-concern-paired-evaluation',
    fixtureId: normalizedFixture.id,
    baseline: baselineEvaluation,
    candidate: candidateEvaluation,
    delta: {
      obligationRecall: nullableDelta(
        baselineEvaluation.metrics.obligationRecall,
        candidateEvaluation.metrics.obligationRecall
      ),
      interactionRecall: nullableDelta(
        baselineEvaluation.metrics.interactionRecall,
        candidateEvaluation.metrics.interactionRecall
      ),
      nonActionableConcernRatio: nullableDelta(
        baselineEvaluation.metrics.nonActionableConcernRatio,
        candidateEvaluation.metrics.nonActionableConcernRatio
      ),
      humanCorrectionCount: nullableDelta(
        baselineEvaluation.metrics.humanCorrectionCount,
        candidateEvaluation.metrics.humanCorrectionCount
      ),
    },
    decision: null,
    applied: false,
  };
}
