# Review Coverage Contract (#2212)

## Status

Contract inspired by Alibaba OpenCodeReview's deterministic dispatch / delegation model.

**Stability: Experimental.** The contract foundation, per-unit runtime derivation, JSON output, and saved-run persistence are implemented. Review Coverage remains observe-only: it does not change `decision`, Gate, auto-approve, or Human Review policy.

## Why

`0 findings` and `review complete` are different facts.

A review run may produce no findings because:

1. all intended review work completed and found nothing, or
2. some intended review work failed, timed out, was skipped, or was otherwise not executed.

The current reviewer orchestrator executes `reviewer role × diff chunk` units. Before #2212, per-role aggregation marked a role `fulfilled` when at least one of its chunks succeeded. The gate treated a run as not executed only when every role failed. Partial execution was therefore visible in debug data, but not represented as a first-class contract.

## Scope

This contract covers **execution coverage** and an observe-only ledger of the **LLM-facing changed-file scope**.

It is intentionally separate from:

- **Skill routing coverage**—`selectedSkills` / `skippedSkills` and their reasons.
- **Context coverage**—repository context supplied / skipped by `repo-context.mjs`.
- **Finding quality**—whether a finding is correct, blocking, or advisory.
- **Reviewer independence**—who reviewed and what context they shared.

The file ledger does not claim that excluded files were ignored by every deterministic heuristic. It records which changed files were selected for the LLM-facing diff and which were intentionally excluded by the existing diff optimizer.

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
coverage:
  schemaVersion: '1'
  status: complete | partial | not_executed
  expectedUnits: 6
  completedUnits: 5
  requiredUnits: 4
  completedRequiredUnits: 3
  incompleteRequiredUnitIds:
    - reviewer:security-scanner/chunk:2
  files:
    selected:
      - src/auth/session.ts
    covered:
      - src/auth/session.ts
    excluded:
      - path: docs/guide.md
        reasonCode: markdown
  units: []
```

Status derivation:

- `complete`: every required unit completed.
- `partial`: at least one required unit completed, but not all required units completed.
- `not_executed`: zero required units completed.

A unit that completes with `findingsCount: 0` is still completed. Finding count never determines coverage.

The current v1 reviewer selection always produces at least one required role when reviewer orchestration runs. `deriveReviewCoverage()` still includes a defensive `requiredUnits === 0` branch for a future all-optional policy. In that case, coverage falls back to whether all, some, or none of the planned optional units completed.

## File scope ledger

`files` is optional and additive so saved runs produced before Slice C remain schema-valid.

- `selected`: changed file paths present in the LLM-facing diff after the existing diff optimizer runs.
- `covered`: selected paths for which every effective Review Unit that names the path completed. Required units are authoritative when they exist; optional reviewer failures do not weaken required file coverage.
- `excluded`: changed file paths omitted from the LLM-facing diff together with a deterministic reason code.

Current exclusion reasons are:

- `markdown`—Markdown paths excluded by the existing LLM diff policy.
- `lockfile`—supported lockfiles excluded by the existing LLM diff policy.
- `generated_artifact`—paths under a `dist/` segment.
- `non_reviewable_hunks`—the path is otherwise reviewable, but no hunk remains after whitespace/comment-only filtering or the diff has no reviewable hunk.

The file ledger is derived from the same `buildLlmDiffView()` / `optimizeDiff()` policy used to construct reviewer prompts. It must not reimplement an independent selection policy.

## Chunked review consistency

Chunked orchestration historically populated `filesForReview` with raw chunk files. `buildLlmDiffView()` treats `filesForReview` as the prompt source. That could reintroduce files that the normal optimizer had already excluded. Examples include Markdown, lockfiles, generated `dist/` files, and non-reviewable hunks.

Slice C makes `buildLlmDiffView()` re-apply the optimizer when `filesForReview` is present. The operation is intentionally idempotent for already-optimized repository diffs and keeps chunked and non-chunked LLM scope aligned.

## Rollout boundary

### Foundation—merged

- Versioned Review Coverage schema.
- Pure `deriveReviewCoverage()` logic and regression tests.
- Schema validation in Ajv strict mode.

### Phase 1 / Slice A—merged

- Build Review Units from the existing `role × chunk` task descriptors and outcomes.
- Derive runtime `complete | partial | not_executed` without changing Gate behavior.

### Phase 1 / Slice B—merged

- Propagate coverage to JSON output and saved runs.
- Keep the field optional and backward compatible.
- Register Review Coverage as Experimental in `pages/reference/stable-interfaces.md`.

### Phase 1 / Slice C—file scope telemetry

- Record selected / covered / excluded file scope with deterministic reasons.
- Keep the ledger additive and observe-only.
- Keep Context Coverage separate.
- Keep existing Gate / decision behavior unchanged.

### Dogfood and Gate integration—later

Before Gate integration, dogfood Review Coverage using River Review's own runs and measure at least:

- required unit completion rate;
- partial review rate;
- required timeout/failure rate;
- `0 findings + partial` frequency;
- unexplained selected-but-uncovered files.

Gate integration must be a separate, opt-in change after those observations establish the desired policy for incomplete required vs optional coverage.

## Backward compatibility

Review Coverage and the `files` ledger are additive. Artifacts and saved runs that predate either field remain valid.

Consumers must not interpret an absent `reviewCoverage` or absent `reviewCoverage.files` as proof of complete coverage.

## Future generalization

Do not generalize v1 beyond the currently executable unit.

If usage proves valuable, later versions may define semantic Review Units for upstream artifacts, for example:

- requirements → acceptance criterion
- design → architectural decision / boundary
- plan → task / milestone
- security → trust boundary

That is explicitly out of scope for the current implementation.
