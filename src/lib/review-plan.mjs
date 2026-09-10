/**
 * `river review plan` core — #802 Phase 3 (slices 1 + B-1)
 *
 * Scope: the public `river review plan --plan-only` entrypoint resolves
 * input artifacts (slice 1) and now also computes a deterministic skill
 * selection plan from the resolved `diff` artifact (B-1).
 *
 * Out of scope (later slices, design-gated): actual skill EXECUTION
 * (findings stay []), the LLM-backed planner modes (`--planner
 * order/prune`), `exec`/`verify`, the `--output`/`--format` contract
 * unification, the PLANGATE_REVIEW_CLI_READY flag, and a stable
 * `context.artifacts` field (deferred to a v2 schema per the versioning
 * policy embedded in review-artifact.schema.json).
 *
 * The emitted artifact conforms to schemas/review-artifact.schema.json
 * version "1". Resolved artifact paths are only attached under `debug`
 * (free-form) and only when `debug` is set, consistent with
 * cli-review-plan-spec.md.
 *
 * Skill selection reuses parseUnifiedDiff + buildExecutionPlan (the same
 * path tests/planner-dataset eval uses) with planner:undefined /
 * dryRun:true / llmEnabled:false, so no LLM call is ever made here.
 *
 * Pure-ish module: config loader, resolver, buildExecutionPlan and the
 * diff reader are injectable for tests.
 */

import path from 'node:path';
import { readFile } from 'node:fs/promises';

import { loadConfig as defaultLoadConfig } from '../config/loader.mjs';
import { resolveAllArtifacts as defaultResolveAllArtifacts } from '../config/artifact-resolver.mjs';
import { parseUnifiedDiff } from './diff-processor.mjs';
import { buildExecutionPlan as defaultBuildExecutionPlan } from '../../runners/core/review-runner.mjs';
import { generateReview as defaultGenerateReview } from './review-engine.mjs';
import { loadRiskMap as defaultLoadRiskMap } from './risk-map.mjs';
import { PHASES, PLANNER_MODES } from './planner-utils.mjs';
import { resolveAvailableContexts, resolveAvailableDependencies } from './utils.mjs';
import { scoreReview } from './scoring/engine.mjs';
import { scanArtifactsForHumanApproval } from './plan-review/approval-scan.mjs';
import { deriveLoopSignalFromArtifact } from './loop-signal.mjs';
import { deriveGateDecision } from './gate-decision.mjs';
import { computeStrictBlock } from './deterministic-gate.mjs';
import { runDeterministicExecGateIfEnabled } from './deterministic-exec-gate.mjs';
import { SEVERITY_RANK } from './finding-factory.mjs';
import { verifyExecutionManifest } from './execution-manifest.mjs';
import { createHash } from 'node:crypto';

const VALID_PHASES = new Set(PHASES);

/**
 * Default run-id generator for the Review Artifact `trace.run_id`. Mirrors the
 * format used by the result store (timestamp prefix + short random suffix) so
 * ids sort chronologically. Injectable for deterministic tests.
 */
function defaultGenerateRunId() {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  // padEnd guarantees a fixed 6-char suffix even when Math.random() yields a
  // short hex fraction (e.g. 0 → '', 0.5 → '8'), keeping run_id length stable.
  const rand = Math.random().toString(16).slice(2, 8).padEnd(6, '0');
  return `${ts}-${rand}`;
}

/**
 * Attach the additive Review Artifact fields introduced for #1045 A1
 * (#1139): top-level `decision` (verdict), `trace.run_id`, and `usage`.
 * All are additive over schema v1; artifacts that predate them stay valid.
 *
 * @param {object} artifact - the artifact being finalized (mutated)
 * @param {object} opts
 * @param {() => string} opts.generateRunId
 * @param {{provider?: string, modelName?: string} | null} [opts.modelConfig]
 * @param {boolean} [opts.llmUsed] - whether an LLM actually ran this review
 * @returns {object} the same artifact
 */
function finalizeArtifact(
  artifact,
  {
    generateRunId,
    modelConfig = null,
    llmUsed = false,
    humanApprovalRequired = false,
    gateContext = null,
  }
) {
  // decision: derive the top-level verdict from the findings present in the
  // artifact. Never let a scoring error break the artifact contract.
  try {
    artifact.decision = scoreReview(artifact.findings ?? [], { humanApprovalRequired }).verdict;
  } catch {
    // leave decision unset on scoring failure
  }

  // suggestedLoopSignal: additive layer-1 signal for agentic fix loops.
  // Derived after decision is set so the two are always consistent.
  // Never let derivation errors break the artifact contract.
  try {
    artifact.suggestedLoopSignal = deriveLoopSignalFromArtifact(artifact);
  } catch {
    // leave suggestedLoopSignal unset on derivation failure
  }

  // gate: machine-readable gate signal for loop-running hosts (Epic #1347 S2).
  // Derived after decision/suggestedLoopSignal (they are inputs). Only the
  // exec path supplies gateContext — the replay path omits it because a
  // replayed artifact's risk-map / diff context is not this run's context.
  // Additive: never let derivation errors break the artifact contract.
  if (gateContext) {
    try {
      const blockingFindings = (artifact.findings ?? []).filter(
        (f) => f != null && (f.severity === 'critical' || f.severity === 'major')
      ).length;
      artifact.gate = deriveGateDecision({
        loopSignal: artifact.suggestedLoopSignal,
        decision: artifact.decision,
        humanApprovalRequired,
        humanApprovalMode: gateContext.humanApprovalMode ?? null,
        riskAction: gateContext.riskAction,
        blockingFindings,
        changedFiles: gateContext.changedFiles ?? [],
        reviewExecuted: gateContext.reviewExecuted === true,
        artifactStatus: gateContext.artifactStatus ?? null,
        riskMapPresent: gateContext.riskMapPresent === true,
        riskMapDigest: gateContext.riskMapDigest ?? null,
        strictBlock: gateContext.strictBlock === true,
        // Epic #1347 §11.8 (c2) (#1401): deterministic gate could not run → 5c.
        deterministicUnrunnable: gateContext.deterministicUnrunnable === true,
        config: gateContext.config ?? {},
      });
    } catch {
      // leave gate unset on derivation failure
    }
  }

  artifact.trace = { run_id: generateRunId() };

  // usage: only when an LLM actually ran and we know the model. Token / cost
  // numbers are surfaced by callers that have them; provider/model are the
  // deterministic minimum available here.
  if (llmUsed && modelConfig && (modelConfig.provider || modelConfig.modelName)) {
    artifact.usage = {};
    if (modelConfig.provider) artifact.usage.provider = modelConfig.provider;
    if (modelConfig.modelName) artifact.usage.model = modelConfig.modelName;
  }

  return artifact;
}
const VALID_PLANNER_MODES = new Set(PLANNER_MODES);
const MODEL_HINTS = new Set(['cheap', 'balanced', 'high-accuracy']);

/**
 * Decide which of two possible diff sources supplies the review diff, and say
 * on stderr when the two disagree (#2046 review, major 1).
 *
 * `pages/reference/artifact-input-contract.md` § `diff` declares that River
 * Review runs git itself only when the diff is NOT supplied as an artifact, so
 * an artifact the caller actually specified — `--artifact diff=<path>` (tier
 * `cli`) or `artifacts.diff` in the config (tier `config`) — wins over
 * `--base`. The cwd-default `diff.patch` (tier `cwd`) is auto-detected rather
 * than specified, so a typed `--base` wins over it; #2046 exists precisely
 * because a stale file in the working directory must not decide the range.
 *
 * Either way the loser is announced. Silently discarding the caller's input is
 * the failure mode #2046 was filed about; replacing it with a different silent
 * discard would not be a fix.
 *
 * @param {{diffText: string, context?: object}|undefined} diffOverride
 * @param {{exists?: boolean, path?: string|null, source?: string|null}|undefined} diffRes
 * @param {{warn?: (msg: string) => void}} [opts] injectable for tests
 * @returns {{useOverride: boolean}}
 */
export function resolveDiffSource(diffOverride, diffRes, { warn = console.warn } = {}) {
  const hasOverride = diffOverride != null && typeof diffOverride.diffText === 'string';
  if (!hasOverride) return { useOverride: false };

  const artifactPresent = Boolean(diffRes?.exists && diffRes.path);
  const artifactSpecified = diffRes?.source === 'cli' || diffRes?.source === 'config';
  const artifactExplicit = artifactPresent && artifactSpecified;

  // A specified-but-missing artifact loses to `--base` on the `exists` check
  // alone, which reads as "the artifact took precedence" to nobody: the caller
  // named a file and got a git range instead. Say so before falling through.
  if (artifactSpecified && !artifactPresent) {
    warn(
      `Warning: the \`diff\` artifact specified via ` +
        `${diffRes.source === 'cli' ? '--artifact diff=' : 'river.config'} (${diffRes.path}) ` +
        'does not exist; using the --base range instead.'
    );
  }

  if (artifactExplicit) {
    warn(
      `Warning: --base is ignored for the review diff. The \`diff\` artifact specified via ` +
        `${diffRes.source === 'cli' ? '--artifact diff=' : 'river.config'} (${diffRes.path}) ` +
        'takes precedence (pages/reference/artifact-input-contract.md § diff).'
    );
    return { useOverride: false };
  }
  if (artifactPresent) {
    warn(
      `Warning: --base takes precedence over the auto-detected diff artifact ${diffRes.path}; ` +
        'that file is not used. Pass --artifact diff=<path> to use it instead.'
    );
  }
  return { useOverride: true };
}

/**
 * The changed-file set for a diff that {@link resolveDiffSource} selected.
 *
 * When the diff came from `--base`, git already answered this question
 * (`git diff --name-only`, via collectRepoDiff) and that answer is the SSoT:
 * `parseUnifiedDiff` only sees entries carrying `---`/`+++` headers, so
 * deriving the set from the diff text drops binary changes and pure renames
 * (#2046 review). A rename-only range parsed to zero files and produced an
 * `ok` review of nothing. Artifact-supplied diffs have no git answer, so there
 * the parsed set stays the only available one.
 *
 * @param {{context?: {changedFiles?: string[]}}|undefined} diffOverride
 * @param {boolean} useOverride
 * @param {{files?: Array<{path?: string}>}} parsedDiff
 * @returns {string[]}
 */
export function resolveChangedFiles(diffOverride, useOverride, parsedDiff) {
  if (useOverride && Array.isArray(diffOverride?.context?.changedFiles)) {
    return [...diffOverride.context.changedFiles];
  }
  // Exclude /dev/null (the deletion/creation sentinel) so deleted or created
  // files are not reported as a literal path.
  return (parsedDiff?.files ?? []).map((f) => f?.path).filter((p) => p && p !== '/dev/null');
}

/** Raised for argument/config errors that map to CLI exit code 3. */
export class ReviewPlanError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ReviewPlanError';
  }
}

/**
 * Compute membership drift between the replay-time changed files and the
 * files implied by the source plan's snapshot (#936). The source plan does
 * NOT snapshot diff bytes (a2-3-replay design), so only membership drift
 * (files added/removed) is detectable — content-level "modified" cannot be
 * derived and is intentionally omitted. Returns null when the source plan
 * predates the snapshot (pre-A2-3) so callers can skip the drift block.
 *
 * @param {string[]} currentFiles changed file paths at replay time
 * @param {object|null} sourceSnapshot the carried-over plan snapshot
 * @returns {{ filesAdded: string[], filesRemoved: string[], summary: string }|null}
 */
export function computeReplayDrift(currentFiles, sourceSnapshot) {
  const fileTypes = sourceSnapshot?.fileTypes;
  if (!fileTypes || typeof fileTypes !== 'object') return null;
  const notSentinel = (p) => p && p !== '/dev/null';
  const sourceFiles = [...new Set(Object.values(fileTypes).flat().filter(notSentinel))];
  const cur = [...new Set((currentFiles ?? []).filter(notSentinel))];
  const srcSet = new Set(sourceFiles);
  const curSet = new Set(cur);
  const filesAdded = cur.filter((f) => !srcSet.has(f)).sort();
  const filesRemoved = sourceFiles.filter((f) => !curSet.has(f)).sort();
  const drifted = filesAdded.length > 0 || filesRemoved.length > 0;
  const summary = drifted
    ? `${cur.length} changed file(s) at replay vs ${sourceFiles.length} in source plan (+${filesAdded.length}/-${filesRemoved.length}); content-level changes not detectable (plan does not snapshot diff bytes)`
    : `no membership drift (${cur.length} changed file(s), same set as source plan)`;
  return { filesAdded, filesRemoved, summary };
}

/**
 * Replay a previously emitted plan as a Review Artifact (`--plan <path>`).
 *
 * Contract (#802 Phase 3 — replay foundation):
 *   - Input may be either a full Review Artifact (with `plan` and `phase`)
 *     or the bare plan object (must contain `selectedSkills`).
 *   - The source plan's `phase` is authoritative; the CLI `--phase` value
 *     is intentionally ignored to preserve determinism of the replay.
 *   - Artifact resolution and `buildExecutionPlan` are NOT re-run, so the
 *     selectedSkills/skippedSkills are echoed verbatim (subject to schema
 *     normalization). This locks the spec contract: "external plan wins".
 *   - Skill execution is out of scope here; `findings` stays `[]` and
 *     `status` is derived from the plan's selectedSkills emptiness, the
 *     same as `runReviewPlan`'s no-changes branch.
 *
 * @param {object} opts
 * @param {string} opts.planFile  Path to the plan JSON file.
 * @param {boolean} [opts.debug]  Attach replay debug info under `debug`.
 * @param {() => string} [opts.now]
 * @param {(p: string) => Promise<string>} [opts.readFileImpl]
 * @returns {Promise<object>} Review Artifact (schema version "1")
 */
export async function runReviewExecReplay({
  planFile,
  debug = false,
  now = () => new Date().toISOString(),
  readFileImpl = (p) => readFile(p, 'utf8'),
  // #878 A2-3-impl: execution params. When executeReview is true and a diff
  // artifact resolves, the replay path invokes generateReview with the source
  // plan's selectedSkills and the carried-over snapshot context (no re-plan).
  executeReview = false,
  cwd = process.cwd(),
  cliArtifacts = {},
  artifactsDir,
  // #2046: diff resolved by the caller from `--base` (see
  // src/cli/commands/review.mjs resolveBaseRepoDiff): `{ diffText, context }`.
  // Precedence against the `diff` artifact is decided by resolveDiffSource;
  // when this source wins, an empty `diffText` means "the base range is empty"
  // and must NOT fall back to a stale on-disk diff artifact.
  diffOverride,
  loadConfigImpl = defaultLoadConfig,
  resolveAllArtifactsImpl = defaultResolveAllArtifacts,
  generateReviewImpl = defaultGenerateReview,
  generateRunId = defaultGenerateRunId,
} = {}) {
  if (!planFile || typeof planFile !== 'string') {
    throw new ReviewPlanError('--plan requires a file path.');
  }

  let raw;
  try {
    raw = await readFileImpl(planFile);
  } catch (err) {
    throw new ReviewPlanError(`Failed to read --plan file "${planFile}": ${err.message}`);
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new ReviewPlanError(`Failed to parse --plan JSON at "${planFile}": ${err.message}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ReviewPlanError(`--plan JSON at "${planFile}" must be a JSON object.`);
  }

  // Accept either a full Review Artifact (extract .plan) or a bare plan.
  // A full artifact is identified by `version: "1"` (the schema's required
  // const) plus a `plan` object; falling back to `parsed.plan` alone would
  // accept arbitrary wrappers, so require both.
  const looksLikeFullArtifact =
    parsed.version === '1' &&
    parsed.plan &&
    typeof parsed.plan === 'object' &&
    !Array.isArray(parsed.plan);
  const sourcePlan = looksLikeFullArtifact ? parsed.plan : parsed;
  const phaseFromArtifact =
    looksLikeFullArtifact && typeof parsed.phase === 'string' && VALID_PHASES.has(parsed.phase)
      ? parsed.phase
      : null;

  if (!Array.isArray(sourcePlan.selectedSkills)) {
    throw new ReviewPlanError(
      `--plan JSON at "${planFile}" must have plan.selectedSkills (array). ` +
        'Pass a Review Artifact produced by `river review plan` or its bare `plan` object.'
    );
  }

  const plannerMode =
    typeof sourcePlan.plannerMode === 'string' && VALID_PLANNER_MODES.has(sourcePlan.plannerMode)
      ? sourcePlan.plannerMode
      : 'off';

  const selectedSkills = sourcePlan.selectedSkills.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new ReviewPlanError(
        `--plan plan.selectedSkills[${index}] must be an object with an id.`
      );
    }
    if (typeof entry.id !== 'string' || entry.id.length === 0) {
      throw new ReviewPlanError(
        `--plan plan.selectedSkills[${index}].id must be a non-empty string.`
      );
    }
    const out = { id: entry.id, name: typeof entry.name === 'string' ? entry.name : entry.id };
    if (VALID_PHASES.has(entry.phase)) out.phase = entry.phase;
    if (MODEL_HINTS.has(entry.modelHint)) out.modelHint = entry.modelHint;
    return out;
  });

  const skippedRaw = Array.isArray(sourcePlan.skippedSkills) ? sourcePlan.skippedSkills : [];
  const skippedSkills = skippedRaw.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      throw new ReviewPlanError(
        `--plan plan.skippedSkills[${index}] must be an object with id and reasons.`
      );
    }
    if (typeof entry.id !== 'string' || entry.id.length === 0) {
      throw new ReviewPlanError(
        `--plan plan.skippedSkills[${index}].id must be a non-empty string.`
      );
    }
    const reasons = Array.isArray(entry.reasons) ? entry.reasons.map(String) : [];
    return { id: entry.id, reasons };
  });

  const phase = phaseFromArtifact ?? 'midstream';

  // #2054 PR-4: when the source artifact carries an Execution Manifest, check
  // its integrity before replaying against it. A mismatch is a WARNING and a
  // debug note only — the replay still runs and gate / decision / findings
  // are untouched (ADR-009 RA-1: the manifest records, it never judges). The
  // point is that a tampered or hand-edited source plan is detectable, not
  // that it is refused; refusal would be a gate this module has no mandate for.
  // A source without a manifest is not checked and not warned about: artifacts
  // that predate the manifest are valid as they are (AC 4).
  let sourceManifestVerification = null;
  if (looksLikeFullArtifact && parsed.executionManifest != null) {
    try {
      const { verified, mismatches } = verifyExecutionManifest(parsed.executionManifest);
      sourceManifestVerification = { verified, mismatches };
    } catch (err) {
      sourceManifestVerification = { verified: false, mismatches: [`invalid: ${err.message}`] };
    }
    if (!sourceManifestVerification.verified) {
      console.warn(
        `Warning: the execution manifest in --plan "${planFile}" does not verify ` +
          `(${sourceManifestVerification.mismatches.join(', ')}); ` +
          'the source plan may have been edited since it was produced. Replay continues.'
      );
    }
  }

  // #878 A2-3-impl: read the carry-over snapshot the planner wrote (A2-3-runners
  // #933). Contract: replay does NOT re-derive these — it trusts the values
  // captured at plan-creation time, avoiding context-snapshot drift.
  const sourceSnapshot =
    parsed.debug &&
    typeof parsed.debug === 'object' &&
    parsed.debug.execution &&
    typeof parsed.debug.execution === 'object' &&
    parsed.debug.execution.snapshot &&
    typeof parsed.debug.execution.snapshot === 'object'
      ? parsed.debug.execution.snapshot
      : null;

  const artifact = {
    version: '1',
    timestamp: now(),
    phase,
    status: selectedSkills.length > 0 ? 'ok' : 'no-changes',
    findings: [],
    plan: { plannerMode, selectedSkills, skippedSkills },
  };

  let executionTrace = null;
  let replayDrift = null;
  let replayChangedFiles = [];
  let useOverrideForContext = false;
  // Whether a diff was actually resolved on this run. `[]` must mean "we looked
  // and the range was empty", never "we never looked" (#2046 review round 3).
  let replayDiffResolved = false;
  // Captured from config (when loaded for execution) so finalizeArtifact can
  // surface usage.provider / usage.model when an LLM actually runs.
  let modelConfigForUsage = null;
  if (executeReview && selectedSkills.length > 0) {
    // Resolve the diff from the CURRENT working tree (or --artifact), not from
    // the plan. The plan does not snapshot diff bytes (design decision in
    // docs/development/a2-3-replay-execution-design.md). Without a diff there
    // is nothing to execute against, so we fall back to the echo contract.
    let config = {};
    try {
      config = await loadConfigImpl(cwd);
    } catch (err) {
      throw new ReviewPlanError(`Failed to load config: ${err.message}`);
    }
    modelConfigForUsage = config?.model ?? null;
    const configArtifacts =
      config && typeof config.artifacts === 'object' && config.artifacts ? config.artifacts : {};
    const detectionRoot = artifactsDir ? path.resolve(cwd, artifactsDir) : cwd;
    const resolved = await resolveAllArtifactsImpl({
      cliArgs: cliArtifacts,
      configArtifacts,
      cwd: detectionRoot,
    });
    const diffRes = resolved?.diff;
    const { useOverride } = resolveDiffSource(diffOverride, diffRes);
    useOverrideForContext = useOverride;
    if (useOverride ? diffOverride.diffText.length > 0 : diffRes?.exists && diffRes.path) {
      let diffText;
      if (useOverride) {
        diffText = diffOverride.diffText;
      } else {
        try {
          diffText = await readFileImpl(diffRes.path);
        } catch (err) {
          throw new ReviewPlanError(`Failed to read diff artifact: ${err.message}`);
        }
      }
      const parsedDiff = parseUnifiedDiff(diffText);
      replayDiffResolved = true;
      replayChangedFiles = resolveChangedFiles(diffOverride, useOverride, parsedDiff);
      // #936: report (non-blocking) membership drift between the replay-time
      // diff and the source plan's snapshot. Null when the snapshot predates A2-3.
      replayDrift = computeReplayDrift(replayChangedFiles, sourceSnapshot);
      let review;
      try {
        review = await generateReviewImpl({
          diff: { diffText, files: parsedDiff.files ?? [] },
          // Replay uses the source plan's selectedSkills verbatim — NO re-plan.
          plan: { selected: selectedSkills },
          phase,
          dryRun: false,
          config,
          // Carry-over from the source plan's snapshot (#933). When the source
          // predates A2-3-runners, these are undefined and generateReview uses
          // its engine defaults — a graceful, not silent, degradation.
          fileTypes: sourceSnapshot?.fileTypes ?? undefined,
          relatedADRs: sourceSnapshot?.relatedADRs ?? undefined,
          reviewMode: sourceSnapshot?.reviewMode ?? undefined,
          riskAssessment: sourceSnapshot?.riskAssessment ?? undefined,
        });
      } catch (err) {
        throw new ReviewPlanError(`Failed to execute replay review skills: ${err.message}`);
      }
      const rawFindings = Array.isArray(review?.findings) ? review.findings : [];
      artifact.findings = rawFindings.map((f, i) => normalizeFindingForArtifact(f, i, phase));
      executionTrace = {
        // #1868: generateReview が debug.execution へ積んだ観測（ADR-006 の
        // promptCompiler など）を先に展開してから、経路側の trace キーを重ねる。
        // 展開しないと replay 経路だけ観測が欠測し、欠測は「差が無かった」と
        // 区別できない。順序は「経路側が勝つ」で固定する。skillsExecuted 等は
        // この経路が artifact 契約として持つ値であり、engine 側が将来同名キーを
        // 足しても上書きされてはならない。
        ...(review?.debug?.execution ?? {}),
        skillsExecuted: selectedSkills.length,
        findingsCount: artifact.findings.length,
        llmUsed: review?.debug?.llmUsed === true,
        llmSkipped: review?.debug?.llmSkipped ?? null,
        heuristicsUsed: review?.debug?.heuristicsUsed === true,
        replaySnapshotUsed: sourceSnapshot != null,
      };
    }
  } else if (diffOverride != null) {
    // `review exec --plan <file> --dry-run` (and a source plan with no selected
    // skills) never reaches the diff-resolution block above, so `--base` is not
    // consumed here at all. Announcing it is the same rule the precedence
    // decision follows: an input the caller typed is never dropped in silence
    // (#2046 review round 3, major 1).
    console.warn(
      'Warning: --base has no effect on this run: `review exec --plan <file>` echoes the ' +
        'source plan without resolving a diff (--dry-run, or the source plan selected no skills).'
    );
  }

  // #2046 review: the replay path accepts `--base` too, so it reports the
  // reviewed range in the same place the plan path does. Emitted ONLY when a
  // diff was actually resolved — an artifact that declares `changedFiles: []`
  // for a run that never looked at any diff is worse than one that stays
  // silent, because a consumer cannot tell the two apart.
  if (replayDiffResolved) {
    artifact.context = {
      ...(useOverrideForContext && diffOverride.context ? diffOverride.context : {}),
      changedFiles: replayChangedFiles,
    };
  }

  if (debug || executionTrace) {
    artifact.debug = artifact.debug ?? {};
    artifact.debug.replay = {
      source: planFile,
      sourcePhase: phaseFromArtifact,
      sourceTimestamp: typeof parsed.timestamp === 'string' ? parsed.timestamp : null,
      ...(replayDrift ? { drift: replayDrift } : {}),
      ...(sourceManifestVerification ? { sourceManifest: sourceManifestVerification } : {}),
    };
    if (executionTrace) artifact.debug.execution = executionTrace;
  }

  finalizeArtifact(artifact, {
    generateRunId,
    modelConfig: modelConfigForUsage,
    llmUsed: executionTrace?.llmUsed === true,
  });

  return artifact;
}

/**
 * Resolve the effective output format for the `river review` namespace
 * from parsed CLI args (#802 Phase 3 PR-2).
 *
 * Contract (per cli-review-plan-spec / plangate-cli-roadmap): canonical
 * is `--output <format>`; `--format` is a compat alias. The unified
 * format set is text|markdown|json. `json` (default) and `markdown`
 * (#976) are honored; `text` is not yet implemented. When neither flag is
 * given the format falls back to `json` for backward compatibility with
 * the slice-1/B-1/B-2 behavior (and the plangate-review workflow).
 *
 * @param {{output?:string, outputExplicit?:boolean, format?:string|null,
 *   formatExplicit?:boolean}} parsed
 * @returns {'json'|'markdown'}
 * @throws {ReviewPlanError} on an unsupported or conflicting combination
 */
export function resolveReviewOutputFormat({
  output = 'text',
  outputExplicit = false,
  format = null,
  formatExplicit = false,
} = {}) {
  if (outputExplicit && formatExplicit && output !== format) {
    throw new ReviewPlanError(
      `--output "${output}" conflicts with --format "${format}". ` +
        'Pass only one, or matching values.'
    );
  }
  let effective;
  if (formatExplicit) effective = format;
  else if (outputExplicit) effective = output;
  else effective = 'json'; // backward-compatible default
  if (effective === 'json') return 'json';
  if (effective === 'markdown') return 'markdown'; // #976: human-readable artifact rendering
  if (effective === 'text') {
    throw new ReviewPlanError(
      `Output format "text" is not implemented yet for river review; use "json" or "markdown".`
    );
  }
  throw new ReviewPlanError(
    `Unsupported output format "${effective}" for river review. Expected: json | markdown (text not yet implemented).`
  );
}

/**
 * Evaluate the review gate exit code from an artifact's findings (#976).
 *
 * Opt-in: gating is only meaningful when `--fail-on` / `--warn-on` are
 * provided by the caller; the CLI keeps exit 0 otherwise (non-breaking).
 * `--advisory-only` forces exit 0 regardless of findings (report-only).
 *
 * @param {object} artifact Review Artifact (schema "1")
 * @param {{ failOn?: string, warnOn?: string, advisoryOnly?: boolean }} [opts]
 * @returns {{ code: 0|1|2, level: 'pass'|'warn'|'fail', maxSeverity: string|null }}
 */
export function evaluateReviewGate(
  artifact,
  { failOn = 'critical', warnOn = 'major', advisoryOnly = false } = {}
) {
  const findings = Array.isArray(artifact?.findings) ? artifact.findings : [];
  let maxRank = -1;
  let maxSeverity = null;
  for (const f of findings) {
    const rank = SEVERITY_RANK[f?.severity];
    if (rank !== undefined && rank > maxRank) {
      maxRank = rank;
      maxSeverity = f.severity;
    }
  }
  if (advisoryOnly || maxRank < 0) {
    return { code: 0, level: 'pass', maxSeverity };
  }
  const failRank = SEVERITY_RANK[failOn] ?? SEVERITY_RANK.critical;
  const warnRank = SEVERITY_RANK[warnOn] ?? SEVERITY_RANK.major;
  if (maxRank >= failRank) return { code: 1, level: 'fail', maxSeverity };
  if (maxRank >= warnRank) return { code: 2, level: 'warn', maxSeverity };
  return { code: 0, level: 'pass', maxSeverity };
}

/** skill objects carry their fields under `.metadata` (or inline). */
function meta(skill) {
  return skill?.metadata ?? skill ?? {};
}

/** Project a selected skill onto the schema's selectedSkills item shape. */
function toSelectedView(skill) {
  const m = meta(skill);
  const view = { id: String(m.id ?? ''), name: String(m.name ?? m.id ?? '') };
  if (VALID_PHASES.has(m.phase)) view.phase = m.phase;
  if (MODEL_HINTS.has(m.modelHint)) view.modelHint = m.modelHint;
  return view;
}

/**
 * Run `river review plan --plan-only` and return a schema-valid Review
 * Artifact (version "1").
 *
 * @param {object} opts
 * @param {string} [opts.cwd]
 * @param {string} [opts.phase]
 * @param {boolean} [opts.planOnly]
 * @param {Record<string,string>} [opts.cliArtifacts]
 * @param {string} [opts.artifactsDir]
 * @param {boolean} [opts.debug]
 * @param {boolean} [opts.executionDeferred] When true, mark the artifact as
 *   "plan-resolved, execution intentionally not performed yet" by adding
 *   `debug.executionDeferred: true`. Used by `river review exec` (no flags)
 *   until A2 wires the skill execution adapter (#802 Phase 3). Has no
 *   effect on `selectedSkills`/`skippedSkills` — the plan path is identical
 *   to `--dry-run`; this flag is the marker so consumers can distinguish
 *   "deferred" from "really did nothing".
 * @param {boolean} [opts.executeReview] When true (#802 Phase 3 A2-1), the
 *   execution plan is built with `llmEnabled: true` so LLM-backed skills
 *   are selectable, and `generateReview` is invoked to populate the
 *   artifact `findings` array. Mutually exclusive with `executionDeferred`.
 * @param {string[]} [opts.availableContexts] Contexts (artifact IDs) that
 *   should satisfy a skill's `inputContext` requirement during selection.
 *   When omitted, defaults to `['diff']` if a diff artifact is resolved.
 *   Extra contexts from `RIVER_AVAILABLE_CONTEXTS` are always merged in
 *   so CI environments can grant additional artifacts (tests, junit, ...)
 *   without code changes. Without this, `buildExecutionPlan` receives an
 *   empty list and every skill that declares `inputContext: ['diff']` is
 *   silently skipped — the dogfood failure mode that motivated A2-fix-1.
 * @param {string[]} [opts.availableDependencies] Optional dependency IDs
 *   (e.g. `code_search`, `test_runner`). When omitted and the env var
 *   `RIVER_AVAILABLE_DEPENDENCIES` is unset, dependency-based skipping is
 *   disabled (backward-compatible). `RIVER_DEPENDENCY_STUBS=1` opts into
 *   the default stub set so all known dependencies appear available.
 * @param {() => string} [opts.now] - timestamp factory (ISO 8601)
 * @param {(repoRoot: string) => Promise<object>} [opts.loadConfigImpl]
 * @param {Function} [opts.resolveAllArtifactsImpl]
 * @param {Function} [opts.buildExecutionPlanImpl]
 * @param {Function} [opts.generateReviewImpl] Injectable for tests so the
 *   adapter wiring can be verified without calling an external LLM.
 * @param {(repoRoot: string) => Promise<object|null>} [opts.loadRiskMapImpl]
 *   Injectable risk map loader. Returns `null` if no risk map is configured
 *   (the default `.river/risk-map.yaml` path is missing), preserving the
 *   backward-compatible "no risk-based action" behaviour.
 * @param {(p: string) => Promise<string>} [opts.readFileImpl]
 * @param {((candidates: object[], text: string, artifactKind: string) => Promise<boolean>)|null} [opts.humanApprovalAdjudicator]
 *   LLM adjudicator for LOW-confidence human-approval candidates (#1348 S1).
 *   `null` forces regex-only mode. When omitted (undefined) the default is
 *   derived from the environment via `createHumanApprovalAdjudicator`, but
 *   ONLY on the `executeReview` path — the `--plan-only` path keeps its
 *   documented "no LLM call is ever made here" contract. The adjudicator is
 *   escalation-only: it can never overturn a HIGH-confidence regex verdict
 *   (see adjudicateHumanApproval).
 * @returns {Promise<object>} Review Artifact (schema version "1") with a
 *   non-enumerable `resolved` resolver result for in-process callers.
 */
export async function runReviewPlan({
  cwd = process.cwd(),
  phase = 'midstream',
  planOnly = false,
  cliArtifacts = {},
  artifactsDir,
  debug = false,
  executionDeferred = false,
  executeReview = false,
  skillIds = null,
  availableContexts,
  availableDependencies,
  // #2046: diff resolved by the caller from `--base` (see
  // src/cli/commands/review.mjs resolveBaseRepoDiff): `{ diffText, context }`.
  // Precedence against the `diff` artifact is decided by resolveDiffSource;
  // when this source wins, an empty `diffText` means "the base range is empty"
  // and must NOT fall back to a stale on-disk diff artifact.
  diffOverride,
  humanApprovalAdjudicator,
  now = () => new Date().toISOString(),
  loadConfigImpl = defaultLoadConfig,
  resolveAllArtifactsImpl = defaultResolveAllArtifacts,
  buildExecutionPlanImpl = defaultBuildExecutionPlan,
  generateReviewImpl = defaultGenerateReview,
  loadRiskMapImpl = defaultLoadRiskMap,
  readFileImpl = (p) => readFile(p, 'utf8'),
  generateRunId = defaultGenerateRunId,
} = {}) {
  if (executeReview && executionDeferred) {
    throw new ReviewPlanError(
      'executeReview and executionDeferred are mutually exclusive options.'
    );
  }
  if (!planOnly) {
    throw new ReviewPlanError(
      'river review plan currently supports only --plan-only (Phase 3). ' +
        'Skill execution is not yet wired.'
    );
  }
  if (!VALID_PHASES.has(phase)) {
    throw new ReviewPlanError(
      `Invalid --phase "${phase}". Expected one of: upstream, midstream, downstream.`
    );
  }

  let config;
  try {
    config = await loadConfigImpl(cwd);
  } catch (err) {
    throw new ReviewPlanError(`Failed to load config: ${err.message}`);
  }

  // Risk map is optional (loadRiskMap returns null when .river/risk-map.yaml
  // is missing). A malformed risk map is surfaced as a ReviewPlanError so
  // the exec path fails loudly instead of silently dropping the risk
  // signal — see Codex/Gemini multi-perspective review on the silent-skip
  // cleanup epoch.
  let riskMap = null;
  try {
    riskMap = await loadRiskMapImpl(cwd);
  } catch (err) {
    throw new ReviewPlanError(`Failed to load risk map: ${err.message}`);
  }
  // Hoisted gate-derivation context (Epic #1347 S2): populated inside the
  // diff / human-approval branches below, consumed at finalizeArtifact.
  let gateChangedFiles = [];
  let gateHumanApprovalModes = [];
  let gateRiskAction; // plan.riskAssessment.aggregateAction (C1: artifact.plan does NOT carry it)
  // Epic #1347 S4 (#1351): deterministic strict_block on the exec-execute path.
  // Only the live `--execute` branch has full skill objects (plan.selected) +
  // findings; the `--plan` replay path projects skills to schema views without
  // deterministicGate, so it stays advisory (strict_block not derivable there).
  let gateStrictBlock = false;
  // Epic #1347 §11.8 (c2) (#1401): deterministic-gate COMMAND execution signal.
  // Opt-in only (double-gated below); false on the replay path and whenever the
  // host has not enabled the executor, so the artifact contract is unchanged.
  let gateDeterministicUnrunnable = false;

  const configArtifacts =
    config && typeof config.artifacts === 'object' && config.artifacts ? config.artifacts : {};

  const detectionRoot = artifactsDir ? path.resolve(cwd, artifactsDir) : cwd;

  const resolved = await resolveAllArtifactsImpl({
    cliArgs: cliArtifacts,
    configArtifacts,
    cwd: detectionRoot,
  });

  const artifact = {
    version: '1',
    timestamp: now(),
    phase,
    status: 'ok',
    findings: [],
    plan: { plannerMode: 'off', selectedSkills: [], skippedSkills: [] },
  };

  const diffRes = resolved?.diff;
  const { useOverride } = resolveDiffSource(diffOverride, diffRes);
  let executionTrace = null;
  // Same rule as the replay path: `changedFiles: []` may only be written when a
  // diff source was actually consulted. `--base` counts as consulted even when
  // the range came back empty — that empty answer is git's, and knowing which
  // range produced it is the point of #2046.
  let diffResolved = useOverride;
  if (useOverride ? diffOverride.diffText.length > 0 : diffRes?.exists && diffRes.path) {
    diffResolved = true;
    let diffText;
    if (useOverride) {
      diffText = diffOverride.diffText;
    } else {
      try {
        diffText = await readFileImpl(diffRes.path);
      } catch (err) {
        throw new ReviewPlanError(`Failed to read diff artifact: ${err.message}`);
      }
    }
    // Parse the diff once and reuse the result. The same parser used to
    // power deriveChangedFiles (planning input) also exposes the per-file
    // structure generateReview needs (execution input).
    const parsedDiff = parseUnifiedDiff(diffText);
    const changedFiles = resolveChangedFiles(diffOverride, useOverride, parsedDiff);
    gateChangedFiles = changedFiles;

    // Declare which artifact contexts are actually available so the plan
    // layer's inputContext check doesn't silently skip skills that need a
    // diff. We are in the diff-resolved branch, so `alwaysInclude: ['diff']`
    // guarantees that a CLI override like `--context tests` does NOT drop
    // 'diff' from the set (would re-introduce the A1 silent-skip failure).
    // env var RIVER_AVAILABLE_CONTEXTS is merged in for CI overrides.
    const effectiveAvailableContexts = resolveAvailableContexts(availableContexts, {
      alwaysInclude: ['diff'],
    });

    // Same silent-skip pattern for dependencies. `null` is the documented
    // disabled sentinel — dependency-based skipping is opt-in via env or
    // `--dependency` so legacy invocations stay backward-compatible.
    const effectiveAvailableDependencies = resolveAvailableDependencies(availableDependencies);

    // The plan layer's selection rules differ by exec mode: for
    // plan-only/dry-run/deferred we restrict to heuristic skills, while
    // executeReview must allow LLM-backed skills so the planner can
    // produce a meaningful selectedSkills set for generateReview.
    let plan;
    try {
      plan = await buildExecutionPlanImpl({
        phase,
        changedFiles,
        diffText,
        plannerMode: 'off',
        planner: undefined,
        dryRun: !executeReview,
        llmEnabled: executeReview,
        repoRoot: cwd,
        riskMap,
        // #976/#1027: honor --skill-set in the review namespace, not just
        // `river run`. null/empty = no restriction (all candidates).
        skillIds,
        availableContexts: effectiveAvailableContexts,
        availableDependencies: effectiveAvailableDependencies,
      });
    } catch (err) {
      throw new ReviewPlanError(`Failed to build execution plan: ${err.message}`);
    }

    gateRiskAction = plan?.riskAssessment?.aggregateAction;
    // Epic #1347 S2 (#1349): additive plan declarations from buildExecutionPlan.
    if (Array.isArray(plan?.executionOrder)) artifact.plan.executionOrder = plan.executionOrder;
    if (plan?.estimatedCost) artifact.plan.estimatedCost = plan.estimatedCost;
    if (plan?.contextLift) artifact.plan.contextLift = plan.contextLift;
    artifact.plan.selectedSkills = (plan.selected ?? []).map(toSelectedView);
    artifact.plan.skippedSkills = (plan.skipped ?? []).map((s) => ({
      id: String(meta(s.skill).id ?? ''),
      reasons: Array.isArray(s.reasons) ? s.reasons.map(String) : [],
    }));

    if (executeReview) {
      let review;
      try {
        // Pass the loaded config plus the analysis context that
        // buildExecutionPlan already derived (fileTypes / relatedADRs /
        // reviewMode). generateReview uses fileTypes for the verifier's
        // file-phase coherence check and the others for prompt enrichment
        // — when omitted, the prompt loses ADR cross-references and the
        // reviewMode-driven budget preset, which is a quiet quality loss
        // rather than a hard failure (Codex silent-skip taxonomy).
        review = await generateReviewImpl({
          diff: { diffText, files: parsedDiff.files ?? [] },
          plan: { selected: plan.selected ?? [] },
          phase,
          dryRun: false,
          config,
          fileTypes: plan.fileTypes ?? undefined,
          relatedADRs: plan.relatedADRs ?? undefined,
          reviewMode: plan.reviewMode ?? undefined,
          riskAssessment: plan.riskAssessment ?? undefined,
        });
      } catch (err) {
        throw new ReviewPlanError(`Failed to execute review skills: ${err.message}`);
      }
      const rawFindings = Array.isArray(review?.findings) ? review.findings : [];
      artifact.findings = rawFindings.map((f, i) => normalizeFindingForArtifact(f, i, phase));
      // Deterministic strict_block (#1351): join over the raw findings (which
      // still carry ruleId = skillId) and the full selected skills.
      gateStrictBlock = computeStrictBlock({
        findings: rawFindings,
        selected: plan.selected ?? [],
      }).strictBlock;

      // Epic #1347 §11.8 (c2) (#1401): deterministic-gate command execution.
      // Wiring, security invariants (double-gated + OFF by default + opt-out
      // no-import + trust boundary + fail-safe) and the strict_block/unrunnable
      // contract all live in runDeterministicExecGateIfEnabled (SSoT, P2 #1434).
      const execGate = await runDeterministicExecGateIfEnabled({
        env: process.env,
        selected: plan.selected ?? [],
        reviewSourceDir: cwd,
        changedFiles: gateChangedFiles,
      });
      if (execGate.strictBlock === true) gateStrictBlock = true;
      gateDeterministicUnrunnable = execGate.deterministicUnrunnable === true;
      executionTrace = {
        // #1868: replay 経路（runReviewExecReplay）と同じ順序で engine 側の
        // debug.execution 観測を引き継ぐ。2 経路で挙動を揃えないと、同じ設定でも
        // 経路によって観測が残ったり消えたりする。
        ...(review?.debug?.execution ?? {}),
        skillsExecuted: artifact.plan.selectedSkills.length,
        findingsCount: artifact.findings.length,
        llmUsed: review?.debug?.llmUsed === true,
        llmSkipped: review?.debug?.llmSkipped ?? null,
        heuristicsUsed: review?.debug?.heuristicsUsed === true,
      };
    }
  } else {
    // No diff resolved — neither a diff artifact nor (since #2046) a non-empty
    // `--base` range: per cli-review-plan-spec.md this is a no-op review, not
    // an error.
    artifact.status = 'no-changes';
  }

  // #2046 review (major 3): `context` is the schema's existing home for the
  // reviewed range (schemas/review-artifact.schema.json `context`, documented
  // in pages/reference/review-artifact.md) — not a new debug field.
  // `changedFiles` means "the file paths included in the review diff", so it is
  // filled whichever source supplied that diff. The range fields (repoRoot /
  // defaultBranch / mergeBase) exist only when git resolved the range from
  // `--base`, the empty-range case included: knowing WHICH range came back
  // empty is the whole point of #2046.
  if (diffResolved) {
    artifact.context = {
      ...(useOverride && diffOverride.context ? diffOverride.context : {}),
      changedFiles: gateChangedFiles,
    };
  }

  if (debug || executionDeferred || executionTrace) {
    artifact.debug = artifact.debug ?? {};
    if (debug) artifact.debug.resolvedArtifacts = resolved;
    if (executionDeferred) artifact.debug.executionDeferred = true;
    if (executionTrace) artifact.debug.execution = executionTrace;
  }

  // Human-approval policy check (#1363: extracted to plan-review/approval-scan.mjs;
  // behavior pinned by the #1348/#1357 contract tests and the canary suite).
  const approvalScan = await scanArtifactsForHumanApproval({
    resolved,
    artifact,
    phase,
    executeReview,
    humanApprovalAdjudicator,
    config,
    readFileImpl,
  });
  const humanApprovalRequired = approvalScan.humanApprovalRequired;
  // Audit trail (Epic #1347 supervisability): record how each verdict was
  // produced (regex-only / llm-adjudicated / llm-skipped / regex-fallback).
  // Debug-gated so the artifact contract is unchanged for existing consumers.
  if (debug && approvalScan.audit.length > 0) {
    artifact.debug = artifact.debug ?? {};
    artifact.debug.humanApproval = approvalScan.audit;
  }
  gateHumanApprovalModes = approvalScan.audit.map((a) => a.mode);

  // Gate derivation context (Epic #1347 S2). humanApprovalMode picks the most
  // informative mode across scanned files (fallback > adjudicated > skipped >
  // regex-only) so a degraded adjudicator is visible in gate.inputs.
  const MODE_PRIORITY = ['regex-fallback', 'llm-adjudicated', 'llm-skipped', 'regex-only'];
  const seenModes = new Set(gateHumanApprovalModes);
  const humanApprovalMode = MODE_PRIORITY.find((m) => seenModes.has(m)) ?? null;
  const riskMapDigest = riskMap
    ? createHash('sha256').update(JSON.stringify(riskMap)).digest('hex').slice(0, 16)
    : null;

  finalizeArtifact(artifact, {
    generateRunId,
    modelConfig: config?.model ?? null,
    llmUsed: executionTrace?.llmUsed === true,
    humanApprovalRequired,
    gateContext: {
      riskAction: gateRiskAction,
      changedFiles: gateChangedFiles,
      humanApprovalMode,
      // Fail-safe (M1): a GO-family outcome requires that skills actually ran
      // against a resolved diff. plan-only / no-changes runs gate as
      // NO_GO NOT_EXECUTED (escalation rules still fire before it).
      reviewExecuted: executeReview === true && artifact.status === 'ok',
      artifactStatus: artifact.status ?? null,
      riskMapPresent: riskMap != null,
      riskMapDigest,
      strictBlock: gateStrictBlock,
      deterministicUnrunnable: gateDeterministicUnrunnable,
      config,
    },
  });

  // Keep resolver state available to the CLI's Flow hand-off without adding it
  // to the Review Artifact or making diagnostic output depend on `--debug`.
  // Non-enumerability preserves the JSON artifact contract for all existing
  // callers, including the no-`--entry` byte-identity guarantee.
  Object.defineProperty(artifact, 'resolved', {
    value: resolved,
    enumerable: false,
  });
  return artifact;
}

/**
 * Convert a generateReview finding to the Review Artifact schema shape
 * (#802 Phase 3 A2-1). The internal pipeline uses `lineStart`/`lineEnd`;
 * the schema requires `line`/`lineEnd`. This is the local adapter — the
 * same bridge exists in `formatJsonOutput` (src/cli.mjs) for the
 * `river run .` legacy path.
 */
function normalizeFindingForArtifact(finding, index, phase) {
  const id =
    typeof finding.id === 'string' && finding.id.length > 0 ? finding.id : `rr-${index + 1}`;
  const ruleId =
    typeof finding.ruleId === 'string' && finding.ruleId.length > 0 ? finding.ruleId : 'unknown';
  const title =
    typeof finding.title === 'string' && finding.title.length > 0
      ? finding.title
      : (finding.message ?? '').slice(0, 80) || ruleId;
  const message = typeof finding.message === 'string' ? finding.message : '';
  const severity = ['info', 'minor', 'major', 'critical'].includes(finding.severity)
    ? finding.severity
    : 'major';
  const out = {
    id,
    ruleId,
    title,
    message,
    severity,
    phase: VALID_PHASES.has(finding.phase) ? finding.phase : phase,
    file: typeof finding.file === 'string' ? finding.file : '<unknown>',
  };
  if (finding.lineStart && Number.isInteger(finding.lineStart) && finding.lineStart >= 1) {
    out.line = finding.lineStart;
  } else if (finding.line && Number.isInteger(finding.line) && finding.line >= 1) {
    out.line = finding.line;
  }
  if (
    finding.lineEnd &&
    Number.isInteger(finding.lineEnd) &&
    finding.lineEnd >= 1 &&
    finding.lineEnd !== (finding.lineStart ?? finding.line)
  ) {
    out.lineEnd = finding.lineEnd;
  }
  if (finding.confidence && ['high', 'medium', 'low'].includes(finding.confidence)) {
    out.confidence = finding.confidence;
  }
  if (finding.status && ['open', 'suppressed', 'verified'].includes(finding.status)) {
    out.status = finding.status;
  }
  if (Array.isArray(finding.evidence) && finding.evidence.length > 0) {
    out.evidence = finding.evidence;
  }
  if (typeof finding.suggestion === 'string' && finding.suggestion.length > 0) {
    out.suggestion = finding.suggestion;
  }
  return out;
}
