# #2267 Phase 6 - Evidence State projection

## Status

Phase 6 implementation note for #2292 / #2267.

This phase introduces a derived epistemic view over the existing #1978 validation result.
It does not create a second finding lifecycle and does not change normal PR review or Gate behavior.

## Decision

ADR-010 D6 remains authoritative: River Review must not create a new status vocabulary before proving a gap.

Phase 6 therefore treats:

```text
established
unresolved
refuted
```

as a **projection** of the existing validation contract rather than a replacement for it.

The v1 source of truth is:

```text
validation.finalStatus
```

from #1978 / `src/lib/finding-critic.mjs`.

The following existing axes remain separate:

- `validatedStatus`: independent-review-synthesis result vocabulary
- finding `status`: lifecycle (`open | suppressed | verified`)
- `scope`: relation to the current diff
- `askRelevance`: relation to the original ask
- severity: impact if the finding is true
- confidence: reviewer confidence
- #1857 `disposition`: materiality / how the review system should treat a valid finding

## Why `validatedStatus` is not the Evidence State SSoT

The Review Artifact schema defines:

```text
confirmed
dismissed-hallucination
dismissed-duplicate
needs-human-judgment
```

But `dismissed-duplicate` does not mean the claim is false.
It means another record owns the canonical representation.
Projecting that value to `refuted` would mix record identity with epistemic truth.

The #1978 gap analysis records `validatedStatus` as a synthesis vocabulary.
The Finding Critic writes a separate `validation.finalStatus` field.
Phase 6 preserves that separation.

## Projection table

### Established

```text
validation.finalStatus = confirmed
  -> evidenceState = established
```

`established` means the current #1978 protocol ended with the finding standing after evidence-grounded validation.

It does not mean:

- blocking
- current-PR relevant
- high severity
- safe to auto-fix
- Gate-approved

Those decisions stay on their existing axes.

### Refuted

Only terminal outcomes that actually reject the claim on evidence or deterministic hallucination grounds project to `refuted`:

```text
dismissed-by-evidence
dismissed-hallucination
  -> evidenceState = refuted
```

A dropped record is not automatically refuted.
Routing and epistemic truth stay separate.

### Unresolved

The following do not establish the claim and also do not prove it false:

```text
withdrawn-by-reviewer
needs-human-judgment
critic-timeout
  -> evidenceState = unresolved
```

The `withdrawn-by-reviewer` distinction is deliberate.
Issue #1978 Phase 1b classifies the withdrawal fixture as an `unsupported-claim`.
It explicitly verifies that the status is **not** `dismissed-by-evidence` when the Critic supplied no grounded citation.
The candidate is dropped from routing, but withdrawal alone is not evidence of falsity.

Missing, malformed, or unknown `validation.finalStatus` also projects fail-safe to `unresolved`.

`out-of-ask` also projects to `unresolved` for epistemic purposes.
The reason is important: #1978 may terminate at the ask-relevance gate before truth adjudication completes.
It is a relevance outcome, not evidence that the finding is false.

Therefore:

```text
withdrawn-by-reviewer != refuted
out-of-ask != refuted
```

## Explicit non-mappings

None of these values may establish or refute a finding by themselves:

```text
validatedStatus = dismissed-duplicate
status = suppressed
disposition = advisory
scope = pre-existing
askRelevance = out-of-ask
agreement.length >= N
severity = critical
confidence = high
```

They answer different questions.

## Unresolved operational contract

A useful unresolved record needs more than the word `unresolved`.
Before an unresolved result is presented as a Security Audit validation record, the caller should provide:

```text
blocker
validationPlan
```

The projection helper accepts those values only as explicit caller input.
It trims surrounding whitespace but does not generate or rewrite their content.

The returned `unresolvedContextComplete` flag is true only when both are present.

This matters for source-only audits:

```text
runtime evidence required
+ no approved sandbox
  -> unresolved
  -> blocker = what source cannot establish
  -> validationPlan = how to validate once a bounded environment exists
```

The system must not run target-controlled code merely to turn unresolved into established/refuted.

## Severity boundary

Existing #1978 records preserve the candidate finding's severity.
Phase 6 does not change that behavior because doing so would alter generic review output.

For Security Audit presentation, an unresolved candidate severity must not be presented as a **final severity**.
Severity becomes final only after the finding is established and then passes the later materiality / semantic-precision step.

Future artifacts may need to preserve an impact hypothesis for unresolved findings.
If so, they must name it as a hypothesis instead of silently reusing final severity semantics.

## Implementation

`src/lib/finding-evidence-state.mjs` provides:

```text
projectFindingEvidenceState(...)
```

Properties:

- imports `FINAL_STATUS` from #1978 instead of re-declaring its vocabulary
- reads only `validation.finalStatus` as the v1 epistemic source
- unknown or missing validation fails safe to `unresolved`
- Reviewer withdrawal remains `unresolved` unless separate grounded evidence refutes the claim
- `out-of-ask` never becomes `refuted`
- legacy `validatedStatus` does not establish truth
- lifecycle / scope / severity / disposition / confidence / agreement do not alter the projection
- unresolved blocker / validation plan are caller supplied only

The helper is not wired into normal runtime paths in Phase 6.

It is a reusable contract for the explicit Security Audit path.
Phase 9 can also reuse it for the structured Security Audit artifact.

## Compatibility

Phase 6 changes none of these:

- #1978 validation state machine
- `validatedStatus` schema vocabulary
- finding lifecycle `status`
- severity or confidence
- #1857 disposition
- normal PR review routing
- LLM invocation count
- Gate behavior
- target execution policy

No public Review Artifact field is added in this phase.

## Tests

`tests/finding-evidence-state.test.mjs` pins:

- confirmed -> established
- evidence dismissal -> refuted
- hallucination dismissal -> refuted
- Reviewer withdrawal -> unresolved, never refuted
- needs-human-judgment -> unresolved
- Critic timeout -> unresolved
- out-of-ask -> unresolved, never refuted
- missing / malformed / unknown validation -> unresolved
- `validatedStatus` alone cannot establish truth
- lifecycle / scope / severity / confidence / disposition / agreement cannot alter truth state
- unresolved requires explicit blocker + validation plan for operational completeness
- established/refuted results ignore stale unresolved context

## Multi-perspective review

### Architecture

PASS if this remains a projection of #1978 rather than a second state machine.

### Security

PASS with fail-safe behavior: missing / timeout / unknown / unsupported withdrawal never becomes established.
Unsafe target execution remains prohibited.

### Contract

PASS because no new public schema field or replacement enum is introduced.

### Review quality

PASS because truth, materiality, and final caller action remain separate:

```text
Is it true?      -> Evidence State
Is it material?  -> #1857 Semantic Precision
What should do?  -> Gate
```

### Compatibility

PASS because the helper has no normal runtime wiring and cannot change existing PR results.

## No-go conditions

Stop and redesign if future integration requires any of these:

- treating Reviewer withdrawal as evidence-grounded refutation without separate evidence
- treating `out-of-ask` as refuted
- treating duplicate suppression as refuted
- inventing blocker / validation plan from free-form text
- replacing #1978 `validation.finalStatus`
- removing severity globally from unresolved generic PR findings
- changing Gate behavior in Phase 6

## Next

Phase 7 connects only `established` findings to #1857 Semantic Precision when the relevant runtime/evaluation gates permit it.
`unresolved` remains an explicit validation obligation and `refuted` does not proceed as a material finding.
