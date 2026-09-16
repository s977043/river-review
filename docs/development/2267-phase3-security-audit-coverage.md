# #2267 Phase 3—Security Audit Coverage Contract

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

The coverage record carries the Phase 2 `taxonomyVersion` explicitly. A later run can detect taxonomy drift instead of silently interpreting an old ledger with new meanings.

The Phase 3 contract does not create new executable skills or reviewer roles.

## Coverage state vocabulary

Coverage state is intentionally independent from finding lifecycle.

### `planned`

The surface is applicable and should be investigated, but the current audit has not yet recorded enough evidence to call the semantic unit covered.

### `covered`

The surface was investigated with both:

- at least one `reviewedPaths` entry
- at least one structured `evidenceRefs` entry

`covered` does **not** mean safe, vulnerability-free, established, or Gate-approved.
It only means the semantic investigation unit has traceable source evidence under the current audit policy.

Zero findings is allowed, but zero findings alone can never produce this state.

### `blocked`

The surface cannot currently be completed because required evidence is unavailable or unsafe to obtain under the current execution policy.

Allowed reason codes:

- `source_evidence_insufficient`
- `unsafe_execution_required`
- `dependency_unavailable`

Both a concrete `explanation` and a `validationPlan` are required.

### `deferred`

The applicable surface is intentionally postponed rather than silently omitted.

Allowed reason codes:

- `budget_deferred`
- `manual_defer`

Both a concrete `explanation` and a `validationPlan` are required.

### `out_of_scope`

The surface is explicitly excluded from this audit scope or is not applicable.

Allowed reason codes:

- `scope_excluded`
- `not_applicable`

A concrete `explanation` is required.
Out-of-scope units do not count toward applicable coverage.

## Finding lifecycle is separate

The Epic originally listed `candidate` as a possible coverage status. Phase 3 intentionally does **not** use it.

A candidate is a statement about a possible finding, not about whether the semantic investigation surface was covered.
Coupling it to coverage would duplicate responsibilities owned by #1978 and make finding production influence coverage accounting.

Instead, every unit has additive `relatedFindingIds` for traceability:

```text
coverage state = was this semantic surface investigated?
relatedFindingIds = what findings are associated with the surface?
```

A unit can therefore be:

```text
state: covered
relatedFindingIds: []
```

or:

```text
state: covered
relatedFindingIds:
  - finding:authz-001
```

Both are equally covered. Finding truth remains a separate verification concern.

## No aggregate `complete` verdict

Phase 3 deliberately avoids a top-level `complete | partial | not_started` status.

The ledger exposes only observable counters and open semantic units:

```text
totalUnits
applicableUnits
coveredUnits
plannedUnits
blockedUnits
deferredUnits
outOfScopeUnits
openUnitIds
```

This prevents `complete` from being mistaken for a security verdict and leaves later policy to the Coverage Critic and eventual opt-in Gate integration.

`openUnitIds` contains `planned`, `blocked`, and `deferred` units.
It excludes `covered` and `out_of_scope` units.

## Evidence references

`evidenceRefs` is structured instead of encoding `path:line` in a free-form string.

Supported evidence kinds remain source-only:

- `source`
- `config`
- `manifest`
- `documentation`
- `history`

Each evidence reference records:

```text
kind
path
lineStart
lineEnd
note
```

Line numbers may be null for repository evidence that is not naturally line-addressable.

## Source-only boundary

Phase 3 keeps the Phase 1/2 source-only policy and records it as:

```text
executionPolicy: source-only
```

When a hypothesis needs target-controlled execution and the sandbox contract does not exist, use:

```text
state: blocked
reasonCode: unsafe_execution_required
explanation: <why source evidence is insufficient>
validationPlan: <safe future validation path>
```

Do not execute target-controlled builds or tests to improve coverage numbers. Do not use browsers or fuzzers. Do not run package scripts or external probes for that purpose.

## Deterministic semantic validation

JSON Schema validates the local shape and state-specific requirements.
`validateSecurityAuditCoverageSemantics()` adds checks that JSON Schema cannot express cleanly:

- `taxonomyVersion` matches the Phase 2 registry
- every `attackClassId` exists in the registry
- unit ids are unique
- `subsystem × trustBoundary × attackClassId` units are unique
- derived counters and `openUnitIds` have not drifted from unit records

These diagnostics are observe-only and do not affect Gate behavior.

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
- Phase 2 taxonomy provenance is explicit
- every Phase 2 attack-class ID can be referenced
- semantic unit identity is unique by subsystem × trust boundary × attack class
- `covered` requires traceable reviewed paths and evidence references
- finding lifecycle does not determine coverage state
- blocked/deferred surfaces cannot disappear without explanation and a validation plan
- out-of-scope surfaces cannot disappear without an explanation
- zero findings are never used to derive coverage
- no aggregate security-complete verdict is emitted
- no Gate behavior changes
- CI passes

## Next phase

Phase 4 evaluates whether `unknown-coverage-review` can act as a security coverage critic before creating any new generic critic implementation.
