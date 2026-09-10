import fs from 'node:fs/promises';
import path from 'node:path';
import { minimatch } from 'minimatch';
import { ConfigLoader } from '../config/loader.mjs';
import { hasSelection, resolveSelectionSkillIds } from './selection.mjs';
import { collectRepoDiff, renderDiffText } from './diff-processor.mjs';
import { generateReview } from './review-engine.mjs';
import { runReviewerOrchestration } from './reviewer-orchestrator.mjs';
import {
  detectDefaultBranch,
  ensureGitRepo,
  getHeadSha,
  isWorkingTreeDirty,
  normalizeBaseRef,
  resolveBaseMergeBase,
} from './git.mjs';
import { createOpenAIPlanner } from './openai-planner.mjs';
import { normalizePlannerMode, PHASES } from './planner-utils.mjs';
import { buildExecutionPlan } from '../../runners/core/review-runner.mjs';
import { loadProjectRules } from './rules.mjs';
import { loadRiskMap } from './risk-map.mjs';
import { loadReviewMemory } from './memory-context.mjs';
import { collectRepoContext } from './repo-context.mjs';
import { loadSkills } from '../../runners/core/skill-loader.mjs';
import {
  isLlmEnabled,
  isOfflineMode,
  parseList,
  resolveAvailableContexts as resolveAvailableContextsShared,
  resolveAvailableDependencies as resolveAvailableDependenciesShared,
} from './utils.mjs';
import { resolveFullFileSupply } from './fullfile-supply.mjs';
import {
  annotateFingerprints,
  computeFingerprint,
  computeFingerprintV2,
} from './finding-factory.mjs';
import { applySuppressions } from './suppression-apply.mjs';
import { computeStrictBlock } from './deterministic-gate.mjs';
import { runDeterministicExecGateIfEnabled } from './deterministic-exec-gate.mjs';

function normalizePhase(phase) {
  const normalized = (phase || '').toLowerCase();
  if (PHASES.includes(normalized)) return normalized;
  return 'midstream';
}

const configLoader = new ConfigLoader();

function shouldExclude(filePath, patterns = []) {
  return patterns.some((pattern) => minimatch(filePath, pattern, { dot: true }));
}

function applyFileExclusions(diff, patterns = []) {
  if (!patterns.length) return diff;

  const changedFiles = (diff.changedFiles ?? []).filter(
    (filePath) => !shouldExclude(filePath, patterns)
  );
  const rawFiles = (diff.files ?? []).filter((file) => !shouldExclude(file.path, patterns));
  const optimizedFiles = (diff.filesForReview ?? diff.files ?? []).filter(
    (file) => !shouldExclude(file.path, patterns)
  );

  const rawDiffText = renderDiffText(rawFiles);
  const diffText = renderDiffText(optimizedFiles);
  const rawTokenEstimate = Math.ceil(rawDiffText.length / 4);
  const tokenEstimate = Math.ceil(diffText.length / 4);
  const reduction =
    rawTokenEstimate === 0
      ? 0
      : Math.max(0, Math.round(((rawTokenEstimate - tokenEstimate) / rawTokenEstimate) * 100));

  return {
    ...diff,
    changedFiles,
    files: rawFiles,
    filesForReview: optimizedFiles,
    rawDiffText,
    diffText,
    rawTokenEstimate,
    tokenEstimate,
    reduction,
  };
}

async function resolvePullRequestLabels() {
  const envLabels = parseList(process.env.RIVER_PR_LABELS);
  if (envLabels.length) return envLabels;

  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) return [];

  try {
    const raw = await fs.readFile(eventPath, 'utf8');
    const event = JSON.parse(raw);
    const pullRequestLabels = event?.pull_request?.labels ?? event?.labels ?? [];
    return pullRequestLabels.map((label) => label?.name).filter(Boolean);
  } catch {
    return [];
  }
}

async function resolvePullRequestBody() {
  // Explicit env wins (works for any runner / non-Action use).
  const envBody = process.env.RIVER_PR_BODY;
  if (envBody && envBody.trim()) return envBody;

  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath) return null;

  try {
    const raw = await fs.readFile(eventPath, 'utf8');
    const event = JSON.parse(raw);
    const body = event?.pull_request?.body;
    return body && String(body).trim() ? String(body) : null;
  } catch {
    return null;
  }
}

function shouldSkipByLabel(prLabels = [], ignorePatterns = []) {
  if (!prLabels.length || !ignorePatterns.length) return { matched: [], shouldSkip: false };
  const normalizedLabels = prLabels.map((label) => label.toLowerCase());
  const matched = ignorePatterns.filter((pattern) => {
    const needle = pattern.toLowerCase();
    return normalizedLabels.some((label) => label.includes(needle));
  });
  return { matched, shouldSkip: matched.length > 0 };
}

// Re-export the shared helper under the legacy name so the rest of this
// module continues to call `resolveAvailableContexts(...)` unchanged.
// The single source of truth now lives in src/lib/utils.mjs and is also
// used by src/lib/review-plan.mjs (#802 Phase 3 A2-fix-1).
const resolveAvailableContexts = (inputContexts, options = {}) =>
  resolveAvailableContextsShared(inputContexts, options);

// The helper now lives in src/lib/utils.mjs; this thin wrapper preserves
// the legacy call sites inside this module unchanged.
const resolveAvailableDependencies = (inputDependencies) =>
  resolveAvailableDependenciesShared(inputDependencies);

async function collectLocalContext({
  cwd,
  debug = false,
  contextLines = 3,
  availableContexts,
  availableDependencies,
  baseRef = null,
} = {}) {
  const repoRoot = await ensureGitRepo(cwd);
  const { config, path: configPath, source: configSource } = await configLoader.load(repoRoot);
  const prLabels = await resolvePullRequestLabels();
  const prBody = await resolvePullRequestBody();
  const { rulesText: projectRules } = await loadProjectRules(repoRoot);
  const riskMap = await loadRiskMap(repoRoot);
  // When --base is provided, compare against the explicit ref instead of the
  // auto-detected default branch. Falls back to detection when unset.
  //
  // #2057: the value used to be handed straight to findMergeBase, which falls
  // back to `rev-parse HEAD` for a ref it cannot resolve — so `--base <typo>`
  // exited 0 having reviewed HEAD..working-tree instead of failing, and the
  // same flag meant something different here than on the `review` surface.
  // resolveBaseMergeBase (src/lib/git.mjs) is the shared contract lifted out of
  // review.mjs's resolveBaseRepoDiff in #2049: it trims, rejects a blank or
  // unresolvable ref with BaseRefError, and reports (does not throw on) a ref
  // that shares no history with HEAD. `detectDefaultBranch` stays lazy — it is
  // only consulted when `--base` is absent, exactly as before.
  const normalizedBaseRef = normalizeBaseRef(baseRef);
  const detectedDefaultBranch =
    normalizedBaseRef === null ? await detectDefaultBranch(repoRoot) : null;
  const { mergeBase, warning: baseRefWarning } = await resolveBaseMergeBase(
    repoRoot,
    baseRef,
    detectedDefaultBranch
  );
  if (baseRefWarning) console.warn(baseRefWarning);
  const defaultBranch = normalizedBaseRef ?? detectedDefaultBranch;
  // #1715 (#1574 producer Slice 2): the HEAD the review was taken against, plus
  // whether the working tree had changes HEAD does not carry.
  //
  // `commitSha` is NOT "the commit containing the reviewed code". `collectRepoDiff`
  // below diffs the WORKING TREE against `mergeBase`, so whenever the tree is
  // dirty — the normal case for a local `river run` — the reviewed lines live
  // only in the working tree and HEAD's tree does not reproduce them. `dirty`
  // is what lets a consumer tell those two situations apart; without it the two
  // are indistinguishable in the saved record (#1715 W1).
  //
  // Both are resolved once here and re-emitted by every exported entry point
  // below — a result that drops them makes the provenance null for that path
  // only. Null when the target has no HEAD / status cannot be read; the record
  // then omits the field rather than guessing.
  const commitSha = await getHeadSha(repoRoot);
  const dirty = await isWorkingTreeDirty(repoRoot);
  const rawDiff = await collectRepoDiff(repoRoot, mergeBase, { contextLines });
  const diff = applyFileExclusions(rawDiff, config.exclude?.files ?? []);
  const reviewFiles = diff.filesForReview?.map((file) => file.path) ?? diff.changedFiles;
  // #1606: declare `fullFile` as an available input context when the runner can
  // honestly supply the current change set's full source text. The content is
  // injected into the prompt by collectRepoContext (repo-context.mjs); this only
  // gates the inputContext-based skill selection, so fullFile skills stop being
  // silently skipped (#1598 class). Budget guards / binary+generated exclusion /
  // fail-safe live in resolveFullFileSupply; the debug ledger is surfaced below.
  const fullFileSupply = resolveFullFileSupply({
    changedFiles: reviewFiles,
    repoRoot,
    security: config.security,
    context: config.context,
  });
  // Expose `prDescription` as an available input context only when a PR body is
  // present, so the pr-description skill activates exactly when it has input.
  const contexts = resolveAvailableContexts(availableContexts, {
    alwaysInclude: [
      ...(prBody ? ['prDescription'] : []),
      ...(fullFileSupply.available ? ['fullFile'] : []),
    ],
  });
  const dependencies = resolveAvailableDependencies(availableDependencies);

  return {
    repoRoot,
    config,
    configPath,
    configSource,
    projectRules,
    riskMap,
    defaultBranch,
    mergeBase,
    commitSha,
    dirty,
    diff,
    reviewFiles,
    availableContexts: contexts,
    availableDependencies: dependencies,
    fullFileSupply,
    prLabels,
    prBody,
    debug,
  };
}

// --- テスト用 named export (内部ヘルパー) ---
export {
  normalizePhase,
  shouldExclude,
  shouldSkipByLabel,
  resolveAvailableContexts,
  resolveAvailableDependencies,
  resolvePullRequestBody,
};

export async function planLocalReview({
  cwd = process.cwd(),
  phase = 'midstream',
  dryRun = false,
  debug = false,
  preferredModelHint = 'balanced',
  availableContexts,
  availableDependencies,
  plannerMode,
  baseRef = null,
  skillIds = null,
  manualReviewMode = null,
} = {}) {
  const base = await collectLocalContext({
    cwd,
    debug,
    contextLines: debug ? 10 : 3,
    availableContexts,
    availableDependencies,
    baseRef,
  });
  const {
    repoRoot,
    projectRules,
    riskMap,
    defaultBranch,
    mergeBase,
    commitSha,
    dirty,
    diff,
    reviewFiles,
    availableContexts: contexts,
    availableDependencies: dependencies,
    fullFileSupply,
    config,
    configPath,
    configSource,
    prLabels,
    prBody,
  } = base;
  const requestedPlannerMode = normalizePlannerMode(plannerMode ?? process.env.RIVER_PLANNER_MODE, {
    defaultMode: 'off',
  });
  const plannerRequested = requestedPlannerMode !== 'off';

  // Config-level selection (.river-review.yaml `selection`) supplies the
  // skill id list unless the CLI already provided one via --skill-set,
  // which takes precedence as the explicit per-run override (design §6).
  let effectiveSkillIds = skillIds;
  if (effectiveSkillIds == null && hasSelection(config.selection)) {
    effectiveSkillIds = await resolveSelectionSkillIds(config.selection, {});
  } else if (
    effectiveSkillIds == null &&
    config.selection &&
    !hasSelection(config.selection) &&
    (config.selection.skills?.exclude?.length ?? 0) > 0
  ) {
    console.warn(
      '⚠️  selection: skills.exclude has no effect without packs, tags, or skills.include; all skills remain eligible.'
    );
  }

  const { matched: ignoredLabels, shouldSkip } = shouldSkipByLabel(
    prLabels,
    config.exclude?.prLabelsToIgnore ?? []
  );

  if (shouldSkip) {
    return {
      status: 'skipped-by-label',
      repoRoot,
      defaultBranch,
      mergeBase,
      commitSha,
      dirty,
      projectRules,
      availableContexts: contexts,
      availableDependencies: dependencies,
      config,
      configPath,
      configSource,
      prLabels,
      matchedLabels: ignoredLabels,
    };
  }

  if (!reviewFiles.length) {
    return {
      status: 'no-changes',
      repoRoot,
      defaultBranch,
      mergeBase,
      commitSha,
      dirty,
      projectRules,
      diff,
      availableContexts: contexts,
      availableDependencies: dependencies,
      config,
      configPath,
      configSource,
      prLabels,
    };
  }

  let planner = null;
  let plannerSkipped = null;
  const llmEnabled = isLlmEnabled();

  if (plannerRequested) {
    if (dryRun) {
      plannerSkipped = 'dry-run enabled';
    } else if (!llmEnabled) {
      plannerSkipped = isOfflineMode()
        ? 'offline (rules-only) mode enabled'
        : 'AI API key (ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_API_KEY) not set';
    } else {
      planner = createOpenAIPlanner();
    }
  }

  const plan = await buildExecutionPlan({
    phase: normalizePhase(phase),
    changedFiles: reviewFiles,
    diffText: diff.diffText,
    availableContexts: contexts,
    availableDependencies: dependencies,
    preferredModelHint,
    planner: planner ?? undefined,
    plannerMode: requestedPlannerMode,
    dryRun,
    llmEnabled,
    repoRoot,
    riskMap,
    skillIds: effectiveSkillIds,
    manualReviewMode,
    specDirs: config.review?.specDirs ?? [],
  });

  const plannerUsed = planner ? !plan.plannerFallback : false;
  const augmentedPlan = {
    ...plan,
    plannerRequested,
    plannerMode: plannerRequested ? requestedPlannerMode : 'off',
    plannerUsed,
    ...(plannerSkipped ? { plannerSkipped } : {}),
  };

  return {
    status: 'ok',
    repoRoot,
    defaultBranch,
    mergeBase,
    commitSha,
    dirty,
    changedFiles: reviewFiles,
    plan: augmentedPlan,
    diff,
    projectRules,
    availableContexts: contexts,
    availableDependencies: dependencies,
    fullFileSupply,
    prLabels,
    prBody,
    config,
    configPath,
    configSource,
  };
}

/**
 * Drop the PR comments whose findings were suppressed.
 *
 * Comments and findings are 1:1 in review-engine.mjs (`findings =
 * comments.map(...)`). When a finding is suppressed, the corresponding comment
 * must go too — otherwise the suppressed finding still surfaces verbatim in the
 * review thread, defeating the point of the suppression. Matching is by a
 * fingerprint recomputed from the comment's OWN fields, so it stays correct if
 * the 1:1 ordering ever drifts.
 *
 * #1797: the filter mirrors the algorithm that gated each finding
 * (`suppressionAlgo`, set by applySuppressions). A v1 suppression keeps the
 * pre-#1797 behavior — every same-kind comment in the file goes. A v2
 * suppression drops only the comment anchored at the same line; filtering those
 * by v1 would collapse exactly the occurrences v2 exists to keep apart.
 *
 * The v2 path depends on the comment's `line` naming the same line as the
 * finding's `lineStart` (review-engine.mjs sets `lineStart: c.line ?? null`
 * from the comment). Extracted from `runLocalReview` so that dependency is
 * testable without standing up the whole pipeline
 * (tests/local-runner-suppression.test.mjs).
 *
 * #1823 残件1: on the `--reviewers` path that dependency holds for the cluster
 * REPRESENTATIVE only. `mergeFindings` collapses findings up to 2 lines apart
 * into one, while their comments stay at their own lines, so the v2 sweep also
 * covers every line the representative absorbed (`mergedLineStarts`). Findings
 * that were never merged carry no such list, so nothing widens for them — an
 * unmerged neighbour's comment is still kept. The non-orchestrated path never
 * calls `mergeFindings` and is unaffected, as is the v1 path (already
 * file-wide).
 *
 * @param {Array<object>} comments - `review.comments`
 * @param {Array<object>} suppressedFindings - `applySuppressions().suppressedFindings`
 * @returns {Array<object>} the comments to keep
 */
export function filterSuppressedComments(comments, suppressedFindings) {
  const list = Array.isArray(comments) ? comments : [];
  const suppressed = Array.isArray(suppressedFindings) ? suppressedFindings : [];
  const suppressedV1 = new Set(
    suppressed
      .filter((f) => f?.suppressionAlgo !== 'v2')
      .map((f) => f?.fingerprint)
      .filter(Boolean)
  );
  const suppressedV2 = new Set();
  for (const f of suppressed) {
    if (f?.suppressionAlgo !== 'v2') continue;
    if (f.fingerprintV2) suppressedV2.add(f.fingerprintV2);
    // #1823 残件1: a finding produced by `--reviewers` can be the representative
    // of a merge cluster (mergeFindings tolerates a ±2 line gap), and the
    // comments of the merged-away members are still anchored at THEIR lines. A
    // v2 hex derived from the representative's line alone therefore misses them
    // and they survive the suppression. `mergedLineStarts` carries those lines,
    // so re-derive the v2 hex per line through the SSoT (computeFingerprintV2)
    // rather than widening the match with a line window: the sweep stays exact
    // and only reaches lines the merge actually absorbed.
    for (const line of Array.isArray(f.mergedLineStarts) ? f.mergedLineStarts : []) {
      if (!Number.isInteger(line) || line < 1) continue;
      suppressedV2.add(computeFingerprintV2({ ...f, lineStart: line, line }));
    }
  }
  if (suppressedV1.size === 0 && suppressedV2.size === 0) return list;
  return list.filter((c) => {
    const key = {
      ruleId: c.skillId || 'unknown',
      file: c.file,
      message: c.message,
      line: c.line,
    };
    if (suppressedV1.has(computeFingerprint(key))) return false;
    if (suppressedV2.has(computeFingerprintV2(key))) return false;
    return true;
  });
}

/**
 * Run a local review end to end.
 *
 * #1975 — precedence of `context` over `availableContexts` /
 * `availableDependencies`: when `context` is supplied, those two arguments are
 * **ignored** and the values carried by `context` are used instead. They are
 * read only on the fallback path, i.e. when `context` is omitted and this
 * function has to build one by calling `planLocalReview` itself.
 *
 * Everything downstream of the fallback reads `context.availableContexts` /
 * `context.availableDependencies`, never the top-level arguments. The
 * production caller (`src/cli/commands/run.mjs`) always passes `context`, so
 * for the CLI these two arguments are inert; `--context` / `--dependency`
 * take effect through the `planLocalReview` call in that command instead.
 * They are kept because callers that omit `context` (currently only tests)
 * depend on them, and because removing them would silently disable
 * `--context` / `--dependency` if `run.mjs` ever stopped passing `context`.
 *
 * @param {object} [options]
 * @param {object} [options.context] - a pre-built plan; when present it wins
 *   over `availableContexts` / `availableDependencies`.
 * @param {string[]} [options.availableContexts] - fallback only (no `context`).
 * @param {string[]} [options.availableDependencies] - fallback only (no `context`).
 */
export async function runLocalReview({
  cwd = process.cwd(),
  phase = 'midstream',
  dryRun = false,
  debug = false,
  preferredModelHint = 'balanced',
  model,
  apiKey,
  context: providedContext,
  availableContexts,
  availableDependencies,
  plannerMode,
  reviewers,
  baseRef = null,
  skillIds = null,
  manualReviewMode = null,
  // #1689: `--quiet` suppresses the reviewer-orchestration progress lines on
  // stderr. It never affects the artifact written to stdout.
  quiet = false,
} = {}) {
  const context =
    providedContext ??
    (await planLocalReview({
      cwd,
      phase,
      dryRun,
      debug,
      preferredModelHint,
      availableContexts,
      availableDependencies,
      plannerMode,
      baseRef,
      skillIds,
      manualReviewMode,
    }));
  if (context.status === 'no-changes') {
    return {
      status: 'no-changes',
      repoRoot: context.repoRoot,
      defaultBranch: context.defaultBranch,
      mergeBase: context.mergeBase,
      commitSha: context.commitSha ?? null,
      dirty: context.dirty ?? null,
      config: context.config,
      configPath: context.configPath,
      configSource: context.configSource,
      prLabels: context.prLabels,
    };
  }

  if (context.status === 'skipped-by-label') {
    return {
      status: 'skipped-by-label',
      reason: 'pr-label',
      matchedLabels: context.matchedLabels,
      repoRoot: context.repoRoot,
      defaultBranch: context.defaultBranch,
      mergeBase: context.mergeBase,
      commitSha: context.commitSha ?? null,
      dirty: context.dirty ?? null,
      availableContexts: context.availableContexts,
      availableDependencies: context.availableDependencies,
      config: context.config,
      configPath: context.configPath,
      configSource: context.configSource,
      prLabels: context.prLabels,
    };
  }

  const memoryContext = loadReviewMemory(context.repoRoot, {
    phase: normalizePhase(phase),
    changedFiles: context.changedFiles,
  });

  const repoContext = await collectRepoContext({
    changedFiles: context.changedFiles,
    repoRoot: path.resolve(context.repoRoot),
    security: context.config?.security,
    context: context.config?.context,
  }).catch(() => null);

  const reviewArgs = {
    diff: context.diff,
    plan: context.plan,
    phase: normalizePhase(phase),
    dryRun,
    model,
    apiKey,
    projectRules: context.projectRules,
    riskAssessment: context.plan?.riskAssessment ?? null,
    memoryContext,
    fileTypes: context.plan?.fileTypes,
    relatedADRs: context.plan?.relatedADRs,
    reviewMode: context.plan?.reviewMode,
    repoContext,
    prBody: context.prBody,
    config: context.config,
    // #1545 P1: formalized stage/risk/artifact routing signals for `--reviewers
    // auto`. Populated by the host/PlanGate via the plan; undefined here keeps
    // the pre-#1545 auto-selection behavior unchanged.
    signals: context.plan?.reviewSignals,
  };

  const review = reviewers?.length
    ? await runReviewerOrchestration({ ...reviewArgs, reviewers, quiet })
    : await generateReview(reviewArgs);

  // #687 PR-C: gate findings by Riverbed Memory suppressions.
  // Run AFTER fingerprint annotation so applySuppressions sees the canonical
  // 16-hex fingerprint produced by computeFingerprint(). Bypassed when
  // config.memory.suppressionEnabled === false (see suppression-apply.mjs).
  const annotatedFindings = annotateFingerprints(review.findings ?? []);
  const {
    keptFindings,
    suppressedFindings,
    applied: suppressionsApplied,
  } = applySuppressions(annotatedFindings, memoryContext, { config: context.config });

  // Epic #1347 S4 (#1351): deterministic strict_block gate. Computed over the
  // PRE-suppression finding set joined with the selected skills so a suppressed
  // deterministic block still forces the gate — a suppression must not be a
  // strict_block bypass (fail-safe, mirroring SKIPPED_BY_POLICY).
  const { strictBlock: findingStrictBlock } = computeStrictBlock({
    findings: annotatedFindings,
    selected: context.plan?.selected ?? [],
  });

  // Epic #1347 §11.8 (c2) (#1401): deterministic-gate COMMAND execution. Wiring,
  // security invariants (double-gated + OFF by default + opt-out no-import +
  // trust boundary + fail-safe) and the strict_block/unrunnable contract all live
  // in runDeterministicExecGateIfEnabled (the SINGLE source of truth, P2 #1434).
  const { strictBlock: deterministicExecStrictBlock, deterministicUnrunnable } =
    await runDeterministicExecGateIfEnabled({
      env: process.env,
      selected: context.plan?.selected ?? [],
      reviewSourceDir: path.resolve(context.repoRoot),
      changedFiles: context.changedFiles ?? [],
    });

  // Either signal (findings-derived OR command-execution-derived) forces the
  // strict_block gate — they are ORed so neither path can be a bypass.
  const strictBlock = findingStrictBlock || deterministicExecStrictBlock;

  const reviewComments = review.comments ?? [];
  const keptComments = filterSuppressedComments(reviewComments, suppressedFindings);

  return {
    status: 'ok',
    // Gate fail-safe input (Epic #1347 S2 review M1): dry-run skips the LLM,
    // so a clean diff scores a vacuous auto-approve — the gate must not read
    // that as CONVERGED_CLEAN.
    dryRun: dryRun === true,
    // Epic #1347 S4 (#1351): deterministic strict_block signal for the gate.
    // deriveRunGate forwards this to deriveGateDecision → unconditional NO_GO.
    strictBlock,
    // Epic #1347 §11.8 (c2) (#1401): deterministic-gate command execution could
    // not run to a verdict (opt-in only; false unless double-gated). deriveRunGate
    // forwards this to deriveGateDecision → rule 5c ESCALATE.
    deterministicUnrunnable,
    repoRoot: path.resolve(context.repoRoot),
    defaultBranch: context.defaultBranch,
    mergeBase: context.mergeBase,
    // #1715: consumed by buildRunRecord (src/lib/result-store.mjs) for the
    // saved record's 契約1 provenance. `commitSha` names the HEAD this review
    // was taken against — NOT necessarily a commit containing the reviewed
    // lines, since the diff above came from the working tree. `dirty` is what
    // says which of the two it was.
    commitSha: context.commitSha ?? null,
    dirty: context.dirty ?? null,
    changedFiles: context.changedFiles,
    plan: context.plan,
    reviewMode: context.plan?.reviewMode ?? 'medium',
    diffText: context.diff.diffText,
    files: context.diff.filesForReview ?? context.diff.files,
    comments: keptComments,
    findings: keptFindings,
    suppressedFindings,
    classified: review.classified,
    reviewerResults: review.reviewerResults ?? null,
    teamLeadReport: review.teamLeadReport ?? null,
    tokenEstimate: context.diff.tokenEstimate,
    rawTokenEstimate: context.diff.rawTokenEstimate,
    reduction: context.diff.reduction,
    prompt: review.prompt,
    reviewDebug: {
      ...(review.debug ?? {}),
      suppressionsApplied,
      // #1606: fullFile supply ledger (which changed files were declared as
      // fullFile context vs skipped for budget/binary/generated/non-source).
      // Only emitted when the resolver actually ran so no-op paths stay clean.
      ...(context.fullFileSupply ? { fullFileSupply: context.fullFileSupply } : {}),
      // #692 PR-C: surface redaction telemetry without leaking the
      // pre-redaction text. `redactionHits` is a small {category, count}
      // tally; raw context never appears here.
      ...(repoContext?.redactionHits?.length || repoContext?.excludedPaths?.length
        ? {
            repoContextSecurity: {
              redactionHits: repoContext?.redactionHits ?? [],
              excludedPaths: repoContext?.excludedPaths ?? [],
            },
          }
        : {}),
      // #689 PR-C: ranking + budget telemetry. Only emitted when the
      // collector actually used these signals so no-op runs stay clean.
      ...(repoContext?.ranking || repoContext?.tokenBudget
        ? {
            repoContextRanking: repoContext?.ranking ?? null,
            repoContextTokenBudget: repoContext?.tokenBudget ?? null,
          }
        : {}),
    },
    projectRules: context.projectRules,
    availableContexts: context.availableContexts,
    availableDependencies: context.availableDependencies,
    prLabels: context.prLabels,
    config: context.config,
    configPath: context.configPath,
    configSource: context.configSource,
  };
}

export async function doctorLocalReview({
  cwd = process.cwd(),
  phase = 'midstream',
  debug = false,
  preferredModelHint = 'balanced',
  availableContexts,
  availableDependencies,
} = {}) {
  const skills = await loadSkills();
  const base = await collectLocalContext({
    cwd,
    debug,
    contextLines: debug ? 10 : 0,
    availableContexts,
    availableDependencies,
  });
  const {
    repoRoot,
    projectRules,
    defaultBranch,
    mergeBase,
    commitSha,
    dirty,
    diff,
    reviewFiles,
    availableContexts: contexts,
    availableDependencies: dependencies,
  } = base;

  const llmEnabled = isLlmEnabled();

  const plan = reviewFiles.length
    ? await buildExecutionPlan({
        phase: normalizePhase(phase),
        changedFiles: reviewFiles,
        diffText: diff.diffText,
        availableContexts: contexts,
        availableDependencies: dependencies,
        preferredModelHint,
        skills,
        llmEnabled,
        repoRoot,
      })
    : null;

  return {
    status: 'ok',
    repoRoot,
    defaultBranch,
    mergeBase,
    commitSha,
    dirty,
    skillsCount: skills.length,
    projectRules,
    changedFiles: reviewFiles,
    plan,
    availableContexts: contexts,
    availableDependencies: dependencies,
    diff,
    config: base.config,
    configPath: base.configPath,
    configSource: base.configSource,
  };
}
