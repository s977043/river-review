// `river run` (default local review) subcommand handler.
//
// Extracted verbatim from src/cli.mjs main() as part of the CLI dispatch
// refactor (split main() into per-subcommand handlers). Behavior, messages,
// and exit codes are unchanged; only the enclosing function and the relative
// import depth (static and dynamic imports) differ from the original inline
// block. The shared render helpers live in src/cli/render.mjs.
import process from 'node:process';
import { planLocalReview, runLocalReview } from '../../lib/local-runner.mjs';
import { SkillLoaderError, resolveSkillSet } from '../../../runners/core/skill-loader.mjs';
import CostEstimator from '../../core/cost-estimator.mjs';
import { resolveDepthToReviewMode } from '../../lib/review-plan-generator.mjs';
import { deriveRunGate } from '../../lib/run-gate.mjs';
import {
  printPlan,
  printComments,
  printMarkdownReport,
  printDebugInfo,
  printExplain,
  formatJsonOutput,
  formatPlannerStatus,
  countChangedLines,
} from '../render.mjs';

/**
 * Warn when `--baseline` was given but the run returned before the comparison (#1936).
 *
 * The regression comparison lives at the very end of `runRunCommand`, so every
 * early return above it drops `--baseline` on the floor: `no-changes` and
 * `skipped-by-label` print their own one-liner and exit 0, and `--estimate`
 * prints a cost table and exits 0. In all three the person asked for a
 * comparison against a baseline and got a successful-looking run in which no
 * comparison happened — with `no-changes` the worst case, because "No changes
 * to review" reads as "compared, and nothing regressed".
 *
 * Advisory only: stderr, exit code untouched, and it fires ONLY when the flag
 * was actually passed — same shape as `warnWhenFingerprintMatchesNoFinding`
 * (src/cli/commands/feedback.mjs, #1823 残件2). Unlike the `evolve aggregate`
 * warning it does not test the file for existence: what went wrong here is that
 * the comparison never ran, which is true whether or not the baseline file is
 * there. A baseline that exists but was never read is exactly as silent.
 *
 * The `--max-cost` overrun is deliberately NOT covered: it exits 1 with its own
 * "Aborting." message, so nothing about it is silent.
 *
 * @param {Record<string, unknown>} parsed - parseArgs() result.
 * @param {string} reason - why the run ended before the comparison.
 */
function warnBaselineNotCompared(parsed, reason) {
  if (!parsed.baseline) return;
  console.warn(
    `Warning: --baseline "${parsed.baseline}" was not used: ${reason}, ` +
      'so no regression comparison ran.'
  );
}

/**
 * Emit the finished review result in the requested `--output` format.
 *
 * Extracted verbatim from `runRunCommand` (#1594 follow-up, step 1): the block
 * is the presentation stage of the run pipeline — it starts after the optional
 * `--baseline` comparison and ends before the gate exit-code resolution, and it
 * neither returns a value nor alters control flow. Both branches it owns key off
 * the same `parsed.output`, which is why the `--debug` dump travels with it: its
 * stream routing is the same inverted `!== 'text'` check as the format dispatch
 * (#1695), so splitting them would put one input's two consumers in two places.
 *
 * Kept module-local rather than moved to `src/cli/render.mjs` because the block
 * is `run`-specific glue (format dispatch + debug routing), not a reusable
 * renderer, and `src/cli/commands/evolve.mjs` already keeps its per-stage
 * functions (`runPromptCompare` / `runAggregate` / `runReplay`) module-local.
 *
 * @param {Record<string, unknown>} result - runLocalReview() result.
 * @param {Record<string, unknown>} parsed - parseArgs() result.
 * @returns {Promise<void>}
 */
async function renderRunResult(result, parsed) {
  if (parsed.output === 'json') {
    console.log(JSON.stringify(formatJsonOutput(result, parsed.phase), null, 2));
  } else if (parsed.output === 'markdown') {
    printMarkdownReport(result, parsed.phase);
  } else if (parsed.output === 'yaml') {
    const { formatYamlOutput } = await import('../../lib/output-formatters/yaml.mjs');
    const jsonOutput = formatJsonOutput(result, parsed.phase);
    const artifact = {
      phase: parsed.phase,
      timestamp: new Date().toISOString(),
      findings: jsonOutput.issues,
      plan: result.plan,
      // Propagate the canonical verdict so YAML matches JSON (#1170 F3).
      ...(jsonOutput.decision !== undefined ? { decision: jsonOutput.decision } : {}),
    };
    console.log(formatYamlOutput(artifact));
  } else if (parsed.output === 'html') {
    const { formatHtmlOutput } = await import('../../lib/output-formatters/html.mjs');
    const jsonOutput = formatJsonOutput(result, parsed.phase);
    const htmlResult = {
      findings: result.findings ?? [],
      plan: result.plan,
      timestamp: new Date().toISOString(),
      // Propagate the canonical verdict so HTML matches JSON (#1170 F3).
      ...(jsonOutput.decision !== undefined ? { decision: jsonOutput.decision } : {}),
    };
    console.log(formatHtmlOutput(htmlResult, parsed.phase));
  } else {
    printPlan(result.plan);
    printComments(result.comments);
  }

  if (parsed.debug) {
    // #1695: same inverted check as logRunHeader in runRunCommand. The previous
    // enumeration already covered every structured format, so this is
    // behavior-identical — it just removes the second place a newly added
    // --output value would silently fall through to stdout.
    if (parsed.output !== 'text') {
      console.error('\nDebug info (not included in output):');
      printDebugInfo(result, { log: console.error });
    } else {
      printDebugInfo(result);
    }
  }
}

/**
 * Persist the finished run and publish its digest to the CI job summary.
 *
 * Extracted verbatim from `runRunCommand` (#1594 follow-up, step 2): the two
 * blocks are adjacent, share the `isGithubActions` decision, and are both gated
 * on `result.status === 'ok'` — together they are the one durability stage of
 * the run pipeline (write the audit record, then surface it where a human is
 * forced to see it, Epic #1347 S3). Neither returns a value nor alters control
 * flow, and both are fail-soft: a failure warns on stderr and the review result
 * is still emitted.
 *
 * Kept module-local for the same reason as `renderRunResult` above: this is
 * `run`-specific glue over `src/lib/result-store.mjs` and
 * `src/lib/runs-digest.mjs`, not a reusable service, and
 * `src/cli/commands/evolve.mjs` already keeps its per-stage functions
 * module-local.
 *
 * @param {Record<string, unknown>} result - runLocalReview() result.
 * @param {Record<string, unknown>} parsed - parseArgs() result.
 * @param {string} targetPath - resolved repo target path.
 * @returns {Promise<void>}
 */
async function persistRunArtifacts(result, parsed, targetPath) {
  // Persist run to result store when --save is provided. Under GitHub
  // Actions the save is AUTOMATIC (Epic #1347 S3, adversarial design
  // review Blocker 1: an opt-in store never accumulates the audit trail),
  // and the digest is appended to the job summary as the forced display
  // point — supervision that requires someone to remember a command is
  // not supervision.
  // M1 (#1372 review): RIVER_AUTO_SAVE=false opts out of the CI auto-save
  // (documented in the contract doc; the write target is .river/runs/).
  const isGithubActions =
    process.env.GITHUB_ACTIONS === 'true' && process.env.RIVER_AUTO_SAVE !== 'false';
  if ((parsed.save || isGithubActions) && result.status === 'ok') {
    try {
      const { buildRunProvenance, buildRunRecord, saveRunRecord, resolveStoreDir } =
        await import('../../lib/result-store.mjs');
      const { decision: runDecision, gate: runGate } = deriveRunGate(result);
      const record = buildRunRecord(result, {
        phase: parsed.phase,
        gate: runGate,
        decision: runDecision,
        // #1715 (#1574 producer Slice 2): attach the 契約1 provenance so
        // `river evolve aggregate` can tie this evidence to a commit. Purely
        // observational — it raises no trust, see buildRunProvenance. `dirty`
        // travels with the sha because a local run normally reviews the working
        // tree, so the sha alone does not identify the reviewed code.
        provenance: buildRunProvenance({
          commitSha: result.commitSha,
          dirty: result.dirty,
        }),
      });
      // #2054 PR-4 (Epic #2011 AC6): pin what this run used — river-review
      // version, selected skill checksums, gate policy digest — as an
      // Execution Manifest on the persisted record. Additive: `attach` returns a
      // new object with one extra top-level key, and every other key keeps the
      // value and order it had (tests/cli-run-execution-manifest pins that
      // against a manifest-less record). The manifest carries no judgment:
      // gate / decision above are computed before it exists and never read it.
      // `river run` accepts no `--entry`, so `flow` stays `missing` here.
      //
      // Its own try: a producer failure must cost the MANIFEST, never the
      // record (#2111 review major 2 — nested inside the save's try it lost the
      // whole record). `attach(record, null)` returns the record itself, so the
      // fallback is exactly the pre-#2054 write.
      let manifest = null;
      try {
        const { produceExecutionManifest, runRecordArtifactView } =
          await import('../../lib/execution-manifest-producer.mjs');
        manifest = await produceExecutionManifest({
          artifact: runRecordArtifactView(result, record),
          runRecord: record,
        });
      } catch (err) {
        console.error(`Warning: execution manifest not attached: ${err.message}`);
      }
      const { attachExecutionManifest } = await import('../../lib/execution-manifest.mjs');
      const recordWithManifest = attachExecutionManifest(record, manifest);
      // Use targetPath (not result.repoRoot) so --save and runs list resolve the same storeDir
      const savedPath = await saveRunRecord(recordWithManifest, {
        storeDir: resolveStoreDir(targetPath),
      });
      console.error(`Run saved: ${record.runId} → ${savedPath}`);
    } catch (err) {
      console.error(`Warning: --save failed: ${err.message}`);
    }
  }

  // Forced display point (Epic #1347 S3): under GitHub Actions, append the
  // runs digest to the job summary. Fail-soft — the review result must
  // never break on digest generation.
  if (isGithubActions && process.env.GITHUB_STEP_SUMMARY && result.status === 'ok') {
    try {
      // C1 (#1372 review): the digest needs FULL records — the light
      // listRunRecords metadata has no gate/findings and silently produced
      // an empty digest here.
      const { loadAllRunRecords, resolveStoreDir } = await import('../../lib/result-store.mjs');
      const { buildRunsDigest, formatDigestMarkdown } = await import('../../lib/runs-digest.mjs');
      const records = await loadAllRunRecords(resolveStoreDir(targetPath));
      const digest = buildRunsDigest(records, { now: () => new Date() });
      const fs = await import('node:fs/promises');
      await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, '\n' + formatDigestMarkdown(digest));
    } catch (err) {
      console.error(`Warning: job summary digest failed: ${err.message}`);
    }
  }
}

/**
 * Handle the default `run` command (local review against the git repo).
 *
 * @param {Record<string, unknown>} parsed - parseArgs() result.
 * @param {string} targetPath - resolved repo target path.
 * @returns {Promise<number>} process exit code.
 */
export async function runRunCommand(parsed, targetPath) {
  // Resolve --skill-set to its skill ids up front so an unknown name fails
  // fast with a clear message before any review work begins.
  let skillIds = null;
  if (parsed.skillSet) {
    try {
      skillIds = await resolveSkillSet(parsed.skillSet);
    } catch (err) {
      if (err instanceof SkillLoaderError) {
        console.error(`Error: ${err.message}`);
        return 1;
      }
      throw err;
    }
  }

  const manualReviewMode = resolveDepthToReviewMode(parsed.depth);

  const context = await planLocalReview({
    cwd: targetPath,
    phase: parsed.phase,
    dryRun: parsed.dryRun,
    debug: parsed.debug,
    availableContexts: parsed.availableContexts,
    availableDependencies: parsed.availableDependencies,
    plannerMode: parsed.plannerMode,
    baseRef: parsed.base,
    skillIds,
    manualReviewMode,
  });

  const estimator = new CostEstimator(
    process.env.OPENAI_MODEL || process.env.RIVER_OPENAI_MODEL || undefined
  );
  const estimatedCost =
    context.status === 'ok'
      ? estimator.estimateFromDiff(context.diff, context.plan?.selected ?? [])
      : null;

  // #1695: any --output other than `text` makes stdout a machine-consumed
  // artifact (markdown comment body / JSON / YAML / a full HTML document), so
  // the human-facing run header must go to stderr. This is deliberately an
  // inverted check rather than an allow-list of structured formats: the
  // previous enumeration (`markdown || json || yaml`) silently leaked the
  // header onto stdout every time a new format was added — `html` shipped
  // that way and broke `--output html > report.html` at the DOCTYPE.
  const logRunHeader = parsed.output !== 'text' ? console.error : console.log;
  logRunHeader(`River Review (local)
Phase: ${parsed.phase}
Repo: ${context.repoRoot}
Base branch: ${context.defaultBranch}
Merge base: ${context.mergeBase}
Dry run: ${parsed.dryRun ? 'yes' : 'no'}
Debug: ${parsed.debug ? 'yes' : 'no'}
Planner: ${formatPlannerStatus(context.plan ?? {})}
Contexts: ${(context.availableContexts || []).join(', ') || 'none'}
Dependencies: ${
    context.availableDependencies
      ? context.availableDependencies.join(', ')
      : 'not specified (skip disabled)'
  }`);

  if (context.status === 'skipped-by-label') {
    const labels = context.matchedLabels?.length
      ? context.matchedLabels.join(', ')
      : '(not specified)';
    console.log(`Review skipped: PR labels matched exclude patterns (${labels}).`);
    warnBaselineNotCompared(parsed, 'the review was skipped by PR labels');
    return 0;
  }

  if (context.status === 'no-changes') {
    console.log(`No changes to review compared to ${context.defaultBranch}.`);
    warnBaselineNotCompared(
      parsed,
      `there are no changes to review against ${context.defaultBranch}`
    );
    return 0;
  }

  if (estimatedCost && parsed.maxCost !== null && estimatedCost.usd > parsed.maxCost) {
    console.log(estimator.formatCost(estimatedCost));
    console.error(
      `Estimated cost $${estimatedCost.usd.toFixed(4)} exceeds max-cost ${parsed.maxCost}. Aborting.`
    );
    return 1;
  }

  if (parsed.estimate) {
    warnBaselineNotCompared(parsed, '--estimate only estimates cost and never runs the review');
    if (!estimatedCost) {
      console.log('Cost estimation skipped (no changes or skipped by label).');
      return 0;
    }
    console.log('Cost Estimate:');
    console.log(estimator.formatCost(estimatedCost));
    console.log(`Files to review: ${context.changedFiles.length}`);
    console.log(
      `Lines changed (approx): ${countChangedLines(context.diff.filesForReview ?? context.diff.files)}`
    );
    return 0;
  }

  const result = await runLocalReview({
    cwd: targetPath,
    phase: parsed.phase,
    dryRun: parsed.dryRun,
    debug: parsed.debug,
    context,
    // #1975: redundant on this path, kept on purpose. `context` is always
    // passed here (built by the `planLocalReview` call above, which is the
    // call that actually applies `--context` / `--dependency`), and
    // `runLocalReview` reads these two top-level arguments ONLY when `context`
    // is absent — downstream it reads `context.availableContexts` /
    // `context.availableDependencies`. So these two lines are currently a
    // no-op. They stay as a safety net for the fallback path: dropping them
    // would silently disable `--context` / `--dependency` the day this call
    // stops passing `context`.
    availableContexts: parsed.availableContexts,
    availableDependencies: parsed.availableDependencies,
    plannerMode: parsed.plannerMode,
    reviewers: parsed.reviewers,
    baseRef: parsed.base,
    skillIds,
    manualReviewMode,
    // #1689: propagate --quiet so the reviewer-orchestration progress lines can
    // be silenced in CI. Previously parsed but never consumed.
    quiet: parsed.quiet,
  });

  if (parsed.explain) {
    printExplain(result);
  }

  await persistRunArtifacts(result, parsed, targetPath);

  // Regression comparison when --baseline is provided
  if (parsed.baseline && result.status === 'ok') {
    try {
      const { diffReviews, formatRegressionSummary } = await import('../../lib/review-differ.mjs');
      const baselineRaw = await import('node:fs/promises').then((fs) =>
        fs.readFile(parsed.baseline, 'utf8')
      );
      const baselineFindings = JSON.parse(baselineRaw);
      const prevFindings = Array.isArray(baselineFindings)
        ? baselineFindings
        : (baselineFindings.findings ?? baselineFindings.issues ?? []);
      const diff = diffReviews(prevFindings, result.findings ?? []);
      const regSummary = formatRegressionSummary(diff);
      // #1706: the summary is a Markdown block printed BEFORE the structured
      // output, so on stdout it corrupts every machine-readable format —
      // `--output html --baseline > report.html` put text ahead of the
      // doctype, and json / yaml became unparseable. Same inverted check as
      // the run header (#1695/#1703): `text` keeps it on stdout, every other
      // format sends it to stderr where the run header already goes.
      // This is a deliberate behavior change for markdown / json / yaml.
      const logRegressionSummary = parsed.output !== 'text' ? console.error : console.log;
      logRegressionSummary(regSummary);
    } catch (err) {
      console.error(`Warning: --baseline comparison failed: ${err.message}`);
    }
  }

  await renderRunResult(result, parsed);

  // #1066 self-review: honor --fail-on / --warn-on / --advisory-only on
  // `river run` too. Previously these were parsed but silently ignored on
  // the run path (only `river review` gated), so agents that relied on the
  // exit code never actually gated. Opt-in: exit 0 unless a gate flag is set.
  if (parsed.failOn || parsed.warnOn || parsed.advisoryOnly || parsed.gate) {
    const { resolveGateExitCode } = await import('../../lib/gate-exit.mjs');
    return await resolveGateExitCode({
      failOn: parsed.failOn,
      warnOn: parsed.warnOn,
      advisoryOnly: parsed.advisoryOnly,
      gate: parsed.gate,
      // Derived the same way as the JSON-output gate so the exit code and the
      // emitted artifact agree. deriveRunGate is statically imported above.
      getGateInput: () => ({ findings: formatJsonOutput(result, parsed.phase).issues }),
      getGateObject: () => deriveRunGate(result).gate,
    });
  }

  return 0;
}
