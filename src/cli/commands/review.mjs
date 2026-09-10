// `river review` subcommand handler.
//
// Extracted verbatim from src/cli.mjs main() as part of the CLI dispatch
// refactor (#issue: split main() into per-subcommand handlers). Behavior,
// messages, and exit codes are unchanged; only the enclosing function and the
// relative import depth differ from the original inline block.
import path from 'node:path';
import process from 'node:process';
import {
  ensureGitRepo,
  detectDefaultBranch,
  normalizeBaseRef,
  resolveBaseMergeBase,
} from '../../lib/git.mjs';
import { collectRepoDiff } from '../../lib/diff-processor.mjs';
import { resolveFlowInputBindings } from '../../lib/flow-input-bindings.mjs';
import { SkillLoaderError, resolveSkillSet } from '../../../runners/core/skill-loader.mjs';

/**
 * Resolve the git diff for `--base` (or the auto-detected default branch).
 *
 * SSoT for how every `review` subcommand turns `--base` into a diff: the
 * route path (`runReviewRoute`) and the plan/exec path both call this, so the
 * two cannot drift into different ranges for the same `--base` (#2046).
 *
 * An explicitly typed `--base` that git cannot resolve is a usage error, not a
 * silent empty range: `findMergeBase` falls back to HEAD for an unknown ref, so
 * without this check `--base no-such-ref` reviewed nothing and exited 0
 * (#2046 review, major 2). The auto-detected default branch keeps the old
 * fallback — it is not something the user typed.
 *
 * @param {Record<string, unknown>} parsed - parseArgs() result.
 * @returns {Promise<{targetPath: string, repoRoot: string, defaultBranch: string,
 *   mergeBase: string, repoDiff: object}>}
 */
export function resolveBaseRef(parsed) {
  // Delegates to the shared normalizer in src/lib/git.mjs — the `skills` and
  // `run` surfaces trim `--base` through the same function (#2051 / #2057), so
  // "blank means usage error" cannot drift between them.
  return normalizeBaseRef(parsed?.base);
}

async function resolveBaseRepoDiff(parsed) {
  const targetPath = path.resolve(parsed.target);
  const repoRoot = await ensureGitRepo(targetPath);
  const defaultBranch = await detectDefaultBranch(repoRoot);
  // #2051 / #2057: the validation this used to inline now lives in
  // resolveBaseMergeBase (src/lib/git.mjs) so `skills` and `run` share it
  // verbatim. Behavior here is unchanged — same messages, same exit path.
  const { baseRef, mergeBase, warning } = await resolveBaseMergeBase(
    repoRoot,
    parsed?.base,
    defaultBranch
  );
  if (warning) console.warn(warning);
  const repoDiff = await collectRepoDiff(repoRoot, mergeBase);
  return { targetPath, repoRoot, defaultBranch, mergeBase, baseRef, repoDiff };
}

/**
 * Flow inputs the plan execution proves were supplied, keyed by Flow input
 * name, for `executeFlow`'s required-input check and `when` clauses (Epic
 * #2011 AC7 P3-1). Two sources:
 *
 *   - `context.changedFiles` exists only when the review diff resolved
 *     (review-plan.mjs sets `context` under `diffResolved`), so it stands for
 *     the Flow input `diff`.
 *   - `resolved` is the resolver result returned by `runReviewPlan`. The
 *     CLI-side binding SSoT maps compatible contract IDs to Flow roles while
 *     preserving direct CLI input precedence.
 *
 * @param {Record<string, unknown>} artifact
 * @param {Record<string, unknown>|undefined} resolved - Resolver result from
 *   the plan execution; unavailable on replay.
 * @param {object} document - the resolved Flow document (`inputs[]` names).
 * @returns {{inputs: Record<string, unknown>, inputSources: Record<string, unknown>, unboundInputNames: string[]}}
 */
function resolvedFlowInputs(artifact, entry, document, resolved) {
  const { inputs, inputSources, unboundInputNames } = resolveFlowInputBindings({
    entry,
    document,
    resolved,
  });
  const declaresDiff =
    Array.isArray(document?.inputs) && document.inputs.some((input) => input?.name === 'diff');
  if (declaresDiff && !('diff' in inputs) && Array.isArray(artifact?.context?.changedFiles)) {
    inputs.diff = artifact.context.changedFiles;
  }
  if ('diff' in inputs) {
    const index = unboundInputNames.indexOf('diff');
    if (index !== -1) unboundInputNames.splice(index, 1);
  }
  return { inputs, inputSources, unboundInputNames };
}

/**
 * Handle the `review` command (plan | exec | verify | route).
 *
 * @param {Record<string, unknown>} parsed - parseArgs() result.
 * @returns {Promise<number>} process exit code.
 */
export async function runReviewCommand(parsed) {
  // `review exec --dry-run` (without --plan): per spec, dry-run does
  // no LLM/skill execution — it only resolves inputs and produces a
  // deterministic plan, which is exactly `runReviewPlan`'s behavior.
  // It is routed through the shared plan path below.
  const isExecDryRun = parsed.reviewSubcommand === 'exec' && parsed.dryRun && !parsed.planFile;

  // `review exec --plan <path>` (replay): the external plan is the
  // source of truth (#802 Phase 3, replay contract). Artifact
  // resolution and buildExecutionPlan are NOT re-run. Skill execution
  // is out of scope here, so `findings` stays empty for now.
  const isExecPlanReplay =
    parsed.reviewSubcommand === 'exec' && typeof parsed.planFile === 'string';

  // `review exec` (no flags): #802 Phase 3 A2-1. Resolve artifacts,
  // build the execution plan with `llmEnabled: true` so non-heuristic
  // skills can be selected, and call generateReview to populate the
  // artifact findings via the LLM-or-heuristic pipeline. When no API
  // key is configured, generateReview gracefully falls back to
  // heuristic findings (or an empty set) instead of failing.
  const isExecExecute =
    parsed.reviewSubcommand === 'exec' && !parsed.dryRun && typeof parsed.planFile !== 'string';

  if (parsed.reviewSubcommand === 'verify') {
    return runReviewVerify(parsed);
  }
  if (parsed.reviewSubcommand === 'route') {
    return runReviewRoute(parsed);
  }
  // At this point, the verify/route branches above have already returned, so the
  // remaining valid subcommands are `plan` and `exec` (in any of its
  // exec dry-run / replay / deferred forms). Anything else is unknown.
  //
  // Unreachable from the CLI since #1755: parseArgs rejects a missing or
  // unknown subcommand itself, so that it exits 1 like every other usage error
  // rather than 3 (= the `--gate` ESCALATE code). Kept as a guard for
  // programmatic callers, and aligned on exit 1 for the same reason.
  if (parsed.reviewSubcommand !== 'plan' && parsed.reviewSubcommand !== 'exec') {
    console.error(
      parsed.reviewSubcommand
        ? `Error: "${parsed.reviewSubcommand}" is not a river review subcommand (plan | exec | verify | route).`
        : 'Error: river review requires a subcommand (plan | exec | verify | route).'
    );
    return 1;
  }
  try {
    const { runReviewPlan, runReviewExecReplay, ReviewPlanError, resolveReviewOutputFormat } =
      await import('../../lib/review-plan.mjs');
    let reviewFormat;
    try {
      reviewFormat = resolveReviewOutputFormat(parsed);
    } catch (err) {
      if (err instanceof ReviewPlanError) {
        console.error(`Error: ${err.message}`);
        return 3;
      }
      throw err;
    }
    // #976/#1027: resolve --skill-set within the review namespace so
    // `river review plan|exec --skill-set <name>` restricts candidates
    // (previously only `river run` honored it; the flag was silently
    // ignored here). Skip on the replay path: --plan replays a fixed
    // source plan, so skill selection (and thus --skill-set) does not apply.
    let reviewSkillIds = null;
    if (parsed.skillSet && !isExecPlanReplay) {
      try {
        reviewSkillIds = await resolveSkillSet(parsed.skillSet);
      } catch (err) {
        if (err instanceof SkillLoaderError) {
          console.error(`Error: ${err.message}`);
          return 3;
        }
        throw err;
      }
    }
    // #2046: `--base <ref>` used to be parsed and then read by nobody on this
    // path, so `review plan --base <ref>` silently reported `no-changes` while
    // `review route --base <ref>` saw the very diff it was pointed at. Resolve
    // it through the SAME helper the route path uses, and hand the resulting
    // diff (plus the range context) to the plan/replay layer. Only when
    // `--base` is actually given: without it the artifact-resolution path is
    // untouched, so existing callers keep their behavior.
    //
    // Precedence against the `diff` artifact is decided in review-plan.mjs,
    // where the artifact's resolution tier (cli / config / cwd-default) is
    // known — an explicitly specified artifact wins, per
    // pages/reference/artifact-input-contract.md.
    let diffOverride;
    if (resolveBaseRef(parsed) !== null) {
      const { repoRoot, defaultBranch, mergeBase, repoDiff } = await resolveBaseRepoDiff(parsed);
      diffOverride = {
        diffText: repoDiff.rawDiffText,
        // schemas/review-artifact.schema.json `context` (additionalProperties:
        // false). Only the four range fields are filled: the token estimates
        // there describe the OPTIMIZED diff text, which is not the text handed
        // to the planner below, so claiming them would be wrong.
        context: {
          repoRoot,
          defaultBranch,
          mergeBase,
          changedFiles: repoDiff.changedFiles,
        },
      };
    }
    let artifact;
    let resolved;
    try {
      if (isExecPlanReplay) {
        artifact = await runReviewExecReplay({
          planFile: path.resolve(parsed.planFile),
          debug: parsed.debug,
          // #878 A2-3-impl: replay executes (not just echoes) unless --dry-run.
          // The source plan stays the source of truth (no re-plan); the diff
          // is resolved from the current working tree / --artifact.
          executeReview: !parsed.dryRun,
          cwd: path.resolve(parsed.target),
          cliArtifacts: parsed.cliArtifacts,
          artifactsDir: parsed.artifactsDir,
          diffOverride,
        });
      } else {
        artifact = await runReviewPlan({
          cwd: path.resolve(parsed.target),
          phase: parsed.phase,
          // exec --dry-run and exec (real run) both reuse the plan path
          // entrypoint; the differentiator is `executeReview`, which
          // enables LLM-backed skill selection and the generateReview
          // adapter so findings are populated.
          planOnly: isExecDryRun || isExecExecute ? true : parsed.planOnly,
          cliArtifacts: parsed.cliArtifacts,
          artifactsDir: parsed.artifactsDir,
          debug: parsed.debug,
          executeReview: isExecExecute,
          skillIds: reviewSkillIds,
          // Forward CLI-level --context / --dependency overrides so
          // authors can opt additional artifact IDs / dependency stubs
          // into selection without env vars.
          availableContexts: parsed.availableContexts ?? undefined,
          availableDependencies: parsed.availableDependencies ?? undefined,
          diffOverride,
        });
        resolved = artifact.resolved;
      }
    } catch (err) {
      if (err instanceof ReviewPlanError) {
        console.error(`Error: ${err.message}`);
        return 3;
      }
      throw err;
    }
    // #2054 PR-3 (Beta): `review plan --entry <name>` pins the artifact to a
    // review Flow entry. Only the pin and the Flow's declared required inputs
    // are attached, both additive; nothing above (skill selection, decision,
    // gate) reads them, so the artifact without `--entry` is byte-identical to
    // the one produced before this flag existed (tests/cli-review-plan-entry
    // pins that). Reading `flows/` goes through the single Flow loader; an
    // unreadable flows directory is a loud exit 1, never a silent "no Flow".
    let resolvedFlow = null;
    if (parsed.entry !== null && parsed.entry !== undefined) {
      const { FlowLoaderError, resolveFlowEntry } = await import('../../lib/flow-loader.mjs');
      try {
        resolvedFlow = resolveFlowEntry(parsed.entry);
        artifact.flow = resolvedFlow.flow;
        artifact.evidenceRequirements = resolvedFlow.evidenceRequirements;
      } catch (err) {
        if (err instanceof FlowLoaderError) {
          console.error(`Error: ${err.message}`);
          return 1;
        }
        throw err;
      }
    }
    // Epic #2011 AC7 P2 (Beta, record only): on `review exec --entry <name>`
    // run the pinned Flow document through the single Flow runner and append
    // the per-step outcomes as `steps`, additively, right after the pin.
    // `capabilities` is empty in this slice, so every step lands on
    // `not-implemented` / `skipped` / `stopped`, and a Flow whose required
    // inputs the artifact cannot vouch for (see `resolvedFlowInputs`) records
    // every step as `stopped`. Nothing here reads the runner's `stopped` / `stopReason`
    // back into `gate` / `decision` (RA-1) — both were finalized above and
    // stay byte-identical to the run without `--entry`. `review plan --entry`
    // and `exec --dry-run` / `exec --plan` keep the pin only: they run no
    // review, so there is nothing for a step to record.
    if (resolvedFlow !== null && isExecExecute) {
      const { executeFlow } = await import('../../lib/flow-runner.mjs');
      const flowInputs = resolvedFlowInputs(
        artifact,
        parsed.entry,
        resolvedFlow.document,
        resolved
      );
      const result = await executeFlow({
        document: resolvedFlow.document,
        capabilities: {},
        ...flowInputs,
        // Record only: `observe` continues past a missing capability as
        // `not-implemented` and lists every step even when a required input
        // is missing. `judgment` is reserved for P4 and not passed here.
        mode: 'observe',
      });
      artifact.steps = result.steps;
    }
    // #2054 PR-4 (Epic #2011 AC6): pin what this run used as an Execution
    // Manifest, additively, as the LAST top-level key. Built after every
    // judgment above (skill selection, decision, gate, Flow pin) so none of
    // them can read it; `attachExecutionManifest` copies the artifact rather
    // than mutating it. The `flow` block is `resolved` only when `--entry`
    // resolved a Flow document on this very run — the parsed document is handed
    // to the resolver so the manifest never reads `flows/` itself (#2037).
    // Fail-soft: a manifest that cannot be built is a loud warning and an
    // artifact without the key, never a lost review.
    try {
      const { produceExecutionManifest } =
        await import('../../lib/execution-manifest-producer.mjs');
      const { attachExecutionManifest } = await import('../../lib/execution-manifest.mjs');
      const manifest = await produceExecutionManifest({
        artifact,
        flowDocument: resolvedFlow?.document ?? null,
        expectedFlowVersion: resolvedFlow?.flow?.version ?? null,
      });
      artifact = attachExecutionManifest(artifact, manifest);
    } catch (err) {
      console.error(`Warning: execution manifest not attached: ${err.message}`);
    }
    const outputFilePath = parsed.outputFile ? path.resolve(parsed.outputFile) : null;
    const summaryFilePath = parsed.summaryFile ? path.resolve(parsed.summaryFile) : null;
    if (outputFilePath && summaryFilePath && outputFilePath === summaryFilePath) {
      console.error('Error: --output-file and --summary-file must not point to the same path.');
      return 3;
    }
    const { writeFile } = await import('node:fs/promises');
    let serialized;
    if (reviewFormat === 'markdown') {
      // #976: human-readable Markdown rendering of the artifact (findings +
      // plan). The JSON artifact stays the machine-readable contract.
      const { formatReviewPlanSummaryMarkdown } = await import('../../lib/review-plan-summary.mjs');
      serialized = formatReviewPlanSummaryMarkdown(artifact);
    } else {
      serialized = JSON.stringify(artifact, null, 2);
    }
    if (outputFilePath) {
      await writeFile(outputFilePath, serialized + '\n', 'utf8');
    } else {
      // The artifact (JSON or Markdown) is the requested output, not a
      // progress log: --quiet does not suppress it.
      process.stdout.write(serialized + '\n');
    }
    if (summaryFilePath) {
      const { formatReviewPlanSummaryMarkdown } = await import('../../lib/review-plan-summary.mjs');
      await writeFile(summaryFilePath, formatReviewPlanSummaryMarkdown(artifact) + '\n', 'utf8');
    }
    // #976: opt-in review gate. Only when --fail-on / --warn-on / --advisory-only
    // / --gate is given do we translate findings into a CI exit code; otherwise
    // exit 0 (non-breaking for existing callers / the plangate-review workflow).
    if (parsed.failOn || parsed.warnOn || parsed.advisoryOnly || parsed.gate) {
      const { resolveGateExitCode } = await import('../../lib/gate-exit.mjs');
      return await resolveGateExitCode({
        failOn: parsed.failOn,
        warnOn: parsed.warnOn,
        advisoryOnly: parsed.advisoryOnly,
        gate: parsed.gate,
        getGateInput: () => artifact,
        getGateObject: () => artifact.gate,
      });
    }
    return 0;
  } catch (err) {
    console.error(`Error: ${err?.message ?? err}`);
    return 1;
  }
}

/**
 * `river review verify` — accept the argument/output contract, defer execution.
 *
 * verify (and any future review subcommand that is not exec): the
 * CLI/output contract is fixed and validated here (PR-3), but skill
 * execution and verify-side artifact reading are not implemented
 * yet. The contract depends only on the Artifact Input Contract IDs
 * — it does not depend on PlanGate.
 *
 * @param {Record<string, unknown>} parsed - parseArgs() result.
 * @returns {Promise<number>} process exit code.
 */
async function runReviewVerify(parsed) {
  try {
    const { ReviewPlanError, resolveReviewOutputFormat } =
      await import('../../lib/review-plan.mjs');
    try {
      resolveReviewOutputFormat(parsed);
    } catch (err) {
      if (err instanceof ReviewPlanError) {
        console.error(`Error: ${err.message}`);
        return 3;
      }
      throw err;
    }
  } catch (err) {
    console.error(`Error: ${err?.message ?? err}`);
    return 1;
  }
  console.error(
    `river review ${parsed.reviewSubcommand}: the argument/output contract is accepted, ` +
      'but execution is not implemented yet (#802 Phase 3). ' +
      'See pages/reference/cli-review-' +
      parsed.reviewSubcommand +
      '-spec.md.'
  );
  return 3;
}

/**
 * `river review route` — risk-based review mode recommendation (dry-run, no LLM).
 *
 * @param {Record<string, unknown>} parsed - parseArgs() result.
 * @returns {Promise<number>} process exit code.
 */
async function runReviewRoute(parsed) {
  try {
    const { routeReviewMode, formatRouterResultMarkdown } =
      await import('../../lib/review-mode-router.mjs');
    const { loadRiskMap } = await import('../../lib/risk-map.mjs');
    const {
      targetPath: routeTargetPath,
      repoRoot,
      repoDiff,
      baseRef,
    } = await resolveBaseRepoDiff(parsed);
    const riskMap = await loadRiskMap(repoRoot).catch((err) => {
      console.warn(`Warning: could not load risk-map.yaml: ${err?.message ?? err}`);
      return null;
    });
    const result = routeReviewMode({
      changedFiles: repoDiff.changedFiles,
      diffText: repoDiff.rawDiffText,
      riskMap,
      targetPath: routeTargetPath,
      // #2046: the suggested next command must review the range this routing
      // decision was made against, otherwise following it re-resolves a
      // different range (the issue's "なぜ問題か").
      baseRef,
    });
    const outputFormat = parsed.formatExplicit
      ? parsed.format
      : parsed.outputExplicit && ['json', 'markdown'].includes(parsed.output)
        ? parsed.output
        : 'json';
    if (outputFormat === 'markdown') {
      console.log(formatRouterResultMarkdown(result));
    } else if (outputFormat === 'json') {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.error(
        `Error: river review route only supports --format json or --format markdown` +
          (parsed.outputExplicit
            ? ` (--output is not supported for this subcommand; use --format instead)`
            : ` (got "${outputFormat}").`)
      );
      return 3;
    }
    return 0;
  } catch (err) {
    console.error(`Error: ${err?.message ?? err}`);
    return 1;
  }
}
