# #2267 Phase 7A - Semantic Precision eligibility

## Status

Phase 7A implementation note for #2297 / #2267.

This phase connects the Phase 6 Evidence State contract to the input boundary of #1857 Semantic Precision without enabling the Semantic Precision Judge.

## Decision

The order is fixed as follows.

```text
Is it true?
  -> Evidence State

Is it material?
  -> Semantic Precision

What should the caller do?
  -> Gate
```

Phase 7A therefore defines only whether a finding is ready to enter Semantic Precision.

```text
established -> eligible
unresolved  -> not eligible
refuted     -> not eligible
```

## Why only established findings proceed

`established` means the current #1978 validation protocol ended with the finding standing after evidence-grounded validation.

That is enough to ask whether the finding is material, but it does not answer the materiality question itself.

Therefore:

```text
established != blocking
established != advisory
established != high severity
established != Gate approved
```

#1857 remains the owner of disposition.

## Why unresolved findings do not proceed

`unresolved` means truth adjudication is incomplete.

Running Semantic Precision first would reverse the intended responsibility order and could turn an unresolved claim into an apparently lower-risk advisory result.

The unresolved record keeps its explicit `blocker` and `validationPlan` from Phase 6.

Phase 7A does not invent, replace, or discard either value.

## Why refuted findings do not proceed

`refuted` means the claim itself does not stand under the current validation protocol.

There is no materiality decision to make for that claim.

Phase 7A deliberately does not map:

```text
refuted -> suppressed
```

`refuted` is an epistemic state. `suppressed` is a #1857 disposition. Keeping them separate preserves auditability.

## Implementation

`src/lib/finding-semantic-precision-eligibility.mjs` provides:

```text
evaluateSemanticPrecisionEligibility(...)
```

The helper composes the existing Phase 6 projector instead of re-declaring its vocabulary.

It returns:

```js
{
  semanticPrecisionEligible: boolean,
  evidence: {
    state,
    source,
    sourceStatus,
    reasonCode,
    blocker,
    validationPlan,
    unresolvedContextComplete
  }
}
```

The nested `evidence` object is the output of `projectFindingEvidenceState()`.

No disposition vocabulary is introduced here.

## Existing #1857 boundary

ADR-007 owns the Semantic Precision contract.

The existing pipeline has already been split into:

```text
prefilterFindings()
adjudicateFindings()
rankFindingsForOutput()
```

`adjudicateFindings()` is still an identity stage.

Phase 7A does not change that function and does not activate a Judge.

## Fail-safe behavior

All Phase 6 unresolved cases remain ineligible, including:

- missing validation
- malformed validation
- unknown `finalStatus`
- Reviewer withdrawal without grounded refutation
- `needs-human-judgment`
- Critic timeout
- `out-of-ask`

Severity, confidence, scope, ask relevance, agreement, or a disposition-like field cannot override this result.

## Compatibility

Phase 7A changes none of these:

- normal PR review routing
- normal PR review latency
- #1978 validation state machine
- #1857 Judge runtime
- Review Artifact public schema
- disposition vocabulary
- Gate behavior
- target execution policy

Additional LLM calls: zero.

## Tests

`tests/finding-semantic-precision-eligibility.test.mjs` pins:

- established is eligible
- unresolved is not eligible
- refuted is not eligible
- missing, malformed, and unknown validation fail safe to not eligible
- Reviewer withdrawal remains not eligible
- out-of-ask remains not eligible
- severity, confidence, scope, ask relevance, agreement, and disposition-like input do not override unresolved state
- established metadata is not mutated
- unresolved blocker and validation plan are retained without mutation

## Phase 7B promotion gate

Phase 7A completion does not authorize Judge runtime activation.

Phase 7B remains conditional on #1857 requirements, including:

- structured Judge contract and schema
- observe-mode fail-safe behavior
- legacy findings preserved on Judge failure
- critical findings not suppressed by LLM judgment alone
- paired evaluation for blocking precision, false blocks, and missed issues
- token, cost, and latency measurement
- default mode remaining off

If those requirements are not satisfied, Phase 7B remains on hold.

## Multi-perspective review

### Architecture

Pass if Phase 7A remains a pure handoff contract and does not create another Semantic Precision implementation.

### Contract

Pass because Phase 6 owns truth and #1857 owns disposition. The new helper only exposes eligibility between them.

### Security

Pass with fail-safe behavior: unresolved claims cannot be demoted through materiality before truth is established.

### Semantic correctness

Pass because `refuted` is not collapsed into `suppressed`, and `established` does not imply `blocking`.

### Compatibility

Pass because no runtime, public schema, Gate, or normal PR behavior is changed.

### Evaluation

Pass for deterministic Phase 7A only. Phase 7B must not start before #1857 evaluation and fail-safe conditions are satisfied.
