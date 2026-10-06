# #2455 Phase 4—Observe-only Concern Coverage Projection

## Status

Implementation note for Issue #2541.

Parent: #2455.

Phase 3 / #2540 added:

- observe-only concern-based reviewer / Skill recommendations
- optional `concernRefs[]` provenance on Review Units

Phase 4 projects existing Review Coverage evidence back onto observed Concerns.

It does not create a new coverage authority.

## Goal

The projection answers:

> For each observed Concern, did existing Review Units map to it, and what execution coverage did those mapped units achieve?

It does not answer:

> Was the Concern semantically reviewed completely?

Those are different claims.

## Ownership

`#2212 Review Coverage` remains the execution-coverage source of truth.

For each mapped Concern, Phase 4 takes the matching Review Units and reuses:

```text
deriveReviewCoverage(mapped Review Units)
```

The projection does not define new required / optional completion rules.

## Observation shape

Phase 4 is persisted only under:

```text
reviewDebug.reviewConcernCoverage
```

Conceptual shape:

```json
{
  "schemaVersion": "1",
  "kind": "review-concern-coverage-observation",
  "status": "observed",
  "source": {
    "concernMapStatus": "completed",
    "reviewCoverageStatus": "complete",
    "limitations": [],
    "reason": null
  },
  "concerns": [
    {
      "concernRef": "concern-1",
      "mappingStatus": "mapped",
      "mappedReviewUnitIds": ["reviewer:bug-hunter/chunk:1"],
      "mappedReviewerRoles": ["bug-hunter"],
      "executionCoverage": "complete",
      "requiredMappedUnits": 1,
      "completedRequiredMappedUnits": 1,
      "incompleteRequiredUnitIds": [],
      "blindSpotCandidate": false
    },
    {
      "concernRef": "concern-2",
      "mappingStatus": "unmapped",
      "mappedReviewUnitIds": [],
      "mappedReviewerRoles": [],
      "executionCoverage": null,
      "requiredMappedUnits": 0,
      "completedRequiredMappedUnits": 0,
      "incompleteRequiredUnitIds": [],
      "blindSpotCandidate": true
    }
  ],
  "summary": {
    "observedConcerns": 2,
    "mappedConcerns": 1,
    "unmappedConcerns": 1,
    "incompleteMappedConcerns": 0
  },
  "blindSpotConcernRefs": ["concern-2"],
  "applied": false
}
```

This remains an internal debug observation and is not registered as a Stable Interface.

## Blind-spot semantics

A Concern becomes a `blindSpotCandidate` only when:

```text
zero existing Review Units carry that concernRef
```

This means:

> no existing planned/executed Review Unit was mapped to this observed Concern

It does not mean:

- a defect definitely exists
- the Concern definitely required another reviewer
- routing must change
- Gate must block

The observation is evidence for later evaluation.

## Mapped execution semantics

When one or more Review Units map to a Concern, Phase 4 reuses the existing Review Coverage derivation.

Examples:

```text
all required mapped units completed
  -> executionCoverage = complete

some required mapped units completed
  -> executionCoverage = partial

no required mapped unit completed
  -> executionCoverage = not_executed
```

Optional Review Units keep the same semantics they already have in `deriveReviewCoverage()`.

A mapped `complete` state means only:

> the mapped execution units completed under the existing Review Coverage contract

It never means:

> semantic Concern coverage is complete

## Findings are independent

`findingsCount` does not determine Concern execution projection.

Both of these can be true:

```text
executionCoverage = complete
findingsCount = 0
```

and:

```text
executionCoverage = complete
findingsCount > 0
```

The projection measures mapped execution evidence, not finding quality or absence.

## Fail-safe behavior

### No Concern Map

No Phase 4 observation is emitted.

### Failed Concern Map

The observation is `unavailable`.

No blind-spot candidate is inferred from a failed map.

### Invalid / unknown Concern Map status

Only `completed` and `partial` maps can be projected.

Unknown or missing status becomes:

```text
status: unavailable
reason: invalid-concern-map-status
```

### Missing Review Coverage

A usable Concern Map with no Review Coverage becomes:

```text
status: unavailable
reason: review-coverage-unavailable
```

Missing execution evidence is never interpreted as covered or unmapped.

### Invalid Review Coverage

The projection reuses `normalizeCoverageStatus()`.

An inconsistent `complete` label is therefore demoted to the existing safer `partial` / `not_executed` interpretation rather than creating a new Phase 4 rule.

If the status is outside the Review Coverage vocabulary and normalizes to `unknown`, the projection becomes:

```text
status: unavailable
reason: review-coverage-invalid
```

### Partial Concern Map

Observed Concerns can still be projected, but the top-level observation remains `partial` and preserves the analyzer limitations.

A partial map therefore cannot claim that all real Concerns were considered.

## Runtime placement

Normal path:

```text
Concern Map
  -> Review execution
  -> Review Coverage
  -> attach concernRefs
  -> Concern Coverage projection
  -> reviewDebug only
```

Optimizer-created `no-changes` path:

```text
Concern Map
  -> no Review Coverage exists
  -> Concern Coverage = unavailable
```

The legacy `no-changes` result remains unchanged except for the opt-in debug observation.

## Boundaries

Phase 4 does not:

- change Review Coverage counters
- change Review Coverage status
- add or remove Review Units
- alter reviewer selection
- alter Skill selection
- alter findings
- alter Gate inputs
- define semantic completeness
- create a top-level `ConcernCoverage` artifact
- create long-lived Concern identity

`applied` is always `false`.

## Tests

`tests/review-concern-coverage.test.mjs` covers:

- missing Concern Map
- failed Concern Map
- invalid / unknown Concern Map status
- missing Review Coverage
- inconsistent `complete` Review Coverage demotion
- unknown Review Coverage status
- mapped Concern projection
- unmapped blind-spot candidate
- required / optional Review Unit semantics
- partial mapped execution
- zero-finding independence
- partial Concern Map limitations
- duplicate Concern ids
- input immutability

`tests/review-concern-local-runner.test.mjs` keeps the default-off isolation invariant and checks failed-map propagation on both normal and optimizer-created `no-changes` paths.

## Promotion boundary

Phase 4 is still observation only.

The next planned step in #2455 is Phase 5:

```text
individual Concern review
  -> existing reviewers

cross-Concern interactions
  -> integration experiment
  -> candidate findings
  -> #1978 Finding Verification
```

No Gate or routing promotion is justified by this Phase alone.

## Delivery review

Three review loops were completed before the final merge check:

1. Coverage authority: reuse #2212 execution semantics; no second coverage SSoT.
2. Fail-safe: missing or invalid evidence remains unavailable and cannot become a false green.
3. SSoT consistency: existing coverage normalization wins; finding count does not affect execution projection.

Generated GitHub Action dist was rebuilt from the final source changes before the latest-head CI run.

Blocking findings after the third review loop: **0**.

## References

- #2455
- #2540
- #2541
- `src/lib/review-concern-coverage.mjs`
- `src/lib/review-concern-planning-bridge.mjs`
- `src/lib/review-coverage.mjs`
- `docs/development/2455-phase3-review-planning-bridge.md`
