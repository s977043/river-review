# Review Coverage Contract (#2212)

## Status

Contract foundation inspired by Alibaba OpenCodeReview's deterministic dispatch / delegation model.

**Stability: Experimental.**

Review Coverage is emitted on machine-readable review execution surfaces. Reviewer orchestration emits it unless every unit skipped the LLM (#2436). Since #2410, the single-reviewer path also emits it when an LLM call was actually attempted. A valid semantic response is `complete`. A transport / response / parse failure is represented as a failed required unit (`not_executed`). Intentional skips (dry-run, offline, missing key) remain unobserved. Review Coverage is not a Stable Contract. Gate integration remains opt-in via `RIVER_GATE_COVERAGE=1`.

The JSON/saved-run surface is Experimental. Its stability is recorded in `pages/reference/stable-interfaces.md`.

## Why

`0 findings` and `review complete` are different facts.

A review run may produce no findings because:

1. all intended review work completed and found nothing, or
2. some intended review work failed, timed out, was skipped, or was otherwise not executed.

The current reviewer orchestrator executes `reviewer role × diff chunk` units. Before #2212, per-role aggregation marked a role `fulfilled` when at least one of its chunks succeeded. The gate treated a run as not executed only when every role failed. Partial execution was therefore visible in debug data, but not represented as a first-class contract.

## Scope

This contract covers **execution coverage** plus an adjacent, observe-only **LLM-facing file-selection scope**.

It is intentionally separate from:

- **Skill routing coverage**—`selectedSkills` / `skippedSkills` and their reasons.
- **Context coverage**—repository context supplied / skipped by `repo-context.mjs`.
- **Finding quality**—whether a finding is correct, blocking, or advisory.
- **Reviewer independence**—who reviewed and what context they shared.

`fileScope` is not reviewer-execution coverage. It records which changed files are represented in the LLM-facing `filesForReview` view after configured exclusions and diff optimization. A file omitted by diff optimization can still be inspected by deterministic review logic through raw `diff.files`. Execution completion is derived only from Review Units.

## Review Unit v1

The current minimum execution unit is the work item the orchestrator actually schedules:

```text
reviewer role × diff chunk
```

A Review Unit has this shape conceptually:

```yaml
id: reviewer:security-scanner/chunk:2
kind: diff-chunk
subjects:
  - src/auth/session.ts
  - src/auth/token.ts
reviewerRole: security-scanner
required: true
status: completed | failed | timed_out
reasonCode: null | reviewer_timeout | reviewer_error
findingsCount: 0
```

The schema enforces the status/reason relationship:

- `completed` → `reasonCode: null`
- `failed` → `reasonCode: reviewer_error`
- `timed_out` → `reasonCode: reviewer_timeout`

### Stable ID

- Non-chunked review: `reviewer:<role>/chunk:1`
- Chunked review: `reviewer:<role>/chunk:<1-based index>`

The ID describes the deterministic execution plan, not a provider request ID.

### Required vs optional

For v1, `required` is derived deterministically from reviewer selection:

- roles listed in `autoSelection.required` are required in auto mode;
- otherwise all explicitly selected reviewer roles are required.

This is deliberately conservative. A future policy can introduce optional reviewer roles without changing the unit contract.

## Coverage status

```yaml
reviewCoverage:
  schemaVersion: '1'
  status: complete | partial | not_executed
  expectedUnits: 6
  completedUnits: 5
  requiredUnits: 4
  completedRequiredUnits: 3
  incompleteRequiredUnitIds: []
  units: []
```

Status derivation:

- `complete`: every required unit completed.
- `partial`: at least one required unit completed, but not all required units completed.
- `not_executed`: zero required units completed.

A unit that completes with `findingsCount: 0` is still completed. Finding count never determines coverage.

The current v1 reviewer selection always produces at least one required role when reviewer orchestration runs. `deriveReviewCoverage()` still includes a defensive `requiredUnits === 0` branch for a future all-optional policy. In that case, coverage falls back to whether all, some, or none of the planned optional units completed.

### Reviewer counts in `debug`

`debug.succeededReviewers` and `debug.failedReviewers` count tasks (role × chunk), not roles:

- `succeededReviewers`: tasks whose LLM call completed.
- `failedReviewers`: rejected tasks plus fulfilled tasks whose LLM call failed.
- A task that skipped the LLM is counted in neither, so the sum can be smaller than the total number of tasks.

The coverage units treat skips differently: when skipped and executed tasks are mixed, a skipped unit counts as `failed` (#2440).

## File scope ledger

Phase 1 / Slice C adds an optional `fileScope` ledger to the same Review Coverage object:

```yaml
fileScope:
  selected:
    - src/app.mjs
  excluded:
    - path: docs/notes.md
      reasonCode: diff_optimization
    - path: fixtures/generated.json
      reasonCode: configured_exclusion
```

The ledger is derived at the local selection boundary. That is the point where River Review holds both the raw repository change set and the post-configuration LLM-facing `filesForReview` view.

Closed reason vocabulary:

- `configured_exclusion`: the path matched `config.exclude.files` and was removed from the local review diff before review processing;
- `diff_optimization`: the path did not match a configured exclusion but was absent from the LLM-facing `filesForReview` set. It can still be inspected by deterministic review logic through raw `diff.files`.

`selected` and `excluded` are deterministic and disjoint. They preserve first-seen changed-file order. Together they reconstruct the raw changed-file set relative to these two selection boundaries; they do not assert file-level execution completion.

That reconstruction holds for runs over a real repository. A programmatic caller can supply paths that the raw changed-file set does not contain. Those paths stay in `selected`, which then covers more than the raw set.

### `excluded` and Review Unit subjects are disjoint

`fileScope` and `units[].subjects` come from different points in the pipeline.
They still agree on which paths the reviewer saw.
A path recorded in `excluded` never appears in a subject list.
That holds for both reason codes.

The guarantee used to hold only below the chunking thresholds.
`splitDiffIntoChunks` partitions the raw `diff.files`.
It then aliases each chunk's `filesForReview` to that same array.
A chunked run therefore reported pre-optimization files as subjects (#2233).
Subjects are now derived through `buildLlmDiffView()`.
That function is the single source of truth for the LLM-facing view.
It re-optimizes the raw chunk alias (#2230).
A subject list therefore names exactly the files whose hunks reached a reviewer.
The `<unknown-diff>` sentinel below is the one declared exception to that.

`selected` remains the wider of the two sets.
It is a superset of the union of Review Unit subjects for a repository run.
A selected path can still lose every hunk to per-chunk optimization.
Do not read the two as one hierarchy in the other direction.
A subject is not a claim that the file was reviewed completely.
It only states that the file was part of the reviewed view.

### The `<unknown-diff>` subject sentinel

`subjects` is schema-constrained to at least one entry.
A Review Unit whose LLM view is empty therefore carries the literal `<unknown-diff>`.
It is the one subject value that names no file.

A chunk reaches that state when the optimizer drops every one of its files.
`splitDiffIntoChunks` groups by top-level directory.
Six Markdown files under `docs/` can become one whole chunk.
That chunk has no reviewable hunk left, so its LLM view is empty.
The condition is reachable on ordinary pull requests, not only on malformed input.

The sentinel is deliberately not a path.
It never matches an entry in `fileScope.excluded`, so the disjointness above still holds.
It also never claims that an excluded file was reviewed.
Reading it as a real path is a consumer bug.

Such a unit still reports `status: "completed"` and `findingsCount: 0`.
That is accurate for Phase 1: the reviewer role did run and returned nothing.
Suppressing the unit, or giving it a distinct status, changes execution semantics.
That change belongs to Gate integration and is tracked separately.

### Why there is no `coveredFiles` field

File-level execution completion is not equivalent to LLM-facing file selection. A file can appear in multiple Review Units because different reviewer roles inspect the same chunk. Deterministic review logic may also inspect raw files that the LLM-facing optimizer omitted. A `covered: true/false` value would therefore require policy about required vs optional reviewers, deterministic processing, and partial failures.

That policy belongs to later Gate integration. Phase 1 keeps file selection as observation and Review Unit outcomes as the execution SSoT.

### All-excluded / non-orchestrated runs

`fileScope` is attached to an existing Review Coverage observation, including the single-reviewer attempted-LLM observation introduced by #2410.

River Review still does not synthesize Review Coverage for intentional no-review paths. A single-reviewer run skipped by dry-run, offline mode, or missing credentials keeps the field absent. Since #2436 the same holds for a `--reviewers` run whose every unit skipped the LLM. If skipped and executed units mix, a skipped unit is recorded as `failed` (`reviewer_error`). This preserves the distinction between **no observation** and **observed execution failure**.

The single-reviewer unit reports execution completeness only. It does not claim reviewer quality, finding correctness, or semantic completeness beyond whether the required LLM review call returned usable output.

## Rollout boundary

### Foundation—shipped

- versioned Review Coverage schema;
- pure `deriveReviewCoverage()` logic and regression tests;
- no Gate behavior change.

### Phase 1 / Slice A—shipped

- build Review Units from existing `role × chunk` task descriptors and outcomes;
- derive complete / partial / not_executed at runtime;
- keep Gate/decision unchanged.

### Phase 1 / Slice B—shipped

- propagate the existing object to JSON output and saved runs;
- validate against the Review Coverage schema without duplicating its shape;
- register the runtime surface as Experimental.

### Phase 1 / Slice C—LLM-facing file selection scope

- attach deterministic selected/excluded LLM-facing file-selection scope to existing Review Coverage;
- distinguish configured exclusions from LLM diff optimization;
- do not derive file-level completion or change Gate policy.

### Gate integration—later, opt-in

Gate integration must be a separate change after fixtures and dogfooding demonstrate the policy we want for incomplete required vs optional coverage.

## Backward compatibility

The contract remains additive:

- `reviewCoverage` itself remains optional on output surfaces;
- `fileScope` is optional inside Review Coverage;
- artifacts produced before Slice C remain valid;
- callers supplying an older programmatic context without file-scope metadata keep the pre-Slice-C Review Coverage object;
- consumers that do not know the new field can ignore it while the surface is Experimental.

Forward compatibility is deliberately weaker. While the surface is Experimental, optional
fields may be added without advancing `schemaVersion`, and the schema sets
`additionalProperties: false`. A consumer that pins or vendors an older copy of
`schemas/review-coverage.schema.json` therefore rejects a newer artifact.
The copy shipped under `runners/github-action/dist/` has the same property.
`schemaVersion` alone does not signal the difference.
Validate against the schema shipped with the release you consume artifacts from.

## Future generalization

Do not generalize v1 beyond the currently executable unit.

If usage proves valuable, later versions may define semantic Review Units for upstream artifacts, for example:

- requirements → acceptance criterion
- design → architectural decision / boundary
- plan → task / milestone
- security → trust boundary

That is explicitly out of scope for the first implementation.
