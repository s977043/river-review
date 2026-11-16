import { minimatch } from 'minimatch';
import { loadSkills } from './skill-loader.mjs';
import { planSkills, summarizeSkill } from '../../src/lib/skill-planner.mjs';
import { inferImpactTags } from '../../src/lib/impact-scope.mjs';
import { classifyChangedFiles } from '../../src/lib/file-classifier.mjs';
import { inferPhase } from '../../src/lib/phase-inference.mjs';
import { analyzeTestImpact } from '../../src/lib/test-impact.mjs';
import { detectStateTransitionSignal } from '../../src/lib/state-transition-signal.mjs';
import { normalizePlannerMode } from '../../src/lib/planner-utils.mjs';
import { HEURISTIC_SKILL_IDS } from '../../src/lib/heuristic-review.mjs';
import { estimateTokens } from '../../src/lib/token-estimator.mjs';
import { evaluateRisk } from '../../src/lib/risk-map.mjs';
import { findRelatedADRs } from '../../src/lib/adr-linker.mjs';
import { extractDiffMeta } from '../../src/lib/diff-processor.mjs';
import { determineReviewMode } from '../../src/lib/review-plan-generator.mjs';

const MODEL_PRIORITY = {
  cheap: 1,
  balanced: 2,
  'high-accuracy': 3,
};

// Epic #1347 S2 (#1349, merged from #1339): declared multi-layer execution
// order. Derived from each selected skill's evaluationType (fallback:
// SKILL_HEURISTIC_MAP membership → heuristic, else agentic→llm). S2 emits the
// DECLARATION only; reordering enforcement (strict_block routing) is S4.
const EVALUATION_LAYER_ORDER = ['deterministic', 'heuristic', 'llm'];

function skillEvaluationLayers(skill) {
  const meta = getMeta(skill);
  const declared = meta?.evaluationType;
  if (declared === 'deterministic') return ['deterministic'];
  if (declared === 'heuristic') return ['heuristic'];
  if (declared === 'agentic') return ['llm'];
  // Undeclared fallback: SKILL_HEURISTIC_MAP members have heuristic detectors
  // AND run through the LLM in normal (non-dry-run) execution, so they
  // contribute BOTH layers — declaring only 'heuristic' would omit the llm
  // layer that actually runs (review M1 of the S2 plan-contract PR).
  return HEURISTIC_SKILL_IDS.includes(meta?.id) ? ['heuristic', 'llm'] : ['llm'];
}

export function deriveExecutionOrder(selected) {
  const layers = new Set((selected ?? []).flatMap(skillEvaluationLayers));
  return EVALUATION_LAYER_ORDER.filter((l) => layers.has(l));
}

// Epic #1347 S3 (#1350, Gemini-proposal adoption): Context Lift — how much
// skill-prompt context progressive disclosure saved. totalSkillTokens counts
// every CANDIDATE skill body; loadedSkillTokens counts only the selected
// ones. liftRatio = 1 - loaded/total (0 when nothing was saved or nothing
// was measurable). Declaration/metric only — no behavior depends on it.
export function computeContextLift(candidates, selected) {
  const bodyTokens = (skill) => estimateTokens(skill?.body ?? '');
  const totalSkillTokens = (candidates ?? []).reduce((sum, s) => sum + bodyTokens(s), 0);
  const loadedSkillTokens = (selected ?? []).reduce((sum, s) => sum + bodyTokens(s), 0);
  const liftRatio =
    totalSkillTokens > 0 ? Math.round((1 - loadedSkillTokens / totalSkillTokens) * 1000) / 1000 : 0;
  return { totalSkillTokens, loadedSkillTokens, liftRatio };
}

function getMeta(skill) {
  return skill?.metadata ?? skill;
}

function ensureArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

export function matchesPhase(skill, phase) {
  const meta = getMeta(skill);
  if (Array.isArray(meta.phase)) {
    return meta.phase.includes(phase);
  }
  return meta.phase === phase;
}

function matchesApplyTo(skill, changedFiles) {
  const meta = getMeta(skill);
  const globs = ensureArray(meta.applyTo);
  if (!globs.length) return false;
  return changedFiles.some((file) =>
    globs.some((pattern) => minimatch(file, pattern, { dot: true }))
  );
}

function missingInputContexts(skill, availableContexts) {
  const meta = getMeta(skill);
  if (!meta.inputContext || meta.inputContext.length === 0) return [];
  const available = new Set(availableContexts);
  return meta.inputContext.filter((ctx) => !available.has(ctx));
}

/**
 * Wildcard sentinel emitted by `dependencyStubs` (src/lib/utils.mjs) for the
 * open branch of `schemas/skill.schema.json` `$defs.dependency`. The schema is
 * an `anyOf` of a closed enum plus `{"pattern": "^custom:.+"}`; the pattern
 * branch cannot be enumerated, so `RIVER_DEPENDENCY_STUBS=1` advertises this
 * single token instead and it is expanded here. Keep the regex identical to
 * that schema pattern (pinned by tests/skill-schema-parity.test.mjs, #1921).
 *
 * The token is expanded only on the AVAILABLE side. A skill that declares
 * `dependencies: [custom:*]` (legal — the schema pattern matches the token) is
 * therefore treated like any other name: satisfied iff `custom:*` is available,
 * i.e. iff blanket custom support is advertised. Pinned in the same canary.
 */
const CUSTOM_DEPENDENCY_WILDCARD = 'custom:*';
const CUSTOM_DEPENDENCY_PATTERN = /^custom:.+/;

function missingDependencies(skill, availableDependencies) {
  const meta = getMeta(skill);
  const deps = ensureArray(meta.dependencies);
  if (!deps.length) return [];
  if (availableDependencies == null) return [];
  const available = new Set(ensureArray(availableDependencies));
  const customWildcard = available.has(CUSTOM_DEPENDENCY_WILDCARD);
  return deps.filter(
    (dep) => !available.has(dep) && !(customWildcard && CUSTOM_DEPENDENCY_PATTERN.test(dep))
  );
}

function evaluateSkill(skill, options) {
  const reasons = [];
  const meta = getMeta(skill);
  if (!matchesPhase(meta, options.phase)) {
    reasons.push(`phase mismatch: ${meta.phase} !== ${options.phase}`);
  }
  if (!matchesApplyTo(meta, options.changedFiles)) {
    reasons.push('applyTo did not match any changed file');
  }
  const missingContexts = missingInputContexts(meta, options.availableContexts);
  if (missingContexts.length) {
    reasons.push(`missing inputContext: ${missingContexts.join(', ')}`);
  }
  const depsMissing = missingDependencies(meta, options.availableDependencies);
  if (depsMissing.length) {
    reasons.push(`missing dependencies: ${depsMissing.join(', ')}`);
  }
  return {
    ok: reasons.length === 0,
    reasons,
  };
}

export function selectSkills(skills, options) {
  const changedFiles = ensureArray(options.changedFiles);
  const availableContexts = ensureArray(options.availableContexts);
  const availableDependencies = options.availableDependencies ?? null;
  const dryRun = options.dryRun ?? false;
  const llmEnabled = options.llmEnabled ?? true;
  const selected = [];
  const skipped = [];

  for (const skill of skills) {
    const meta = skill.metadata ?? skill;
    const skillId = meta.id;

    // ルーティングスキル（エントリポイント）は実行対象外
    const tags = ensureArray(meta.tags);
    if (tags.includes('routing')) {
      skipped.push({ skill, reasons: ['routing skill: not an executable review skill'] });
      continue;
    }

    // dry-run または LLM 無効時はヒューリスティック対応スキルのみ選択
    const isLlmRestricted = dryRun || !llmEnabled;
    if (isLlmRestricted && !HEURISTIC_SKILL_IDS.includes(skillId)) {
      const reason = dryRun
        ? 'dry-run: LLM必須スキル（ヒューリスティック未対応）'
        : 'LLM disabled: LLM必須スキル（APIキー未設定）';
      skipped.push({ skill, reasons: [reason] });
      continue;
    }

    const result = evaluateSkill(meta, {
      phase: options.phase,
      changedFiles,
      availableContexts,
      availableDependencies,
    });
    if (result.ok) {
      selected.push(skill);
    } else {
      skipped.push({ skill, reasons: result.reasons });
    }
  }
  return { selected, skipped };
}

export function rankByModelHint(skills, preferredModelHint = 'balanced') {
  const preferredWeight = MODEL_PRIORITY[preferredModelHint] ?? MODEL_PRIORITY.balanced;
  const weight = (hint) => MODEL_PRIORITY[hint] ?? MODEL_PRIORITY.balanced;
  return [...skills].sort((a, b) => {
    const wa = Math.abs(weight(getMeta(a).modelHint) - preferredWeight);
    const wb = Math.abs(weight(getMeta(b).modelHint) - preferredWeight);
    if (wa !== wb) return wa - wb;
    return getMeta(a).id.localeCompare(getMeta(b).id);
  });
}

function computeTagScore(skill, impactTags) {
  if (!impactTags?.length) return 0;
  const tags = new Set(getMeta(skill).tags ?? []);
  let score = 0;
  for (const tag of impactTags) {
    if (tags.has(tag)) score += 1;
  }
  return score;
}

function rankByImpactTags(skills, impactTags, preferredModelHint = 'balanced') {
  const scores = new Map(skills.map((s) => [getMeta(s).id, computeTagScore(s, impactTags)]));
  const anyMatched = Array.from(scores.values()).some((v) => v > 0);
  if (!anyMatched) {
    return rankByModelHint(skills, preferredModelHint);
  }

  const preferredWeight = MODEL_PRIORITY[preferredModelHint] ?? MODEL_PRIORITY.balanced;
  const weight = (hint) => MODEL_PRIORITY[hint] ?? MODEL_PRIORITY.balanced;

  return [...skills].sort((a, b) => {
    const idA = getMeta(a).id;
    const idB = getMeta(b).id;
    const scoreA = scores.get(idA) ?? 0;
    const scoreB = scores.get(idB) ?? 0;
    if (scoreA !== scoreB) return scoreB - scoreA;

    const wa = Math.abs(weight(getMeta(a).modelHint) - preferredWeight);
    const wb = Math.abs(weight(getMeta(b).modelHint) - preferredWeight);
    if (wa !== wb) return wa - wb;
    return idA.localeCompare(idB);
  });
}

/**
 * Build an execution plan from skills and review context.
 * - planner 未指定: メタデと modelHint に基づく決定論的な並び替え
 * - planner 指定: LLM 等で優先度決定し、エラー時は決定論的順序にフォールバック
 *   - plannerMode=order: 優先度づけ（未参照スキルは後ろに決定論で追加）
 *   - plannerMode=prune: 絞り込み（LLM が選んだスキルのみを実行）
 */
// #1255 (approach D): opt-in escalation. When RIVER_ESCALATE_TEST_SKILLS is
// enabled and the diff is high test-impact risk (app changed, no tests), these
// downstream test skills are force-selected regardless of phase so untested
// high-risk changes still get a test-coverage review. Default off — see
// docs/development/1255-test-impact-routing-design.md.
const ESCALATION_TEST_SKILL_IDS = ['test-existence', 'coverage-gap'];

function isTestSkillEscalationEnabled() {
  const v = String(process.env.RIVER_ESCALATE_TEST_SKILLS ?? '')
    .trim()
    .toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

const STATE_TRANSITION_SKILL_IDS = ['river-review-testing', 'unknown-coverage-review'];

function forceSelectSkills(selection, skills, ids) {
  const selectedIds = new Set(selection.selected.map((s) => getMeta(s).id));
  for (const id of ids) {
    if (selectedIds.has(id)) continue;
    const skill = skills.find((s) => getMeta(s).id === id);
    if (!skill) continue;
    selection.selected.push(skill);
    selection.skipped = selection.skipped.filter((entry) => getMeta(entry.skill).id !== id);
  }
}

export async function buildExecutionPlan(options) {
  const {
    phase,
    changedFiles = [],
    availableContexts = [],
    availableDependencies = null,
    preferredModelHint = 'balanced',
    skills: providedSkills,
    planner,
    plannerMode,
    diffText,
    dryRun = false,
    llmEnabled = true,
    repoRoot,
    riskMap,
    skillIds = null,
    manualReviewMode = null,
    specDirs = [],
  } = options;

  const loadedSkills = providedSkills ?? (await loadSkills());
  // When a skill set is requested (--skill-set), narrow the candidate skills to
  // the set's ids before phase/applyTo selection. Default (null) keeps all skills.
  const skills =
    Array.isArray(skillIds) && skillIds.length > 0
      ? loadedSkills.filter((skill) => skillIds.includes(skill.metadata?.id ?? skill.id))
      : loadedSkills;
  const selection = selectSkills(skills, {
    phase,
    changedFiles,
    availableContexts,
    availableDependencies,
    dryRun,
    llmEnabled,
  });
  const impactTags = inferImpactTags(changedFiles, { diffText });
  const fileTypes = classifyChangedFiles(changedFiles);
  // #1565 Stage 1 (observe): deterministically infer a phase from fileTypes and
  // record it on the snapshot for measurement only. `applied: false` documents
  // that the inferred phase does NOT drive selection — the actual `phase` is
  // unchanged. Applying it (Stage 2, `--phase auto`) is a separate change.
  const inferredPhase = { ...inferPhase(fileTypes), applied: false };
  const riskAssessment = riskMap ? evaluateRisk(riskMap, changedFiles) : null;
  // #1255: surface test-impact signal (riskLevel high = app changed, no tests)
  // on the plan so downstream planners/consumers can route test skills. This
  // exposes the previously dead-code analyzeTestImpact() without forcing skill
  // injection (approach B).
  const testImpact = analyzeTestImpact(changedFiles);
  // #1255 (approach D): opt-in escalation of downstream test skills for high
  // test-impact risk diffs. Injects regardless of phase; default off so the
  // baseline selection (and dry-run heuristic behavior) is unchanged.
  if (testImpact.riskLevel === 'high' && isTestSkillEscalationEnabled()) {
    forceSelectSkills(selection, skills, ESCALATION_TEST_SKILL_IDS);
  }
  // #2875: diffs dense in exception / resume / state-rewrite paths always get
  // the testing and unknown-coverage reviews, regardless of phase.
  const stateTransition = detectStateTransitionSignal(diffText);
  if (stateTransition.triggered) {
    forceSelectSkills(selection, skills, STATE_TRANSITION_SKILL_IDS);
  }
  if (selection.selected.length === 0) {
    // #878 A2-3-runners: even when no skills are selected, expose the
    // snapshot so consumers can attach it to the artifact for downstream
    // diagnostics (drift detection, audit). Cheap to compute, cheap to drop.
    return {
      selected: [],
      skipped: selection.skipped,
      fileTypes,
      riskAssessment,
      testImpact,
      executionOrder: [],
      estimatedCost: { tokens: estimateTokens(diffText ?? ''), source: 'token-estimator' },
      contextLift: computeContextLift(skills, []),
      snapshot: {
        fileTypes,
        relatedADRs: [],
        reviewMode: null,
        riskAssessment,
        testImpact,
        inferredPhase,
      },
    };
  }
  const relatedADRs = findRelatedADRs(repoRoot ?? process.cwd(), {
    changedFiles,
    keywords: impactTags,
    extraDirs: specDirs,
  });

  const diffMeta = extractDiffMeta({ changedFiles, diffText });
  const reviewMode = determineReviewMode(diffMeta, { manualMode: manualReviewMode });

  // If planner is provided, try LLM-based planning, fallback to deterministic rank
  const effectivePlannerMode = planner
    ? normalizePlannerMode(plannerMode, { defaultMode: 'order' })
    : 'off';
  if (planner && effectivePlannerMode !== 'off') {
    const context = {
      phase,
      changedFiles,
      availableContexts,
      impactTags,
      fileTypes,
    };
    const { planned, reasons, fallback } = await planSkills({
      skills: selection.selected,
      context,
      llmPlan: planner.plan ?? planner,
      appendRemaining: effectivePlannerMode !== 'prune',
    });
    const ranked = fallback
      ? rankByImpactTags(selection.selected, impactTags, preferredModelHint)
      : planned;
    return {
      selected: ranked,
      skipped: selection.skipped,
      plannerMode: effectivePlannerMode,
      plannerReasons: reasons,
      plannerFallback: fallback,
      ...(fallback ? { plannerError: reasons?.[0]?.reason ?? 'planner fallback' } : {}),
      impactTags,
      fileTypes,
      relatedADRs,
      reviewMode,
      // #877 silent-skip cleanup: riskAssessment was previously computed but
      // never returned, so consumers received `undefined`. Top-level for
      // back-compat; also nested in `snapshot` for the #878 A2-3 carry-over.
      riskAssessment,
      // #1255: test-impact signal (see analyzeTestImpact call above).
      testImpact,
      // Epic #1347 S2: declared layer order + rough cost estimate (advisory).
      executionOrder: deriveExecutionOrder(ranked),
      estimatedCost: { tokens: estimateTokens(diffText ?? ''), source: 'token-estimator' },
      contextLift: computeContextLift(skills, ranked),
      // #878 A2-3-runners: carry-over context for --plan replay execution.
      // Consumers should propagate this to `artifact.debug.execution.snapshot`
      // per docs/development/a2-3-replay-execution-design.md.
      snapshot: { fileTypes, relatedADRs, reviewMode, riskAssessment, testImpact, inferredPhase },
    };
  }

  // planner が無い場合（LLM未設定）は決定論的順位付けで実行
  const ordered = rankByImpactTags(selection.selected, impactTags, preferredModelHint);

  return {
    selected: ordered,
    skipped: selection.skipped,
    impactTags,
    fileTypes,
    relatedADRs,
    reviewMode,
    riskAssessment,
    testImpact,
    executionOrder: deriveExecutionOrder(ordered),
    estimatedCost: { tokens: estimateTokens(diffText ?? ''), source: 'token-estimator' },
    contextLift: computeContextLift(skills, ordered),
    snapshot: { fileTypes, relatedADRs, reviewMode, riskAssessment, testImpact, inferredPhase },
  };
}

// Re-export summarizeSkill for consumers that want the same view used by planner
export { summarizeSkill };
