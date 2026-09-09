---
title: Artifact Input Contract
---

River Review is a review agent that consumes artifacts produced by upstream workflows such as PlanGate as **external inputs** and performs review, QA, and double-check operations. This document defines the input contract that River Review can read stably.

> Related issues: #516 (Task) / #508 (Capability) / #507 (Epic)

## Policy

- River Review operates **artifact-driven** and does not depend on PlanGate-internal commands or on a specific directory layout.
- Inputs are consumed on a **file path basis**; only the content format (Markdown / JSON / XML / plain) is contracted.
- Behavior when a file is missing (skip / degrade / error) is defined per artifact.
- When adding a new artifact, update this document and preserve backward compatibility.

## Artifact Catalog

The input artifacts recognized by River Review are listed below. See "Legend" at the end for column semantics.

| ID                | Example filename     | Format       | Required        | Schema / reference                                  | Role                                                           |
| ----------------- | -------------------- | ------------ | --------------- | --------------------------------------------------- | -------------------------------------------------------------- |
| `pbi-input`       | `pbi-input.md`       | Markdown     | Optional (rec.) | Free-form                                           | Input spec / background of the Product Backlog Item            |
| `plan`            | `plan.md`            | Markdown     | Optional (rec.) | Free-form                                           | Implementation plan and design rationale                       |
| `design`          | — (no default)       | Markdown     | Optional (rec.) | Free-form                                           | Design document (architecture and technical premises)          |
| `todo`            | `todo.md`            | Markdown     | Optional        | Free-form (checklist)                               | Implementation tasks and progress                              |
| `test-cases`      | `test-cases.md`      | Markdown     | Optional        | Free-form (bullets or tables)                       | Test case design                                               |
| `review-self`     | `review-self.md`     | Markdown     | Optional        | Free-form                                           | Self-review by the author                                      |
| `review-external` | `review-external.md` | Markdown     | Optional        | Free-form                                           | External review (AI or human)                                  |
| `diff`            | `diff.patch`         | unified diff | Required (alt.) | `git diff` compatible                               | Review target diff; falls back to `git diff` when absent       |
| `junit`           | `junit.xml`          | XML          | Optional        | JUnit XML                                           | Unit/integration test results                                  |
| `coverage`        | `coverage.xml` etc.  | XML / JSON   | Optional        | One of Cobertura / LCOV / Istanbul JSON             | Coverage report                                                |
| `lint`            | `lint.json` etc.     | JSON / plain | Optional        | ESLint JSON, stylelint JSON, or tool-specific plain | Lint result                                                    |
| `typecheck`       | `typecheck.txt` etc. | plain / JSON | Optional        | tsc `--pretty=false` or tool-specific plain         | Type checker result                                            |
| `findings-pool`   | `findings-pool.json` | JSON         | Optional        | `findings-pool` section in this document            | Aggregated `findings[]` history from multiple Review Artifacts |
| `tdd-ledger`      | `tdd-ledger.json`    | JSON         | Optional        | `tdd-ledger` section in this document               | RED/GREEN/REFACTOR VERIFY phase execution evidence for TDD     |

### Legend

- **Required**
  - `Required`: Without this input River Review aborts.
  - `Required (alt.)`: If absent, an alternative (e.g. `git diff`) is used automatically.
  - `Optional`: Missing files are tolerated; related skills are skipped or degraded.
  - `Optional (rec.)`: Missing is allowed, but review quality drops meaningfully.
- **Format**: Encoding and syntax. Multiple accepted formats are comma-separated.
- **Example filename**: The well-known filename probed by current-directory detection, the third channel described in "Input channels" below. An artifact marked `— (no default)` is excluded from that probe and resolves only when supplied explicitly via a CLI argument or the config file.

## Per-artifact Contract

### `pbi-input` / `plan` / `todo` / `test-cases`

- **Format**: UTF-8 Markdown. Heading structure and bullets are unconstrained.
- **Size guideline**: 100 KB or less per file recommended. Beyond that, River Review may apply diff optimization (summarization / trimming).
- **When absent**: Skills referencing the artifact skip their observation and record it in `skippedSkills`.
- **`reviewSignals` (optional)**: Structured signals for automatic reviewer selection, supplied as a field on the review plan object rather than in the Markdown body. See the next section.

### `reviewSignals` (optional signals carried on the review plan)

`reviewSignals` is an optional input that gives extra hints to reviewer role auto-selection under `--reviewers auto`. It is supplied as a **field on the review plan object**, not in the Markdown body of `plan.md` (the implementation reads it at `context.plan.reviewSignals`). River Review owns the vocabulary; it is not tied to the format of any particular upstream workflow.

- **Format**: JSON object with a `stage` string and a set of boolean signal keys.
- **Supply channel**: Programmatic embedding — the review plan passed to `runLocalReview({ context })`. It is not exposed as a CLI flag or a dedicated file.
- **Producer**: No producer exists in this repository; supplying the value is the host's responsibility. PlanGate is only one possible supplier, and River Review acts purely as a consumer.
- **When absent**: Absence is the default. `--reviewers auto` selects roles from file types and risk assessment alone, behaving exactly as it did before `reviewSignals` existed.

#### `stage` vocabulary

| `stage`        | Roles added                    |
| -------------- | ------------------------------ |
| `requirements` | (none)                         |
| `plan`         | `security-scanner`, `test-gap` |
| `design`       | `frontend-reviewer`            |
| `exec`         | `security-scanner`             |
| `verify`       | `test-gap`                     |
| `release`      | `security-scanner`             |

An unknown `stage` value is ignored and adds no role.

#### Signal keys

| Signal key             | Role added          |
| ---------------------- | ------------------- |
| `touchesAuth`          | `security-scanner`  |
| `changesPermissions`   | `security-scanner`  |
| `handlesSensitiveData` | `security-scanner`  |
| `databaseMigration`    | `security-scanner`  |
| `breakingChange`       | `security-scanner`  |
| `changesUi`            | `frontend-reviewer` |
| `changesUserFlow`      | `frontend-reviewer` |
| `deploymentChange`     | `ci-cd-reviewer`    |

- Only truthy keys are evaluated; unknown keys are ignored.
- `changesPublicApi` / `changesCliInterface` / `changesInstallation` correspond to the devex Lens and deliberately map to no role, because no dedicated role exists for it.
- Signals only **add** roles. They never remove anything from the existing selection, including the always-on `bug-hunter`.
- For the Lens correspondence, see [Reviewer Lens Taxonomy](../explanation/reviewer-lens-taxonomy.en.md).

Example:

```json
{
  "reviewSignals": {
    "stage": "exec",
    "touchesAuth": true,
    "changesUi": true
  }
}
```

### `design`

An artifact that supplies the design document. A Flow's declared `design` input resolves to this same-named artifact ID.

- **How to supply it**: Always supply it explicitly, with `--artifact design=<path>` or `artifacts.design` in the config file. It has no well-known filename for current-directory detection.
- **Why it has no default filename**: `design` is a required input of `design-review` / `technical-review`, and a default binding on a required input would let a file that merely sits in the working tree declare the input satisfied (see [Runner CLI Reference](./runner-cli-reference.en.md#entry-acceptance-scope)).
- **Format**: UTF-8 Markdown. Describes architecture, design decisions, and technical premises.
- **Size guideline**: 100 KB or less per file recommended.
- **Flows that require it**: `design-review` / `technical-review`
- **Flows that treat it as optional**: `plan-review` / `requirements-review` / `research-review`
- **When absent (Flows that require it)**: The input is reported as unbound.
- **When absent (Flows that treat it as optional)**: The related observation is skipped.
- **Distinct from the `stage` vocabulary**: The `design` listed in the `stage` vocabulary above is a value of `reviewSignals.stage` and does not share a vocabulary space with artifact IDs. The names match, but the two are unrelated.

### `review-self` / `review-external`

- **Format**: UTF-8 Markdown. Existing AI reviewer (including River Review itself) or human review output may be stored verbatim.
- **When absent**: Double-check (W-check) skills are skipped.
- **Compatibility**: Content may follow the `issue` definition in [`schemas/output.schema.json`](../../schemas/output.schema.json), but this is not required.

**See also**: [pages/guides/w-check.md](../guides/w-check.md) — W-check Practical Guide

### `findings-pool`

- **Format**: UTF-8 JSON. An aggregation of `findings[]` collected from multiple Review Artifacts (execution history of `river review exec` / `river review verify`).
- **Size guideline**: 5 MB or less recommended (typically hundreds of findings). When exceeded, apply rotation or time-window filtering on the CLI side.
- **Schema (provisional)**:

  ```json
  {
    "version": "1",
    "entries": [
      {
        "timestamp": "2026-04-17T00:00:00Z",
        "phase": "exec",
        "skillId": "plangate-plan-integrity",
        "severity": "major",
        "file": "path/to/file.ts",
        "line": 42,
        "message": "description",
        "source": "path/to/review-artifact.json"
      }
    ]
  }
  ```

  - `version`: Fixed string `"1"` (bumped on incompatible changes).
  - `entries[]`: One entry per finding.
  - `entries[].phase`: `exec` or `verify`.
  - `entries[].skillId`: ID of the skill that produced the finding.
  - `entries[].severity`: External vocabulary (`critical` / `major` / `minor` / `info`).
  - `entries[].file` / `entries[].line`: Target location. Omittable for findings that reference outside the diff.
  - `entries[].message`: Human-readable description of the finding.
  - `entries[].source` (optional): Path of the originating Review Artifact. Recommended to preserve provenance.

- **Construction**: CLI consumers are expected to build this artifact by reading multiple `review-artifact.json` files and concatenating their `findings[]` into `entries[]` (implementation tracked in follow-up issue).
- **When absent**: Skills that require this artifact, such as `plangate-rule-promotion`, return `NO_REVIEW` at the Pre-execution Gate and skip the promotion-judgement process.

### `tdd-ledger`

- **Format**: UTF-8 JSON. A ledger recording each TDD (test-driven development) phase execution. Expected to be produced during exec by upstream workflows such as PlanGate.
- **Role**: Records the command and result (exitCode) of the RED / GREEN / REFACTOR VERIFY phases, providing evidence that TDD was performed in the declared, correct order.
- **Schema (provisional)**:

  ```json
  {
    "version": "1",
    "task": "TASK-1234",
    "phases": [
      {
        "phase": "tdd_red",
        "command": "npm test -- discount.test.ts",
        "exitCode": 1,
        "conclusion": "Fails as expected because applyDiscount is unimplemented",
        "testCaseRefs": ["TC2"]
      },
      {
        "phase": "tdd_green",
        "command": "npm test -- discount.test.ts",
        "exitCode": 0,
        "conclusion": "Minimal implementation makes TC2 pass",
        "testCaseRefs": ["TC2"]
      }
    ]
  }
  ```

  - `version`: Fixed string `"1"` (bumped on future incompatible changes).
  - `task` (optional): Identifier of the corresponding task.
  - `phases[].phase`: One of `tdd_red` / `tdd_green` / `refactor_verify` / `verification`.
  - `phases[].command`: The test/verification command executed.
  - `phases[].exitCode`: Exit code of the command (`tdd_red` expects `!= 0`; `tdd_green` / `refactor_verify` / `verification` expect `0`).
  - `phases[].conclusion` (optional): Explanation of the phase outcome or failure reason.
  - `phases[].testCaseRefs` (optional): Array of corresponding `test-cases` IDs.

- **When absent**: Skills that require this artifact, such as `plangate-tdd-evidence`, return `NO_REVIEW` at the Pre-execution Gate and skip the TDD evidence review.

### `diff`

- **Format**: unified diff (`git diff` compatible). Binary diffs are ignored when the diff is supplied as an artifact. (When `review plan|exec --base <ref>` obtains the diff from git, the changed-file set comes from `git diff --name-only`, so binary changes and 100% renames are included.)
- **Requirement**: A diff must be supplied by **some channel**. When no artifact is specified, River Review internally runs `git diff <mergeBase>..HEAD` and uses the result as the diff.
- **Precedence against `--base`** (#2046): an explicitly specified artifact (tier 1 CLI argument / tier 2 config file) wins over `review plan|exec --base <ref>` — provided the file exists at that path; when it does not, the `--base` range is used and a warning says so. `--base` wins over tier 3 directory auto-detection (`diff.patch`). Either way, the discarded input is announced as a warning on stderr.
- **When the resulting diff is empty**: If the supplied diff (explicit or fallback) is empty, `status` is set to `no-changes` and review skills are not executed.

### `junit`

- **Format**: [JUnit XML](https://github.com/testmoapp/junitxml) compatible. Nested `<testsuite>` is permitted.
- **When absent**: Test-pass/fail skills are skipped.

### `coverage`

- **Format**: One of Cobertura XML, LCOV, or Istanbul JSON.
- **When absent**: Coverage skills are skipped.
- **Note**: Threshold evaluation is the skill's responsibility; this contract only fixes schema passthrough.

### `lint` / `typecheck`

- **Format**: Prefer JSON (ESLint / stylelint / tsc JSON), fall back to plain text. Skills perform a tool-specific light parse on plain input.
- **When absent**: Static-analysis skills are skipped.

## Input Channels

River Review resolves artifacts in this order:

1. **CLI / GitHub Action arguments** (defined in `river review plan` / `river review exec` CLI spec). Example: `--artifact pbi-input=./path/to/pbi-input.md`
2. **Configuration file** (defined in `river review plan` / `river review exec` CLI spec). `artifacts` section in `river.config.*`.
3. **Current directory auto-detection** (fallback). Searches the workspace root for the default filenames above.

Artifacts not resolved by any channel are treated as "absent" and follow the per-artifact absence behavior above.

## Downstream Integration

### CLI

- `river run` records the resolved artifact set in the `context` / `debug` sections of the [Review Artifact](./review-artifact.en.md).
- Failure to resolve required artifacts exits with code `1`. See [Stable Interfaces](./stable-interfaces.en.md).

### Skills

- Individual skills declare the artifact IDs they require (implemented as part of the skill-pack design).
- Skills requiring an unresolved artifact are auto-skipped and recorded in `plan.skippedSkills`.

### CI

> **⚠️ GitHub Action limitation (not yet implemented)**
>
> The `--artifact` and `--ensemble` flags are **not yet available as GitHub Action inputs**.
> As a workaround, invoke the `dist/index.mjs` CLI directly. See the [W-check Practical Guide](../guides/w-check.md) for a concrete example.
> A dedicated `artifact` input is planned (see `runners/github-action/action.yml`).

- CI should decide failure from the Review Artifact `status` and the severity mix of `findings`.

## PlanGate Independence

This contract treats PlanGate as **one of several possible producers** and deliberately avoids:

- Hard-coding PlanGate-specific directory layouts (e.g. `plangate/<phase>/`) as default paths.
- Adopting artifact names tied to PlanGate-internal commands or execution models.
- Assuming PlanGate versions and River Review skill versions are co-released.
- Adopting a PlanGate-specific signal format as the `reviewSignals` contract. The `stage` vocabulary and signal keys are defined by River Review; PlanGate is treated as one possible supplier.

This keeps River Review usable for workflows other than PlanGate or for artifacts generated manually.

## Versioning

- This contract is managed as document version `1` (when later formalized as JSON Schema, a `version` field will be added).
- Adding artifacts or extending formats is a minor bump (backward compatible); removal is a major bump.

## See Also

- [Review Artifact](./review-artifact.en.md) — Output schema for review runs
- [Stable Interfaces](./stable-interfaces.en.md) — CLI / GitHub Actions stable contract
- [Runner CLI Reference](./runner-cli-reference.en.md) — Runner CLI usage
- [Review Policy](./review-policy.en.md) — AI review policy
