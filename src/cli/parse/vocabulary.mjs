// `parseArgs` が使うサブコマンド語彙。src/cli.mjs から純粋に移設したもので、
// 集合の中身も JSDoc も変えていない（リファクタリング Step 3a）。
//
// ここに置くのはリテラルな集合だけである。`EAGER_COMMANDS` は `COMMAND_USAGE`
// から導出しており、移すと使用箇所の表そのものを連れてくることになるため
// src/cli.mjs に残した。

/**
 * Eager-branch commands that take a subcommand word and never a positional
 * path. The arms above the fall-through in the eager branch have already
 * consumed their subcommand word, so the fall-through (which reads a
 * positional `<path>`) must skip exactly these.
 */
export const SUBCOMMAND_ONLY_COMMANDS = new Set(['runs', 'suppression', 'feedback', 'promote']);

/**
 * `skills` subcommands (`skills import|export|list|resolve` take options, not a
 * positional path — see `acceptsPositionalPath`).
 */
export const SKILLS_SUBCOMMANDS = new Set(['import', 'export', 'list', 'resolve']);

/**
 * `evolve` subcommands (#1574 P1 `aggregate` / P2 `replay`, ADR-006
 * `prompt-compare` / `prompt-ab`). Matching against a known set (rather than
 * "first non-flag token") keeps `river evolve <path>` working.
 */
export const EVOLVE_SUBCOMMANDS = new Set(['aggregate', 'replay', 'prompt-compare', 'prompt-ab']);

/**
 * `promote` subcommands that take an optional positional candidate id.
 */
export const PROMOTE_ID_SUBCOMMANDS = new Set([
  'approve',
  'reject',
  'template',
  'review-effectiveness',
]);

/**
 * `river review` subcommands (#802 Phase 3), at module scope because BOTH the
 * eager branch inside `parseArgs` and `takeTrailingPositional` below need it:
 * `review` had no vocabulary at all, so a subcommand written after the options
 * was swallowed as the path (#1755).
 *
 * `SKILLS_SUBCOMMANDS` / `EVOLVE_SUBCOMMANDS` sit alongside it above. Hoisting
 * them out of `parseArgs` is a pure relocation: `takeTrailingPositional`
 * already consulted `REVIEW_SUBCOMMANDS` before the hoist, but for `evolve`
 * it only approximated the eager branch's decision with `existsSync` (#1759
 * B1). `takeTrailingPositional` now checks `EVOLVE_SUBCOMMANDS` first, the
 * same priority the eager branch uses, so `river evolve aggregate --min 2`
 * and `river evolve --min 2 aggregate` agree even when a directory named
 * `aggregate` exists in cwd.
 */
export const REVIEW_SUBCOMMANDS = new Set(['plan', 'exec', 'verify', 'route']);

/**
 * `runs` subcommands, as dispatched by `runRunsCommand`
 * (`src/cli/commands/runs.mjs`): `list` / `diff` / `summary` / `digest`, with a
 * MISSING subcommand behaving as `list` (`:21` — `!parsed.runsSubcommand ||
 * parsed.runsSubcommand === 'list'`). Mirrors the vocabulary in that handler's
 * `Unknown runs subcommand: … Use: list | diff | summary | digest` message,
 * the same "mirror + pin" arrangement `SUPPRESSION_FINGERPRINT_ALGOS` uses
 * against its schema; `tests/cli-base-option-scope.test.mjs` pins the two
 * together by running the CLI, so this list cannot drift from the handler.
 *
 * Needed at parse time only so `checkCommandScopedOptions` can tell a real
 * surface from a typo'd subcommand word (see `isNamedSurface`).
 */
export const RUNS_SUBCOMMANDS = new Set(['list', 'diff', 'summary', 'digest']);

/**
 * `feedback` / `suppression` accept exactly one subcommand word each, and a
 * missing one is NOT a surface — both handlers answer
 * ``only `river feedback add` is supported`` / ``only `river suppression add`
 * is supported`` (`src/cli/commands/feedback.mjs:61`,
 * `src/cli/commands/suppression.mjs:20`). Pinned by the same test.
 */
export const FEEDBACK_SUBCOMMANDS = new Set(['add']);
export const SUPPRESSION_SUBCOMMANDS = new Set(['add']);
