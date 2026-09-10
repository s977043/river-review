# Runner CLI Reference

> **Scope note**: this page covers only the `--reviewers` flag of `river run` and the validation commands.
>
> - For every other `river run` flag (`--phase` / `--planner` / `--dry-run` / `--output` / `--max-cost` / `--debug` / `--estimate` and so on), see **[stable-interfaces.en.md](./stable-interfaces.en.md)**.
> - For the `river review exec` flags used in a W-check (`--artifact`, `--ensemble`, `--phase`), see the **[W-check guide](../guides/w-check.en.md)** and **[cli-review-exec-spec.en.md](./cli-review-exec-spec.en.md)**.

Use the Runner CLI to validate River Review agents and skills locally or in CI.
A lightweight Python runner outputs structured review results that follow `schemas/output.schema.json`.
Install the required dependency with `pip install jsonschema` before running the Python example.

## `--reviewers` flag

The `--reviewers` flag on `river run` accepts a comma-separated list of role names or the special keyword `auto`.

### `auto` keyword

When `--reviewers auto` is specified, River Review analyzes the diff content and selects reviewer roles automatically. `bug-hunter` is always included; additional roles are added based on the following signals:

| Signal                                                                                                               | Role added            |
| -------------------------------------------------------------------------------------------------------------------- | --------------------- |
| config / schema / migration / infra files changed, or risk-escalated files exist                                     | `security-scanner`    |
| test files changed, or 3 or more app files changed                                                                   | `test-gap`            |
| package manifest / lockfile changed (`package.json` / `package-lock.json` / `pnpm-lock.yaml` / `yarn.lock`)          | `dependency-reviewer` |
| UI / component / styling files changed (`.tsx` / `.jsx` / `.css` / `.scss` / `.sass` / `.less` / `.vue` / `.svelte`) | `frontend-reviewer`   |
| Workflows under `.github/workflows/` changed                                                                         | `ci-cd-reviewer`      |

If no signals are detected, only `bug-hunter` is used.

The selected roles are reported in the `autoSelectedRoles` field of the JSON output:

```json
{
  "autoSelectedRoles": ["bug-hunter", "security-scanner"]
}
```

### Large-diff chunking and finding deduplication

When reviewing with multiple roles (including `auto`), large diffs are automatically split into chunks and run in parallel as role × chunk. Findings from each run are deduplicated across chunks and roles before final IDs are assigned (implemented in `src/lib/reviewer-orchestrator.mjs` as `splitDiffIntoChunks` / `deduplicateFindings`), so duplicate findings on the same location are collapsed into one.

### Progress output and per-role timeout

Parallel role execution prints one line per role start, completion, and failure to **stderr**. The deliverable goes to stdout, so progress lines never corrupt the JSON / YAML / Markdown artifact.

```text
Reviewer bug-hunter: start
Reviewer security-scanner: start
Reviewer bug-hunter: done in 6.2s (3 findings)
Reviewer security-scanner: timeout after 120.0s (other chunks/roles continue)
Reviewers: 1/2 roles succeeded, 0 failed, 120.0s total (timed out: security-scanner)
```

The related flag and environment variable:

| Name                     | Kind   | Default                              | Description                                                                                                                                                                            |
| ------------------------ | ------ | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--quiet`                | flag   | `false`                              | Suppresses the role progress lines above only. It does not affect the other logs `river run` writes (the run header, `Run saved:`, and so on)                                          |
| `RIVER_REVIEWER_TIMEOUT` | env    | unset                                | Per-role budget in milliseconds. Only integers in `1`–`3600000` are accepted; out-of-range or non-integer values are ignored with a warning. Wins over `review.orchestrator.timeoutMs` |
| `review.orchestrator.*`  | config | `timeoutMs` unset / `progress: true` | The equivalent settings in `.river-review.json`. See [Config / Schema Overview](./config-schema.md)                                                                                    |

The per-role timeout is disabled (unlimited) by default. **Leaving it unset does not change how long a run waits** — only observability improves; cutting a role off happens solely when a limit is configured.

The timeout is fail-soft: the role that hits the limit is recorded as a failed role and the run continues with the other roles' findings — the whole run is never aborted. **When no role at all succeeds the run counts as "review not executed"**, so the gate never returns GO (`decision` becomes `human-review-required` and `--gate` exits non-zero).

A cutoff is observable from:

| Surface                                   | Where it appears                                                                                                |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `--output json`                           | top-level `timedOutRoles` (names of the roles cut off; the key is absent when none were)                        |
| run record (`--save` / automatic CI save) | `reviewDebug.timeoutMs` / `reviewDebug.timedOutRoles` / `reviewDebug.durationMs`                                |
| library callers                           | `reviewerResults[].timedOut` / `reviewerResults[].durationMs`, plus the same `debug.*` fields as the run record |

`--output yaml` and `--output html` do not carry the cutoff information. Use the JSON output for machine-readable decisions.

> **Note**: the timeout only bounds the orchestration-layer wait; it does not cancel the in-flight LLM call. The abandoned request keeps running until the budget in `src/lib/llm-pipeline.mjs` is exhausted (15 s per attempt plus bounded retries — roughly 45 s), so the process stays alive for that long after the `timeout` line is printed. True cancellation requires threading an `AbortSignal` through `generateReview()` and is out of scope for this change.

## Commands

- Agents: `npm run agents:validate` (or `node scripts/validate-agents.mjs`)
- Skills: `npm run skills:validate` (or `node scripts/validate-skills.mjs`)
- Structured output (Python): `python scripts/rr_runner.py --input tests/fixtures/structured-output/sample_llm_response.json`

## Exit codes

### `river run` / `src/cli.mjs`

| Code | Meaning                                                                                                                     |
| ---- | --------------------------------------------------------------------------------------------------------------------------- |
| `0`  | Success                                                                                                                     |
| `1`  | Runtime error, schema error, or argument error (including an unknown command and a missing or invalid option value)         |
| `2`  | The `--warn-on` warning threshold was exceeded                                                                              |
| `3`  | An `--gate` ESCALATE verdict, a configuration error raised by the `review` handler, or an unimplemented `review` subcommand |

The exit code for argument errors (usage errors) was unified to exit 1 plus a stderr summary in #1709. Unknown commands and missing or invalid option values were unified in Slice 2. Unknown options, surplus positionals, and the value-missing paths that remained (for example `--from` / `--cases`) were unified in Slice 3. Printing the full help to stdout and exiting 0 is kept only for an explicit `--help` and for invocation with no arguments.

A missing or unknown `river review` subcommand also moved to exit 1 in #1755. Exit 3 now remains for three families of cases, none of which is about how the arguments were written:

- An `--gate` ESCALATE verdict
- A configuration error detected by the `review` handler (such as `--output html`)
- An unimplemented `review` path (`river review verify`, and `river review plan` without `--plan-only`, return exit 3 as "not implemented in Phase 3")

Thanks to this unification, an option-name typo, a surplus positional, and a missing value are all detectable as exit 1 in `$?`. The **validity of the value** is checked in the parse layer for the following options.

- Enumerated values: `--phase` / `--severity` / `--planner` / `--depth` / `--output` / `--format` / `--fail-on` / `--warn-on` / `--source` / `--fingerprint-algo`
- Numeric values: `--pr` / `--threshold` / `--min` / `--max-cost`
- Dates: `--expires` / `--month`

No data write (adding a feedback or suppression entry, for instance) ever happens ahead of a usage error.

#### `--base` acceptance scope and migration {#base-acceptance-scope}

`--base <ref>` is accepted only by the five surfaces that actually read a diff (#2065). Passing it anywhere else is a parse-layer usage error and exits 1.

- `river run`
- `river skills` (the form without a subcommand)
- `river review plan` / `river review exec` / `river review route`

Every other surface (`doctor`, `runs`, `eval`, `feedback`, `suppression`, the `skills` subcommands, `review verify`, and so on) rejects the flag even when the value is a ref the repository can resolve. The rejection happens before resolution is attempted, so the reason is that the surface does not review a diff — not that the ref is invalid. On `review` / `evolve` / `skills`, writing the subcommand before or after the option makes no difference to the decision (#2081). `runs` / `feedback` / `suppression` do not resolve a trailing subcommand, so write the subcommand before the options there.

The value itself is validated in the handler layer rather than the parse layer, and the five accepting surfaces share a single resolution path: the value is trimmed first, then checked with `git rev-parse` (#2051 / #2057).

- A blank value and a ref the repository cannot resolve are usage errors, exit 1
- A ref whose merge base turns out to be HEAD itself is not fatal; it is announced as a warning on stderr. The wording distinguishes a ref that shares no history with HEAD from one that is ahead of HEAD (#2067). Ref resolution and merge-base lookup walk the same candidate order (`origin/<ref>` then `<ref>`) with different predicates, so they can land on different candidates; the wording is then chosen by the candidate the merge base came from (#2071). `--base HEAD`, where the ref and the merge base are the same commit, is excluded and warns about nothing
- What an omitted `--base` falls back to differs per surface. `river run` and `river skills` use the auto-detected default branch, which this check does not apply to. `river review plan` runs no git at all, and the `diff` artifact is then the only source of the diff (see the [CLI review plan spec](./cli-review-plan-spec.en.md))

`river skills` used to accept `--base` and never read it, always reviewing the diff against the auto-detected default branch (#2051). Now that the value is read, a caller that passes `--base` sees a different set of reviewed files and findings; drop the flag to keep the previous range. `river run` did read the value but never checked that it resolved, silently falling back to HEAD (#2057), so a typo that used to exit 0 now exits 1.

The surfaces that do not read `--base` used to accept the flag and throw the value away (#2065). Calls that passed it to the following surfaces change their exit code.

- From exit 0 to exit 1: `doctor`, `runs` (no subcommand — the form that runs as `runs list`), `runs list`, `runs summary`, `runs digest`, `eval`, `feedback add`, `suppression add`, `skills list`, `skills resolve`, `skills export`, `skills import`
- From exit 3 to exit 1: `review verify` (its old exit 3 was the unimplemented `#802 Phase 3` path, not a result of processing `--base`)
- `runs diff` no longer accepts it either. A call whose two runs both exist moves from exit 0 to exit 1; a call that cannot find a run already exited 1, so its exit code does not move

Word order does not matter on a surface that has no subcommand: `doctor --base main .` is rejected exactly like `doctor . --base main`, and repeating `--base` behaves like passing it once. An **unknown subcommand word skips this check entirely**, though: `river runs nosuch --base main` still answers `Unknown runs subcommand: nosuch`, and `river feedback --base main` still answers ``only `river feedback add` is supported`` — the CLI does not rule on `--base` for a surface that does not exist.

Among the surfaces that have subcommands, `review` / `evolve` / `skills` resolve a trailing subcommand, so `river skills --base main import` is the same usage error as `river skills import --base main` (#2081; see "The target path may be written either before or after the options" below). Up to v1.99.3, `skills` read the trailing `import` as the target path and slipped past the check; when an `import/` directory existed the review ran and exited 0. Dropping the flag from this form does not reproduce the previous result, because `skills import` then runs as the subcommand. The same applies without `--base`: `river skills --output json import` used to review `import/` and now runs the import subcommand, exiting 0 either way, so there is no flag to drop. To keep reviewing `import/`, write `river skills ./import`. On `runs` / `feedback` / `suppression` the trailing token becomes an `unexpected argument`, so the exit code stays 1.

None of these surfaces ever read the value, so **dropping the flag from the call reproduces the previous result exactly**. Leaving the flag in place means the surface no longer runs at all: the call fails as a usage error. The rejection message says so itself: it ends with `Drop --base to get the previous behavior.` (#2076). Usage-error exit codes are outside the Stable Contract in [Stable Interfaces](./stable-interfaces.en.md), which is the policy this change follows.

#### `--entry` acceptance scope (Beta) {#entry-acceptance-scope}

`river review plan --entry <name>` pins the emitted Review Artifact to a review Flow entry (#2054 PR-3). `<name>` is a key of `entries` in `flows/entry-map.json` (`review-plan` / `review-task` / `review-final` / `review-replan` / `review-research` / `review-requirements` / `review-design` / `review-technical`). When given, two fields are **appended** to the artifact:

- `flow`: `{ entry, id, version, sha256 }`; `sha256` is the hash of the Flow document's canonical JSON, computed by `deriveFlowPin` in `src/lib/execution-manifest.mjs`
- `evidenceRequirements`: the sorted names of the inputs that Flow declares `required: true`

The two fields appear in JSON output only (`--output json` / `--format json`); markdown output does not carry them. The pin is the hash of the document that was read, and no check is made that it matches the document shipped under `flows/`. Without `--entry` the output is exactly what it was before the flag existed. Skill selection, `decision` and `gate` never read `--entry`, so the presence of a pin changes no judgment (ADR-009 D3, RA-1..RA-4). The flag, the two fields and the `steps[]` described below are **Beta** and are not part of the Stable Contract in [Stable Interfaces](./stable-interfaces.en.md).

`review plan` and `review exec` accept it. `review exec --entry <name>` (Epic #2011 AC7 P2, Beta) appends, after the two fields above, `steps[]`: the result of running the pinned Flow through `src/lib/flow-runner.mjs`. Each element is the runner's step record verbatim (`{ index, id, kind, parallel, parallelRun, outcome, reason?, result? }`), where `index` is the position in the Flow document's `steps`, `kind` is `primitive` / `reviewer`, and `outcome` is drawn from the closed set `executed` / `skipped` / `degraded` / `stopped` / `not-implemented`. P2 wires no capability, so the array is a record only and every outcome is one of `not-implemented` / `skipped` / `stopped`. The inputs handed to the runner are only what the artifact itself proves: `diff` when `context.changedFiles` exists, plus any resolved artifact whose ID equals a Flow input name and that exists. **`--debug` only exposes the resolver result as `debug.resolvedArtifacts`; it is not a prerequisite for input resolution** (#2011 AC7 P3-1). `plan` resolves from its default filename. `tests` is bound by default to the first of `junit` / `coverage` / `test-cases` that resolves. **Required inputs (`tasks` / `requirements` / `baseline` / `design`) carry no default binding**: a `todo.md` that merely sits in the working tree must not declare that the task and its acceptance statement were supplied. Those are given explicitly, as in `--artifact tasks=todo.md`, and an explicit artifact always wins over a default. A Flow whose required inputs cannot be supplied still yields one record per Flow step, every one of them `stopped` (observe mode). `steps[]` never feeds `gate` / `decision` / `findings` (RA-1). `review plan --entry`, `exec --dry-run --entry` and `exec --plan <file> --entry` (replay) pin only and carry no `steps[]`. Passing the flag to any other surface, such as `doctor --entry x`, is a parse-layer usage error and exits 1 through the same command-scoped allowlist as `--base` (#2065). An unknown entry name exits 1 listing the accepted names; a missing value exits 1 as well. Every one of those rejected forms exited 1 as `unknown option --entry` before the flag was introduced, so no exit code has moved.

The Flow documents are read by `src/lib/flow-loader.mjs` only. The default location is the `flows/` directory shipped with the package, and the `RIVER_FLOWS_DIR` environment variable overrides it (the means for an npm-installed CLI that keeps `flows/` elsewhere). The GitHub Action dist bundles `flows/` and the three schemas (`flow-entry-map` / `flow` / `review-intent`) next to the bundle, and the loader reads that bundled copy first (#2054 PR-5, #2105 (b)), so `--entry` works in the dist too; the Action exposes it as the `entry` input ([Stable Interfaces](./stable-interfaces.en.md)). `RIVER_FLOWS_DIR` replaces `flows/` only: the schemas are always the bundled ones and cannot be overridden, so watch for version drift between an external `flows/` and the bundled schemas. When the directory cannot be found the command stops with `Error: flows directory not found` and exit 1; it never emits an artifact without the pin silently.

`--expires` accepts only the RFC 3339 `YYYY-MM-DD` form and the date-time form. A date-only input is read as UTC midnight and normalized to a date-time when stored, because `expiresAt` in `schemas/suppression-context.schema.json` is declared `format: date-time`.

Value validation does not reach every option, though. The following three paths still exit 0, so `$?` alone does not catch them.

- Passing a non-existent path to `--baseline` (the regression comparison is silently skipped)
- Passing unknown vocabulary to `--context` / `--dependency`
- Running `river --base main` with no command at all, or alongside `-h` / `--help` (both only print help and run no review, so they are deliberately outside the command-scoped allowlist)

The `RIVER_PHASE` environment variable now goes through the same vocabulary and the same case-insensitive validation as `--phase` (#1759 C2). An invalid value prints the same shape of error, `Error: RIVER_PHASE must be one of: ...`, to stderr and exits 1. Unset or empty still falls back to the default `midstream`.

Option values are passed **separated by a space**. The `=`-joined form such as `--output=json` is not accepted and exits 1 as an unknown option (`--run-id=<id>` is the one legacy exception). A value that contains `=` **inside** it, as in `--artifact plan=./plan.md`, is valid.

The target path may be written either before or after the options on these surfaces only:

- `run` / `doctor`
- `skills` (the form without a subcommand)
- `review` (`plan` / `exec` / `verify` / `route`)
- `evolve aggregate` (`evolve replay` is out of scope because it takes its input from `--spec`)

Within that range, `river run . --dry-run` and `river run --dry-run .` mean the same thing. Only one non-option token is read as the target path; a second one is a surplus positional and exits 1.

The `review` subcommands (`plan` / `exec` / `verify` / `route`) may likewise be written before or after the options: `river review plan --plan-only` and `river review --plan-only plan` are equivalent. Forgetting the subcommand, or passing a token outside the vocabulary, exits 1.

The `evolve` subcommands (`aggregate` / `replay`) may likewise be written before or after the options (#1759 B1), and so may the `skills` subcommands (`import` / `export` / `list` / `resolve`) (#2081). A trailing token that matches the vocabulary is always resolved as the subcommand, so to review a directory that shares a subcommand's name, write it with a `./` prefix: `river skills ./import`. Those three surfaces are the only ones whose subcommand word order is free: `runs` / `feedback` / `suppression` do not resolve a trailing subcommand, so write the subcommand before the options there.

Under `review` the subcommand word does not count toward the positional budget above. `river review --plan-only plan ./sub` is accepted as one subcommand plus one path; the surplus positional starts at the third non-option token.

The POSIX `--` terminator works as well. A token placed after `--` is read as a path rather than as an option or a subcommand name. Here too only the first one is taken, and a second exits 1 as a surplus positional. `river run -- .` means the same as `river run .`. `river run -- --dry-run` is treated as specifying a path named `--dry-run`, so the `--dry-run` flag does not take effect.

A token after `--` must be an existing path; if it does not exist, the command exits 1. This prevents a typo such as `river evolve aggregate -- ./typo` from exiting 0 as "a successful aggregation over zero records". A bare `--` with no token after it is accepted as a no-op on every command surface.

Other surfaces (`skills list` / `runs list` / `promote list` / `eval` and so on) do not take a trailing path and exit 1 with a surplus positional. Subcommands that take several non-option tokens by design — `runs diff <id1> <id2> [<id3>...]` or `promote approve <id>` — are handled separately.

### `river review` / `river eval` (`runners/cli`)

The commands in `runners/cli` currently collapse every error into code `1`. Code `3` never occurs.

| Code | Meaning                                                         |
| ---- | --------------------------------------------------------------- |
| `0`  | Success                                                         |
| `1`  | Every abnormal termination, including runtime and schema errors |

### Validation script (Python)

- `0`: validation completed successfully.
- `1`: schema checks didn't pass or a schema error occurred.

## Examples

```bash
# Validate all agents
npm run agents:validate

# Validate all skills
npm run skills:validate

# Build structured review output (writes to artifacts/river-review-output.json)
python scripts/rr_runner.py --input tests/fixtures/structured-output/sample_llm_response.json
```
