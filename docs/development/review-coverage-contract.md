# Review Coverage Contract (#2212)

## Status

Design + observe-only implementation contract inspired by Alibaba OpenCodeReview's deterministic dispatch / delegation model.

This document defines **review execution coverage** for River Review. It does not change gate behavior by itself.

## Why

`0 findings` and `review complete` are different facts.

A review run may produce no findings because:

1. all intended review work completed and found nothing, or
2. some intended review work failed, timed out, was skipped, or was otherwise not executed.

The current reviewer orchestrator executes `reviewer role × diff chunk` units. Before #2212, per-role aggregation marked a role `fulfilled` when at least one of its chunks succeeded, while the gate only treated the run as not executed when every role failed. That makes partial execution observable in debug data but not a first-class contract.

## Scope

This contract covers **execution coverage** only.

It is intentionally separate from:

- **Skill routing coverage** — `selectedSkills` / `skippedSkills` and their reasons.
- **Context coverage** — repository context supplied / skipped by `repo-context.mjs`.
- **Finding quality** — whether a finding is correct, blocking, or advisory.
- **Reviewer independence** — who reviewed and what context they shared.

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
  schemaVersion: "1"
  status: complete | partial | not_executed
  expectedUnits: 6
  completedUnits: 5
  requiredUnits: 4
  completedRequiredUnits: 3
  units: []
```

Status derivation:

- `complete`: every required unit completed.
- `partial`: at least one required unit completed, but not all required units completed.
- `not_executed`: zero required units completed.

A unit that completes with `findingsCount: 0` is still completed. Finding count never determines coverage.

## Gate boundary

Phase 1 is **observe-only**.

- Existing `decision` and `gate` derivation are unchanged.
- Coverage is emitted as machine-readable metadata.
- `run-gate.mjs` keeps its existing all-reviewers-failed fail-safe.

Gate integration must be a separate change after fixtures and dogfooding demonstrate the policy we want for incomplete required vs optional coverage.

## Backward compatibility

Coverage is additive and optional. Consumers that do not know the field can ignore it.

The v1 Review Artifact schema remains valid for artifacts that predate this field.

## Future generalization

Do not generalize v1 beyond the currently executable unit.

If usage proves valuable, later versions may define semantic Review Units for upstream artifacts, for example:

- requirements → acceptance criterion
- design → architectural decision / boundary
- plan → task / milestone
- security → trust boundary

That is explicitly out of scope for the first implementation.
