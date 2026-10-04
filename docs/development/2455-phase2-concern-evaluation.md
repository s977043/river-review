# #2455 Phase 2—Obligation-oriented Review Concern Evaluation

## Status

Implementation note for Issue #2455 Phase 2.

Phase 1 added the opt-in, observe-only Review Concern Analyzer. Phase 2 adds a deterministic scoring layer for human-labeled review obligations. Runtime routing and Review Coverage remain unchanged. Gate behavior, reviewer selection, and merge authority also remain unchanged.

Tracking issue: #2507.

## Goal

The evaluation contract must answer:

> Did an observed Review Concern Map expose the human-labeled review obligations and known interactions that matter for this fixture?

It must not answer:

> Is this the one correct partition of the diff?

ADR-014 explicitly allows several valid concern decompositions for the same change.

## Responsibility split

The evaluator separates semantic judgment from deterministic aggregation.

```text
frozen fixture
  -> human-labeled obligations / known interactions
  -> analyzer output
  -> human adjudication: obligation <-> concern ids
  -> deterministic scorer
  -> metrics / delta only
```

Human adjudication owns semantic correspondence.

The scorer owns arithmetic and structural validation only.

This avoids introducing another LLM Judge.

## Fixture contract

The initial dataset lives at:

```text
tests/fixtures/review-concern/phase2-eval-cases.json
```

Each case freezes:

- an id and category
- a small executable analyzer input
- must-detect review obligations
- known obligation interactions
- an acceptable concern-count range

The acceptable grouping range is a diagnostic. It is not the primary truth.

The initial set contains 15 cases:

1. single concern / many files
2. one file / multiple concerns
3. independent concerns
4. cross-concern interaction
5. migration + application behavior
6. auth + public API contract
7. refactor + behavior fix
8. docs/tests support changes
9. generated/vendor noise
10. affected unchanged caller
11. dynamic dispatch / incomplete enumeration
12. missed required obligation
13. over-split concern
14. analyzer timeout
15. malformed analyzer output

The fixture set and oracle are frozen before an evaluation run.

## Adjudication contract

An evaluation run supplies human adjudication separately from the fixture:

```json
{
  "obligationMatches": {
    "OB-auth-state": ["concern-1"],
    "OB-api-error": ["concern-2"]
  },
  "nonActionableConcernIds": ["concern-3"],
  "humanCorrectionCount": 1
}
```

Rules:

- every obligation id must come from the frozen fixture
- every concern id must come from the observed map
- zero matches means the obligation was missed
- non-actionable concern ids are human labels, not inferred from unmapped output
- correction burden is recorded as a count, not converted into a promotion verdict

## Interaction scoring

A known interaction is detected when either condition holds:

1. both obligations are adjudicated to the same concern; or
2. their matched concerns have an explicit `interactionRefs` edge.

This preserves the ADR-014 gray zone where two obligations may be represented as one coherent concern or two interacting concerns.

## Metrics

`evaluateReviewConcernMap()` reports:

- obligation total / detected / recall
- missed obligation ids
- interaction total / detected / recall
- missed interactions
- concern count
- grouping range result
- human-labeled non-actionable concern count / ratio
- unmapped concern count
- human correction count
- analyzer status and limitations

A zero denominator is `null`, not a perfect score.

Examples:

- no known interactions -> `interactionRecall: null`
- failed map with zero concerns -> `nonActionableConcernRatio: null`
- absent map -> evaluation status `not-observed`, with recall metrics unavailable

This keeps "not measured" separate from "passed".

## Paired comparison

`buildPairedReviewConcernEvaluation()` evaluates baseline and candidate with the same frozen fixture, then reports metric deltas.

It always returns:

```json
{
  "decision": null,
  "applied": false
}
```

The comparison does not promote a prompt, model, routing rule, or analyzer configuration.

Evidence remains separate from judgment.

## Relationship to paired replay

`src/lib/paired-replay.mjs` remains the generic saved-run / finding experiment SSoT.

This Phase 2 module is narrower:

```text
review-concern-eval
= concern-domain scoring adapter

paired-replay
= experiment manifest + saved review-run/finding comparison
```

Phase 2 does not create a second generic experiment framework.

A later evaluation runner may attach these concern-domain metrics to the existing experiment evidence flow.

## Interpretation boundaries

### Obligation recall

Obligation recall measures whether the human-labeled review obligations are represented in the observed map after adjudication.

It is not a claim that the map is semantically complete.

### Unmapped concern

An unmapped concern is not automatically a false positive.

It can be:

- useful extra decomposition
- a redundant split
- an obligation missing from the frozen oracle

Only `nonActionableConcernIds`, supplied by human adjudication, contributes to the non-actionable ratio.

### Grouping range

The acceptable grouping range catches obvious over-splitting or collapse.

It is supporting evidence only.

A candidate is not rejected solely because it chooses a different valid partition.

## Promotion boundary

Phase 2 changes no runtime decision.

Before Concern Map can influence reviewer planning or Review Coverage, later work still needs:

1. repeated baseline/candidate observations
2. frozen runtime/model conditions
3. downstream finding quality and Major/Critical recall checks
4. false-positive checks
5. latency and token cost measurement
6. human correction burden review
7. an explicit promotion decision

No metric in this module is Gate authority.

## Follow-up

The next useful slice is an evaluation runner that:

- executes the frozen fixture inputs against baseline and candidate analyzer configurations
- stores raw maps
- stores human adjudication separately
- emits deterministic Phase 2 scorecards
- connects the resulting evidence to the existing experiment / paired-replay architecture without changing runtime routing

## References

- #2455
- #2507
- ADR-014
- `src/lib/review-concern-analyzer.mjs`
- `src/lib/paired-replay.mjs`
- `tests/fixtures/review-concern/phase2-eval-cases.json`
