---
title: CLI Spec — `river review exec`
---

`river review exec` consumes resolved input artifacts (diff, test results, lint / typecheck, etc.), executes the selected review skills, and emits a [Review Artifact](./review-artifact.en.md). This document fixes the command's arguments, inputs, outputs, and exit codes as a stable contract that CI can rely on.

> Related issues: #518 (Task) / #509 (Capability) / #507 (Epic)
> Related spec: `river review plan` (drafted in parallel under issue #517)

## Responsibility split (relation to `plan`)

| Command             | Purpose                                                                                                    | Side effects                                    |
| ------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `river review plan` | Compute only the execution plan (selected skills / planner reasons) from input artifacts. Minimal LLM use. | Does not run review skills.                     |
| `river review exec` | Take the plan (or compute an equivalent), then run review skills and produce `findings`.                   | External LLM calls; writes the Review Artifact. |

`exec` MAY call `plan` internally, but when `--plan <path>` is supplied it MUST honor that plan instead of recomputing one. This keeps `plan` deterministic and `exec` reproducible.

## Usage

```bash
river review exec [options]
```

### Examples

```bash
# 1) Default detection (current dir + git)
river review exec

# 2) CI invocation with explicit artifacts
river review exec \
  --artifact diff=./artifacts/diff.patch \
  --artifact junit=./artifacts/junit.xml \
  --artifact lint=./artifacts/lint.json \
  --artifact typecheck=./artifacts/typecheck.txt \
  --output json --output-file ./artifacts/review-artifact.json

# 3) Replay a plan computed in a separate step
river review plan --output json --output-file ./artifacts/plan.json
river review exec --plan ./artifacts/plan.json --output json --output-file ./artifacts/review-artifact.json

# 4) Abort when the cost estimate exceeds the budget
river review exec --max-cost 0.50
```

## Arguments and Options

### Input selection

| Option                 | Type       | Default | Description                                                                                                         |
| ---------------------- | ---------- | ------- | ------------------------------------------------------------------------------------------------------------------- |
| `--artifact <id=path>` | repeatable | (unset) | Specify an input file by [Artifact Input Contract](./artifact-input-contract.en.md) ID. `id` follows that contract. |
| `--plan <path>`        | string     | (unset) | Replay an existing plan JSON. When set, `exec` skips internal plan computation.                                     |
| `--target <path>`      | string     | `.`     | Repository root. Set when different from `pwd`.                                                                     |

Resolution priority (CLI > config file > directory detection) follows the contract. There is no `--config` flag; the config file is auto-detected from the repo root.

### Phase / planner

| Option              | Type                                      | Default     | Description                                                 |
| ------------------- | ----------------------------------------- | ----------- | ----------------------------------------------------------- |
| `--phase <value>`   | `upstream` \| `midstream` \| `downstream` | `midstream` | Review SDLC phase. Mirrored to the Review Artifact `phase`. |
| `--planner <value>` | `off` \| `order` \| `prune`               | `off`       | Planner mode. Ignored when `--plan` is supplied.            |

### Execution control

| Option             | Type   | Default | Description                                                                                                                                                                                                    |
| ------------------ | ------ | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--dry-run`        | bool   | `false` | Resolve inputs and compute plan only; skip LLM calls. `status` is `ok` or `no-changes`.                                                                                                                        |
| `--estimate`       | bool   | `false` | Cost-estimate only. No skill execution; estimate is recorded in Review Artifact `debug`; `status` is `ok`.                                                                                                     |
| `--max-cost <usd>` | number | (none)  | Abort skill execution (exit `1`) when the estimate exceeds this budget. When combined with `--estimate`, no skills run in the first place, so exec reports the estimate and returns exit `0` without aborting. |
| `--debug`          | bool   | `false` | Verbose logs to stderr; richer `debug` field in the Review Artifact.                                                                                                                                           |

### Output

| Option                 | Type                 | Default | Description                                                                                                                                                           |
| ---------------------- | -------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--output <format>`    | `json` \| `markdown` | `json`  | Output format. `json` is the machine-readable contract (default), `markdown` implemented in #976, `text` not implemented (exit 3). Compat alias: `--format <format>`. |
| `--output-file <path>` | string               | -       | Where to write the Review Artifact. Defaults to stdout when unset; `-` is also stdout.                                                                                |
| `--no-write`           | bool                 | `false` | Print to stdout only; do not create files.                                                                                                                            |

> Note (#802 Phase 3, revised 2026-05-18): the output contract is unified across `plan`/`exec`/`verify` to `--output <format>` = format, `--output-file <path>` = destination (decision in the [PlanGate CLI Stabilization Roadmap](./plangate-cli-roadmap.en.md)). This matches the global `--output <mode>` (`river run`). `--format` is accepted as a review-namespace compatibility alias, but the canonical flag is `--output`; if `--output` and `--format` are both given and disagree, it is a configuration error (exit 3). The old spec's `--output <path>` (destination) is withdrawn.
>
> Implementation status (#802 Phase 3 PR-3, 2026-05-18): only the CLI argument / output-contract parser & dispatch foundation is implemented so far. `river review exec` accepts `--plan` / `--artifact <id=path>` / `--output` / `--format` / `--output-file` and validates the output contract, but skill execution, plan replay, artifact reading, and LLM are not implemented and it returns exit 3. This parser contract depends only on the [Artifact Input Contract](./artifact-input-contract.en.md) artifact IDs and **does not depend on PlanGate** (PlanGate is just one possible artifact producer).
>
> Addendum (#802 Phase 3, 2026-05-18): **`river review exec --dry-run` (without `--plan`) is implemented.** Per spec, dry-run makes no external LLM / skill execution — it only resolves inputs and produces a deterministic plan, emitting a v1 Review Artifact with `status` `ok`/`no-changes` and `findings: []`, exit 0 (it reuses `runReviewPlan`, the same non-breaking path as `river review plan --plan-only`).
>
> Addendum ([#935](https://github.com/s977043/river-review/pull/935), 2026-05-29): **`river review exec --plan <file>` is now implemented.** It reads the plan file, executes skills via `generateReview`, and produces a Review Artifact. Non-dry-run `exec` without `--plan` still returns exit 3. `verify` execution remains unimplemented.

## Input artifacts

`river review exec` consumes the resolution of [Artifact Input Contract](./artifact-input-contract.en.md). For the `exec` scope the most relevant entries are:

| Artifact ID                                                                      | Used by                          | When absent                                                                |
| -------------------------------------------------------------------------------- | -------------------------------- | -------------------------------------------------------------------------- |
| `diff`                                                                           | Required premise for all skills. | Falls back to `git diff <mergeBase>..HEAD`. Empty diff means `no-changes`. |
| `junit`                                                                          | Test failure skills.             | Skill is skipped and recorded in `plan.skippedSkills`.                     |
| `coverage`                                                                       | Coverage skills.                 | Same as above.                                                             |
| `lint`                                                                           | Lint skills.                     | Same as above.                                                             |
| `typecheck`                                                                      | Type-check skills.               | Same as above.                                                             |
| `pbi-input` / `plan` / `todo` / `test-cases` / `review-self` / `review-external` | Upstream-context skills.         | Same as above (per contract).                                              |

- The contract is the SSoT for required/optional, format, and size guidelines. This spec does not duplicate those.
- The set of resolved artifacts is recorded in the Review Artifact `context` / `debug`.

The PR body is not an artifact but an implicit input read from the runtime environment: `RIVER_PR_BODY` when it is non-empty, otherwise `pull_request.body` from the event JSON at `GITHUB_EVENT_PATH`. The PR body is not saved in the plan, so replaying the same plan with `--plan` in a different environment can produce a different prompt; the `exec` reproducibility stated above does not cover it. Only when an LLM runs is the PR body added to the prompt as the "PR Description" section (truncated at 4000 characters), and findings may then target `PR-DESCRIPTION:0`.

## Output (Review Artifact)

The output of `river review exec` is JSON conforming to the [Review Artifact schema](./review-artifact.en.md) (`schemas/review-artifact.schema.json`, version `1`). The minimum fields `exec` is responsible for are:

- `version`: always `"1"`.
- `timestamp`: ISO 8601 at completion.
- `phase`: value of `--phase`.
- `status`: per the "Exit status" table below.
- `plan`: the plan that was used (the `--plan` input or the internal computation).
- `findings`: array of issues from executed skills, compatible with the `issue` definition in `output.schema.json`.
- `context`: `repoRoot` / `defaultBranch` / `mergeBase` / `changedFiles` / `tokenEstimate` / `rawTokenEstimate` / `reduction` (omit fields that cannot be obtained).
- `debug`: free-form object populated when `--debug` or `--estimate` is set.

`status` to exit code mapping is below.

## Exit codes

Exit codes are fixed so CI can rely on them.

| Exit | Use                            | Typical cause                                                                                               |
| ---- | ------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `0`  | Success                        | `status` is one of `ok` / `no-changes` / `skipped-by-label`, and `--max-cost` was not exceeded.             |
| `1`  | Failure (user input / runtime) | Bad input, required artifact unresolved, `git diff` failure, `--max-cost` exceeded, internal exception.     |
| `2`  | Configuration error            | Auto-detected config file cannot be loaded; unknown `--artifact id`; unknown `--phase` / `--planner` value. |

`findings` severity (`critical` / `major` / `minor` / `info`) does not directly affect exit code. CI is expected to read the Review Artifact `findings` for gating ([Stable Interfaces](./stable-interfaces.en.md)).

> Note: The minimal CLI contract in [Stable Interfaces](./stable-interfaces.en.md) only defines exit codes `0` and `1`. Exit code `2` (configuration error) is an `exec`-specific extension. CI that treats unknown exit codes as failure remains backward compatible because `2 != 0`.

### `status` to exit-code mapping

| `status`           | Exit | Meaning                                                |
| ------------------ | ---- | ------------------------------------------------------ |
| `ok`               | `0`  | All skill runs completed (`findings` may be empty).    |
| `no-changes`       | `0`  | Resolved diff was empty; skills not run.               |
| `skipped-by-label` | `0`  | exec was intentionally skipped by an operational rule. |
| `error`            | `1`  | Runtime error; details in `debug` and stderr.          |

## Fail conditions

`exec` returns `status: error` + Exit `1` in the following cases:

- A path supplied via `--artifact` cannot be opened.
- The required artifact (`diff` or `git diff` fallback) cannot be resolved.
- The JSON given to `--plan` violates the schema.
- An uncaught, non-retryable exception occurs during skill execution.
- The cost estimate exceeds `--max-cost` (not applicable when combined with `--estimate` — skills do not execute, so exec returns `status: ok` + exit `0`).

Syntax errors for `--artifact` / `--phase` / `--planner` (unknown values, invalid format) return Exit `2`.

## Fallback behavior

- **`diff` not specified**: per contract, internally run `git diff <mergeBase>..HEAD`; `mergeBase` is inferred from `context.defaultBranch`.
- **Optional artifact missing**: skip the corresponding skill and record it in `plan.skippedSkills`. Does not affect exit code.
- **`--plan` not specified**: `exec` performs the plan computation internally, honoring `--planner`.
- **LLM call failure**: retry per skill. Skills that remain failing after retry are recorded in `plan.skippedSkills` with a reason, and a reporter-sourced `info`-level entry is added to `findings`. If **at least one skill completes successfully** and the exec pipeline can continue, the overall run returns `status: ok` + exit `0` (partial success is allowed). Only when **every skill fails** — or an unrecoverable internal exception occurs — does exec return `status: error` + exit `1`. CI that needs to detect partial failure should read `plan.skippedSkills` and `findings` in the Review Artifact.

## See Also

- [Artifact Input Contract](./artifact-input-contract.en.md) — input artifact SSoT
- [Review Artifact](./review-artifact.en.md) — output schema
- [Stable Interfaces](./stable-interfaces.en.md) — CLI / GitHub Actions stable contract
- [Runner CLI Reference](./runner-cli-reference.en.md) — Runner CLI usage
- [Review Policy](./review-policy.en.md) — AI review policy
