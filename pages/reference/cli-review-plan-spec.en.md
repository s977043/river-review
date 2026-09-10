---
title: river review plan CLI Spec
---

`river review plan` is the River Review CLI subcommand that **generates and runs a review plan** against upstream artifacts. This document defines the arguments, input artifacts, output formats, exit codes, severity buckets (fail / warn / advisory), and the machine-readable output policy.

> Related issues: #517 (Task) / #509 (Capability) / #507 (Epic)
> Prerequisite: input artifacts follow the [Artifact Input Contract](./artifact-input-contract.en.md).

## Positioning

- `river review plan` consumes artifacts produced by upstream workflows such as **PlanGate v6**, generates a review plan (skill selection / ordering), and emits the execution result as a [Review Artifact](./review-artifact.en.md).
- While `river run` is a generic local-developer entry point, `river review plan` provides a **stable contract for CI / batch execution**.
- Stability label: **Beta** (see [Stable Interfaces](./stable-interfaces.en.md)). Adding flags is a minor bump; removing or changing the meaning of flags is a major bump.

## Usage

```bash
river review plan [options]
```

### Minimal examples

```bash
# Auto-detect input artifacts from the current directory and run
river review plan

# Specify artifacts explicitly and write JSON output to a file
river review plan \
  --artifact pbi-input=./artifacts/pbi-input.md \
  --artifact plan=./artifacts/plan.md \
  --artifact diff=./artifacts/diff.patch \
  --output json \
  --output-file ./artifacts/review-artifact.json

# Generate the plan only (do not execute skills)
river review plan --plan-only --output json
```

## Arguments

### Artifact selection

| Option                   | Type       | Required | Description                                                                                                                                 |
| ------------------------ | ---------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `--artifact <id>=<path>` | repeatable | Optional | Pair of artifact ID (defined in [Artifact Input Contract](./artifact-input-contract.en.md)) and file path. May be specified multiple times. |
| `--artifacts-dir <path>` | string     | Optional | Base directory used for default-filename auto-detection. Defaults to current working directory.                                             |

Resolution order matches Artifact Input Contract "Input Channels" (CLI args → config file → directory auto-detection).

### Diff resolution

| Option         | Type   | Default                                   | Description                                                                                             |
| -------------- | ------ | ----------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `--base <ref>` | string | none (without it, only the diff artifact) | Branch / ref to diff against. The review target becomes the diff between that ref and the working tree. |

Without `--base`, `review plan` does not run git at all: the diff comes from the `diff` artifact only, and `status` is `no-changes` when no artifact resolves either. (This differs from `river run`, which auto-detects the default branch.)

Precedence between `--base` and the `diff` artifact (#2046):

- An explicitly specified `diff` artifact (`--artifact diff=<path>`, or `artifacts.diff` in the config file) wins over `--base`, per the Artifact Input Contract statement that River Review runs git only when no artifact is specified
- `--base` wins over the auto-detected `diff.patch` in the working directory
- Whichever loses, the discarded input is announced as a warning on stderr
- When `--base` supplies the diff, the resolved range is recorded in the [Review Artifact](./review-artifact.en.md) `context` (`repoRoot` / `defaultBranch` / `mergeBase` / `changedFiles`)
- A run that resolved no diff at all (neither `--base` nor a `diff` artifact, and the `review exec --plan <file> --dry-run` echo path) emits no `context`, so that "the range was empty" stays distinguishable from "no range was consulted"
- `review exec --plan <file> --dry-run` resolves no diff and therefore does not consume `--base`; it says so on stderr

`changedFiles` is derived differently per source. From `--base` it is `git diff --name-only`, so renames and binary changes are included. From a `diff` artifact it is the parsed unified diff, so entries without `---` / `+++` headers (100% renames, binary files) are not.

The `--base` value is trimmed and then checked with `git rev-parse`. An unresolvable ref and a whitespace-only value are usage errors that exit `1`, rather than a silently empty range. A target that is not a git repository also exits `1`. `river run` and `river skills` share this same resolution path (#2051 / #2057); see the [Runner CLI reference](./runner-cli-reference.en.md).

### Plan control

| Option                 | Type       | Default     | Description                                                                                            |
| ---------------------- | ---------- | ----------- | ------------------------------------------------------------------------------------------------------ |
| `--phase <value>`      | enum       | `midstream` | One of `upstream` / `midstream` / `downstream`. Review phase.                                          |
| `--planner <value>`    | enum       | `off`       | One of `off` / `order` / `prune`. AI planner mode.                                                     |
| `--plan-only`          | flag       | false       | Generate the plan only; do not execute skills. `status` becomes `ok` and `findings` is an empty array. |
| `--include-skill <id>` | repeatable | -           | Skill ID that must be included in the plan.                                                            |
| `--exclude-skill <id>` | repeatable | -           | Skill ID to exclude from the plan.                                                                     |
| `--max-cost <usd>`     | number     | -           | If estimated cost exceeds this threshold, abort without executing and exit with code `1`.              |

### Output control

| Option                  | Type   | Default | Description                                                                                                     |
| ----------------------- | ------ | ------- | --------------------------------------------------------------------------------------------------------------- |
| `--output <format>`     | enum   | `json`  | `json` (default, machine-readable) / `markdown` (human-facing, implemented in #976). `text` is not implemented. |
| `--output-file <path>`  | string | -       | Output destination. Defaults to stdout when unset.                                                              |
| `--summary-file <path>` | string | -       | Write a human-readable summary (Markdown) to a separate file. Intended to be paired with `--output json`.       |
| `--quiet`               | flag   | false   | Suppress progress logs on stdout (errors still go to stderr). For CI use.                                       |
| `--debug`               | flag   | false   | Include debug data in the [Review Artifact](./review-artifact.en.md) `debug` field.                             |

> Note (#802 Phase 3, 2026-05-18): the `--output <format>` = format, `--output-file <path>` = destination contract is unified across `plan`/`exec`/`verify` and matches the global `--output <mode>` (`river run`) (decision in the [PlanGate CLI Stabilization Roadmap](./plangate-cli-roadmap.en.md)). `--format <format>` is accepted as a review-namespace compatibility alias, but the canonical flag is `--output`. If `--output` and `--format` are both given and disagree, it is a configuration error (exit 3).
>
> Current implementation (updated in #976): for backward compatibility, when neither `--output` nor `--format` is given, JSON is emitted. Explicit `json` and explicit `markdown` are both accepted (`markdown` implemented in #976); explicit `text` is a not-implemented error (exit 3); `yaml` is outside the review contract (exit 3).

### Failure thresholds

| Option                 | Type | Default    | Description                                                                                            |
| ---------------------- | ---- | ---------- | ------------------------------------------------------------------------------------------------------ |
| `--fail-on <severity>` | enum | `critical` | One of `critical` / `major` / `minor` / `info`. A finding at this severity or above counts as a fail.  |
| `--warn-on <severity>` | enum | `major`    | Threshold for warnings (below `--fail-on`).                                                            |
| `--advisory-only`      | flag | false      | Always exit with `0` regardless of severity. Findings are still reported but the run does not fail CI. |

The severity vocabulary is the same as [`schemas/output.schema.json`](../../schemas/output.schema.json) and the severity mapping in `.claude/rules/review-core.md` (`critical` / `major` / `minor` / `info`).

## Input Artifacts

`river review plan` recognizes the artifacts listed in [Artifact Input Contract](./artifact-input-contract.en.md) "Artifact Catalog" verbatim. The set of artifact IDs and their default filenames is owned by that contract as the SSoT and is not restated here (currently 12).

- The set of artifact IDs and their formats is governed by the Artifact Input Contract, not this spec.
- When `diff` is unspecified and the `git diff` fallback is also empty, `status` becomes `no-changes` and no skills run (exit `0`).
- Failure to resolve a required artifact exits with code `1` (see below).

## Output Formats

### `--output text` (not implemented)

A plain-text human-readable summary format is envisioned but **not implemented** for the review namespace (explicitly requesting it exits 3). Use `--output markdown` for human-facing output. The review namespace default is `--output json`.

### `--output markdown` (implemented in #976)

Emits human-readable Markdown (status / phase / planner mode, Selected/Skipped skills, and a `## Findings` section when findings are present) for uses such as GitHub Actions PR comments. Uses the same renderer as `--summary-file` (`formatReviewPlanSummaryMarkdown`). JSON remains the only machine-readable contract; Markdown is a human-facing derived view.

### `--output json` (machine-readable / stable contract)

Emits JSON conforming to [`schemas/review-artifact.schema.json`](../../schemas/review-artifact.schema.json).

- Schema version is governed by the `version` field (currently `"1"`).
- Each `findings[]` entry is compatible with the `issue` definition in `output.schema.json`.
- `debug` is included only when `--debug` is set.
- With `--plan-only`, `findings` is an empty array, `status` is `ok`, and only `plan.selectedSkills` carries meaning.

JSON output is the **single stable machine-readable contract**. Downstream pipelines (Riverbed Memory ingestion, evaluation, CI gating) should consume only this JSON.

## Severity Buckets (fail / warn / advisory)

| Bucket     | Criterion                                                                             | Default behavior                         |
| ---------- | ------------------------------------------------------------------------------------- | ---------------------------------------- |
| `fail`     | One or more findings at or above `--fail-on` severity (default `critical`).           | Exit `1`. Fails CI.                      |
| `warn`     | One or more findings below `--fail-on` but at or above `--warn-on` (default `major`). | Exit `2`. CI may choose how to treat it. |
| `advisory` | Neither of the above; only `minor` / `info` findings, or `--advisory-only` is set.    | Exit `0`. Informational only.            |

The mapping between internal severity tokens (`blocker` / `warning` / `nit`) and JSON schema tokens (`critical` / `major` / `minor` / `info`) is defined in `.claude/rules/review-core.md`. Among the JSON schema tokens, `info` has no direct internal counterpart; it is the auxiliary level assigned to findings without a severity token (the "(なし)" row in `.claude/rules/review-core.md`) and is not produced by any internal-token conversion today. Unknown severity values fall back to `major` for safety.

## Exit Codes

| Exit | Meaning                                                                                                                                                                                          |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `0`  | Success. `status` is `ok` / `no-changes` / `skipped-by-label`, with no fail/warn findings.                                                                                                       |
| `1`  | Failure. Reached `--fail-on` threshold (unless `--advisory-only`), required artifact missing, plan/exec error, or `--max-cost`.                                                                  |
| `2`  | Warn-only. `--warn-on` threshold reached but `--fail-on` not met.                                                                                                                                |
| `3`  | Configuration error detected by the handler layer (unsupported `--output` value, `--output` / `--format` disagreement, config load failure, etc.). Parse-layer argument errors are NOT included. |

When `--advisory-only` is set, fail/warn judgement is disabled and only internal errors (missing artifacts, execution errors) yield non-zero exit.

> Argument errors (#1709): argument errors detected in the parse layer (unknown options, surplus positionals, missing or invalid option values) exit `1`. Exit `3` is limited to configuration errors detected by the handler layer after the shared parser has accepted the arguments.
>
> Current implementation (#976): the gate is **opt-in** — exit `1` / `2` are returned only when `--fail-on` / `--warn-on` / `--advisory-only` is explicitly passed. With none of them, success stays exit `0` (non-breaking for existing callers / the plangate-review workflow). When a flag is given, defaults are `--fail-on critical` / `--warn-on major`. The judgement is based on the maximum `findings[].severity` in the artifact.

## CI / Downstream Integration

- **Review Artifact**: persist `--output json --output-file <path>` via the CI artifact upload step.
- **GitHub Action**: `runners/github-action/action.yml` will map inputs onto this CLI (not yet implemented; tracked separately).
- **Riverbed Memory**: only the JSON output is canonical for ingestion (see [Riverbed Storage](./riverbed-storage.en.md)).
- **PR comments**: idempotent updates via the `<!-- river-review -->` marker follow [Stable Interfaces](./stable-interfaces.en.md).

## Compatibility Policy

- The set of `--artifact` IDs grows together with the Artifact Input Contract.
- Adding flags is a minor bump; removing flags or changing their meaning / default value is a major bump.
- Gate-decision exit codes (`0` / `1` / `2` / `3`) are part of the **stable contract** and require a major bump to change.
- Usage-error exit codes (failure to interpret arguments) are not part of the stable contract; they follow the Beta label of the CLI surface as a whole. #1709 changed the granularity by detection layer (parse layer → `1`, handler-layer configuration errors → `3`) and shipped as a minor. The split by purpose is defined in "Exit Code Stability" in [Stable Interfaces](./stable-interfaces.en.md), which is the SSoT.
- Breaking changes in JSON output follow the versioning rules of [Review Artifact](./review-artifact.en.md).

## See Also

- [Artifact Input Contract](./artifact-input-contract.en.md) — Input artifact contract
- [Review Artifact](./review-artifact.en.md) — Output JSON schema
- [Stable Interfaces](./stable-interfaces.en.md) — CLI / GitHub Actions stable contract
- [Runner CLI Reference](./runner-cli-reference.en.md) — Runner CLI (validators) usage
- [Review Policy](./review-policy.en.md) — AI review policy
