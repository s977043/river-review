# #2267 Phase 3 — Security Audit Coverage Contract

## Status

Phase 3 foundation for #2267.

This slice is observe-only.
It adds no Gate behavior, target-controlled execution, reviewer orchestration, or normal PR review changes.

## Why a separate contract exists

River Review already has `ReviewCoverage` from #2212.
That contract answers whether planned reviewer execution actually completed.
Its current execution unit is reviewer role × diff chunk.

`SecurityAuditCoverage` answers a different question:

```text
ReviewCoverage
= did planned review execution run?

SecurityAuditCoverage
= which subsystem × trust-boundary × attack-class surfaces were investigated?
```

The contracts must remain separate.
A completed reviewer execution unit does not prove a security hypothesis surface was investigated sufficiently.
A semantic security unit can also remain blocked even when the reviewer process itself completed successfully.

## Coverage unit

The Phase 3 semantic unit is:

```text
subsystem × trustBoundary × attackClassId
```

`attackClassId` references the stable taxonomy introduced in Phase 2:

```text
skills/agent-skills/river-review-security-audit/references/attack-classes.json
```

The Phase 3 contract does not create new executable skills or reviewer roles.

## Unit status vocabulary

### `planned`

The surface is applicable and should be investigated, but traceable investigation evidence has not yet been recorded.

### `covered`

The surface was investigated with both:

- at least one `reviewedPaths` entry
- at least one `evidenceRefs` entry

`covered` does **not** mean safe.
It means the investigation surface has traceable evidence.
Zero findings is allowed, but zero findings alone can never produce this status.

### `candidate`

The surface was investigated with traceable evidence and produced one or more candidate finding references.

`candidate` is a coverage status only.
It does not mean the finding is established.
Candidate truth remains owned by deterministic verification and #1978 adversarial finding verification.

### `blocked`

The surface cannot currently be completed because required evidence is unavailable or unsafe to obtain under the current execution policy.

Allowed reason codes:

- `source_evidence_insufficient`
- `unsafe_execution_required`
- `dependency_unavailable`

A concrete `validationPlan` is required.

### `deferred`

The surface is intentionally postponed rather than silently omitted.

Allowed reason codes:

- `budget_deferred`
- `manual_defer`

A concrete `validationPlan` is required.

### `out-of-scope`

The surface is explicitly excluded from this audit scope or is not applicable.

Allowed reason codes:

- `scope_excluded`
- `not_applicable`

An explanation is required.
Out-of-scope units do not count toward applicable coverage.

## Aggregate status

The derived ledger uses:

```text
complete | partial | not_started
```

These values are local to `SecurityAuditCoverage` and do not modify #2212 `ReviewCoverage` semantics.

- `complete`: every applicable unit is `covered` or `candidate`
- `partial`: at least one applicable unit is investigated and at least one gap remains
- `not_started`: no applicable unit is yet investigated, or no applicable units exist

`complete` is not a security verdict.
It must never be rendered or interpreted as `safe`, `secure`, or `no vulnerabilities`.

## Finding-count invariant

The contract intentionally contains no `findingsCount`-driven coverage rule.

```text
0 findings + evidence-backed investigation
may be covered

0 findings without evidence-backed investigation
must not be covered
```

`deriveSecurityAuditCoverage()` only summarizes caller-supplied semantic unit statuses.
It does not infer `covered` from findings, reviewer success, or execution metadata.

## Source-only boundary

Phase 3 keeps the Phase 1/2 source-only policy.

When a hypothesis needs target-controlled execution and the sandbox contract does not exist, use:

```text
status: blocked
reasonCode: unsafe_execution_required
validationPlan: <safe future validation path>
```

Do not execute target-controlled builds, tests, browsers, fuzzers, package scripts, or external probes to improve the coverage number.

## Gate boundary

This phase is telemetry only.

The following remain unchanged:

- deterministic Gate logic
- normal PR security review
- `ReviewCoverage`
- #1978 finding validation state machine
- #1857 Semantic Precision

Gate integration remains a later phase after dogfood and paired evaluation.

## Files

- `schemas/security-audit-coverage.schema.json`
- `src/lib/security-audit-coverage.mjs`
- `tests/security-audit-coverage.test.mjs`
- `tests/helpers/schema-validator.mjs`

## Exit criteria

Phase 3 foundation is complete when:

- schema and runtime vocabularies are aligned
- every Phase 2 attack-class ID can be referenced
- `covered` requires traceable path and evidence references
- `candidate` requires a candidate finding reference
- blocked/deferred surfaces cannot disappear without a validation plan
- out-of-scope surfaces cannot disappear without an explanation
- zero findings are never used to derive coverage
- no Gate behavior changes
- CI passes

## Next phase

Phase 4 evaluates whether `unknown-coverage-review` can act as a security coverage critic before creating any new generic critic implementation.
