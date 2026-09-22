---
title: CLI Spec — `river review verify`
---

`river review verify` consumes an already-produced review (`review-self` and/or `review-external`) together with the original upstream artifacts (`plan` / `diff` / `test-cases`, etc.) and runs the verify-family skills to perform a **W-check (audit of the review itself)**. It re-audits existing review findings for omissions, false positives, and hallucinations, and emits META findings (comments on the quality of the reviewed review) as a [Review Artifact](./review-artifact.en.md). This document fixes the command's arguments, inputs, outputs, and exit codes as a stable contract that CI can rely on.

> Related issues: #575 (Task) / #509 (Capability) / #507 (Epic)
> Related specs: `river review plan` (#517) / `river review exec` (#518) / `plangate-verification-audit` (skill spec forthcoming in #577)

## Responsibility split (plan / exec / verify)

| Command               | Purpose                                                                                                                                                          | Side effects                                    |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `river review plan`   | Compute only the execution plan (selected skills / planner reasons) from input artifacts. Minimal LLM use.                                                       | Does not run review skills.                     |
| `river review exec`   | Take the plan (or compute an equivalent), then run review skills and produce `findings`.                                                                         | External LLM calls; writes the Review Artifact. |
| `river review verify` | Take an existing review result plus upstream artifacts and run verify-family skills only to re-audit existing findings (W-check). Non-verify skills are NOT run. | External LLM calls; writes META findings.       |

`verify` MAY call `plan` internally, but the selection is restricted to verify-family skills; non-verify skills are recorded in `plan.skippedSkills` with reason `not-verify-skill`. `exec` and `verify` have different scopes — `verify` MUST NOT re-run non-verify skills (that is `exec`'s job).

## Usage

```bash
river review verify [options]
```

### Examples

```bash
# 1) W-check against existing review-self / review-external
river review verify \
  --artifact review-self=./artifacts/review-self.md \
  --artifact review-external=./artifacts/review-external.md \
  --artifact plan=./artifacts/plan.md \
  --artifact diff=./artifacts/diff.patch \
  --output json --output-file ./artifacts/review-audit-artifact.json

# 2) Replay a plan computed in a separate step
river review plan --phase upstream --output json --output-file ./artifacts/plan.json
river review verify --plan ./artifacts/plan.json \
  --artifact review-external=./artifacts/review-external.md

# 3) Cost-estimate only
river review verify --estimate \
  --artifact review-self=./artifacts/review-self.md

# 4) Advisory mode (audit without failing CI)
river review verify --advisory-only \
  --artifact review-external=./artifacts/review-external.md
```

## Arguments and Options

### Input selection

| Option                 | Type       | Default | Description                                                                                                                     |
| ---------------------- | ---------- | ------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `--artifact <id=path>` | repeatable | (unset) | Specify an input file by [Artifact Input Contract](./artifact-input-contract.en.md) ID. `id` follows that contract.             |
| `--plan <path>`        | string     | (unset) | Replay an existing plan JSON. When set, `verify` skips internal plan computation (the verify-family restriction still applies). |
| `--target <path>`      | string     | `.`     | Repository root. Set when different from `pwd`.                                                                                 |

Resolution priority (CLI > config file > directory detection) follows the contract. There is no `--config` flag; the config file is auto-detected from the repo root. If neither `review-self` nor `review-external` resolves, `verify` aborts with Exit `1` per "Fail conditions" below.

### Phase / planner

| Option              | Type                                      | Default    | Description                                                                                                                |
| ------------------- | ----------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------- |
| `--phase <value>`   | `upstream` \| `midstream` \| `downstream` | `upstream` | Review SDLC phase. W-checks are primarily an upstream concern, hence the default differs from `exec`/`plan` (`midstream`). |
| `--planner <value>` | `off` \| `order` \| `prune`               | `off`      | Planner mode. Ignored when `--plan` is supplied.                                                                           |

### Execution control

| Option             | Type   | Default | Description                                                                                                                                                                                                      |
| ------------------ | ------ | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--dry-run`        | bool   | `false` | Resolve inputs and compute plan only; skip LLM calls. `status` is `ok` (or `error` if required review inputs are missing).                                                                                       |
| `--estimate`       | bool   | `false` | Cost-estimate only. No skill execution; estimate is recorded in Review Artifact `debug`; `status` is `ok`.                                                                                                       |
| `--max-cost <usd>` | number | (none)  | Abort skill execution (exit `1`) when the estimate exceeds this budget. When combined with `--estimate`, no skills run in the first place, so verify reports the estimate and returns exit `0` without aborting. |
| `--debug`          | bool   | `false` | Verbose logs to stderr; richer `debug` field in the Review Artifact.                                                                                                                                             |

### Output

| Option                 | Type                 | Default | Description                                                                                                                                                           |
| ---------------------- | -------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--output <format>`    | `json` \| `markdown` | `json`  | Output format. `json` is the machine-readable contract (default), `markdown` implemented in #976, `text` not implemented (exit 3). Compat alias: `--format <format>`. |
| `--output-file <path>` | string               | -       | Where to write the Review Artifact. Defaults to stdout when unset; `-` is also stdout.                                                                                |
| `--no-write`           | bool                 | `false` | Print to stdout only; do not create files.                                                                                                                            |

> Note (#802 Phase 3, revised 2026-05-18): the output contract is unified across `plan`/`exec`/`verify` to `--output <format>` = format, `--output-file <path>` = destination (decision in the [PlanGate CLI Stabilization Roadmap](./plangate-cli-roadmap.en.md)). This matches the global `--output <mode>` (`river run`). `--format` is accepted as a review-namespace compatibility alias, but the canonical flag is `--output`; if `--output` and `--format` are both given and disagree, it is a configuration error (exit 3). The old spec's `--output <path>` (destination) is withdrawn.
>
> Implementation status (#802 Phase 3 PR-3, 2026-05-18): only the CLI argument / output-contract parser & dispatch foundation is implemented so far. `river review verify` accepts `--plan` / `--artifact <id=path>` (`review-self` / `review-external`, etc.) / `--output` / `--format` / `--output-file` and validates the output contract, but verify skill execution and artifact reading are not implemented and it returns exit 3. This parser contract depends only on the [Artifact Input Contract](./artifact-input-contract.en.md) artifact IDs and **does not depend on PlanGate**. The verify skill layer (`plangate-verification-*`) is a separate layer, independent of the parser contract.

The META finding severity vocabulary follows [`schemas/output.schema.json`](../../schemas/output.schema.json) and the severity mapping in `.claude/rules/review-core.md` (`critical` / `major` / `minor` / `info`). Unknown severity values default to `major` as a fail-safe. As with `exec`, the CLI does not perform fail / warn gating based on severity; CI should read the Review Artifact `findings` and gate there (see [Stable Interfaces](./stable-interfaces.en.md)).

## Skill selection (verify-family restriction)

`verify` restricts execution to **verify-family skills**. A skill is considered verify-family when either heuristic matches:

- `id` starts with `plangate-verification-` (e.g. `plangate-verification-audit`; the skill spec is forthcoming in #577).
- The skill metadata `outputKind` includes `review-audit`.

Non-verify skills are excluded from `plan.selectedSkills` and recorded in `plan.skippedSkills` with `reason: "not-verify-skill"`. This lets CI and Riverbed Memory downstream distinguish a `verify` audit run from an `exec` review run by reading the Review Artifact alone.

## Input artifacts

`river review verify` consumes the resolution of [Artifact Input Contract](./artifact-input-contract.en.md). Because the command audits an existing review, the pairing between the existing review outputs and the upstream artifacts they relied on is central.

| Artifact ID                         | Used by                                                             | When absent                                                                                                                                      |
| ----------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `review-self`                       | Self-review output. Primary W-check target.                         | If `review-external` also fails to resolve, `status: error` + Exit `1` (see Fail conditions).                                                    |
| `review-external`                   | External (AI/human) review output. Primary W-check target.          | If `review-self` also fails to resolve, `status: error` + Exit `1` (see Fail conditions).                                                        |
| `plan`                              | Upstream plan; references the design intent the review relied on.   | Optional. When absent, the related skill is recorded in `plan.skippedSkills` and skipped.                                                        |
| `diff`                              | Review target diff; required for hallucination checks.              | Falls back to `git diff <mergeBase>..HEAD`. An empty diff weakens W-checks but does not change `status` to `no-changes` — verify still proceeds. |
| `test-cases`                        | Used to check consistency between test expectations and the review. | Optional. Missing → skill skipped and recorded.                                                                                                  |
| `pbi-input` / `todo` / `junit` etc. | Context enrichment (see the contract's artifact list).              | Optional. Behavior follows the contract.                                                                                                         |

- `review-self` / `review-external` — **at least one is required**. If neither resolves, the first fail-condition below applies.
- The contract is the SSoT for required/optional, format, and size guidelines; this spec does not duplicate those.
- The set of resolved artifacts is recorded in the Review Artifact `context` / `debug`.

## Output (Review Artifact)

The output of `river review verify` is JSON conforming to the [Review Artifact schema](./review-artifact.en.md) (`schemas/review-artifact.schema.json`, version `"1"`). The minimum fields `verify` is responsible for are:

- `version`: always `"1"`.
- `timestamp`: ISO 8601 at completion.
- `phase`: value of `--phase` (default `upstream`).
- `status`: per the "`status` to exit-code mapping" table below.
- `plan`: the plan that was used. `selectedSkills` contains verify-family skills only; `skippedSkills` records reasons such as `not-verify-skill`.
- `findings`: array of **META findings** produced by verify-family skills. These comment on the quality of the existing `review-self` / `review-external` (omissions, false positives, hallucinations, missing grounding), not directly on the code under review. Each entry is compatible with the `issue` definition in `output.schema.json`.
- `context`: `repoRoot` / `defaultBranch` / `mergeBase` / `changedFiles` / `tokenEstimate` / `rawTokenEstimate` / `reduction` (omit fields that cannot be obtained).
- `debug`: free-form object populated when `--debug` or `--estimate` is set.

`status` to exit code mapping is below.

## Exit codes

Exit codes are fixed so CI can rely on them and share the three-value shape (`0` / `1` / `2`) with `exec`.

| Exit | Use                            | Typical cause                                                                                                                                                            |
| ---- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `0`  | Success                        | `status` is `ok` or `skipped-by-label`, and `--max-cost` was not exceeded.                                                                                               |
| `1`  | Failure (user input / runtime) | Neither `review-self` nor `review-external` resolved, required artifact unresolved, `--max-cost` exceeded, internal exception. All map to `status: error` with Exit `1`. |
| `2`  | Configuration error            | Auto-detected config file cannot be loaded; unknown `--artifact id`; unknown `--phase` / `--planner` value.                                                              |

`findings` severity (`critical` / `major` / `minor` / `info`) does not directly affect the exit code. CI should read the Review Artifact `findings` and gate there ([Stable Interfaces](./stable-interfaces.en.md)).

> Note: The minimal CLI contract in [Stable Interfaces](./stable-interfaces.en.md) only defines exit codes `0` and `1`. Exit code `2` (configuration error) is an extension shared with `exec`. CI that treats unknown exit codes as failure remains backward compatible because `2 != 0`.

### `status` to exit-code mapping

| `status`           | Exit | Meaning                                                         |
| ------------------ | ---- | --------------------------------------------------------------- |
| `ok`               | `0`  | All verify skill runs completed (META `findings` may be empty). |
| `skipped-by-label` | `0`  | verify was intentionally skipped by an operational rule.        |
| `error`            | `1`  | Runtime error; details in `debug` and stderr.                   |

Unlike `exec`, `verify` **does not use the `no-changes` status**. Even when the diff is empty, auditing the existing review remains meaningful, so `status` stays `ok` (Exit `0`) and verify proceeds. Conversely, when no review input exists at all (neither `review-self` nor `review-external` resolves), verify is considered misused and returns `status: error` + Exit `1`.

## Fail conditions

`verify` returns `status: error` + Exit `1` in the following cases:

- Neither `review-self` nor `review-external` can be resolved. stderr prints: `rr-cli-verify: review-self / review-external could not be resolved`.
- A path supplied via `--artifact` cannot be opened.
- The JSON given to `--plan` violates the schema.
- An uncaught, non-retryable exception occurs during verify skill execution.
- The cost estimate exceeds `--max-cost` (not applicable when combined with `--estimate` — skills do not execute, so verify returns `status: ok` + exit `0`).

Syntax errors for `--artifact` / `--phase` / `--planner` (unknown values, invalid format) return Exit `2`.

## Fallback behavior

- **Only one of `review-self` / `review-external` resolves**: proceed with the W-check on whichever side resolved (still eligible for Exit `0`).
- **`plan` / `test-cases` missing**: record the affected skill in `plan.skippedSkills` and skip. Does not affect exit code.
- **`diff` not specified**: per contract, internally run `git diff <mergeBase>..HEAD`; `mergeBase` is inferred from `context.defaultBranch`.
- **`--plan` not specified**: `verify` performs the plan computation internally, selecting verify-family skills only (honoring `--planner`).
- **LLM call failure**: retry per skill. Skills that remain failing after retry are recorded in `plan.skippedSkills` with a reason, and a reporter-sourced `info`-level entry is added to `findings`. If **at least one verify skill completes successfully** and the pipeline can continue, verify returns `status: ok` + exit `0` (partial success allowed). Only when **every verify skill fails** — or an unrecoverable internal exception occurs — does verify return `status: error` + exit `1`.
- **Non-verify skill enters the plan candidate set**: record as `plan.skippedSkills` with `reason: "not-verify-skill"`; do not execute. Does not affect exit code.

## Stability and compatibility

- Stability: **Internal** (see [Stable Interfaces](./stable-interfaces.en.md)). The `river` CLI is not published to npm and has no distribution channel.
- Adding, removing, or altering the semantics of a flag, and changing a default, are all outside the Stable Contract and ship in a minor or patch release.
- The exit codes in the table above are not gate-decision codes (`verify` performs no gate decision), so they are not among the Stable Contract entries; changing their meaning also ships in a minor or patch release. What the Stable Contract guarantees is the gate-decision exit codes `0` / `1` / `2` / `3`, which users reach through the GitHub Action.
- Usage-error exit codes (failure to interpret arguments) are outside that table and follow the Internal label of the CLI surface as a whole. The split by purpose is defined in "Exit Code Stability" in [Stable Interfaces](./stable-interfaces.en.md), which is the SSoT.
- `status` is a Review Artifact field, so changes to the meaning of its values follow the Review Artifact versioning noted below.
- Breaking JSON output changes follow [Review Artifact](./review-artifact.en.md) versioning.

## See Also

- [CLI Spec — `river review plan`](./cli-review-plan-spec.en.md) — plan-only command spec
- [CLI Spec — `river review exec`](./cli-review-exec-spec.en.md) — review execution command spec
- [Artifact Input Contract](./artifact-input-contract.en.md) — input artifact SSoT
- [Review Artifact](./review-artifact.en.md) — output schema
- [Stable Interfaces](./stable-interfaces.en.md) — CLI / GitHub Actions stable contract
- [Review Policy](./review-policy.en.md) — AI review policy
