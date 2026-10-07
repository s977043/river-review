# #2455 Phase 5A—Observe-only Cross-concern Interaction Planner

## Status

Implementation note for Issue #2568.

Parent: #2455.

Phase 5 is split into two steps.

- **Phase 5A:** deterministic interaction planning and observation
- **Phase 5B:** future opt-in cross-concern integration review that may generate candidate findings

This document covers Phase 5A only.

## Goal

Phase 5A answers:

> Which explicit Concern interactions should a future integration pass inspect?

It also attaches existing Phase 4 execution-coverage context when available.

It does not answer:

> Does an interaction contain a defect?

It does not generate findings.

## Inputs

Phase 5A consumes two existing observations.

1. `reviewConcernMap`
2. `reviewConcernCoverage`

The Concern Map owns the explicit semantic interaction edges.

Phase 4 Concern Coverage supplies optional execution context for each endpoint.

Coverage does not decide whether an interaction exists.

## Explicit edges only

The planner reads only:

```text
concern.interactionRefs[]
```

It does not infer a new relationship from:

- file overlap
- reviewer overlap
- finding similarity
- shared Skill
- shared Review Unit
- severity
- agreement count

This keeps semantic relationship discovery owned by the Concern Analyzer.

## Reciprocal edge handling

For Phase 5A, an explicit interaction is treated as one undirected integration candidate.

```text
A -> B
B -> A
```

becomes one candidate:

```text
[A, B]
```

The pair is canonicalized using deterministic string ordering.

The observation then assigns a per-run opaque reference:

```text
interaction-1
interaction-2
...
```

The reference is not a cross-run identity.

## Observation shape

The result is emitted only under:

```text
reviewDebug.reviewConcernInteractions
```

Conceptual shape:

```json
{
  "schemaVersion": "1",
  "kind": "review-concern-interaction-observation",
  "status": "observed",
  "source": {
    "concernMapStatus": "completed",
    "concernCoverageStatus": "observed",
    "limitations": [],
    "reason": null
  },
  "interactions": [
    {
      "interactionRef": "interaction-1",
      "concernRefs": ["concern-a", "concern-b"],
      "coverage": {
        "status": "available",
        "concerns": [
          {
            "concernRef": "concern-a",
            "mappingStatus": "mapped",
            "executionCoverage": "complete",
            "blindSpotCandidate": false
          },
          {
            "concernRef": "concern-b",
            "mappingStatus": "unmapped",
            "executionCoverage": null,
            "blindSpotCandidate": true
          }
        ]
      },
      "integrationCheckCandidate": true
    }
  ],
  "summary": {
    "observedInteractions": 1,
    "withAvailableCoverageContext": 1,
    "withPartialCoverageContext": 0,
    "withUnavailableCoverageContext": 0
  },
  "applied": false
}
```

This is an internal debug observation.

It is not a Stable Interface.

## Coverage semantics

Coverage is context only.

An interaction remains an integration candidate when:

- one endpoint is unmapped
- one endpoint has partial execution
- Phase 4 coverage is unavailable

Phase 5A does not suppress a semantic interaction because execution evidence is incomplete.

### Available coverage context

Both endpoints have valid Phase 4 entries.

### Partial coverage context

The Phase 4 observation itself is partial.

The interaction remains visible and the partial state is preserved.

### Unavailable coverage context

Coverage is absent, malformed, unavailable, or missing an endpoint.

The interaction remains visible.

Its coverage fields become unknown instead of being guessed.

## Fail-safe behavior

### Missing Concern Map

No Phase 5A observation is emitted.

### Failed Concern Map

The observation is unavailable.

### Unknown Concern Map status

The observation is unavailable.

### Duplicate Concern ids

The observation is unavailable.

### Invalid interactionRefs

A malformed list or blank reference makes the observation unavailable.

### Self interaction

A Concern cannot reference itself.

A self-reference makes the observation unavailable.

### Missing interaction target

Every interaction target must exist in the same Concern Map.

A missing target makes the observation unavailable.

### Partial Concern Map

The interaction observation remains partial.

Analyzer limitations are preserved.

## Runtime placement

```text
Concern Map
  -> Review execution
  -> Review Coverage
  -> Phase 4 Concern Coverage projection
  -> Phase 5A Interaction planner
  -> reviewDebug only
```

The planner runs after Phase 4 so it can attach endpoint coverage context.

It still depends on the Concern Map for interaction identity.

## Boundaries

Phase 5A does not:

- generate findings
- infer new Concern relationships
- alter reviewer selection
- alter Skill selection
- alter Review Coverage
- change finding severity
- change finding disposition
- invoke Finding Critic
- change Gate inputs
- create a new Organizer
- create a top-level stable artifact

`applied` is always `false`.

## Phase 5B boundary

A future Phase 5B may run an opt-in integration review for these candidates.

The intended flow is:

```text
explicit Concern interaction
  -> cross-concern integration review
  -> candidate finding
  -> existing deterministic verification
  -> #1978 Finding Critic / validation path
  -> validated finding
```

Phase 5B must not create a second finding validation lifecycle.

Consensus must not be used as correctness evidence.

## Tests

`tests/review-concern-interaction.test.mjs` covers:

- missing and failed Concern Maps
- unknown map status
- reciprocal-edge deduplication
- deterministic pair ordering
- duplicate Concern ids
- blank interaction refs
- malformed interactionRefs
- self interactions
- missing targets
- missing coverage
- valid endpoint coverage joins
- partial coverage context
- malformed coverage context
- input immutability

`tests/review-concern-local-runner.test.mjs` keeps the default-off invariant.

It also checks that failed-map observations remain unavailable on normal and optimizer-created `no-changes` paths.

## Promotion boundary

Phase 5A provides planning evidence only.

No runtime promotion is justified by this step alone.

Before Phase 5B becomes active by default, #2455 still requires paired evaluation of quality, recall, false positives, latency, and token cost.

## Delivery review

Three implementation review loops were completed before PR creation.

1. Interaction ordering is locale-independent and deterministic.
2. Malformed Phase 4 coverage never becomes trusted coverage context.
3. The final diff remains observe-only and does not create findings, routing, Gate logic, or a new validation lifecycle.

Repository formatting and GitHub Action dist generation were run from the final source changes.

Blocking findings after the third review loop: **0**.

## References

- #2455
- #2568
- #2565
- #1978
- #2322
- `src/lib/review-concern-interaction.mjs`
- `src/lib/review-concern-coverage.mjs`
- `src/lib/review-concern-analyzer.mjs`
