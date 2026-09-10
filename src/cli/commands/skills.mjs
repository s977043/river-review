// `river skills` subcommand handler.
//
// Extracted verbatim from src/cli.mjs main() as part of the CLI dispatch
// refactor (split main() into per-subcommand handlers). Behavior, messages,
// and exit codes are unchanged; only the enclosing function and the relative
// import depth differ from the original inline block.
import {
  BaseRefError,
  ensureGitRepo,
  detectDefaultBranch,
  resolveBaseMergeBase,
} from '../../lib/git.mjs';
import { collectRepoDiff, renderDiffText } from '../../lib/diff-processor.mjs';
import { SkillDispatcher } from '../../core/skill-dispatcher.mjs';

/**
 * `--output` values the default `skills` run can actually render (#1705).
 * `yaml` / `html` have no renderer here; accepting them and emitting JSON
 * misreports the format to a downstream consumer, so they are rejected.
 * Insertion order is the order used in the error message.
 */
const SUPPORTED_OUTPUTS = new Set(['text', 'markdown', 'json']);

/**
 * Handle the `skills` command (resolve | import/export/list | default run).
 *
 * @param {Record<string, unknown>} parsed - parseArgs() result.
 * @param {string} targetPath - resolved repo target path.
 * @returns {Promise<number>} process exit code.
 */
export async function runSkillsCommand(parsed, targetPath) {
  // The command is guaranteed to be `skills` by the dispatch in cli.mjs main(),
  // so the branches below key on the skills subcommand only (no redundant
  // `parsed.command === 'skills'` re-check).
  if (parsed.skillsSubcommand === 'resolve') {
    // Deterministic resolution: which skills would run for the given
    // path(s) and phase. No git, no LLM — pure metadata routing, so
    // agents and CI can introspect skill selection cheaply (#1045).
    const paths = parsed.resolvePaths?.length ? parsed.resolvePaths : null;
    if (!paths) {
      console.error('Error: `river skills resolve` requires at least one --path <file>.');
      return 1;
    }
    const { buildExecutionPlan } = await import('../../../runners/core/review-runner.mjs');
    const plan = await buildExecutionPlan({
      phase: parsed.phase,
      changedFiles: paths,
      availableContexts: parsed.availableContexts ?? ['diff'],
      preferredModelHint: 'balanced',
    });
    if (parsed.output === 'json') {
      console.log(
        JSON.stringify(
          {
            phase: parsed.phase,
            paths,
            selected: plan.selected.map((s) => s.metadata?.id ?? s.id),
            skipped: plan.skipped.map((e) => ({
              id: e.skill?.metadata?.id ?? e.skill?.id,
              reasons: e.reasons,
            })),
          },
          null,
          2
        )
      );
      return 0;
    }
    console.log(`Resolved skills (phase=${parsed.phase}, paths=${paths.join(', ')}):`);
    if (!plan.selected.length) console.log('  (none matched)');
    for (const skill of plan.selected) {
      console.log(`  ✓ ${skill.metadata?.id ?? skill.id}`);
    }
    const skippedWithReasons = plan.skipped.filter((e) => e.reasons?.length);
    if (skippedWithReasons.length) {
      console.log('Skipped:');
      for (const e of skippedWithReasons) {
        console.log(`  - ${e.skill?.metadata?.id ?? e.skill?.id}: ${e.reasons.join('; ')}`);
      }
    }
    return 0;
  }

  if (parsed.skillsSubcommand) {
    const { runSkillsSubcommand } = await import('../../lib/agent-skill-bridge.mjs');
    return runSkillsSubcommand(parsed);
  }

  // Default `skills` run (no subcommand): Skill-based reviewer over the diff.
  //
  // #1705: `--output` is validated CLI-wide against text|markdown|json|yaml|html,
  // but this command only renders text / markdown / json. The previous `else`
  // branch swallowed yaml and html and returned JSON, so the CLI answered a
  // format it was never asked for. Reject the unrenderable formats up front
  // (evolve precedent, #1652) instead of falling back silently; the check runs
  // before any git or LLM work so the failure is immediate.
  if (!SUPPORTED_OUTPUTS.has(parsed.output)) {
    console.error(
      `Unsupported --output for skills: ${parsed.output}. Use: ${[...SUPPORTED_OUTPUTS].join(' | ')}`
    );
    return 1;
  }

  // #1695 / #1703: any --output other than `text` makes stdout a
  // machine-consumed artifact, so the banner and the dispatcher's progress
  // lines must go to stderr. Same inverted check as `river run` — an allow-list
  // of structured formats is what leaked the header there in the first place.
  const logProgress = parsed.output !== 'text' ? console.error : console.log;

  const repoRoot = await ensureGitRepo(targetPath);
  const defaultBranch = await detectDefaultBranch(repoRoot);
  // #2051: `--base` was parsed and accepted here but read by nobody — the diff
  // was always taken against the auto-detected default branch, so pointing
  // `skills` at another ref silently reviewed the wrong range. Resolve it
  // through the SAME helper `review` uses (src/lib/git.mjs resolveBaseMergeBase,
  // lifted out of resolveBaseRepoDiff in #2049) so the flag cannot mean two
  // things on two surfaces. A blank / unresolvable ref is a usage error,
  // rendered as `Error: ...` + exit 1 exactly like the `review` surface.
  let mergeBase;
  try {
    const resolved = await resolveBaseMergeBase(repoRoot, parsed.base, defaultBranch);
    mergeBase = resolved.mergeBase;
    // Same stream as `review` (console.warn -> stderr): stdout may be a
    // machine-consumed JSON/markdown artifact here.
    if (resolved.warning) console.warn(resolved.warning);
  } catch (err) {
    if (err instanceof BaseRefError) {
      console.error(`Error: ${err.message}`);
      return 1;
    }
    throw err;
  }
  const repoDiff = await collectRepoDiff(repoRoot, mergeBase);

  const dispatcher = new SkillDispatcher(repoRoot, { log: logProgress });

  const getFileDiff = async (targetFile) => {
    const fileData = repoDiff.files.find((f) => f.path === targetFile);
    if (!fileData) return '';
    return renderDiffText([fileData]);
  };

  logProgress(`River Review (Skills) - Target: ${targetPath}`);
  const results = await dispatcher.run(
    repoDiff.changedFiles,
    getFileDiff,
    parsed.phase,
    parsed.dryRun,
    parsed.debug
  );

  if (parsed.output === 'markdown') {
    console.log(`## Review Results\n`);
    for (const res of results) {
      console.log(`### ${res.file} (Skill: ${res.skill})`);
      console.log(res.review);
      console.log('\n---');
    }
  } else if (parsed.output === 'json') {
    console.log(JSON.stringify(results, null, 2));
  } else {
    printSkillsTextReport(results);
  }
  return 0;
}

/**
 * Render the skill review results as plain text.
 *
 * #1705: `text` is the CLI-wide default for `--output`, so it cannot be
 * rejected the way yaml / html are — it has to be rendered. Previously it fell
 * into the JSON branch, which made the documented default format a lie (and
 * made the default output unusable as JSON anyway, since the banner and
 * progress lines shared the stream).
 *
 * @param {Array<{file?: string, skill?: string, review?: string, error?: string}>} results
 * @returns {void}
 */
function printSkillsTextReport(results) {
  if (!results.length) {
    console.log('Review Results (0)');
    return;
  }
  console.log(`Review Results (${results.length})`);
  for (const res of results) {
    console.log(`\n--- ${res.file} (Skill: ${res.skill}) ---`);
    console.log(res.error ? `[Error] ${res.error}` : res.review);
  }
}
