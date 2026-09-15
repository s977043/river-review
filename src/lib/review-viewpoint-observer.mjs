function assertViewpointDocument(document) {
  if (!document || typeof document !== 'object' || Array.isArray(document)) {
    throw new TypeError('review viewpoint document must be an object');
  }
  if (typeof document.skillId !== 'string' || document.skillId.trim() === '') {
    throw new TypeError('review viewpoint document requires a non-empty skillId');
  }
  if (!Array.isArray(document.viewpoints)) {
    throw new TypeError('review viewpoint document requires a viewpoints array');
  }
}

function normalizeDetectorSignals(detections) {
  if (!Array.isArray(detections)) {
    throw new TypeError('detector results must be an array');
  }

  const signals = [];
  const seen = new Set();

  for (const [index, detection] of detections.entries()) {
    if (!detection || typeof detection !== 'object' || Array.isArray(detection)) {
      throw new TypeError(`detector result at index ${index} must be an object`);
    }

    const kind = typeof detection.kind === 'string' ? detection.kind.trim() : '';
    if (!kind) {
      throw new TypeError(`detector result at index ${index} requires a non-empty kind`);
    }

    const signal = { kind };
    if (typeof detection.file === 'string' && detection.file.length > 0) {
      signal.file = detection.file;
    }
    if (Number.isInteger(detection.line) && detection.line > 0) {
      signal.line = detection.line;
    }

    const key = `${signal.kind}\u0000${signal.file ?? ''}\u0000${signal.line ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    signals.push(signal);
  }

  return signals;
}

function matchViewpoints(document, signals) {
  const signalsByKind = new Map();
  for (const signal of signals) {
    const bucket = signalsByKind.get(signal.kind) ?? [];
    bucket.push(signal);
    signalsByKind.set(signal.kind, bucket);
  }

  const applicableViewpoints = [];
  for (const viewpoint of document.viewpoints) {
    const matchedKinds = [];
    const matchedSignals = [];

    for (const kind of viewpoint.activatesOn ?? []) {
      const matches = signalsByKind.get(kind);
      if (!matches?.length) continue;
      matchedKinds.push(kind);
      matchedSignals.push(...matches);
    }

    if (matchedKinds.length === 0) continue;

    applicableViewpoints.push({
      id: viewpoint.id,
      title: viewpoint.title,
      matchedKinds,
      matchedSignals,
    });
  }

  return applicableViewpoints;
}

function buildReviewObligations(document, applicableViewpoints) {
  const viewpointsById = new Map(document.viewpoints.map((viewpoint) => [viewpoint.id, viewpoint]));

  return applicableViewpoints.map((applicable) => {
    const viewpoint = viewpointsById.get(applicable.id);
    return {
      id: `${document.skillId}/${viewpoint.id}`,
      skillId: document.skillId,
      viewpointId: viewpoint.id,
      title: viewpoint.title,
      question: viewpoint.question,
      requiredEvidence: [...viewpoint.requiredEvidence],
      evidenceHints: [...(viewpoint.evidenceHints ?? [])],
      falsePositiveGuards: [...(viewpoint.falsePositiveGuards ?? [])],
      activation: {
        matchedKinds: [...applicable.matchedKinds],
        matchedSignals: applicable.matchedSignals.map((signal) => ({ ...signal })),
      },
    };
  });
}

function buildObserveComparison(signals, applicableViewpoints, obligations) {
  const mappedSignalKeys = new Set();
  for (const viewpoint of applicableViewpoints) {
    for (const signal of viewpoint.matchedSignals) {
      mappedSignalKeys.add(`${signal.kind}\u0000${signal.file ?? ''}\u0000${signal.line ?? ''}`);
    }
  }

  const unmappedSignals = signals.filter(
    (signal) =>
      !mappedSignalKeys.has(`${signal.kind}\u0000${signal.file ?? ''}\u0000${signal.line ?? ''}`)
  );

  return {
    detectorSignalCount: signals.length,
    mappedSignalCount: mappedSignalKeys.size,
    unmappedSignalCount: unmappedSignals.length,
    activatedViewpointCount: applicableViewpoints.length,
    obligationCount: obligations.length,
    unmappedSignals: unmappedSignals.map((signal) => ({ ...signal })),
  };
}

/**
 * Calculate observe-mode Review Viewpoint activation from existing heuristic
 * detector results without changing findings, gates, policy, or LLM context.
 *
 * The input detector shape is intentionally the existing internal
 * `{ file, line, kind }` contract. This does not introduce a public
 * ReviewSignal schema; normalization is private to this module until multiple
 * signal producers demonstrate a real shared abstraction is needed.
 *
 * `comparison` is the serializable old/new observation record: existing
 * detector signals versus newly activated viewpoints/obligations. Persistence
 * is intentionally left to the runtime adapter so this module does not acquire
 * run-artifact or orchestration responsibilities.
 *
 * @param {object} document validated Review Viewpoint document
 * @param {Array<{kind: string, file?: string, line?: number}>} detections existing detector results for the owning Skill
 * @returns {{mode: 'observe', skillId: string, signals: object[], applicableViewpoints: object[], obligations: object[], comparison: object}}
 */
export function observeReviewViewpoints(document, detections = []) {
  assertViewpointDocument(document);
  const signals = normalizeDetectorSignals(detections);
  const applicableViewpoints = matchViewpoints(document, signals);
  const obligations = buildReviewObligations(document, applicableViewpoints);
  const comparison = buildObserveComparison(signals, applicableViewpoints, obligations);

  return {
    mode: 'observe',
    skillId: document.skillId,
    signals,
    applicableViewpoints,
    obligations,
    comparison,
  };
}
