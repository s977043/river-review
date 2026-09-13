# Review Coverage Contract (#2212)

## Status

Contract foundation inspired by Alibaba OpenCodeReview's deterministic dispatch / delegation model.

**Stability: Experimental.** This contract is not part of the Stable Contract yet. The first implementation slice adds the schema and pure derivation logic only; runtime emission and Gate integration are separate follow-up changes. Before runtime output becomes a supported external surface, `pages/reference/stable-interfaces.md` must be updated with the Review Coverage contract and its stability level.

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

The current v1 reviewer selection always produces at least one required role when reviewer orchestration runs. The `requiredUnits === 0` branch in `deriveReviewCoverage()` is defensive for a future policy where all units might be optional; in that case coverage falls back to whether all, some, or none of the planned optional units completed.

## Rollout boundary

### Foundation slice (this PR)

- Add the versioned Review Coverage schema.
- Add pure `deriveReviewCoverage()` logic and regression tests.
- Compile the schema in Ajv strict mode and validate representative positive/negative cases.
- Do not change runtime output, `decision`, or Gate behavior.

### Observe-only runtime slice (next PR)

- Build Review Units from the existing `role × chunk` task descriptors and outcomes.
- Emit coverage as additive machine-readable metadata.
- Keep existing `decision` and `gate` derivation unchanged.
- Keep `run-gate.mjs`'s existing all-reviewers-failed fail-safe.
- Register Review Coverage in `pages/reference/stable-interfaces.md` before treating the runtime field as a supported external surface.

### Gate integration (later, opt-in)

Gate integration must be a separate change after fixtures and dogfooding demonstrate the policy we want for incomplete required vs optional coverage.

## Backward compatibility

The contract is designed to be additive and optional. Runtime consumers remain unchanged until the observe-only wiring lands.

When runtime emission is added, artifacts that predate coverage must remain valid and consumers that do not know the field must be able to ignore it.

## Future generalization

Do not generalize v1 beyond the currently executable unit.

If usage proves valuable, later versions may define semantic Review Units for upstream artifacts, for example:

- requirements → acceptance criterion
- design → architectural decision / boundary
- plan → task / milestone
- security → trust boundary

That is explicitly out of scope for the first implementation.
