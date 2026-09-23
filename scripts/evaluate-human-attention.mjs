#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  materializeHumanAttentionCase,
} from '../tests/fixtures/human-attention/decision-surface-eval-adapter.mjs';

export const CANONICAL_FIXTURE_PATH =
  'tests/fixtures/human-attention/decision-surface-eval-cases.json';
export const ADAPTER_PATH = 'tests/fixtures/human-attention/decision-surface-eval-adapter.mjs';
export const ADAPTER_HELPER_PATH = 'tests/helpers/render-result-fixtures.mjs';
export const RUBRIC_PATH = 'docs/development/2378-human-attention-evaluation-contract.md';
export const SCORECARD_PATH =
  'tests/fixtures/human-attention/decision-surface-scorecard-template.yaml';

const ALLOWED_PRESENTATION_PATHS = [
  'docs/adr/012-human-attention-architecture.md',
  'src/cli/render.mjs',
  'tests/render-markdown-digest.test.mjs',
  'runners/github-action/dist/index.mjs',
  'runners/github-action/dist/index.mjs.map',
];

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function runGit(repoRoot, args, { allowFailure = false } = {}) {
  const result = spawnSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0 && !allowFailure) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr.trim()}`);
  }
  return result;
}

function resolveCommit(repoRoot, revision) {
  return runGit(repoRoot, [
    'rev-parse',
    '--verify',
    '--end-of-options',
    `${revision}^{commit}`,
  ]).stdout.trim();
}

function lastChangeCommit(repoRoot, file) {
  const commit = runGit(repoRoot, ['log', '-1', '--format=%H', '--', file]).stdout.trim();
  if (!commit) throw new Error(`cannot resolve last-change commit for ${file}`);
  return commit;
}

function assertFrozenInputsClean(repoRoot) {
  const trackedInputs = [
    CANONICAL_FIXTURE_PATH,
    ADAPTER_PATH,
    ADAPTER_HELPER_PATH,
    RUBRIC_PATH,
    SCORECARD_PATH,
    'scripts/evaluate-human-attention.mjs',
    'package-lock.json',
  ];
  const dirty = runGit(repoRoot, ['status', '--porcelain', '--', ...trackedInputs]).stdout.trim();
  if (dirty) {
    throw new Error(
      `INCONCLUSIVE_ENVIRONMENT: evaluation inputs must match HEAD exactly:\n${dirty}`
    );
  }
}

export function isAllowedPresentationPath(file) {
  return ALLOWED_PRESENTATION_PATHS.includes(file);
}

export function assertPairedScope({ baseline, candidate, changedFiles, isAncestor }) {
  if (baseline === candidate) throw new Error('baseline and candidate must be different commits');
  if (!isAncestor) throw new Error('INCONCLUSIVE_SCOPE: baseline must be an ancestor of candidate');

  const unexpected = changedFiles.filter((file) => !isAllowedPresentationPath(file));
  if (unexpected.length > 0) {
    throw new Error(`INCONCLUSIVE_SCOPE: unexpected changed files: ${unexpected.join(', ')}`);
  }
}

export function assertSameLockfile(baselineHash, candidateHash) {
  if (baselineHash !== candidateHash) {
    throw new Error('INCONCLUSIVE_ENVIRONMENT: package-lock.json differs between conditions');
  }
}

export function parseArgs(argv) {
  const result = {
    fixtures: CANONICAL_FIXTURE_PATH,
    output: null,
    baseline: null,
    candidate: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    const next = argv[index + 1];
    if (value === '--baseline') result.baseline = next;
    else if (value === '--candidate') result.candidate = next;
    else if (value === '--fixtures') result.fixtures = next;
    else if (value === '--output') result.output = next;
    else throw new Error(`unknown argument: ${value}`);
    index += 1;
  }

  if (!result.baseline || !result.candidate) {
    throw new Error('--baseline and --candidate are required');
  }
  if (!result.output) throw new Error('--output is required');
  return result;
}

async function assertOutputAbsent(outputDir) {
  try {
    await access(outputDir);
    throw new Error(`output already exists: ${outputDir}`);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

async function linkNodeModules(repoRoot, worktree) {
  const source = path.join(repoRoot, 'node_modules');
  try {
    await access(source);
  } catch {
    throw new Error(
      'INCONCLUSIVE_ENVIRONMENT: node_modules is missing; run npm ci for the frozen lockfile first'
    );
  }
  const target = path.join(worktree, 'node_modules');
  await symlink(source, target, process.platform === 'win32' ? 'junction' : 'dir');
}

async function removeWorktree(repoRoot, worktreePath) {
  runGit(repoRoot, ['worktree', 'remove', '--force', worktreePath], { allowFailure: true });
}

export async function withTemporaryWorktrees({
  repoRoot,
  baseline,
  candidate,
  task,
  tempParent = os.tmpdir(),
}) {
  const root = await mkdtemp(path.join(tempParent, 'river-review-human-attention-'));
  const baselineDir = path.join(root, 'baseline');
  const candidateDir = path.join(root, 'candidate');
  let baselineAdded = false;
  let candidateAdded = false;

  try {
    runGit(repoRoot, ['worktree', 'add', '--detach', baselineDir, baseline]);
    baselineAdded = true;
    await linkNodeModules(repoRoot, baselineDir);

    runGit(repoRoot, ['worktree', 'add', '--detach', candidateDir, candidate]);
    candidateAdded = true;
    await linkNodeModules(repoRoot, candidateDir);

    return await task({ baselineDir, candidateDir });
  } finally {
    if (candidateAdded) await removeWorktree(repoRoot, candidateDir);
    if (baselineAdded) await removeWorktree(repoRoot, baselineDir);
    await rm(root, { recursive: true, force: true });
  }
}

async function loadRenderer(worktree, revision) {
  const url = pathToFileURL(path.join(worktree, 'src/cli/render.mjs'));
  url.searchParams.set('human-attention-eval', revision);
  return import(url.href);
}

function captureMarkdown(renderer, result, phase = 'midstream') {
  const lines = [];
  const originalLog = console.log;
  console.log = (...args) => lines.push(args.map(String).join(' '));
  try {
    renderer.printMarkdownReport(result, phase);
  } finally {
    console.log = originalLog;
  }
  return lines.join('\n');
}

function countOccurrences(haystack, needle) {
  return haystack.split(needle).length - 1;
}

function inspectRenderedMarkdown(markdown, evalCase, sourceResult) {
  const reference = evalCase.materialReference ?? {};
  const requiredActionCount = reference.requiredActionCount ?? 0;
  const expectedFindings = sourceResult?.findings ?? [];
  const expectedFindingFiles = expectedFindings.map((finding) => finding.file);

  const humanReviewCount = reference.humanReviewFileCount ?? null;
  const failedCount = reference.failedUnitCount ?? null;
  const timedOutCount = reference.timedOutUnitCount ?? null;

  return {
    canonicalMarkerCount: countOccurrences(markdown, '<!-- river-review -->'),
    allFindingsReachable: expectedFindingFiles.every((file) => markdown.includes(file)),
    fullFindingBodyCountPreserved:
      countOccurrences(markdown, '- **Evidence:**') === expectedFindings.length,
    actionCountVisible:
      requiredActionCount === 0 ||
      markdown.includes(`### 要対応 (${requiredActionCount} 件`) ||
      markdown.includes(`- 要対応: **${requiredActionCount} 件**`),
    humanReviewVisible:
      reference.humanReviewRequired !== true ||
      markdown.includes('人間レビュー必須') ||
      markdown.includes('人間レビュー: **必須**'),
    humanReviewCountVisible:
      humanReviewCount === null ||
      markdown.includes(`対象ファイル ${humanReviewCount} 件`) ||
      countOccurrences(markdown, 'src/human-review/file-') >= humanReviewCount,
    coverageWarningVisible:
      reference.coverageWarningRequired !== true ||
      markdown.includes('レビュー網羅性: **partial**') ||
      markdown.includes('レビュー網羅性: **not_executed**'),
    failedCountVisible: failedCount === null || markdown.includes(`failed ${failedCount}`),
    timedOutCountVisible: timedOutCount === null || markdown.includes(`timeout ${timedOutCount}`),
    blindSpotVisible:
      reference.blindSpotWarningRequired !== true ||
      markdown.includes('未実行のレビュー観点'),
  };
}

function candidateSafetyChecks({ markdown, evalCase, sourceResult, artifactEqual }) {
  const rendered = inspectRenderedMarkdown(markdown, evalCase, sourceResult);
  const reference = evalCase.materialReference ?? {};
  const legacy = reference.mustNotInventCoverageState === true;

  return {
    artifactSemanticsUnchanged: artifactEqual,
    canonicalMarkerSingle: rendered.canonicalMarkerCount === 1,
    allFindingsReachable: rendered.allFindingsReachable,
    fullFindingBodyCountPreserved: rendered.fullFindingBodyCountPreserved,
    actionCountVisible: rendered.actionCountVisible,
    humanReviewVisible: rendered.humanReviewVisible,
    humanReviewCountVisible: rendered.humanReviewCountVisible,
    coverageWarningVisible: rendered.coverageWarningVisible,
    failedCountVisible: rendered.failedCountVisible,
    timedOutCountVisible: rendered.timedOutCountVisible,
    blindSpotVisible: rendered.blindSpotVisible,
    noMisleadingCleanState:
      !surfaceNeedsAttention(evalCase) ||
      !markdown.includes('✅ マージ前に対応が必要な指摘はありません。'),
    legacyCoverageNotInvented:
      !legacy || (!markdown.includes('レビュー網羅性:') && !markdown.includes('verified_resolved')),
  };
}

function surfaceNeedsAttention(evalCase) {
  const reference = evalCase.materialReference ?? {};
  return (
    (reference.requiredActionCount ?? 0) > 0 ||
    reference.humanReviewRequired === true ||
    reference.coverageWarningRequired === true ||
    reference.blindSpotWarningRequired === true
  );
}

function allChecksPass(checks) {
  return Object.values(checks).every(Boolean);
}

async function writeJson(file, value) {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export async function runEvaluation({ baseline, candidate, fixtures, output }) {
  const repoRoot = runGit(process.cwd(), ['rev-parse', '--show-toplevel']).stdout.trim();
  assertFrozenInputsClean(repoRoot);

  const canonicalFixture = path.resolve(repoRoot, CANONICAL_FIXTURE_PATH);
  const requestedFixture = path.resolve(repoRoot, fixtures);
  if (requestedFixture !== canonicalFixture) {
    throw new Error(`fixture path must be canonical SSoT: ${CANONICAL_FIXTURE_PATH}`);
  }

  const baselineCommit = resolveCommit(repoRoot, baseline);
  const candidateCommit = resolveCommit(repoRoot, candidate);
  const ancestor =
    runGit(repoRoot, ['merge-base', '--is-ancestor', baselineCommit, candidateCommit], {
      allowFailure: true,
    }).status === 0;
  const changedFiles = runGit(repoRoot, [
    'diff',
    '--name-only',
    `${baselineCommit}..${candidateCommit}`,
  ])
    .stdout.split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  assertPairedScope({
    baseline: baselineCommit,
    candidate: candidateCommit,
    changedFiles,
    isAncestor: ancestor,
  });

  const baselineLock = runGit(repoRoot, ['show', `${baselineCommit}:package-lock.json`]).stdout;
  const candidateLock = runGit(repoRoot, ['show', `${candidateCommit}:package-lock.json`]).stdout;
  const runnerLock = await readFile(path.join(repoRoot, 'package-lock.json'), 'utf8');
  const baselineLockHash = sha256(baselineLock);
  const candidateLockHash = sha256(candidateLock);
  const runnerLockHash = sha256(runnerLock);
  assertSameLockfile(baselineLockHash, candidateLockHash);
  if (runnerLockHash !== baselineLockHash) {
    throw new Error(
      'INCONCLUSIVE_ENVIRONMENT: current checkout package-lock.json differs from frozen conditions'
    );
  }

  const fixtureText = await readFile(canonicalFixture, 'utf8');
  const adapterText = await readFile(path.join(repoRoot, ADAPTER_PATH), 'utf8');
  const adapterHelperText = await readFile(path.join(repoRoot, ADAPTER_HELPER_PATH), 'utf8');
  const rubricText = await readFile(path.join(repoRoot, RUBRIC_PATH), 'utf8');
  const scorecardText = await readFile(path.join(repoRoot, SCORECARD_PATH), 'utf8');
  const fixtureManifest = JSON.parse(fixtureText);
  if (fixtureManifest.schemaVersion !== '1') {
    throw new Error(`unsupported fixture schemaVersion: ${fixtureManifest.schemaVersion}`);
  }

  const outputDir = path.resolve(repoRoot, output);
  await assertOutputAbsent(outputDir);
  await mkdir(outputDir, { recursive: true });

  const startedAt = new Date().toISOString();
  const experimentId = [
    'ha',
    baselineCommit.slice(0, 8),
    candidateCommit.slice(0, 8),
    startedAt.replace(/[:.]/g, '-'),
  ].join('-');
  const experimentManifest = {
    experimentId,
    baselineCommit,
    candidateCommit,
    changedFiles,
    fixturePath: CANONICAL_FIXTURE_PATH,
    fixtureCommit: lastChangeCommit(repoRoot, CANONICAL_FIXTURE_PATH),
    fixtureSha256: sha256(fixtureText),
    adapterPath: ADAPTER_PATH,
    adapterCommit: lastChangeCommit(repoRoot, ADAPTER_PATH),
    adapterSha256: sha256(adapterText),
    adapterHelperPath: ADAPTER_HELPER_PATH,
    adapterHelperCommit: lastChangeCommit(repoRoot, ADAPTER_HELPER_PATH),
    adapterHelperSha256: sha256(adapterHelperText),
    runnerPath: 'scripts/evaluate-human-attention.mjs',
    runnerCommit: lastChangeCommit(repoRoot, 'scripts/evaluate-human-attention.mjs'),
    runnerSha256: sha256(
      await readFile(path.join(repoRoot, 'scripts/evaluate-human-attention.mjs'), 'utf8')
    ),
    rubricPath: RUBRIC_PATH,
    rubricCommit: lastChangeCommit(repoRoot, RUBRIC_PATH),
    rubricSha256: sha256(rubricText),
    scorecardPath: SCORECARD_PATH,
    scorecardCommit: lastChangeCommit(repoRoot, SCORECARD_PATH),
    scorecardSha256: sha256(scorecardText),
    nodeVersion: process.version,
    packageLockBaselineSha256: baselineLockHash,
    packageLockCandidateSha256: candidateLockHash,
    packageLockRunnerSha256: runnerLockHash,
    startedAt,
    measurementMode: 'unavailable',
  };
  await writeJson(path.join(outputDir, 'manifest.json'), experimentManifest);

  let safetyRegressionCount = 0;
  const caseSummaries = [];

  await withTemporaryWorktrees({
    repoRoot,
    baseline: baselineCommit,
    candidate: candidateCommit,
    task: async ({ baselineDir, candidateDir }) => {
      const [baselineRenderer, candidateRenderer] = await Promise.all([
        loadRenderer(baselineDir, baselineCommit),
        loadRenderer(candidateDir, candidateCommit),
      ]);

      for (const evalCase of fixtureManifest.cases) {
        const caseDir = path.join(outputDir, evalCase.id);
        await mkdir(caseDir, { recursive: true });

        const sourceResult = materializeHumanAttentionCase(evalCase, {
          schemaVersion: fixtureManifest.schemaVersion,
        });
        const baselineResult = structuredClone(sourceResult);
        const candidateResult = structuredClone(sourceResult);

        const baselineMarkdown = captureMarkdown(baselineRenderer, baselineResult);
        const candidateMarkdown = captureMarkdown(candidateRenderer, candidateResult);
        const baselineArtifact = baselineRenderer.formatJsonOutput(baselineResult, 'midstream');
        const candidateArtifact = candidateRenderer.formatJsonOutput(candidateResult, 'midstream');
        const artifactEqual =
          JSON.stringify(baselineArtifact) === JSON.stringify(candidateArtifact);

        const checks = candidateSafetyChecks({
          markdown: candidateMarkdown,
          evalCase,
          sourceResult,
          artifactEqual,
        });
        if (!allChecksPass(checks)) safetyRegressionCount += 1;

        const score = {
          caseId: evalCase.id,
          baselineObservation: inspectRenderedMarkdown(baselineMarkdown, evalCase, sourceResult),
          candidateObservation: inspectRenderedMarkdown(candidateMarkdown, evalCase, sourceResult),
          deterministicSafetyChecks: checks,
          deterministicSafetyPassed: allChecksPass(checks),
          decisionExtraction: 'not_scored',
          humanAttention: { seconds: null, mode: 'unavailable' },
        };

        await writeFile(path.join(caseDir, 'baseline.md'), `${baselineMarkdown}\n`, 'utf8');
        await writeFile(path.join(caseDir, 'candidate.md'), `${candidateMarkdown}\n`, 'utf8');
        await writeJson(path.join(caseDir, 'deterministic-score.json'), score);
        caseSummaries.push({
          caseId: evalCase.id,
          deterministicSafetyPassed: score.deterministicSafetyPassed,
        });
      }
    },
  });

  const summary = {
    cases: caseSummaries,
    totalCases: caseSummaries.length,
    safetyRegressionCount,
    deterministicSafetyPassed: safetyRegressionCount === 0,
    humanAttentionImprovement: 'not_evaluated',
    nextState: safetyRegressionCount === 0 ? 'READY_FOR_HUMAN_SCORING' : 'SAFETY_REGRESSION',
  };
  await writeJson(path.join(outputDir, 'summary.json'), summary);
  return summary;
}

async function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    const summary = await runEvaluation(args);
    console.log(JSON.stringify(summary, null, 2));
    if (!summary.deterministicSafetyPassed) process.exitCode = 2;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await main();
}
