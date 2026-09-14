# Review Coverage Contract (#2212)

## Status

Contract foundation inspired by Alibaba OpenCodeReview's deterministic dispatch / delegation model.

**Stability: Experimental.**

Review Coverage is emitted on machine-readable reviewer-orchestration surfaces. It is not a Stable Contract. It has no Gate authority in Phase 1.

The JSON/saved-run surface is Experimental. Its stability is recorded in `pages/reference/stable-interfaces.md`.

## Why

`0 findings` and `review complete` are different facts.

A review run may produce no findings because:

1. all intended review work completed and found nothing, or
2. some intended review work failed, timed out, was skipped, or was otherwise not executed.

The current reviewer orchestrator executes `reviewer role × diff chunk` units. Before #2212, per-role aggregation marked a role `fulfilled` when at least one of its chunks succeeded. The gate treated a run as not executed only when every role failed. Partial execution was therefore visible in debug data, but not represented as a first-class contract.

## Scope

This contract covers **execution coverage** plus the deterministic **file-selection scope** that precedes reviewer execution.

It is intentionally separate from:

- **Skill routing coverage**—`selectedSkills` / `skippedSkills` and their reasons.
- **Context coverage**—repository context supplied / skipped by `repo-context.mjs`.
- **Finding quality**—whether a finding is correct, blocking, or advisory.
- **Reviewer independence**—who reviewed and what context they shared.

File selection does not prove execution. Execution completion is still derived only from Review Units.

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

The ledger is derived at the local selection boundary. At that point River Review has the raw repository change set and the exact diff passed to reviewer execution.

Closed reason vocabulary:

- `configured_exclusion`: the path matched `config.exclude.files`;
- `diff_optimization`: the path did not match a configured exclusion but was absent from the LLM-facing `filesForReview` set.

`selected` and `excluded` are deterministic and disjoint. They preserve first-seen changed-file order. Together they reconstruct the changed-file scope available at that boundary.

### Why there is no `coveredFiles` field

File-level execution completion is not equivalent to file selection. A file can appear in multiple Review Units because different reviewer roles inspect the same chunk. A `covered: true/false` value would therefore require policy about required vs optional reviewers and partial failures.

That policy belongs to later Gate integration. Phase 1 keeps file selection as observation and Review Unit outcomes as the execution SSoT.

### All-excluded / non-orchestrated runs

`fileScope` is attached to an existing Review Coverage observation.

River Review does not synthesize Review Coverage when reviewer orchestration does not run. Legacy single-reviewer and early no-review paths keep their existing surface semantics.

Generalizing scope telemetry to those paths is a separate change. It is not an implicit expansion of this contract.

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

### Phase 1 / Slice C—file selection scope

- attach deterministic selected/excluded file scope to existing Review Coverage;
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

## Future generalization

Do not generalize v1 beyond the currently executable unit.

If usage proves valuable, later versions may define semantic Review Units for upstream artifacts, for example:

- requirements → acceptance criterion
- design → architectural decision / boundary
- plan → task / milestone
- security → trust boundary

That is explicitly out of scope for the first implementation.
