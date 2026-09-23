import { makeFinding, makeResult } from '../../helpers/render-result-fixtures.mjs';

const SUPPORTED_SCHEMA_VERSION = '1';
const SUPPORTED_SIGNAL_KEYS = new Set([
  'findings',
  'humanReviewRequired',
  'humanReviewFileCount',
  'coverageStatus',
  'incompleteUnitCount',
  'failedUnitCount',
  'timedOutUnitCount',
  'blindSpotCount',
]);
const SUPPORTED_FINDING_KEYS = new Set(['id', 'severity']);
const SUPPORTED_SEVERITIES = new Set(['critical', 'major', 'minor', 'info']);
const SUPPORTED_COVERAGE = new Set(['complete', 'partial', 'not_executed']);

function assertNonNegativeInteger(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
}

function assertOnlyKeys(value, supported, label) {
  for (const key of Object.keys(value ?? {})) {
    if (!supported.has(key)) throw new Error(`${label}: unsupported key "${key}"`);
  }
}

function materializeFindings(signals, caseId) {
  if (!Array.isArray(signals.findings)) {
    throw new Error(`${caseId}: signals.findings must be an array`);
  }

  return signals.findings.map((input, index) => {
    assertOnlyKeys(input, SUPPORTED_FINDING_KEYS, `${caseId}.findings[${index}]`);
    if (!input?.id || typeof input.id !== 'string') {
      throw new Error(`${caseId}.findings[${index}].id is required`);
    }
    if (!SUPPORTED_SEVERITIES.has(input.severity)) {
      throw new Error(`${caseId}.findings[${index}].severity is unsupported`);
    }

    return makeFinding({
      id: input.id,
      severity: input.severity,
      file: `src/eval/${input.id.toLowerCase()}.js`,
      title: `${input.id} fixture finding`,
    });
  });
}

function materializeCoverage(signals, caseId, subject) {
  const status = signals.coverageStatus;
  const incomplete = signals.incompleteUnitCount ?? 0;
  const failed = signals.failedUnitCount ?? 0;
  const timedOut = signals.timedOutUnitCount ?? 0;

  for (const [label, value] of [
    ['incompleteUnitCount', incomplete],
    ['failedUnitCount', failed],
    ['timedOutUnitCount', timedOut],
  ]) {
    assertNonNegativeInteger(value, `${caseId}.${label}`);
  }

  if (status === null) {
    if (incomplete + failed + timedOut !== 0) {
      throw new Error(`${caseId}: absent coverage cannot carry unit outcomes`);
    }
    return undefined;
  }

  if (!SUPPORTED_COVERAGE.has(status)) {
    throw new Error(`${caseId}: unsupported coverageStatus "${status}"`);
  }

  if (status === 'complete' || status === 'not_executed') {
    if (incomplete + failed + timedOut !== 0) {
      throw new Error(`${caseId}: ${status} coverage cannot carry incomplete units`);
    }
  }

  if (status === 'partial') {
    if (incomplete === 0 || failed + timedOut !== incomplete) {
      throw new Error(
        `${caseId}: partial coverage must freeze failed/timed_out outcomes for every incomplete unit`
      );
    }
  }

  if (status === 'not_executed') {
    return {
      schemaVersion: '1',
      status,
      expectedUnits: 0,
      completedUnits: 0,
      requiredUnits: 0,
      completedRequiredUnits: 0,
      incompleteRequiredUnitIds: [],
      units: [],
    };
  }

  const units = [
    {
      id: 'eval:completed:1',
      kind: 'diff-chunk',
      subjects: [subject],
      reviewerRole: 'eval-reviewer',
      required: true,
      status: 'completed',
      reasonCode: null,
      findingsCount: 0,
    },
  ];

  for (let i = 0; i < failed; i += 1) {
    units.push({
      id: `eval:failed:${i + 1}`,
      kind: 'diff-chunk',
      subjects: [subject],
      reviewerRole: 'eval-reviewer',
      required: true,
      status: 'failed',
      reasonCode: 'reviewer_error',
      findingsCount: 0,
    });
  }
  for (let i = 0; i < timedOut; i += 1) {
    units.push({
      id: `eval:timed-out:${i + 1}`,
      kind: 'diff-chunk',
      subjects: [subject],
      reviewerRole: 'eval-reviewer',
      required: true,
      status: 'timed_out',
      reasonCode: 'reviewer_timeout',
      findingsCount: 0,
    });
  }

  const incompleteIds = units.filter((unit) => unit.status !== 'completed').map((unit) => unit.id);

  return {
    schemaVersion: '1',
    status,
    expectedUnits: units.length,
    completedUnits: 1,
    requiredUnits: units.length,
    completedRequiredUnits: 1,
    incompleteRequiredUnitIds: incompleteIds,
    units,
  };
}

function materializePlan(signals, caseId) {
  if (typeof signals.humanReviewRequired !== 'boolean') {
    throw new Error(`${caseId}: humanReviewRequired must be boolean`);
  }

  const fileCount = signals.humanReviewFileCount ?? 0;
  assertNonNegativeInteger(fileCount, `${caseId}.humanReviewFileCount`);

  if (!signals.humanReviewRequired && fileCount !== 0) {
    throw new Error(`${caseId}: humanReviewFileCount requires humanReviewRequired=true`);
  }
  if (signals.humanReviewRequired && fileCount === 0) {
    throw new Error(`${caseId}: humanReviewRequired=true requires at least one explicit file`);
  }

  if (!signals.humanReviewRequired) return { selected: [], skipped: [] };

  const humanReviewFiles = Array.from(
    { length: fileCount },
    (_, index) => `src/human-review/file-${index + 1}.js`
  );
  return {
    selected: [],
    skipped: [],
    riskAssessment: {
      aggregateAction: 'require_human_review',
      escalatedFiles: [],
      humanReviewFiles,
      fileRisks: humanReviewFiles.map((file) => ({
        file,
        action: 'require_human_review',
      })),
    },
  };
}

function materializeTeamLead(signals, caseId) {
  const count = signals.blindSpotCount ?? 0;
  assertNonNegativeInteger(count, `${caseId}.blindSpotCount`);
  if (count === 0) return null;

  return {
    top3Findings: [],
    blindSpots: Array.from({ length: count }, (_, index) => ({
      role: `eval-blind-spot-${index + 1}`,
      label: `Eval blind spot ${index + 1}`,
    })),
    consensusSummary: { consensus: 0, multi: 0, single: 0, total: 0 },
  };
}

export function materializeHumanAttentionCase(
  evalCase,
  { schemaVersion = SUPPORTED_SCHEMA_VERSION } = {}
) {
  if (schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
    throw new Error(
      `${evalCase?.id ?? '<unknown>'}: unsupported manifest schemaVersion "${schemaVersion}"`
    );
  }
  if (!evalCase?.id || typeof evalCase.id !== 'string') {
    throw new Error('evaluation case id is required');
  }
  if (!evalCase.signals || typeof evalCase.signals !== 'object') {
    throw new Error(`${evalCase.id}: signals are required`);
  }

  assertOnlyKeys(evalCase.signals, SUPPORTED_SIGNAL_KEYS, `${evalCase.id}.signals`);

  const findings = materializeFindings(evalCase.signals, evalCase.id);
  const plan = materializePlan(evalCase.signals, evalCase.id);
  const teamLeadReport = materializeTeamLead(evalCase.signals, evalCase.id);

  const changedFiles = new Set(findings.map((finding) => finding.file));
  for (const file of plan.riskAssessment?.humanReviewFiles ?? []) changedFiles.add(file);
  if (changedFiles.size === 0) changedFiles.add('src/eval/fixture.js');

  const primarySubject = [...changedFiles][0];
  const reviewCoverage = materializeCoverage(evalCase.signals, evalCase.id, primarySubject);

  return makeResult({
    findings,
    plan,
    teamLeadReport,
    reviewCoverage,
    changedFiles: [...changedFiles],
  });
}

export const humanAttentionAdapterContract = Object.freeze({
  schemaVersion: SUPPORTED_SCHEMA_VERSION,
  supportedSignalKeys: [...SUPPORTED_SIGNAL_KEYS],
});
