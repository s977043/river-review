import { makeFinding, makeResult } from '../../helpers/render-result-fixtures.mjs';

const SUPPORTED_SIGNAL_KEYS = new Set([
  'findings',
  'humanReviewRequired',
  'humanReviewFileCount',
  'coverageStatus',
  'incompleteUnitCount',
  'blindSpotCount',
  'failedUnitCount',
  'timedOutUnitCount',
]);

function assertSupportedSignals(signals, caseId) {
  for (const key of Object.keys(signals ?? {})) {
    if (!SUPPORTED_SIGNAL_KEYS.has(key)) {
      throw new Error(`${caseId}: unsupported Human Attention signal: ${key}`);
    }
  }
}

function findingFromSignal(signal, index) {
  const id = signal.id ?? `RR-HA-${index + 1}`;
  const severity = signal.severity ?? 'major';

  return makeFinding({
    id,
    ruleId: `human-attention-${severity}`,
    file: `src/eval/${id.toLowerCase()}.js`,
    lineStart: index + 1,
    lineEnd: index + 1,
    severity,
    title: `${id} ${severity} finding`,
  });
}

function buildCoverage(signals) {
  if (signals.coverageStatus === null || signals.coverageStatus === undefined) return undefined;

  const failedCount = signals.failedUnitCount ?? 0;
  const timedOutCount = signals.timedOutUnitCount ?? 0;
  const incompleteCount = signals.incompleteUnitCount ?? failedCount + timedOutCount;

  if (signals.coverageStatus === 'complete' && incompleteCount !== 0) {
    throw new Error('complete coverage cannot contain incomplete units');
  }
  if (signals.coverageStatus === 'not_executed' && incompleteCount !== 0) {
    throw new Error('not_executed coverage cannot contain review units');
  }
  if (
    signals.coverageStatus === 'partial' &&
    (incompleteCount === 0 || incompleteCount !== failedCount + timedOutCount)
  ) {
    throw new Error(
      `partial coverage must freeze every incomplete unit as failed or timed_out: incomplete=${incompleteCount}, failed=${failedCount}, timedOut=${timedOutCount}`
    );
  }

  const units = [];
  let unitIndex = 0;

  for (let i = 0; i < failedCount; i++) {
    units.push({
      id: `reviewer:eval/unit:${++unitIndex}`,
      kind: 'diff-chunk',
      subjects: [`src/eval/unit-${unitIndex}.js`],
      reviewerRole: 'eval-reviewer',
      required: true,
      status: 'failed',
      reasonCode: 'reviewer_error',
      findingsCount: 0,
    });
  }

  for (let i = 0; i < timedOutCount; i++) {
    units.push({
      id: `reviewer:eval/unit:${++unitIndex}`,
      kind: 'diff-chunk',
      subjects: [`src/eval/unit-${unitIndex}.js`],
      reviewerRole: 'eval-reviewer',
      required: true,
      status: 'timed_out',
      reasonCode: 'reviewer_timeout',
      findingsCount: 0,
    });
  }

  const completedCount = ['complete', 'partial'].includes(signals.coverageStatus) ? 1 : 0;
  for (let i = 0; i < completedCount; i++) {
    units.push({
      id: `reviewer:eval/unit:${++unitIndex}`,
      kind: 'diff-chunk',
      subjects: [`src/eval/unit-${unitIndex}.js`],
      reviewerRole: 'eval-reviewer',
      required: true,
      status: 'completed',
      reasonCode: null,
      findingsCount: 0,
    });
  }

  return {
    schemaVersion: '1',
    status: signals.coverageStatus,
    expectedUnits: units.length,
    completedUnits: completedCount,
    requiredUnits: units.length,
    completedRequiredUnits: completedCount,
    incompleteRequiredUnitIds: units
      .filter((unit) => unit.status !== 'completed')
      .map((unit) => unit.id),
    units,
  };
}

function buildHumanReviewPlan(signals) {
  const humanReviewRequired = signals.humanReviewRequired === true;
  const fileCount = humanReviewRequired ? (signals.humanReviewFileCount ?? 0) : 0;
  const files = Array.from(
    { length: fileCount },
    (_, index) => `src/human-review/file-${index + 1}.js`
  );

  if (!humanReviewRequired) return { selected: [], skipped: [] };

  return {
    selected: [],
    skipped: [],
    riskAssessment: {
      aggregateAction: 'require_human_review',
      humanReviewFiles: files,
      escalatedFiles: [],
    },
    riskMap: {
      require_human_review: files,
    },
  };
}

function buildTeamLeadReport(signals) {
  const count = signals.blindSpotCount ?? 0;
  if (count === 0) return null;

  return {
    top3Findings: [],
    blindSpots: Array.from({ length: count }, (_, index) => ({
      role: `eval-reviewer-${index + 1}`,
      label: `Eval Reviewer ${index + 1}`,
    })),
    consensusSummary: { consensus: 0, multi: 0, single: 0, total: 0 },
  };
}

export function adaptHumanAttentionCase(caseDefinition) {
  if (!caseDefinition?.id) throw new Error('Human Attention case id is required');

  const signals = caseDefinition.signals ?? {};
  assertSupportedSignals(signals, caseDefinition.id);

  const findings = (signals.findings ?? []).map(findingFromSignal);
  return makeResult({
    findings,
    plan: buildHumanReviewPlan(signals),
    teamLeadReport: buildTeamLeadReport(signals),
    reviewCoverage: buildCoverage(signals),
  });
}

export function supportedHumanAttentionSignalKeys() {
  return [...SUPPORTED_SIGNAL_KEYS].sort();
}
