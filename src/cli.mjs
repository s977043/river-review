#!/usr/bin/env node
import {
  existsSync,
  realpathSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { GitError, GitRepoNotFoundError } from './lib/git.mjs';
import { SkillLoaderError } from '../runners/core/skill-loader.mjs';
import { ProjectRulesError } from './lib/rules.mjs';
import { RiskMapError } from './lib/risk-map.mjs';
import { parseList } from './lib/utils.mjs';
import { PLANNER_MODES, PHASES } from './lib/planner-utils.mjs';
import { SEVERITY_RANK } from './lib/finding-factory.mjs';
import { DEPTH_TO_REVIEW_MODE } from './lib/review-plan-generator.mjs';
// #1768: `parseExpiresAt` lived here and defined "a valid --expires" for the CLI
// alone, while riverbed-memory decided the same question with a bare `Date`.
// It now lives in src/lib/expires-at.mjs so the CLI and the library share one
// definition; the accepted set of `--expires` values is unchanged.
import { parseExpiresAt } from './lib/expires-at.mjs';
import { listFlowEntryNames } from './lib/flow-loader.mjs';
import { acceptsPositionalPath, takePositionalPath } from './cli/parse/positionals.mjs';
import { consumeTerminator } from './cli/parse/terminator.mjs';
import {
  EVOLVE_SUBCOMMANDS,
  FEEDBACK_SUBCOMMANDS,
  PROMOTE_ID_SUBCOMMANDS,
  REVIEW_SUBCOMMANDS,
  RUNS_SUBCOMMANDS,
  SKILLS_SUBCOMMANDS,
  SUBCOMMAND_ONLY_COMMANDS,
  SUPPRESSION_SUBCOMMANDS,
} from './cli/parse/vocabulary.mjs';
import { consumeEagerCommand } from './cli/parse/eager-command.mjs';
import { consumeOption } from './cli/parse/options.mjs';
import { applyPhaseFallback, checkReviewSubcommand } from './cli/parse/postprocess.mjs';
import { runReviewCommand } from './cli/commands/review.mjs';
import { runSkillsCommand } from './cli/commands/skills.mjs';
import { runRunsCommand } from './cli/commands/runs.mjs';
import { runEvalCommand } from './cli/commands/eval.mjs';
import { runFeedbackCommand } from './cli/commands/feedback.mjs';
import { runSuppressionCommand } from './cli/commands/suppression.mjs';
import { runDoctorCommand } from './cli/commands/doctor.mjs';
import { runRunCommand } from './cli/commands/run.mjs';
import { runPromoteCommand } from './cli/commands/promote.mjs';
import { runEvolveCommand } from './cli/commands/evolve.mjs';
import {
  printHintLines,
  printExplain,
  isLlmlessEmptyReview,
  validateOutputArtifact,
} from './cli/render.mjs';

function printHelp() {
  console.log(`Usage: river <command> <path> [options]

Commands:
  run <path>            Run River Review locally against the git repo at <path>
  skills <path>         Run the new Skill-based Reviewer architecture
  skills import         Import Agent Skills (SKILL.md) into River Review
  skills export         Export River Review skills to Agent Skills format
  skills list           List all skills (RR and Agent Skills)
  skills resolve        Show which skills apply to the given --path files
  doctor <path>         Check setup and print hints for common issues
  review plan           Resolve upstream artifacts and emit a Review Artifact
                        (Phase 3 slice: --plan-only only; --base <ref> diffs
                         against that ref instead of the diff artifact;
                         --entry <name> pins a review Flow entry, Beta)
  review exec           Run the review and emit a Review Artifact with findings
                        (--dry-run: plan only; --plan <file>: replay an existing plan;
                         --entry <name> pins a review Flow entry and records steps, Beta)
  review route          Recommend a review mode (light|standard|team|human-required)
                        for the current diff (--format json|markdown; --base <ref>)
  eval                  Run review fixtures evaluation (must_include checks)
  suppression add       Create a Riverbed Memory suppression entry
                        (--fingerprint --feedback --rationale [--scope]
                         [--severity] [--files] [--expires] [--pr]
                         [--fingerprint-algo v1|v2]; v2 = line-anchored,
                         suppresses only the occurrence at that line but
                         stops matching once the line shifts)
  feedback add          Record a review feedback entry (.river/feedback/)
                        (--type --skill [--trigger] [--fingerprint] [--evidence]
                         [--pr] [--reviewer] [--model] [--reversed-by] [--run-id])
  promote propose       Create (or converge on) one promotion candidate from an
                        explicit feedback JSONL selection. The candidate id is a
                        content hash of (evidence, cluster, policy version), so
                        re-running with the same evidence is idempotent.
                        (--input <jsonl> --cluster-key <skillId::feedbackType>
                         [--policy-version <v>] [--threshold <n>] [--index <path>]
                         [--dry-run])
                        Not safe to run in parallel against the same --index:
                        the index is rewritten read-modify-write, so concurrent
                        proposes can lose one another's entry. Serialize calls.
  promote list          List promotion_candidate entries (Judgment Promotion Loop Phase 2)
  promote approve <id>  Approve a candidate (promotionStatus -> approved)
  promote reject <id>   Reject a candidate (promotionStatus -> archived)
  promote template [<id>] Emit PR scaffold(s) for approved candidate(s) (text only)
                        (--approver <name> --reason <text> --index <path>
                         --include-inactive; --output json for machine output)
  promote retire        Retire promotion candidates: archive on expiresAt and
                        sync promotionStatus to the retired entry status (Phase 3)
  promote review-effectiveness [<id>]
                        Review post-activation feedback; flag needs_review when
                        false-positive/reversal signals reach --threshold
                        (--threshold <n> --feedback-root <path> --index <path>)
  evolve aggregate <path>
                        Read-only shadow aggregate over saved runs + feedback
                        (#1574 P1). Prints evidence provenance, two-stage
                        clusters, and at most one shadow candidate. Writes
                        nothing (--min <n> --month YYYY-MM; --output json)
  evolve replay         Read-only paired replay of an experiment spec
                        (#1574 P2). Pins an immutable Experiment Manifest,
                        pairs baseline vs candidate findings, and reports the
                        delta against the declared per-profile acceptance
                        criteria. Never re-runs a review and never decides
                        adoption (--spec <file> --expect-manifest <id>;
                        --output json)
  evolve prompt-compare <path>
                        Read-only paired comparison of the legacy prompt vs the
                        compiled prompt over saved observe-mode runs
                        (ADR-006 / #1860). Feeds the same Experiment Manifest as
                        evolve replay. Never re-runs a review and never sends
                        the compiled prompt (--output json)
  evolve prompt-ab <path>
                        Read-only A/B comparison of TWO run families: the saved
                        runs that sent the legacy prompt (baseline) vs the ones
                        that sent the compiled prompt (candidate, mode active)
                        (ADR-006 / #1880). Unlike prompt-compare, the two sides
                        are different records, so findings-level comparison is
                        possible. Never re-runs a review (--output json)

Skills Subcommand Options:
  --from <path>         (import) Source directory to scan for SKILL.md files
  --to <path>           (import) Output dir for converted skills / (export) Output dir for SKILL.md
  --strict              (import) Require full RR schema compliance (default)
  --loose               (import) Accept minimal name/description, auto-fill missing fields
  --source <type>       (list) Filter: rr|agent|all (default: all)
  --include-assets      (export) Copy references/ scripts/ prompt/ alongside SKILL.md
  --path <file>         (resolve) File to resolve skills for; repeatable, at least one required
  --dry-run             (import) Validate without writing files

Options:
  --phase <phase>   Review phase (upstream|midstream|downstream). Default: env RIVER_PHASE or midstream
  --planner <mode>  Planner mode (off|order|prune). Default: env RIVER_PLANNER_MODE or off
  --dry-run         Do not call external services; print results to stdout
  --debug           Print debug information (merge base, files, token estimate)
  --explain         Print which skills / gates / config tier were resolved (to stderr)
  --estimate        Print cost estimate only (no review)
  --max-cost <usd>  Abort if estimated cost exceeds this USD amount
  --output <mode>   Output format: text|markdown|json|yaml|html. Default: text
  --format <mode>   (review) Output format for review plan|exec|verify|route: text|markdown|json. Takes
                    precedence over --output; plan|exec reject a conflicting explicit pair.
                    Default: json (text is parsed but not implemented for review yet)
  --context list    Comma-separated available contexts (e.g. diff,fullFile,tests). Overrides RIVER_AVAILABLE_CONTEXTS
  --dependency list Comma-separated available dependencies (e.g. code_search,test_runner). Overrides RIVER_AVAILABLE_DEPENDENCIES
  --reviewers list  Comma-separated reviewer roles for parallel orchestration (e.g. bug-hunter,security-scanner,test-gap).
                    Use "auto" to select roles automatically based on diff content and risk signals.
  --baseline <path> Path to a previous review JSON (findings array) for regression comparison
  --base <ref>      Branch or ref to diff against (e.g. main). Default: auto-detected default branch
                    Accepted only by: run, skills (no subcommand), review plan|exec|route.
                    Other surfaces reject it (#2065) — they never read a diff.
  --entry <name>    (review plan|exec, Beta) Review Flow entry to pin the artifact to
                    (review-plan|review-task|review-final|... from the entry map).
                    Adds flow and evidenceRequirements to the artifact; review exec also
                    records the Flow's per-step outcomes as steps. No other output changes.
  --skill-set <name> Restrict review to a named skill set from skills/registry.yaml
                    (e.g. basic, typescript, comprehensive). Default: all applicable skills
  --depth <name>    Force review depth: quick|standard|thorough. Default: auto-detected from diff size
  --save            Persist the review run to the project result store (.river/runs/)
  --fail-on <sev>   (run/review) Exit 1 if a finding >= severity exists. Opt-in; default critical when set
  --warn-on <sev>   (run/review) Exit 2 if a finding >= severity exists (below --fail-on). Default major when set
  --advisory-only   (run/review) Report findings but always exit 0 (disables --fail-on/--warn-on gating)
  --gate            (run/review) Map the gate decision to the exit code: GO/GO_WITH_OBSERVATION=0,
                    NO_GO=1, ESCALATE=3. Opt-in; combines with --fail-on/--warn-on (stricter wins).
                    Conflicts with --advisory-only.
  --offline         (run) Skip AI; review on deterministic heuristics only, even if an API key is set.
                    Reproduces the Auto-approve gate locally when CI/AI is unavailable. Alias: --rules-only

Commands:
  river runs list           List stored review runs
  river runs diff <id1> <id2> [<id3>...] Diff stored review runs (3+ runs detect oscillation)
  river runs summary        Show aggregate dashboard metrics
  river runs digest         Supervision digest (gate decisions, warnings, escape candidates)
  --cases <path>    (eval) Path to fixtures cases.json (default: tests/fixtures/review-eval/cases.json)
  --verbose         (eval) Print detailed per-case results
  -h, --help        Show this help message
`);
}

// #1709 Slice 2: one-line usage summaries per command, printed to stderr on a
// usage error instead of the full help text. The full help used to go to
// stdout on every option error, which polluted redirected artifacts (e.g.
// runners/github-action redirects stdout into the review JSON file).
const COMMAND_USAGE = {
  run: 'river run <path> [options]',
  doctor: 'river doctor <path> [options]',
  skills: 'river skills <path> | river skills <import|export|list|resolve> [options]',
  runs: 'river runs <list|diff|summary|digest> [options]',
  review: 'river review <plan|exec|verify|route> [options]',
  eval: 'river eval [--cases <path>] [--verbose]',
  feedback: 'river feedback add --type <type> --skill <id> [options]',
  suppression:
    'river suppression add --fingerprint <fp> --feedback <type> --rationale <text> [options]',
  promote:
    'river promote <propose|list|approve|reject|template|retire|review-effectiveness> [options]',
  evolve: 'river evolve <aggregate|replay|prompt-compare|prompt-ab> [options]',
};

const GENERIC_USAGE = 'river <command> <path> [options]';

function printUsageHint(command) {
  console.error(`Usage: ${COMMAND_USAGE[command] ?? GENERIC_USAGE}`);
  console.error('Run `river --help` for the full option list.');
}

/**
 * #1709 Slice 2 — central usage-error contract.
 *
 * Every option/command parse error funnels through here. The call site has
 * already written its `Error: ...` line to stderr; this helper appends a
 * one-line usage summary plus a pointer to the full help (both stderr) and
 * marks the parse result so `main()` exits 1 WITHOUT printing the full help
 * to stdout. Explicit `-h`/`--help` (and bare `river`) keep the old
 * contract: full help on stdout, exit 0.
 */
function usageError(parsed) {
  printUsageHint(parsed.command);
  parsed.usageError = true;
}

/**
 * Every command token the CLI accepts, derived from `COMMAND_USAGE` above so
 * that the usage table and the accepted-command check cannot drift apart.
 * `main()` uses it to decide whether `parsed.command` is a real command.
 */
const COMMAND_NAMES = Object.keys(COMMAND_USAGE);

/**
 * Commands consumed by the eager command branch at the top of `parseArgs`'
 * loop, i.e. those whose subcommand word / positional path is read right after
 * the command token. `eval` and `review` are excluded because each has its own
 * branch further down the loop (`eval` takes nothing, `review` matches against
 * `REVIEW_SUBCOMMANDS`).
 */
const EAGER_COMMANDS = new Set(
  COMMAND_NAMES.filter((name) => name !== 'eval' && name !== 'review')
);

/**
 * Global options the shared parser handles for `evolve`. Anything else starting
 * with `-` is rejected rather than silently ignored.
 */
const EVOLVE_SHARED_OPTIONS = new Set(['--output', '-h', '--help', '--debug']);

/**
 * Same treatment for `promote`: a typo such as `--dry-rnu` must not fall
 * through to the shared parser and be ignored, because `propose` then writes
 * the index for real while the caller believes it asked for a dry run.
 */
const PROMOTE_SHARED_OPTIONS = new Set(['--output', '--dry-run', '-h', '--help', '--debug']);

/**
 * Severity vocabulary shared by `suppression add --severity` and the
 * `--fail-on` / `--warn-on` gating options — all three take the same four
 * values, so they read them from one table.
 *
 * Derived from `SEVERITY_RANK` (src/lib/finding-factory.mjs), the declared
 * single source of truth for the output-schema severity vocabulary, rather
 * than re-listing the values here. It matches the `severity` enum of
 * `schemas/suppression-context.schema.json`, which validates the `context`
 * `suppression add` ends up writing.
 */
const SEVERITY_VALUES = Object.keys(SEVERITY_RANK);

/**
 * Fingerprint algorithms accepted by `suppression add --fingerprint-algo`
 * (#1797). Mirrors the `fingerprintAlgo` enum of
 * `schemas/suppression-context.schema.json`, which validates the `context`
 * this option writes; the schema is the vocabulary SSoT and
 * `tests/suppression-fingerprint-v2.test.mjs` pins the two together so this
 * list cannot drift from it.
 */
const SUPPRESSION_FINGERPRINT_ALGOS = ['v1', 'v2'];

/**
 * Which subcommand words name a real surface, per command (#2065 review).
 *
 * `bare` says whether the command WITHOUT a subcommand is itself a surface:
 * `river runs` runs as `runs list`, `river skills <path>` is the diff-reviewing
 * form, and `river evolve <path>` takes a path — but `river feedback` and
 * `river suppression` are not surfaces, and `river review` without a
 * subcommand is already rejected earlier in this function.
 *
 * `promote` is deliberately ABSENT. Its vocabulary lives only in its handler,
 * and the parser has no constant for it — but it also never reaches the
 * command-scoped check, because `parsePromoteOption` consumes `--base` as an
 * unknown option before `parsed.base` is ever set (measured: `promote list
 * --base main` exits 1 with ``unknown option for promote: --base`` both before
 * and after #2065). A command missing from this map is treated as "not a
 * surface the parser can name", so the check skips it rather than invent one.
 *
 * @type {Map<string, {bare: boolean, known: Set<string> | null}>}
 */
const SURFACE_SUBCOMMANDS = new Map([
  ['run', { bare: true, known: null }],
  ['doctor', { bare: true, known: null }],
  ['eval', { bare: true, known: null }],
  ['skills', { bare: true, known: SKILLS_SUBCOMMANDS }],
  ['runs', { bare: true, known: RUNS_SUBCOMMANDS }],
  ['review', { bare: false, known: REVIEW_SUBCOMMANDS }],
  ['feedback', { bare: false, known: FEEDBACK_SUBCOMMANDS }],
  ['suppression', { bare: false, known: SUPPRESSION_SUBCOMMANDS }],
  ['evolve', { bare: true, known: EVOLVE_SUBCOMMANDS }],
]);

/**
 * The surfaces that actually READ `parsed.base` (#2065).
 *
 * Derived by reading every consumer of the value — `src/cli/commands/run.mjs`
 * (`baseRef: parsed.base`), `src/cli/commands/skills.mjs` (only the
 * subcommand-less `skills <path>` branch reaches `resolveBaseMergeBase`; the
 * `import` / `export` / `list` / `resolve` branches return before it), and
 * `src/cli/commands/review.mjs` (`resolveBaseRepoDiff`, reached from `plan`,
 * `exec` and `route`; `verify` returns from `runReviewVerify` without ever
 * touching it, and its own option contract in
 * `pages/reference/cli-review-verify-spec.md` lists `--artifact` / `--plan` /
 * `--target` rather than `--base`).
 *
 * `tests/cli-base-option-scope.test.mjs` pins this set against the files that
 * mention `parsed.base` / `resolveBaseMergeBase`, so adding a consumer without
 * widening the set (or the reverse) fails there rather than silently.
 *
 * @type {Set<string>}
 */
const BASE_CONSUMING_SURFACES = new Set([
  'run',
  'skills',
  'review plan',
  'review exec',
  'review route',
]);

/**
 * The surfaces that READ `parsed.entry` (#2054 PR-3, Beta).
 *
 * `--entry <name>` names a review Flow entry (a key of the entry map's
 * `entries`, read through `src/lib/flow-loader.mjs`) and is consumed by
 * `src/cli/commands/review.mjs` on the `plan` and `exec` paths, where it
 * attaches the resolved Flow pin to the emitted artifact; on `review exec`
 * (Epic #2011 AC7 P2) it additionally runs the pinned Flow through
 * `src/lib/flow-runner.mjs` and records the per-step outcomes as `steps`.
 * `exec --dry-run` / `exec --plan` share the `review exec` surface word, so
 * the parse layer lets the token through for them too; the handler attaches
 * the pin there and runs no steps. Same INVARIANT as `--base` above: every
 * other surface accepted the token and never read it (before #2054 PR-3 it was
 * an unknown option on all of them), so dropping it restores the previous
 * behavior exactly.
 *
 * @type {Set<string>}
 */
const ENTRY_CONSUMING_SURFACES = new Set(['review plan', 'review exec']);

/**
 * Command-scoped option allowlist (#2065).
 *
 * `KNOWN_OPTION_TOKENS` and the per-option `if` chain inside `parseArgs` are
 * FLAT: every option they know is accepted by every command. That is why
 * `doctor --base <ref>`, `runs list --base <ref>` and `eval --base <ref>`
 * exited 0 while consuming nothing — the same "accepted, therefore effective"
 * misreading that #2046 / #2051 / #2057 closed on the surfaces that do read the
 * value. Rather than rebuild the parser around per-command option tables, this
 * table names the few options whose meaning is surface-specific and the parse
 * loop stays untouched; the check runs once after the loop (see
 * `checkCommandScopedOptions`), which is also the only point where the
 * subcommand word is known regardless of where the caller wrote it
 * (`river review --base X plan` and `river review plan --base X` are both
 * accepted orders since #1755).
 *
 * `promote` and `evolve` already reject out-of-scope options this way through
 * `PROMOTE_SHARED_OPTIONS` / `EVOLVE_SHARED_OPTIONS`, so `promote list --base
 * main` and `evolve aggregate --base main` exited 1 before this change too —
 * this table extends the same contract to the surfaces those two sets do not
 * cover.
 *
 * INVARIANT: every entry here names an option that the out-of-scope surfaces
 * ACCEPTED AND NEVER READ. That is the whole reason the table exists, and it is
 * what makes one shared recovery sentence correct for all of them (#2076):
 * removing the option cannot change what those surfaces do, because they never
 * looked at its value. An option whose presence has a side effect on a surface
 * that does not "read" it does not belong in this table — it needs its own
 * message, not this one.
 *
 * @type {Array<{token: string, given: (parsed: object) => boolean,
 *   surfaces: Set<string>, why: string}>}
 */
const COMMAND_SCOPED_OPTIONS = [
  {
    token: '--base',
    // `--base` requires a value, so a non-null field means it was passed.
    given: (parsed) => parsed.base !== null,
    surfaces: BASE_CONSUMING_SURFACES,
    why: 'that surface does not review a diff',
  },
  {
    token: '--entry',
    given: (parsed) => parsed.entry !== null,
    surfaces: ENTRY_CONSUMING_SURFACES,
    why: 'that surface does not resolve a review Flow entry',
  },
];

/**
 * The surface a parse result names: the command word plus its subcommand when
 * it has one (`review plan`, `skills list`, `runs digest`). Only one of these
 * fields can be set at a time — each is written by the eager branch of the
 * command it belongs to.
 *
 * @param {object} parsed
 * @returns {string}
 */
function currentSubcommand(parsed) {
  return (
    parsed.reviewSubcommand ??
    parsed.skillsSubcommand ??
    parsed.runsSubcommand ??
    parsed.evolveSubcommand ??
    parsed.promoteSubcommand ??
    parsed.suppressionSubcommand ??
    parsed.feedbackSubcommand ??
    null
  );
}

function currentSurface(parsed) {
  const subcommand = currentSubcommand(parsed);
  return subcommand ? `${parsed.command} ${subcommand}` : `${parsed.command}`;
}

/**
 * Whether `currentSurface(parsed)` names a surface that actually exists
 * (#2065 review, minor 1).
 *
 * The subcommand word is taken verbatim by the eager branch for `runs` /
 * `feedback` / `suppression` / `promote` — it is the HANDLER that validates it.
 * Without this gate, `river runs nosuch --base main` reported
 * ``--base is not supported by `river runs nosuch` `` and swallowed the far
 * more useful ``Unknown runs subcommand: nosuch. Use: list | diff | summary |
 * digest``, naming a surface that does not exist. Both exit 1, so the canary
 * cannot see the difference — hence the explicit gate.
 *
 * When the surface cannot be named, this returns false and the command-scoped
 * check stands down, leaving the handler to report the real problem. `--base`
 * is not consumed on any of those paths either way.
 *
 * @param {object} parsed
 * @returns {boolean}
 */
function isNamedSurface(parsed) {
  const entry = SURFACE_SUBCOMMANDS.get(parsed.command);
  if (!entry) return false;
  const subcommand = currentSubcommand(parsed);
  if (subcommand === null) return entry.bare;
  return entry.known !== null && entry.known.has(subcommand);
}

/**
 * Reject an option the current surface accepts but never reads (#2065).
 *
 * Runs post-loop, and only for a real command: `parsed.command` is `null` for
 * a bare `river --base main` (which prints help and exits 0) and `'help'`
 * whenever `-h` / `--help` appeared anywhere in argv — including AFTER the
 * option, as in `river run . --base main --help`. Rejecting either would turn
 * `--help` into a usage error, so both are left alone; neither can be misread
 * as "a review ran against that ref" because neither runs a review.
 *
 * @param {object} parsed
 * @returns {void}
 */
function checkCommandScopedOptions(parsed) {
  if (parsed.usageError) return;
  if (!COMMAND_NAMES.includes(parsed.command)) return;
  // A typo'd subcommand word is the handler's to report, not this check's.
  if (!isNamedSurface(parsed)) return;
  const surface = currentSurface(parsed);
  for (const rule of COMMAND_SCOPED_OPTIONS) {
    if (!rule.given(parsed)) continue;
    if (rule.surfaces.has(surface)) continue;
    // Sentence order: why it was rejected -> where the option IS read -> how to
    // recover (#2076). The recovery sentence closes the Error line rather than
    // taking a line of its own, so that the `Usage:` / ``Run `river --help` ``
    // pair `usageError` prints below stays the last thing on stderr.
    console.error(
      `Error: ${rule.token} is not supported by \`river ${surface}\` — ${rule.why}, ` +
        `so the value would be accepted and never used. ` +
        `Surfaces that read ${rule.token}: ${[...rule.surfaces]
          .map((name) => `river ${name}`)
          .join(', ')}. ` +
        `Drop ${rule.token} to get the previous behavior.`
    );
    usageError(parsed);
    return;
  }
}

/**
 * Read a non-option token that reached the strict-parse catch-all.
 *
 * `parseArgs` consumes the path eagerly when it directly follows the command
 * token (`river run . --dry-run`). Before this helper existed, a path written
 * AFTER a flag (`river run --dry-run .`, the POSIX-conventional order) reached
 * the Slice 3 strict-parse catch-all and was rejected as a surplus positional
 * (regression introduced in #1746 / v1.72.0). The FIRST such token becomes the
 * target instead; the second one is still a surplus positional and still
 * exits 1.
 *
 * A subcommand word is resolved before the path, so that the same token means
 * the same thing wherever it is written.
 *
 * @param {object} parsed
 * @param {string} token
 * @returns {boolean} true when the token was consumed
 */
function takeTrailingPositional(parsed, token) {
  // #1755: `river review --gate exec` swallowed `exec` as the path, leaving the
  // handler with no subcommand — which it reported with exit 3, the code this
  // project reserves for the `--gate` ESCALATE decision. Checked before the
  // `targetConsumed` guard inside takePositionalPath so that a subcommand
  // written after the path (`river review . plan`) resolves as well.
  if (parsed.command === 'review' && !parsed.reviewSubcommand && REVIEW_SUBCOMMANDS.has(token)) {
    parsed.reviewSubcommand = token;
    return true;
  }
  // #2081: `river skills --base main import` swallowed `import` as the target
  // path, so the `--base` allowlist check (#2065) never saw the subcommand and
  // the review ran against `import/` when that directory existed. Vocabulary
  // match only — the eager branch above (`args[0]` right after `skills`) also
  // matches by vocabulary alone and `river skills bogus` is pinned as "read as
  // a path" (#1709 未決 7), so an `!existsSync` heuristic here would make the
  // two word orders disagree again. A directory literally named `import` is
  // still reachable as `river skills ./import`. `!parsed.targetConsumed`
  // mirrors the `evolve` branch: once a path has been taken
  // (`river skills --dry-run . import`), the trailing word is a surplus
  // positional, exactly as the leading form `skills import .` reports it —
  // otherwise the path would be swallowed silently and the subcommand run.
  if (
    parsed.command === 'skills' &&
    !parsed.targetConsumed &&
    !parsed.skillsSubcommand &&
    SKILLS_SUBCOMMANDS.has(token)
  ) {
    parsed.skillsSubcommand = token;
    return true;
  }
  // Mirror the eager branch's priority: a token that matches known
  // `EVOLVE_SUBCOMMANDS` vocabulary is ALWAYS the subcommand, even when a
  // same-named directory exists in cwd (#1759 B1). Before this vocabulary
  // check existed, this branch approximated the decision with `!existsSync`
  // alone, so `river evolve --min 2 aggregate` disagreed with
  // `river evolve aggregate --min 2` whenever an `aggregate` directory was
  // present: the eager branch (which checks `EVOLVE_SUBCOMMANDS` first) read
  // `aggregate` as the subcommand, but this branch read it as a path because
  // `existsSync('aggregate')` was true — same tokens, different meaning,
  // both exiting 0. Only when the token is NOT in the vocabulary does the
  // `!existsSync` heuristic apply, to still reject a mistyped subcommand
  // (`river evolve --output json agregate`) rather than swallow it as a
  // path. `!parsed.evolveSubcommand` also covers the `replay` exclusion,
  // because `replay` is itself a subcommand value.
  if (
    parsed.command === 'evolve' &&
    !parsed.targetConsumed &&
    !parsed.evolveSubcommand &&
    (EVOLVE_SUBCOMMANDS.has(token) || !existsSync(token))
  ) {
    parsed.evolveSubcommand = token;
    return true;
  }
  return takePositionalPath(parsed, token);
}

/**
 * Every option token `parseArgs` recognizes, used only by
 * `takeFreeTextValue()` below. Keep in sync when adding an option.
 */
const KNOWN_OPTION_TOKENS = new Set([
  // suppression
  '--fingerprint',
  '--fingerprint-algo',
  '--finding',
  '--feedback',
  '--scope',
  '--rationale',
  '--severity',
  '--files',
  '--expires',
  '--pr',
  // skills resolve
  '--path',
  // feedback
  '--type',
  '--skill',
  '--trigger',
  '--evidence',
  '--reviewer',
  '--model',
  '--reversed-by',
  '--run-id',
  // promote
  '--approver',
  '--reason',
  '--index',
  '--include-inactive',
  '--threshold',
  '--feedback-root',
  '--input',
  '--cluster-key',
  '--policy-version',
  // evolve
  '--min',
  '--month',
  '--spec',
  '--expect-manifest',
  // shared / review
  '--plan-only',
  '--fail-on',
  '--warn-on',
  '--advisory-only',
  '--gate',
  '--offline',
  '--rules-only',
  '--plan',
  '--output-file',
  '--summary-file',
  '--quiet',
  '--artifacts-dir',
  '--artifact',
  '--ensemble',
  '--phase',
  '--cases',
  '--verbose',
  '--planner',
  '--dry-run',
  '--debug',
  '--explain',
  '--estimate',
  '--max-cost',
  '--output',
  '--format',
  '--context',
  '--dependency',
  '--reviewers',
  '--baseline',
  '--base',
  '--entry',
  '--skill-set',
  '--depth',
  '--save',
  '--from',
  '--to',
  '--strict',
  '--loose',
  '--source',
  '--include-assets',
  '-h',
  '--help',
]);

/**
 * Cache for {@link knownInputContexts}. `undefined` = not read yet,
 * `null` = read failed (stay quiet), array = the vocabulary.
 * @type {string[] | null | undefined}
 */
let knownInputContextsCache;

/**
 * The `inputContext` vocabulary, read from its SSoT
 * `schemas/skill.schema.json` `$defs.inputContext.enum` — the very file
 * `runners/core/skill-loader.mjs` validates every skill against (its
 * `defaultSchemaPath`). Because that schema is a closed enum, a value outside
 * it cannot appear in any skill's `inputContext`, and the match in
 * `runners/core/review-runner.mjs` `missingInputContexts()` is an exact
 * `Set.has()` — so such a value can never make a skill eligible.
 *
 * Read lazily (only when `--context` is actually passed) so the common path
 * pays nothing, and fail-safe: if the schema cannot be read or parsed we
 * return `null` and warn about nothing rather than guess at the vocabulary.
 *
 * @returns {string[] | null}
 */
function knownInputContexts() {
  if (knownInputContextsCache !== undefined) return knownInputContextsCache;
  try {
    // NOTE: pass the URL object straight to readFileSync — do NOT wrap it in
    // `fileURLToPath()`. ncc rewrites `new URL(<asset>, import.meta.url)` into
    // `__nccwpck_require__.ab + "skill.schema.json"`, a BARE absolute path
    // rather than a file URL, so `fileURLToPath()` throws `ERR_INVALID_URL` in
    // `runners/github-action/dist/**` and the fail-safe below swallows it —
    // the warning would then never fire on the bundled surface (#1958 review).
    const schema = JSON.parse(
      readFileSync(new URL('../schemas/skill.schema.json', import.meta.url), 'utf8')
    );
    const values = schema?.$defs?.inputContext?.enum;
    knownInputContextsCache = Array.isArray(values) && values.length > 0 ? values : null;
  } catch {
    knownInputContextsCache = null;
  }
  return knownInputContextsCache;
}

/**
 * Warn (stderr only, exit code untouched) when `--context` carries a value
 * that is outside the `inputContext` vocabulary. Without this, a typo makes
 * every skill skip with `missing inputContext: diff` and the review comes back
 * empty, which reads as "nothing applied" rather than "you mistyped a flag".
 *
 * All unknown values go into ONE line so a multi-typo list stays scannable and
 * matches the single-line `Warning:` shape used elsewhere in this file.
 * Legitimate values produce no output at all.
 *
 * Scope: this CLI flag only. `RIVER_AVAILABLE_CONTEXTS` merges in later inside
 * `resolveAvailableContexts()` (src/lib/utils.mjs), which is bundled into
 * `runners/github-action/dist/**` — warning there would mean a dist rebuild
 * and would fire from library call sites too, so it is left out of this change.
 * The other `river` CLI (`runners/cli/src/index.mjs:29`, whose `--context` is
 * split in `runners/cli/src/commands/review.mjs:33`) is likewise out of scope.
 *
 * Wording: the claim is deliberately NOT "no effect". An unknown value cannot
 * make any skill eligible — that part is closed by the enum — but it is not
 * inert everywhere: `src/lib/local-runner.mjs:359` forwards `availableContexts`
 * to `buildExecutionPlan`, `runners/core/review-runner.mjs:352-358` passes it
 * into `planSkills`, and `src/lib/openai-planner.mjs:39-40,54` interpolates it
 * verbatim into the LLM planner prompt (`- availableContexts: ...`). With
 * `--planner order|prune` and an API key, the typo therefore still reaches the
 * model and can move ordering / pruning of the ALREADY selected skills.
 *
 * @param {string[]} contexts
 */
function warnUnknownInputContexts(contexts) {
  const known = knownInputContexts();
  if (!known) return;
  const unknown = [...new Set(contexts.filter((ctx) => !known.includes(ctx)))];
  if (unknown.length === 0) return;
  console.warn(
    `Warning: --context value(s) outside the skill inputContext vocabulary: ` +
      `${unknown.join(', ')}. No skill can be made eligible by them. ` +
      `Accepted values: ${known.join(', ')}.`
  );
}

/**
 * Value reader for options whose value is FREE TEXT a human writes
 * (`--rationale`, `--evidence`, `--reason`).
 *
 * The `!value || value.startsWith('-')` guard the other options use is correct
 * for paths, enums, ids and numbers, but it rejects legitimate prose: a
 * rationale such as `"-1 は誤検知"` was reported back as
 * "--rationale option requires a value", which is both a false rejection and a
 * misleading message. Free-text options therefore accept a leading `-`.
 *
 * The failure case that must STAY blocked is #1717: `--evidence --pr 123`
 * silently recorded `evidence: "--pr"` and dropped the pr. So "missing value"
 * here means "no next token, or the next token is an option this parser
 * recognizes" — prose is accepted, a real flag is not swallowed.
 *
 * @param {string[]} args - remaining argv (not consumed when the value is missing).
 * @returns {{ value: string } | { missing: true }}
 */
function takeFreeTextValue(args) {
  const next = args[0];
  if (next === undefined || KNOWN_OPTION_TOKENS.has(next) || next.startsWith('--run-id=')) {
    return { missing: true };
  }
  return { value: args.shift() };
}

/**
 * Command-scoped option handlers extracted out of `parseArgs`' `while` loop.
 *
 * Each handler receives the token just shifted off (`arg`), the REMAINING argv
 * (`args`, mutated in place when the handler consumes a value) and the result
 * object (`parsed`, mutated in place). The return value names the statement the
 * CALLER must run against the loop, because a `continue` / `break` inside a
 * helper cannot reach the loop it was lifted out of:
 *
 *   'continue' – the token was this command's and is fully handled.
 *   'break'    – a usage error was reported; stop parsing.
 *   null       – not this command's token; fall through to the shared parser.
 *
 * The handlers are behaviour-identical to the inline blocks they replace; the
 * guard that selects them (`parsed.command === '<cmd>'`) stays at the call site
 * so the dispatch order remains readable in `parseArgs`.
 * @typedef {'continue' | 'break' | null} OptionOutcome
 */

/**
 * `skills resolve --path <p>` (repeatable).
 * @param {string} arg
 * @param {string[]} args
 * @param {Record<string, any>} parsed
 * @returns {OptionOutcome}
 */
function parseSkillsResolveOption(arg, args, parsed) {
  if (arg === '--path') {
    parsed.resolvePaths = parsed.resolvePaths ?? [];
    const v = args.shift();
    if (v) parsed.resolvePaths.push(v);
    return 'continue';
  }
  return null;
}

/**
 * `promote` options.
 * @param {string} arg
 * @param {string[]} args
 * @param {Record<string, any>} parsed
 * @returns {OptionOutcome}
 */
function parsePromoteOption(arg, args, parsed) {
  if (arg === '--approver') {
    const value = args.shift();
    if (!value || value.startsWith('-')) {
      console.error('Error: --approver option requires a value.');
      usageError(parsed);
      return 'break';
    }
    parsed.promoteApprover = value;
    return 'continue';
  }
  if (arg === '--reason') {
    // Free text (approval / rejection prose written by a human).
    const taken = takeFreeTextValue(args);
    if (taken.missing) {
      console.error('Error: --reason option requires a value.');
      usageError(parsed);
      return 'break';
    }
    parsed.promoteReason = taken.value;
    return 'continue';
  }
  if (arg === '--index') {
    const value = args.shift();
    if (!value || value.startsWith('-')) {
      console.error('Error: --index option requires a path.');
      usageError(parsed);
      return 'break';
    }
    parsed.promoteIndex = value;
    return 'continue';
  }
  if (arg === '--include-inactive') {
    parsed.promoteIncludeInactive = true;
    return 'continue';
  }
  if (arg === '--threshold') {
    const value = args.shift();
    // Strict parse: parseInt('2garbage') is 2, so a typo would silently
    // become a different threshold than the one that was typed.
    if (!value || !/^\d+$/.test(value) || Number.parseInt(value, 10) < 1) {
      console.error('Error: --threshold option requires a positive integer.');
      usageError(parsed);
      return 'break';
    }
    parsed.promoteThreshold = Number.parseInt(value, 10);
    return 'continue';
  }
  if (arg === '--feedback-root') {
    const value = args.shift();
    if (!value || value.startsWith('-')) {
      console.error('Error: --feedback-root option requires a path.');
      usageError(parsed);
      return 'break';
    }
    parsed.promoteFeedbackRoot = value;
    return 'continue';
  }
  if (arg === '--input') {
    const value = args.shift();
    if (!value || value.startsWith('-')) {
      console.error('Error: --input option requires a JSONL path.');
      usageError(parsed);
      return 'break';
    }
    parsed.promoteInput = value;
    return 'continue';
  }
  if (arg === '--cluster-key') {
    const value = args.shift();
    if (!value || value.startsWith('-')) {
      console.error('Error: --cluster-key option requires a value.');
      usageError(parsed);
      return 'break';
    }
    parsed.promoteClusterKey = value;
    return 'continue';
  }
  if (arg === '--policy-version') {
    const value = args.shift();
    if (!value || value.startsWith('-')) {
      console.error('Error: --policy-version option requires a value.');
      usageError(parsed);
      return 'break';
    }
    parsed.promotePolicyVersion = value;
    return 'continue';
  }
  // Options that are neither promote's own nor handled by the shared parser
  // must fail loudly instead of being ignored (a mistyped `--dry-rnu` would
  // otherwise write the Riverbed index for real).
  if (arg.startsWith('-') && !PROMOTE_SHARED_OPTIONS.has(arg)) {
    parsed.promoteUnknownOption = arg;
    return 'break';
  }
  return null;
}

/**
 * `evolve` options.
 * @param {string} arg
 * @param {string[]} args
 * @param {Record<string, any>} parsed
 * @returns {OptionOutcome}
 */
function parseEvolveOption(arg, args, parsed) {
  if (arg === '--min') {
    const value = args.shift();
    // Strict parse, same reason as promote's --threshold above.
    if (!value || !/^\d+$/.test(value) || Number.parseInt(value, 10) < 1) {
      console.error('Error: --min option requires a positive integer.');
      usageError(parsed);
      return 'break';
    }
    parsed.evolveMin = Number.parseInt(value, 10);
    return 'continue';
  }
  if (arg === '--month') {
    const value = args.shift();
    // #1759 (C4): the literal YYYY-MM shape alone let `2026-13` / `2026-00`
    // through, since /^\d{4}-\d{2}$/ does not know what a valid month is.
    // Parse the MM segment and require it to be 01-12; the year segment is
    // left unrestricted (4 digits) because aggregate data can legitimately
    // exist for any calendar year and narrowing it would reject valid past
    // or future months without a corresponding need.
    const match = value && /^(\d{4})-(\d{2})$/.exec(value);
    const monthNum = match ? Number.parseInt(match[2], 10) : NaN;
    if (!match || monthNum < 1 || monthNum > 12) {
      console.error('Error: --month option requires a YYYY-MM value.');
      usageError(parsed);
      return 'break';
    }
    parsed.evolveMonth = value;
    return 'continue';
  }
  if (arg === '--spec') {
    const value = args.shift();
    if (!value || value.startsWith('-')) {
      console.error('Error: --spec option requires a file path.');
      usageError(parsed);
      return 'break';
    }
    parsed.evolveSpec = value;
    return 'continue';
  }
  if (arg === '--expect-manifest') {
    const value = args.shift();
    if (!value || value.startsWith('-')) {
      console.error('Error: --expect-manifest option requires a manifest id or hash.');
      usageError(parsed);
      return 'break';
    }
    parsed.evolveExpectManifest = value;
    return 'continue';
  }
  // Options that are not evolve's own and not handled by the shared parser
  // below must fail loudly instead of being ignored.
  if (arg.startsWith('-') && !EVOLVE_SHARED_OPTIONS.has(arg)) {
    parsed.evolveUnknownOption = arg;
    return 'break';
  }
  return null;
}

/**
 * `runs` positional run-ID collector (#1759 B2).
 *
 * Only `runs diff` takes positionals (two or more run IDs), and they may
 * appear before, after, or interleaved with options such as `--output json`.
 * Every non-option token seen while `diff` is the active subcommand is a run
 * ID; option tokens (`--output` and any future runs option) are left
 * untouched here so the shared handlers below (or the final unknown-option
 * catch-all) process them exactly as they do for every other command.
 *
 * @param {string} arg
 * @param {string[]} args - unused; kept for signature parity with the other
 *   `parse*Option` dispatchers (`parsePromoteOption` etc. all take this shape).
 * @param {Record<string, any>} parsed
 * @returns {OptionOutcome}
 */
function parseRunsOption(arg, args, parsed) {
  if (parsed.runsSubcommand !== 'diff' || arg.startsWith('-')) return null;
  parsed.runsIds.push(arg);
  if (parsed.runsId1 === null) parsed.runsId1 = arg;
  else if (parsed.runsId2 === null) parsed.runsId2 = arg;
  return 'continue';
}

/**
 * `feedback` options.
 * @param {string} arg
 * @param {string[]} args
 * @param {Record<string, any>} parsed
 * @returns {OptionOutcome}
 */
function parseFeedbackOption(arg, args, parsed) {
  // #1717: every option below takes a value, and `args.shift() ?? null`
  // guarded none of them. A missing value consumed the FOLLOWING flag as
  // this option's value (so `--pr --evidence x` lost both at once), and a
  // value that failed validation was dropped in silence while the entry was
  // still written. Each option now rejects a missing value / a following
  // flag up front with the same `!value || value.startsWith('-')` guard the
  // --reviewer / --model / --run-id options below already use. The
  // option-error convention itself (stderr message + help) is unchanged;
  // unifying its exit code is #1709.
  if (arg === '--type') {
    const value = args.shift();
    if (!value || value.startsWith('-')) {
      console.error('Error: --type option requires a value.');
      usageError(parsed);
      return 'break';
    }
    parsed.feedbackType = value;
    return 'continue';
  }
  if (arg === '--skill') {
    const value = args.shift();
    // `--skill --pr 123` used to record skillId:"--pr": a flag is a
    // non-empty string, so buildFeedbackEntry's "skillId is required."
    // check accepted it and wrote the entry.
    if (!value || value.startsWith('-')) {
      console.error('Error: --skill option requires a value.');
      usageError(parsed);
      return 'break';
    }
    parsed.feedbackSkillId = value;
    return 'continue';
  }
  if (arg === '--trigger') {
    const value = args.shift();
    // A trailing `--trigger` used to null the field, which the handler maps
    // back to undefined — so the entry was written with the DEFAULT trigger
    // instead of the one the caller meant to set.
    if (!value || value.startsWith('-')) {
      console.error('Error: --trigger option requires a value.');
      usageError(parsed);
      return 'break';
    }
    parsed.feedbackTrigger = value;
    return 'continue';
  }
  if (arg === '--fingerprint') {
    const value = args.shift();
    if (!value || value.startsWith('-')) {
      console.error('Error: --fingerprint option requires a value.');
      usageError(parsed);
      return 'break';
    }
    parsed.feedbackFingerprint = value;
    return 'continue';
  }
  if (arg === '--evidence') {
    // Free text. `--evidence --pr 123` (recording evidence:"--pr" and
    // dropping the pr, #1717) stays blocked because takeFreeTextValue
    // treats a recognized option token as a missing value.
    const taken = takeFreeTextValue(args);
    if (taken.missing) {
      console.error('Error: --evidence option requires a value.');
      usageError(parsed);
      return 'break';
    }
    parsed.feedbackEvidence = taken.value;
    return 'continue';
  }
  if (arg === '--pr') {
    const value = args.shift();
    // Strict parse, same shape as --threshold (#1658): parseInt('12abc') is
    // 12 and parseInt('1.5') is 1, so a typo silently recorded a DIFFERENT
    // pr than the one that was typed, while 'abc' / 0 / -5 / a following
    // flag all became pr:null on an entry that was still written (exit 0).
    // `pr` is one half of the occurrence key (review_run_id, pr), so a null
    // or wrong value skews the repetition denominator downstream (#1717).
    if (!value || !/^\d+$/.test(value) || Number.parseInt(value, 10) < 1) {
      console.error('Error: --pr option requires a positive integer.');
      usageError(parsed);
      return 'break';
    }
    parsed.feedbackPrNumber = Number.parseInt(value, 10);
    return 'continue';
  }
  if (arg === '--reviewer') {
    const value = args.shift();
    if (!value || value.startsWith('-')) {
      console.error('Error: --reviewer option requires a value.');
      usageError(parsed);
      return 'break';
    }
    parsed.feedbackReviewer = value;
    return 'continue';
  }
  if (arg === '--model') {
    const value = args.shift();
    if (!value || value.startsWith('-')) {
      console.error('Error: --model option requires a value.');
      usageError(parsed);
      return 'break';
    }
    parsed.feedbackModel = value;
    return 'continue';
  }
  if (arg === '--reversed-by') {
    const value = args.shift();
    if (!value || value.startsWith('-')) {
      console.error('Error: --reversed-by option requires a value.');
      usageError(parsed);
      return 'break';
    }
    parsed.feedbackReversedBy = value;
    return 'continue';
  }
  // #1673: the run this feedback refers to. Only an explicit id is
  // accepted — resolving "the latest run" implicitly would attach evidence
  // to an unrelated run.
  //
  // Two silent-miss paths this parse deliberately closes, both of which
  // exited 0 while writing an entry with no `review_run_id` (so the loss
  // only surfaced much later as joinedFeedbackCount staying at 0):
  //   1. `--run-id=<id>`: the token never equals '--run-id', so an
  //      equals-form value fell through and was dropped.
  //   2. `--run-id "   "`: whitespace passes a truthiness check, then
  //      normalizeOptionalString() nulls it out downstream.
  // The `=` form is scoped to THIS option on purpose; extending it to
  // --reviewer / --model / --reversed-by would change their behaviour and
  // is out of scope here.
  if (arg === '--run-id' || arg.startsWith('--run-id=')) {
    const value = arg.startsWith('--run-id=') ? arg.slice('--run-id='.length) : args.shift();
    if (!value || !value.trim() || value.startsWith('-')) {
      console.error('Error: --run-id option requires a value.');
      usageError(parsed);
      return 'break';
    }
    parsed.feedbackRunId = value;
    return 'continue';
  }
  return null;
}

/**
 * `suppression` options.
 * @param {string} arg
 * @param {string[]} args
 * @param {Record<string, any>} parsed
 * @returns {OptionOutcome}
 */
function parseSuppressionOption(arg, args, parsed) {
  // #1709 Slice 3: every option below takes a value, and none of the
  // `args.shift() ?? <default>` forms guarded it. A trailing `--scope`
  // silently fell back to 'file' and a `--pr abc` was silently dropped —
  // in both cases the suppression entry was still WRITTEN with exit 0
  // (holes found by the Slice 2 adversarial review; pinned in the canary).
  // Same guard shape as the feedback options below (#1717).
  if (arg === '--fingerprint') {
    const value = args.shift();
    if (!value || value.startsWith('-')) {
      console.error('Error: --fingerprint option requires a value.');
      usageError(parsed);
      return 'break';
    }
    parsed.suppressionFingerprint = value;
    return 'continue';
  }
  if (arg === '--fingerprint-algo') {
    // #1797: opt-in selector for the line-anchored fingerprint. The
    // default stays 'v1' so existing workflows and every entry already in
    // `.river/memory/index.json` keep their meaning. Validated here rather
    // than in the handler for the same reason as --severity (#1746): an
    // unrecognized algo would otherwise be persisted and then ignored by
    // applySuppressions, i.e. a silently inert suppression written at
    // exit 0. Vocabulary SSoT: schemas/suppression-context.schema.json
    // `$defs.fingerprintAlgo.enum`.
    const value = args.shift();
    if (!value || value.startsWith('-')) {
      console.error('Error: --fingerprint-algo option requires a value.');
      usageError(parsed);
      return 'break';
    }
    // 大小無視で受理し、小文字化して保存する。`--severity` / `--phase` /
    // `--fail-on` / `--warn-on` はいずれもこの形であり、ここだけ大小を
    // 区別すると `--severity Critical` は通るのに `--fingerprint-algo V2`
    // だけ exit 1 という非対称になる（v1.72.1 の `--phase Upstream`
    // 誤拒否と同型の回帰）。schema の enum は小文字なので保存値も小文字。
    const algo = value.toLowerCase();
    if (!SUPPRESSION_FINGERPRINT_ALGOS.includes(algo)) {
      console.error(
        `Error: --fingerprint-algo must be one of: ${SUPPRESSION_FINGERPRINT_ALGOS.join(', ')} (got "${value}").`
      );
      usageError(parsed);
      return 'break';
    }
    parsed.suppressionFingerprintAlgo = algo;
    return 'continue';
  }
  if (arg === '--finding') {
    const value = args.shift();
    if (!value || value.startsWith('-')) {
      console.error('Error: --finding option requires a value.');
      usageError(parsed);
      return 'break';
    }
    parsed.suppressionFindingId = value;
    return 'continue';
  }
  if (arg === '--feedback') {
    const value = args.shift();
    if (!value || value.startsWith('-')) {
      console.error('Error: --feedback option requires a value.');
      usageError(parsed);
      return 'break';
    }
    parsed.suppressionFeedbackType = value;
    return 'continue';
  }
  if (arg === '--scope') {
    const value = args.shift();
    if (!value || value.startsWith('-')) {
      console.error('Error: --scope option requires a value.');
      usageError(parsed);
      return 'break';
    }
    parsed.suppressionScope = value;
    return 'continue';
  }
  if (arg === '--rationale') {
    // Free text (`--rationale "-1 は誤検知"` must be accepted).
    const taken = takeFreeTextValue(args);
    if (taken.missing) {
      console.error('Error: --rationale option requires a value.');
      usageError(parsed);
      return 'break';
    }
    parsed.suppressionRationale = taken.value;
    return 'continue';
  }
  if (arg === '--severity') {
    const value = args.shift();
    if (!value || value.startsWith('-')) {
      console.error('Error: --severity option requires a value.');
      usageError(parsed);
      return 'break';
    }
    // #1746 follow-up: Slice 3 guarded the MISSING value but not an invalid
    // one, so `--severity BOGUS` exited 0 and persisted
    // `context.severity: "BOGUS"` — a value the suppression-context schema
    // rejects and which suppression-apply's SEVERITY_RANK lookup reads as
    // undefined.
    //
    // Case-insensitive, storing the lowercased value: `--fail-on` /
    // `--warn-on` take the SAME vocabulary and already lowercase before
    // comparing, so rejecting `--severity Critical` while accepting
    // `--fail-on CRITICAL` would be an asymmetry between two options that
    // mean the same thing. The schema enum is lowercase, so the stored
    // value must be too.
    const severity = value.toLowerCase();
    if (!SEVERITY_VALUES.includes(severity)) {
      console.error(
        `Error: --severity must be one of: ${SEVERITY_VALUES.join(', ')} (got "${value}").`
      );
      usageError(parsed);
      return 'break';
    }
    parsed.suppressionSeverity = severity;
    return 'continue';
  }
  if (arg === '--files') {
    const value = args.shift();
    if (!value || value.startsWith('-')) {
      console.error('Error: --files option requires a comma-separated list.');
      usageError(parsed);
      return 'break';
    }
    parsed.suppressionFiles = parseList(value);
    return 'continue';
  }
  if (arg === '--expires') {
    const value = args.shift();
    if (!value || value.startsWith('-')) {
      console.error('Error: --expires option requires a value.');
      usageError(parsed);
      return 'break';
    }
    // #1746 follow-up: `--expires notadate` used to be persisted verbatim as
    // `context.expiresAt`. The expiry check compares that string against the
    // current ISO timestamp, and an unparseable value never compares as
    // past — the suppression would never expire.
    //
    // A bare `Date.parse` guard is too loose to be the fix: it also accepts
    // `2027`, `March 5, 2027` and `2027-01-01`, and `createSuppression`
    // stores the string verbatim, so those land in `context.expiresAt`,
    // which schemas/suppression-context.schema.json declares as
    // `format: date-time`. Accept only the two RFC 3339 shapes below and
    // NORMALIZE to the same form the rest of the codebase writes
    // (`new Date(...).toISOString()`, as in promotion-candidates.mjs), so a
    // date-only input stays convenient AND schema-valid. Date-only inputs
    // are read as UTC midnight — that is what `new Date('2027-01-01')`
    // already does for the date-only ISO form.
    const expires = parseExpiresAt(value);
    if (!expires) {
      console.error(
        `Error: --expires must be an RFC 3339 date (YYYY-MM-DD) or date-time (e.g. 2027-01-01T00:00:00Z) (got "${value}").`
      );
      usageError(parsed);
      return 'break';
    }
    parsed.suppressionExpiresAt = expires;
    return 'continue';
  }
  if (arg === '--pr') {
    const value = args.shift();
    // Strict parse, same shape as the feedback --pr below: parseInt('abc')
    // used to become NaN and be dropped in silence while the entry was
    // still written with exit 0.
    if (!value || !/^\d+$/.test(value) || Number.parseInt(value, 10) < 1) {
      console.error('Error: --pr option requires a positive integer.');
      usageError(parsed);
      return 'break';
    }
    parsed.suppressionPrNumber = Number.parseInt(value, 10);
    return 'continue';
  }
  return null;
}

function parseArgs(argv) {
  const args = [...argv];
  // Whether a positional path was taken from AFTER a POSIX `--` terminator.
  // Only used to phrase the `review` usage error correctly (see below): a token
  // the caller explicitly declared to be a path must not be reported as "not a
  // subcommand".
  let terminatorTookPositional = false;
  const parsed = {
    command: null,
    // #1709 Slice 2: set (via usageError) when an option/command parse error
    // was already reported to stderr; main() then exits 1 without help.
    usageError: false,
    target: '.',
    // Whether a positional <path> has already been taken. Distinguishes
    // "target is still the default `.`" from "target was explicitly given",
    // which `target` alone cannot express. See takeTrailingPositional.
    targetConsumed: false,
    fixturesCasesPath: null,
    verbose: false,
    phase: process.env.RIVER_PHASE || 'midstream',
    // #1759 C2: set to true only by the --phase branch below, once its value
    // has passed the PHASES check. Lets the post-loop RIVER_PHASE validation
    // tell "an explicit, already-validated --phase" apart from "still the
    // raw (possibly invalid) env-or-default value".
    phaseExplicit: false,
    plannerMode: process.env.RIVER_PLANNER_MODE || 'off',
    dryRun: false,
    debug: false,
    estimate: false,
    maxCost: null,
    output: 'text',
    outputExplicit: false,
    format: null,
    formatExplicit: false,
    availableContexts: null,
    availableDependencies: null,
    reviewers: null,
    baseline: null,
    base: null,
    entry: null,
    skillSet: null,
    depth: null,
    save: false,
    // runs subcommand fields
    runsSubcommand: null,
    runsId1: null,
    runsId2: null,
    runsIds: [], // all run IDs for multi-run diff (3+)
    // suppression subcommand fields (#687 PR-D)
    suppressionSubcommand: null,
    feedbackSubcommand: null,
    feedbackType: null,
    feedbackSkillId: null,
    feedbackTrigger: null,
    feedbackFingerprint: null,
    feedbackEvidence: null,
    feedbackPrNumber: null,
    feedbackReviewer: null,
    feedbackModel: null,
    feedbackReversedBy: null,
    feedbackRunId: null,
    suppressionFingerprint: null,
    // #1797: 'v1' (no line) stays the default so this option is opt-in.
    suppressionFingerprintAlgo: 'v1',
    suppressionFindingId: null,
    suppressionFeedbackType: null,
    suppressionScope: 'file',
    suppressionRationale: null,
    suppressionSeverity: null,
    suppressionFiles: null,
    suppressionExpiresAt: null,
    suppressionPrNumber: null,
    // promote subcommand fields (#1622 / #1568-B)
    promoteSubcommand: null,
    promoteId: null,
    promoteApprover: null,
    promoteReason: null,
    promoteIndex: null,
    promoteIncludeInactive: false,
    promoteThreshold: null,
    promoteFeedbackRoot: null,
    // promote propose fields (#1624 / #1574 P0 contract 4)
    promoteInput: null,
    promoteClusterKey: null,
    promotePolicyVersion: null,
    promoteUnknownOption: null,
    // evolve subcommand fields (#1574 P1 Shadow aggregate / P2 Paired replay)
    evolveSubcommand: null,
    evolveMin: null,
    evolveMonth: null,
    evolveSpec: null,
    evolveExpectManifest: null,
    evolveExtraArgs: [],
    evolveUnknownOption: null,
    // skills subcommand fields
    skillsSubcommand: null,
    resolvePaths: null,
    fromPath: null,
    toPath: null,
    validationMode: 'strict',
    listSource: 'all',
    includeAssets: false,
    // review subcommand fields (#802 Phase 3)
    reviewSubcommand: null,
    planOnly: false,
    failOn: null,
    warnOn: null,
    advisoryOnly: false,
    gate: false,
    offline: false,
    outputFile: null,
    summaryFile: null,
    quiet: false,
    artifactsDir: null,
    cliArtifacts: {},
    planFile: null,
  };

  while (args.length) {
    const arg = args.shift();
    // POSIX end-of-options terminator (#1759 A1). Every token after `--` is a
    // positional path: never an option (so a path that literally starts with a
    // dash can be passed) and never a subcommand word. `river run -- .` exited
    // 0 up to v1.71.1 and started failing with `Error: unknown option --.` when
    // the Slice 3 strict parse landed in v1.72.0, because `--` matched no rule
    // and fell through to the catch-all. Handled here, ahead of the
    // command-specific blocks, so that all five path-taking surfaces behave the
    // same (`evolve` would otherwise report it as its own unknown option).
    if (arg === '--') {
      const { error, tookPositional } = consumeTerminator(parsed, args);
      if (tookPositional) terminatorTookPositional = true;
      if (error) {
        usageError(parsed);
        break;
      }
      continue;
    }
    if (!parsed.command && EAGER_COMMANDS.has(arg)) {
      consumeEagerCommand(parsed, arg, args);
      continue;
    }
    if (parsed.command === 'suppression') {
      const outcome = parseSuppressionOption(arg, args, parsed);
      if (outcome === 'continue') continue;
      if (outcome === 'break') break;
    }
    if (parsed.command === 'skills' && parsed.skillsSubcommand === 'resolve') {
      const outcome = parseSkillsResolveOption(arg, args, parsed);
      if (outcome === 'continue') continue;
      if (outcome === 'break') break;
    }
    if (parsed.command === 'feedback') {
      const outcome = parseFeedbackOption(arg, args, parsed);
      if (outcome === 'continue') continue;
      if (outcome === 'break') break;
    }
    if (parsed.command === 'promote') {
      const outcome = parsePromoteOption(arg, args, parsed);
      if (outcome === 'continue') continue;
      if (outcome === 'break') break;
    }
    if (parsed.command === 'evolve') {
      const outcome = parseEvolveOption(arg, args, parsed);
      if (outcome === 'continue') continue;
      if (outcome === 'break') break;
    }
    if (parsed.command === 'runs') {
      const outcome = parseRunsOption(arg, args, parsed);
      if (outcome === 'continue') continue;
      if (outcome === 'break') break;
    }
    if (!parsed.command && arg === 'eval') {
      parsed.command = 'eval';
      continue;
    }
    if (!parsed.command && arg === 'review') {
      parsed.command = 'review';
      // Only a KNOWN subcommand is taken here (#1755). Any non-flag token used
      // to be recorded as the subcommand, so `river review . --plan-only`
      // reported `.` as an unknown subcommand instead of reading it as the
      // path. A token that is not in the vocabulary falls through to the
      // positional path below, and a subcommand written after the options is
      // still resolved by takeTrailingPositional().
      if (args[0] && REVIEW_SUBCOMMANDS.has(args[0])) {
        parsed.reviewSubcommand = args.shift(); // plan | exec | verify | route
      }
      // Consume optional positional target path (e.g., `river review route .`)
      if (args[0] && !args[0].startsWith('-')) {
        parsed.target = args.shift();
        parsed.targetConsumed = true;
      }
      continue;
    }
    // #1709 Slice 2 (B1): an unknown leading token used to fall through
    // silently, leaving `parsed.command` null — so main() printed the full
    // help and exited 0, and its `Unknown command:` branch was unreachable
    // dead code. Record the token as the command so that branch actually
    // fires (exit 1, error on stderr).
    if (!parsed.command && !arg.startsWith('-')) {
      parsed.command = arg;
      break;
    }
    const optionResult = consumeOption(parsed, arg, args);
    if (optionResult === 'continue') continue;
    if (optionResult === 'break') {
      usageError(parsed);
      break;
    }
    if (arg === '-h' || arg === '--help') {
      parsed.command = 'help';
      break;
    }
    // #1709 Slice 3: strict parse. A token that reaches this point matched no
    // rule above. It used to be ignored in silence (exit 0), so a typo like
    // `--dry-runn` ran the command as if the flag had not been given, and a
    // surplus positional was dropped without a trace. Note: promote / evolve
    // detect their own unknown options above (promoteUnknownOption /
    // evolveUnknownOption) and keep their handler-level messages.
    // ...with one exception: `<command> <flags> <path>` is the POSIX-conventional
    // order and used to work. Slice 3's catch-all rejected it as a surplus
    // positional (v1.72.0 regression). The FIRST non-option token of a
    // path-taking command is the path wherever it appears; the SECOND one is
    // still surplus and still exits 1.
    if (!arg.startsWith('-') && takeTrailingPositional(parsed, arg)) {
      continue;
    }
    if (arg.startsWith('-')) {
      console.error(`Error: unknown option ${arg}.`);
    } else {
      console.error(`Error: unexpected argument "${arg}".`);
    }
    usageError(parsed);
    break;
  }

  // #1759 C3: warn once, against the list that actually survives the loop.
  // Not guarded by `parsed.usageError` on purpose — today a `--context` typo
  // followed by a bad option prints both the advisory and the error, and this
  // change is about de-duplicating the advisory, not about suppressing it on
  // the error path.
  if (parsed.availableContexts) {
    warnUnknownInputContexts(parsed.availableContexts);
  }

  if (checkReviewSubcommand(parsed, terminatorTookPositional)) {
    usageError(parsed);
  }

  // #2065: an option the resolved surface accepts but never reads. Placed
  // after the `review` subcommand check on purpose — that check is what turns
  // a missing / unknown subcommand into a usage error, and this one must not
  // report `river review null` on top of it (checkCommandScopedOptions returns
  // early when parsed.usageError is already set).
  checkCommandScopedOptions(parsed);

  if (applyPhaseFallback(parsed)) {
    usageError(parsed);
  }

  return parsed;
}

async function main(argv = process.argv.slice(2)) {
  const parsed = parseArgs(argv);
  // #1709 Slice 2: parseArgs already reported the usage error to stderr
  // (Error line + usage hint). Exit 1 without printing the full help to
  // stdout — usage errors must not pollute redirected stdout artifacts.
  if (parsed.usageError) {
    return 1;
  }
  if (parsed.command === 'help' || !parsed.command) {
    printHelp();
    return 0;
  }
  // Epic #1347 S4 (#1351): `--gate` enforces the gate decision as an exit code;
  // `--advisory-only` forces exit 0. They are contradictory — fail loudly
  // (exit 1) rather than silently letting one win.
  if (parsed.gate && parsed.advisoryOnly) {
    console.error('Error: --gate cannot be combined with --advisory-only (contradictory).');
    return 1;
  }
  // The replay path (`review exec --plan <file>`) deliberately omits the gate
  // block — a replayed artifact's risk-map / diff context is not this run's
  // (see review-plan.mjs finalizeArtifact). So --gate on replay could only ever
  // fail-safe to exit 1; reject it explicitly rather than always exiting 1.
  if (parsed.gate && typeof parsed.planFile === 'string') {
    console.error(
      'Error: --gate is not supported with --plan (the replay path does not derive an authoritative gate).'
    );
    return 1;
  }
  // Offline (rules-only) mode: force-disable AI for this process so the review
  // runs on deterministic heuristics only (ADR-002 / #1071). isLlmEnabled()
  // honors RIVER_OFFLINE across all call sites (dispatcher / runner / engine).
  if (parsed.offline) {
    process.env.RIVER_OFFLINE = '1';
  }
  if (!COMMAND_NAMES.includes(parsed.command)) {
    // Reachable since #1709 Slice 2: parseArgs records an unknown leading
    // token as the command instead of silently leaving it null (which used
    // to print the full help and exit 0).
    console.error(`Unknown command: ${parsed.command}`);
    printUsageHint(parsed.command);
    return 1;
  }

  // review subcommand (#802 Phase 3) — no git repo required; pure
  // config + artifact resolution. Only `review plan --plan-only` is
  // wired in this slice.
  if (parsed.command === 'review') {
    return runReviewCommand(parsed);
  }

  const targetPath = path.resolve(parsed.target);

  try {
    // Skills subcommands (import/export/list) – no git repo required.
    // `return await` (not bare `return`) is required so a rejected handler
    // promise is caught by this function's outer try/catch, which maps
    // GitRepoNotFoundError / SkillLoaderError / ProjectRulesError /
    // RiskMapError / GitError to friendly messages + Hints. A bare `return`
    // settles the promise outside the try, regressing to a raw stack trace /
    // unhandledRejection (adversarial review BLOCKER, PR #1592).
    if (parsed.command === 'skills') {
      return await runSkillsCommand(parsed, targetPath);
    }

    if (parsed.command === 'suppression') {
      return await runSuppressionCommand(parsed, targetPath);
    }

    if (parsed.command === 'feedback') {
      return await runFeedbackCommand(parsed, targetPath);
    }

    // `return await` (not bare `return`) so a rejected handler promise is caught
    // by this outer try/catch for GitRepoNotFoundError etc. (adversarial review
    // BLOCKER lesson, PR #1592).
    if (parsed.command === 'promote') {
      return await runPromoteCommand(parsed, targetPath);
    }

    if (parsed.command === 'runs') {
      return await runRunsCommand(parsed, targetPath);
    }

    // `return await` so a rejected handler promise reaches this outer
    // try/catch (same reason as the promote/runs handlers above).
    if (parsed.command === 'evolve') {
      return await runEvolveCommand(parsed, targetPath);
    }

    if (parsed.command === 'eval') {
      return await runEvalCommand(parsed);
    }
    if (parsed.command === 'doctor') {
      return await runDoctorCommand(parsed, targetPath);
    }

    if (parsed.command === 'run') {
      return await runRunCommand(parsed, targetPath);
    }

    return 0;
  } catch (error) {
    if (error instanceof GitRepoNotFoundError) {
      console.error(error.message);
      printHintLines([
        'Run this command inside a git repository (or pass the repo path).',
        'If needed: `git init` or `git clone ...`',
      ]);
    } else if (error instanceof SkillLoaderError) {
      console.error(`Skill configuration error: ${error.message}`);
      printHintLines([
        'Run `npm run skills:validate` to see full validation errors.',
        'Docs: pages/guides/validate-skill-schema.md',
      ]);
    } else if (error instanceof ProjectRulesError) {
      console.error(error.message);
      printHintLines([
        'Check `.river/rules.md` exists and is readable (or remove it to disable rules).',
        'Docs: README.md (Project-specific review rules)',
      ]);
    } else if (error instanceof RiskMapError) {
      console.error(error.message);
      printHintLines([
        'Check `.river/risk-map.yaml` format and valid action values.',
        'Valid actions: comment_only, escalate, require_human_review',
      ]);
    } else if (error instanceof GitError) {
      console.error(`Git command failed: ${error.message}`);
      printHintLines([
        'Ensure `git` is available and the repository has a default branch.',
        'Try `river run . --debug` for more context.',
      ]);
    } else {
      console.error(`CLI error: ${error.message}`);
      printHintLines(['Try `river run . --debug` for more context.']);
    }
    return 1;
  }
}

export {
  parseArgs,
  main,
  isLlmlessEmptyReview,
  printExplain,
  validateOutputArtifact,
  // Exported for tests/cli-parse-args.test.mjs only. That test pins the
  // membership of this set against a hand-written literal, and because the set
  // is DERIVED from COMMAND_USAGE rather than written out, only the runtime
  // value can be checked — reading the source cannot recover it.
  EAGER_COMMANDS,
  // Exported for tests/cli-base-option-scope.test.mjs only (#2065). That test
  // is the mechanical half of this guard: it pins this set against the files
  // that actually read `parsed.base`, so a new consumer (or a removed one)
  // cannot drift from the surfaces the parser lets through.
  BASE_CONSUMING_SURFACES,
  ENTRY_CONSUMING_SURFACES,
  // Also for tests/cli-base-option-scope.test.mjs only (#2065 review, minor 1).
  // These mirror vocabularies that live in the handler modules, so the test
  // runs the CLI for every token to pin the mirror against the real dispatch.
  SURFACE_SUBCOMMANDS,
};

/**
 * この CLI が直接起動されたときのみ `main()` を実行する。
 *
 * `import.meta.url === \`file://${process.argv[1]}\`` という素朴な比較は、
 * 以下のケースで偽になり自動起動が走らない:
 *
 *   1. npm `bin` 経由（`npm install -g`）: `process.argv[1]` が symlink の
 *      `.../node_modules/.bin/river` のままで、`import.meta.url` は実体の
 *      `.../src/cli.mjs` を指す。
 *   2. macOS の `/tmp` → `/private/tmp` など、プラットフォーム固有の
 *      canonical path 展開。
 *   3. Windows のバックスラッシュ区切り path（`file:///C:/...` 形式でない）。
 *
 * そのため `realpathSync` で symlink を解決し、`pathToFileURL` で URL に
 * 変換した上で比較する。比較に失敗してもアプリは落とさない（import-only
 * シナリオを壊さない）。
 */
function isDirectInvocation() {
  if (!process.argv[1]) return false;
  try {
    const real = realpathSync(process.argv[1]);
    return fileURLToPath(import.meta.url) === real || import.meta.url === pathToFileURL(real).href;
  } catch {
    return false;
  }
}

if (isDirectInvocation()) {
  main().then((code) => {
    if (typeof code === 'number' && code !== 0) {
      process.exitCode = code;
    }
  });
}
