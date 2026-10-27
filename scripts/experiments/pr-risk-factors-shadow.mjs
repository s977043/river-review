import {
  classifyChangedFiles,
  isCIWorkflowFile,
  isDependencyFile,
} from '../../src/lib/file-classifier.mjs';
import { findSensitiveCodePaths } from '../../src/lib/sensitive-code-paths.mjs';

const SHA = /^[a-f0-9]{40}$/i;
const MAX_FILES = 500;
const RANK = { low: 0, medium: 1, high: 2 };
const POLICY_PATHS = new Set(['.river/risk-map.yaml', '.river-review.json', '.small_change']);
const COMPONENT_TEST_FILE = /\.(?:test|spec)\.(?:vue|svelte|astro|cs|swift|dart)$/i;

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validFiles(files) {
  return (
    Array.isArray(files) &&
    files.length > 0 &&
    files.length <= MAX_FILES &&
    files.every(
      (file) =>
        typeof file === 'string' &&
        file.length > 0 &&
        !file.startsWith('/') &&
        !file.includes('\\') &&
        !file.includes('\0') &&
        !file.split('/').some((part) => part === '' || part === '.' || part === '..')
    ) &&
    new Set(files).size === files.length
  );
}

function boundEvidence(item, head) {
  return isRecord(item) && SHA.test(head ?? '') && item.headSha === head;
}

function hasEvidenceRef(item) {
  return typeof item?.evidenceRef === 'string' && item.evidenceRef.trim().length > 0;
}

/**
 * Offline risk observations, never an approval or merge decision.
 * All claims supplied by the caller remain unverified even if SHA-matched.
 * Paths are heuristics, not proof of code semantics or irreversibility.
 *
 * @param {unknown} input caller-supplied, untrusted PR observations
 */
export function assessPrRiskFactorsShadow(input) {
  const value = isRecord(input) ? input : {};
  const head = value.subject?.headSha;
  const files = value.change?.changedFiles;
  const reasons = new Set();
  const floors = new Set();
  const signals = new Set();
  const validHead = typeof head === 'string' && SHA.test(head);
  const pathManifestValid = validFiles(files);
  const manifestValid = pathManifestValid && boundEvidence(value.change, head);
  let riskFloor = 'unknown';

  if (!validHead) reasons.add('invalid-subject-sha');
  if (!pathManifestValid) reasons.add('invalid-change-manifest');
  if (pathManifestValid && !manifestValid) reasons.add('missing-or-stale-change');

  const raise = (level, reason) => {
    if (riskFloor === 'unknown' || RANK[level] > RANK[riskFloor]) riskFloor = level;
    floors.add(reason);
  };

  if (manifestValid) {
    const types = classifyChangedFiles(files);
    const docsTestOnly = files.every(
      (file) =>
        types.docs.includes(file) ||
        types.test.includes(file) ||
        COMPONENT_TEST_FILE.test(file)
    );
    riskFloor = docsTestOnly ? 'low' : 'medium';
    if (!docsTestOnly) signals.add('non-docs-test-change');

    if (findSensitiveCodePaths(files).length > 0) {
      signals.add('sensitive-source');
      raise('high', 'sensitive-source');
    }
    if (types.migration.length > 0) {
      signals.add('migration');
      raise('high', 'migration');
    }
    if (files.some((file) => POLICY_PATHS.has(file))) {
      signals.add('review-policy-change');
      raise('high', 'review-policy-change');
    }
    if (files.some(isCIWorkflowFile)) {
      signals.add('ci-workflow');
      raise('medium', 'ci-workflow');
    }
    if (files.some(isDependencyFile)) {
      signals.add('dependency');
      raise('medium', 'dependency');
    }
    if (types.schema.length > 0) {
      signals.add('schema');
      raise('medium', 'schema');
    }
  }

  let alignment = 'unknown';
  if (boundEvidence(value.alignment, head)) {
    if (typeof value.alignment.planRef === 'string' && value.alignment.planRef.trim()) {
      alignment = 'reported';
    }
  }
  if (alignment === 'unknown') reasons.add('missing-or-stale-alignment');

  let verification = 'unknown';
  if (boundEvidence(value.verification, head)) {
    const { checks, coverage } = value.verification;
    if (checks === 'failed') {
      verification = 'reported-failed';
      raise('high', 'reported-failed-checks');
    } else if (checks === 'passed' && coverage === 'complete') {
      verification = 'reported-complete';
    } else if (
      ['pending', 'passed'].includes(checks) ||
      ['partial', 'incomplete'].includes(coverage)
    ) {
      verification = 'reported-incomplete';
    }
  }
  if (verification !== 'reported-complete') reasons.add('verification-not-complete');

  let rollback = 'unknown';
  if (boundEvidence(value.rollback, head)) {
    if (value.rollback.reversibility === 'irreversible') {
      rollback = 'reported-irreversible';
      raise('high', 'reported-irreversible-change');
    } else if (value.rollback.reversibility === 'reversible') {
      if (hasEvidenceRef(value.rollback)) rollback = 'reported-reversible';
    }
  }
  if (rollback === 'unknown') reasons.add('missing-or-stale-rollback');

  let detection = 'unknown';
  if (boundEvidence(value.detection, head) && hasEvidenceRef(value.detection)) {
    if (value.detection.monitoring === 'present') detection = 'reported-present';
    if (value.detection.monitoring === 'absent') detection = 'reported-absent';
  }
  if (detection === 'unknown') reasons.add('missing-or-stale-detection');
  if (detection === 'reported-absent' && riskFloor !== 'low') {
    reasons.add('monitoring-reported-absent');
  }

  return {
    kind: 'pr-risk-factors-shadow/v1',
    assessmentStatus: reasons.size ? 'incomplete' : 'reported',
    riskFloor,
    axes: {
      alignment,
      impact: manifestValid ? 'path-reported' : 'unknown',
      verification,
      rollback,
      detection,
    },
    impactSignals: [...signals],
    hardFloorReasons: [...floors],
    reasonCodes: [...reasons],
    authorizesApproval: false,
    evidenceTrust: 'unverified-input',
  };
}
