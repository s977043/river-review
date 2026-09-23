#!/usr/bin/env node

import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';

import {
  adaptHumanAttentionCase,
} from '../tests/fixtures/human-attention/decision-surface-eval-adapter.mjs';

const DEFAULT_FIXTURES = 'tests/fixtures/human-attention/decision-surface-eval-cases.json';
const RUBRIC_PATH = 'docs/development/2378-human-attention-evaluation-contract.md';
const ADAPTER_PATH = 'tests/fixtures/human-attention/decision-surface-eval-adapter.mjs';
const FIXTURE_HELPER_PATH = 'tests/helpers/render-result-fixtures.mjs';
const SCORECARD_PATH =
  'tests/fixtures/human-attention/decision-surface-scorecard-template.yaml';
const RUNNER_PATH = 'scripts/evaluate-human-attention.mjs';

const SUPPORTED_MATERIAL_REFERENCE_KEYS = new Set([
  'allFindingIds',
  'blindSpotCount',
  'blindSpotWarningRequired',
  'coverageStatus',
  'coverageWarningRequired',
  'failedUnitCount',
  'humanReviewFileCount',
  'humanReviewRequired',
  'lowerSeverityFindingsMustRemainReachable',
  'mustNotClaimAttentionRequired',
  'mustNotCollapseFailureIntoClean',
  'mustNotInventCoverageState',
  'mustNotInventIncompleteUnitCount',
  'mustNotInventNewReason',
  'mustNotInventResolutionState',
  'mustNotPresentAsClean',
  'mustNotUpgradeSeverity',
  'mustRemainBackwardCompatible',
  'requiredActionCount',
  'requiredFindingIds',
  'requiredFindingSeverities',
  'timedOutUnitCount',
]);

const SEVERITY_MARKERS = {
  critical: '🔴',
  major: '🟠',
  minor: '🟡',
  info: 'ℹ️',
};

class EvaluationError extends Error {
  constructor(code, message, exitCode = 1) {
    super(message);
    this.name = 'EvaluationError';
    this.code = code;
    this.exitCode = exitCode;
  }
}

function sha256Buffer(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function sha256File(filePath) {
  return sha256Buffer(readFileSync(filePath));
}

function git(repoRoot, args, options = {}) {
  return execFileSync('git', ['-C', repoRoot, ...args], {
    encoding: 'utf8',
    stdio: options.stdio ?? ['ignore', 'pipe', 'pipe'],
  }).trim();
}

export function parseArgs(argv) {
  const args = {
    fixtures: DEFAULT_FIXTURES,
    measurementMode: 'unavailable',
  };

  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[i + 1];

    if (
      flag === '--baseline' ||
      flag === '--candidate' ||
      flag === '--fixtures' ||
      flag === '--output'
    ) {
      if (!value || value.startsWith('--')) {
        throw new EvaluationError('USAGE', `${flag} requires a value`);
      }
      args[flag.slice(2)] = value;
      i++;
      continue;
    }

    if (flag === '--measurement-mode') {
      if (!value || !['explicit', 'bounded_approximation', 'unavailable'].includes(value)) {
        throw new EvaluationError(
          'USAGE',
          '--measurement-mode must be explicit, bounded_approximation, or unavailable'
        );
      }
      args.measurementMode = value;
      i++;
      continue;
    }

    throw new EvaluationError('USAGE', `unknown argument: ${flag}`);
  }

  for (const required of ['baseline', 'candidate', 'output']) {
    if (!args[required]) throw new EvaluationError('USAGE', `--${required} is required`);
  }

  return args;
}

const ALLOWED_PRESENTATION_DELTA_PATHS = new Set([
  'docs/adr/012-human-attention-architecture.md',
  'runners/github-action/dist/index.mjs',
  'runners/github-action/dist/index.mjs.map',
  'src/cli/render.mjs',
  'tests/render-markdown-digest.test.mjs',
]);

export function classifyChangedPaths(paths) {
  const allowed = [];
  const unrelated = [];

  for (const file of paths) {
    if (ALLOWED_PRESENTATION_DELTA_PATHS.has(file)) allowed.push(file);
    else unrelated.push(file);
  }

  return { allowed, unrelated };
}

export function assertDistinctCommits(baselineCommit, candidateCommit) {
  if (baselineCommit === candidateCommit) {
    throw new EvaluationError('USAGE', 'baseline and candidate must be different commits');
  }
}

function resolveCommit(repoRoot, ref, label) {
  try {
    return git(repoRoot, ['rev-parse', '--verify', `${ref}^{commit}`]);
  } catch {
    throw new EvaluationError('MISSING_COMMIT', `${label} commit/ref not found: ${ref}`);
  }
}

function assertAncestor(repoRoot, baselineCommit, candidateCommit) {
  const result = spawnSync(
    'git',
    ['-C', repoRoot, 'merge-base', '--is-ancestor', baselineCommit, candidateCommit],
    { encoding: 'utf8' }
  );

  if (result.status !== 0) {
    throw new EvaluationError(
      'INCONCLUSIVE_SCOPE',
      'baseline commit is not an ancestor of candidate commit'
    );
  }
}

function readFileAtCommit(repoRoot, commit, filePath) {
  try {
    return execFileSync('git', ['-C', repoRoot, 'show', `${commit}:${filePath}`]);
  } catch {
    return null;
  }
}

function environmentContract(repoRoot, commit) {
  const lock = readFileAtCommit(repoRoot, commit, 'package-lock.json');
  const pkg = readFileAtCommit(repoRoot, commit, 'package.json');

  if (!lock || !pkg) {
    throw new EvaluationError(
      'INCONCLUSIVE_ENVIRONMENT',
      `package.json/package-lock.json missing at ${commit}`
    );
  }

  const parsedPackage = JSON.parse(pkg.toString('utf8'));

  return {
    packageLockSha256: sha256Buffer(lock),
    nodeRequirement: parsedPackage.engines?.node ?? null,
  };
}

function assertEnvironmentCompatible(baseline, candidate) {
  if (baseline.packageLockSha256 !== candidate.packageLockSha256) {
    throw new EvaluationError(
      'INCONCLUSIVE_ENVIRONMENT',
      'package-lock.json differs between baseline and candidate'
    );
  }

  if (baseline.nodeRequirement !== candidate.nodeRequirement) {
    throw new EvaluationError(
      'INCONCLUSIVE_ENVIRONMENT',
      'Node engine requirement differs between baseline and candidate'
    );
  }
}

function addWorktree(repoRoot, targetPath, commit) {
  execFileSync('git', ['-C', repoRoot, 'worktree', 'add', '--detach', targetPath, commit], {
    stdio: ['ignore', 'ignore', 'pipe'],
  });
}

export function removeWorktree(repoRoot, targetPath) {
  const result = spawnSync(
    'git',
    ['-C', repoRoot, 'worktree', 'remove', '--force', targetPath],
    { encoding: 'utf8' }
  );

  if (result.status === 0) return null;

  return {
    targetPath,
    status: result.status,
    error: (result.stderr || result.error?.message || 'git worktree remove failed').trim(),
  };
}

function installFrozenDependencies(worktreePath) {
  const result = spawnSync(
    'npm',
    ['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund', '--prefer-offline'],
    {
      cwd: worktreePath,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );

  if (result.status !== 0) {
    throw new EvaluationError(
      'INCONCLUSIVE_ENVIRONMENT',
      `npm ci failed for frozen baseline dependencies: ${result.stderr.trim()}`
    );
  }
}

function linkFrozenDependencies(baselineWorktree, candidateWorktree) {
  const source = path.join(baselineWorktree, 'node_modules');
  const destination = path.join(candidateWorktree, 'node_modules');

  if (!existsSync(source)) {
    throw new EvaluationError(
      'INCONCLUSIVE_ENVIRONMENT',
      'frozen baseline node_modules is missing after npm ci'
    );
  }

  if (!existsSync(destination)) {
    symlinkSync(source, destination, process.platform === 'win32' ? 'junction' : 'dir');
  }
}

async function loadRenderer(worktreePath, arm) {
  const renderPath = path.join(worktreePath, 'src', 'cli', 'render.mjs');
  if (!existsSync(renderPath)) {
    throw new EvaluationError('INCONCLUSIVE_ENVIRONMENT', `${arm}: renderer entry is missing`);
  }

  return import(`${pathToFileURL(renderPath).href}?ha-eval=${arm}-${Date.now()}`);
}

async function renderMarkdown(renderer, result) {
  if (typeof renderer.printMarkdownReport !== 'function') {
    throw new EvaluationError('INCONCLUSIVE_ENVIRONMENT', 'printMarkdownReport export is missing');
  }

  const lines = [];
  const originalLog = console.log;
  console.log = (...args) => lines.push(args.map(String).join(' '));

  try {
    renderer.printMarkdownReport(structuredClone(result), 'midstream');
  } finally {
    console.log = originalLog;
  }

  return lines.join('\n');
}

function countOccurrences(text, needle) {
  return text.split(needle).length - 1;
}

function extractHeadline(markdown) {
  return markdown.split('\n').find((line) => line.startsWith('**判定: ')) ?? null;
}

function extractVerdict(markdown) {
  return (
    extractHeadline(markdown)
      ?.match(/\*\*判定: ([^*]+)\*\*/)?.[1]
      ?.trim() ?? null
  );
}

function evaluateCondition(markdown, caseDefinition) {
  const ref = caseDefinition.materialReference ?? {};
  const missing = [];
  const misleading = [];
  const signals = caseDefinition.signals ?? {};

  for (const key of Object.keys(ref)) {
    if (!SUPPORTED_MATERIAL_REFERENCE_KEYS.has(key)) {
      throw new EvaluationError(
        'UNSUPPORTED_MATERIAL_REFERENCE',
        `${caseDefinition.id}: unsupported materialReference key: ${key}`
      );
    }
  }

  for (const findingId of ref.allFindingIds ?? []) {
    if (!markdown.includes(findingId)) missing.push(`finding:${findingId}`);
  }

  for (const findingId of ref.requiredFindingIds ?? []) {
    if (!markdown.includes(findingId)) missing.push(`required-finding:${findingId}`);
  }

  for (const severity of ref.requiredFindingSeverities ?? []) {
    const expectedCount = (signals.findings ?? []).filter(
      (finding) => finding.severity === severity
    ).length;
    const marker = SEVERITY_MARKERS[severity];
    if (
      expectedCount > 0 &&
      (!marker || !extractHeadline(markdown)?.includes(`${marker} ${expectedCount}`))
    ) {
      missing.push(`required-severity:${severity}:${expectedCount}`);
    }
  }

  if (ref.lowerSeverityFindingsMustRemainReachable === true) {
    for (const finding of signals.findings ?? []) {
      if (finding.severity === 'minor' || finding.severity === 'info') {
        if (!markdown.includes(finding.id)) {
          missing.push(`lower-severity-unreachable:${finding.id}`);
        }
      }
    }
  }

  if (
    ref.requiredActionCount > 0 &&
    !markdown.includes(`要対応: **${ref.requiredActionCount} 件**`)
  ) {
    missing.push(`required-action-count:${ref.requiredActionCount}`);
  }

  if (
    ref.mustNotUpgradeSeverity === true &&
    ref.requiredActionCount === 0 &&
    /- 要対応: \*\*\d+ 件\*\*/.test(markdown)
  ) {
    misleading.push('severity-upgraded-to-action-required');
  }

  if (ref.humanReviewRequired === true) {
    const visible =
      markdown.includes('人間レビュー: **必須**') ||
      markdown.includes('**人間レビュー必須**') ||
      markdown.includes('Human review required');
    if (!visible) missing.push('human-review-required');
  }

  if (
    ref.humanReviewFileCount > 0 &&
    !markdown.includes(`対象ファイル ${ref.humanReviewFileCount} 件`)
  ) {
    missing.push(`human-review-file-count:${ref.humanReviewFileCount}`);
  }

  if (ref.mustNotInventNewReason === true) {
    const humanLine = markdown
      .split('\n')
      .find((line) => line.startsWith('- 人間レビュー: **必須**'));
    const expectedHumanLine =
      ref.humanReviewFileCount > 0
        ? `- 人間レビュー: **必須**（対象ファイル ${ref.humanReviewFileCount} 件）`
        : '- 人間レビュー: **必須**';
    if (humanLine && humanLine !== expectedHumanLine) {
      misleading.push('invented-human-review-reason');
    }
  }

  if (ref.coverageWarningRequired === true) {
    const status = ref.coverageStatus ?? signals.coverageStatus;
    if (!status || !markdown.includes(status)) missing.push(`coverage:${status ?? 'unknown'}`);
  }

  if (ref.failedUnitCount > 0 && !markdown.includes(`failed ${ref.failedUnitCount}`)) {
    missing.push(`failed-unit-count:${ref.failedUnitCount}`);
  }

  if (ref.timedOutUnitCount > 0 && !markdown.includes(`timeout ${ref.timedOutUnitCount}`)) {
    missing.push(`timed-out-unit-count:${ref.timedOutUnitCount}`);
  }

  if (ref.blindSpotCount > 0) {
    const surfaceCount = `未実行のレビュー観点: **${ref.blindSpotCount} 件**`;
    const legacyCount = `未実行のレビュー観点 (${ref.blindSpotCount})`;
    if (!markdown.includes(surfaceCount) && !markdown.includes(legacyCount)) {
      missing.push(`blind-spot-count:${ref.blindSpotCount}`);
    }
  }

  if (ref.blindSpotWarningRequired === true && !markdown.includes('未実行のレビュー観点')) {
    missing.push('blind-spot');
  }

  if (
    ref.mustNotPresentAsClean === true &&
    markdown.includes('✅ マージ前に対応が必要な指摘はありません')
  ) {
    misleading.push('presented-as-clean');
  }

  if (
    ref.mustNotCollapseFailureIntoClean === true &&
    markdown.includes('✅ マージ前に対応が必要な指摘はありません')
  ) {
    misleading.push('failure-collapsed-into-clean');
  }

  if (ref.mustNotInventIncompleteUnitCount === true && /未完了 \d+ unit/.test(markdown)) {
    misleading.push('invented-incomplete-unit-count');
  }

  if (ref.mustNotClaimAttentionRequired === true && markdown.includes('### 判断が必要な項目')) {
    misleading.push('invented-attention-required');
  }

  if (ref.mustNotInventCoverageState === true && markdown.includes('レビュー網羅性:')) {
    misleading.push('invented-coverage-state');
  }

  return {
    missing,
    misleading,
    canonicalMarkerCount: countOccurrences(markdown, '<!-- river-review -->'),
    findingBodyCount: countOccurrences(markdown, '- **Evidence:**'),
  };
}

function deterministicScore(caseDefinition, baselineMarkdown, candidateMarkdown) {
  const baseline = evaluateCondition(baselineMarkdown, caseDefinition);
  const candidate = evaluateCondition(candidateMarkdown, caseDefinition);

  const baselineHeadline = extractHeadline(baselineMarkdown);
  const candidateHeadline = extractHeadline(candidateMarkdown);
  const baselineVerdict = extractVerdict(baselineMarkdown);
  const candidateVerdict = extractVerdict(candidateMarkdown);
  const verdictUnchanged = baselineVerdict === candidateVerdict;
  const headlineUnchanged = baselineHeadline === candidateHeadline;
  const ref = caseDefinition.materialReference ?? {};

  const materialFailures = [...candidate.missing, ...candidate.misleading];
  const regressionItems = [
    ...candidate.missing.filter((item) => !baseline.missing.includes(item)),
    ...candidate.misleading.filter((item) => !baseline.misleading.includes(item)),
  ];

  const allFindingCount = caseDefinition.materialReference?.allFindingIds?.length ?? 0;
  const structuralFailures = [];

  if (baseline.canonicalMarkerCount !== 1) {
    structuralFailures.push(`baseline canonical marker count=${baseline.canonicalMarkerCount}`);
  }
  if (candidate.canonicalMarkerCount !== 1) {
    structuralFailures.push(`candidate canonical marker count=${candidate.canonicalMarkerCount}`);
  }
  if (!verdictUnchanged) {
    structuralFailures.push(`verdict changed: ${baselineVerdict} -> ${candidateVerdict}`);
  }
  if (!headlineUnchanged) {
    structuralFailures.push('headline changed between baseline and candidate');
  }
  if (
    ref.mustNotInventResolutionState === true &&
    /(?:resolution|解決済み|解決状態)/i.test(candidateMarkdown) &&
    !/(?:resolution|解決済み|解決状態)/i.test(baselineMarkdown)
  ) {
    structuralFailures.push('candidate invented resolution state');
  }
  if (ref.mustRemainBackwardCompatible === true && candidateMarkdown !== baselineMarkdown) {
    structuralFailures.push('legacy-compatible output changed');
  }
  if (baseline.findingBodyCount < allFindingCount) {
    structuralFailures.push(
      `baseline finding bodies ${baseline.findingBodyCount} < expected ${allFindingCount}`
    );
  }
  if (candidate.findingBodyCount < allFindingCount) {
    structuralFailures.push(
      `candidate finding bodies ${candidate.findingBodyCount} < expected ${allFindingCount}`
    );
  }

  return {
    caseId: caseDefinition.id,
    baseline,
    candidate,
    baselineHeadline,
    candidateHeadline,
    baselineVerdict,
    candidateVerdict,
    verdictUnchanged,
    headlineUnchanged,
    materialFailures,
    visibilityRegression: regressionItems,
    structuralFailures,
    safetyRegression: materialFailures.length > 0 || structuralFailures.length > 0,
    humanAttentionImprovementClaimed: false,
  };
}

function assertFrozenAssetsClean(repoRoot, paths) {
  const relativePaths = paths.map((filePath) => path.relative(repoRoot, filePath));
  const dirty = git(repoRoot, ['status', '--porcelain', '--', ...relativePaths]);
  if (dirty) {
    throw new EvaluationError(
      'INCONCLUSIVE_ENVIRONMENT',
      `frozen evaluation assets have uncommitted changes:\n${dirty}`
    );
  }
}

function immutableWrite(filePath, content) {
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, { encoding: 'utf8', flag: 'wx' });
}

function experimentId(baselineCommit, candidateCommit) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `ha-${timestamp}-${baselineCommit.slice(0, 8)}-${candidateCommit.slice(0, 8)}`;
}

async function execute() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = git(process.cwd(), ['rev-parse', '--show-toplevel']);

  const baselineCommit = resolveCommit(repoRoot, args.baseline, 'baseline');
  const candidateCommit = resolveCommit(repoRoot, args.candidate, 'candidate');
  assertDistinctCommits(baselineCommit, candidateCommit);
  assertAncestor(repoRoot, baselineCommit, candidateCommit);

  const changedPaths = git(repoRoot, [
    'diff',
    '--name-only',
    `${baselineCommit}..${candidateCommit}`,
  ])
    .split('\n')
    .filter(Boolean);
  const scope = classifyChangedPaths(changedPaths);
  if (scope.unrelated.length > 0) {
    throw new EvaluationError(
      'INCONCLUSIVE_SCOPE',
      `candidate contains unrelated paths: ${scope.unrelated.join(', ')}`
    );
  }

  const baselineEnvironment = environmentContract(repoRoot, baselineCommit);
  const candidateEnvironment = environmentContract(repoRoot, candidateCommit);
  const runnerPackagePath = path.join(repoRoot, 'package.json');
  const runnerLockPath = path.join(repoRoot, 'package-lock.json');
  const runnerEnvironment = {
    packageLockSha256: sha256File(runnerLockPath),
    nodeRequirement: JSON.parse(readFileSync(runnerPackagePath, 'utf8')).engines?.node ?? null,
  };
  assertEnvironmentCompatible(baselineEnvironment, candidateEnvironment);

  const fixturesPath = path.resolve(repoRoot, args.fixtures);
  const fixtureRelativePath = path.relative(repoRoot, fixturesPath);
  if (fixtureRelativePath.startsWith('..') || path.isAbsolute(fixtureRelativePath)) {
    throw new EvaluationError('USAGE', '--fixtures must resolve inside the repository');
  }
  if (!existsSync(fixturesPath)) {
    throw new EvaluationError('USAGE', `fixture manifest not found: ${args.fixtures}`);
  }

  const fixtureManifest = JSON.parse(readFileSync(fixturesPath, 'utf8'));
  if (!Array.isArray(fixtureManifest.cases) || fixtureManifest.cases.length === 0) {
    throw new EvaluationError('USAGE', 'fixture manifest contains no cases');
  }

  const outputRoot = path.resolve(repoRoot, 'artifacts/evals/human-attention');
  const outputDir = path.resolve(repoRoot, args.output);
  const relativeOutput = path.relative(outputRoot, outputDir);
  if (
    relativeOutput === '' ||
    relativeOutput.startsWith('..') ||
    path.isAbsolute(relativeOutput)
  ) {
    throw new EvaluationError(
      'USAGE',
      '--output must be a new child directory under artifacts/evals/human-attention/'
    );
  }
  if (existsSync(outputDir)) {
    throw new EvaluationError('OUTPUT_EXISTS', `output directory already exists: ${args.output}`);
  }

  const adapterPath = path.join(repoRoot, ADAPTER_PATH);
  const fixtureHelperPath = path.join(repoRoot, FIXTURE_HELPER_PATH);
  const rubricPath = path.join(repoRoot, RUBRIC_PATH);
  const scorecardPath = path.join(repoRoot, SCORECARD_PATH);
  const runnerPath = path.join(repoRoot, RUNNER_PATH);
  assertFrozenAssetsClean(repoRoot, [
    fixturesPath,
    adapterPath,
    fixtureHelperPath,
    rubricPath,
    scorecardPath,
    runnerPath,
  ]);
  const runnerCommit = git(repoRoot, ['rev-parse', 'HEAD']);
  const tempRoot = mkdtempSync(path.join(tmpdir(), 'river-review-ha-'));
  const baselineWorktree = path.join(tempRoot, 'baseline');
  const candidateWorktree = path.join(tempRoot, 'candidate');

  let baselineAdded = false;
  let candidateAdded = false;

  let primaryError = null;

  try {
    addWorktree(repoRoot, baselineWorktree, baselineCommit);
    baselineAdded = true;
    addWorktree(repoRoot, candidateWorktree, candidateCommit);
    candidateAdded = true;

    installFrozenDependencies(baselineWorktree);
    linkFrozenDependencies(baselineWorktree, candidateWorktree);

    const baselineRenderer = await loadRenderer(baselineWorktree, 'baseline');
    const candidateRenderer = await loadRenderer(candidateWorktree, 'candidate');

    const id = experimentId(baselineCommit, candidateCommit);
    mkdirSync(path.dirname(outputDir), { recursive: true });
    mkdirSync(outputDir, { recursive: false });

    const manifest = {
      experimentId: id,
      baselineCommit,
      candidateCommit,
      changedPaths,
      approvedScope: scope.allowed,
      fixturePath: fixtureRelativePath,
      fixtureSha256: sha256File(fixturesPath),
      runnerPath: RUNNER_PATH,
      runnerCommit,
      runnerSha256: sha256File(runnerPath),
      adapterPath: ADAPTER_PATH,
      adapterCommit: runnerCommit,
      adapterSha256: sha256File(adapterPath),
      fixtureHelperPath: FIXTURE_HELPER_PATH,
      fixtureHelperCommit: runnerCommit,
      fixtureHelperSha256: sha256File(fixtureHelperPath),
      rubricPath: RUBRIC_PATH,
      rubricCommit: runnerCommit,
      rubricSha256: sha256File(rubricPath),
      scorecardPath: SCORECARD_PATH,
      scorecardCommit: runnerCommit,
      scorecardSha256: sha256File(scorecardPath),
      nodeVersion: process.version,
      nodeRequirement: baselineEnvironment.nodeRequirement,
      packageLockBaselineSha256: baselineEnvironment.packageLockSha256,
      packageLockCandidateSha256: candidateEnvironment.packageLockSha256,
      packageLockRunnerSha256: runnerEnvironment.packageLockSha256,
      conditionDependencyInstall: 'baseline-lock/npm-ci-omit-dev-ignore-scripts',
      candidateNodeModules: 'shared-from-baseline-worktree',
      startedAt: new Date().toISOString(),
      measurementMode: args.measurementMode,
    };
    immutableWrite(path.join(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

    const caseScores = [];

    for (const caseDefinition of fixtureManifest.cases) {
      const result = adaptHumanAttentionCase(caseDefinition);
      const baselineMarkdown = await renderMarkdown(baselineRenderer, result);
      const candidateMarkdown = await renderMarkdown(candidateRenderer, result);
      const score = deterministicScore(caseDefinition, baselineMarkdown, candidateMarkdown);
      const caseDir = path.join(outputDir, caseDefinition.id);

      immutableWrite(path.join(caseDir, 'baseline.md'), `${baselineMarkdown}\n`);
      immutableWrite(path.join(caseDir, 'candidate.md'), `${candidateMarkdown}\n`);
      immutableWrite(
        path.join(caseDir, 'deterministic-score.json'),
        `${JSON.stringify(score, null, 2)}\n`
      );
      caseScores.push(score);
    }

    const regressions = caseScores.filter((score) => score.safetyRegression);
    const summary = {
      experimentId: id,
      caseCount: caseScores.length,
      deterministicStatus: regressions.length === 0 ? 'PASS' : 'SAFETY_REGRESSION',
      safetyRegressionCaseIds: regressions.map((score) => score.caseId),
      humanAttentionImprovementClaimed: false,
      nextStep:
        regressions.length === 0
          ? 'Human Decision Extraction / attention scoring remains required by #2378 rubric.'
          : 'Do not proceed to Human Attention adoption scoring until deterministic regressions are resolved.',
    };
    immutableWrite(path.join(outputDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);

    if (regressions.length > 0) process.exitCode = 2;
    console.log(JSON.stringify(summary, null, 2));
  } catch (error) {
    primaryError = error;
  } finally {
    const cleanupFailures = [];
    if (candidateAdded) {
      const failure = removeWorktree(repoRoot, candidateWorktree);
      if (failure) cleanupFailures.push(failure);
    }
    if (baselineAdded) {
      const failure = removeWorktree(repoRoot, baselineWorktree);
      if (failure) cleanupFailures.push(failure);
    }
    rmSync(tempRoot, { recursive: true, force: true });

    if (cleanupFailures.length > 0) {
      const details = cleanupFailures
        .map((failure) => `${failure.targetPath}: ${failure.error}`)
        .join('; ');
      const primary = primaryError
        ? ` Original evaluation error: ${primaryError.code ?? primaryError.name ?? 'Error'}: ${primaryError.message}`
        : '';
      throw new EvaluationError(
        'INCONCLUSIVE_CLEANUP',
        `failed to remove evaluation worktree(s): ${details}.${primary}`
      );
    }
  }

  if (primaryError) throw primaryError;
}

const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  execute().catch((error) => {
    if (error instanceof EvaluationError) {
      console.error(`${error.code}: ${error.message}`);
      process.exitCode = error.exitCode;
      return;
    }
    console.error(error?.stack ?? String(error));
    process.exitCode = 1;
  });
}

export { EvaluationError, assertEnvironmentCompatible, deterministicScore };
