# #2267 Phase 5A - Reviewer execution independence

## Status

Phase 5A foundation for #2267, tracked by #2286.

This slice defines the minimum deterministic contract needed to distinguish a finder execution from a verifier execution before Security Audit can claim independent adversarial verification.
It does not activate the #1978 LLM Critic runtime, add a new finding state machine, change normal PR review, or alter deterministic Gate behavior.

## Why Phase 5 is split

#1978 already provides the Evidence-Grounded Adversarial Review state machine and fixtures.
Phase 0 / 1a / 1b are on `main`, while promotion into runtime remains blocked by the paired-evaluation requirement.
That evaluation needs real LLM Critic responses, and the current repository policy does not provide the required API key through repository secrets.

Phase 5 therefore separates two concerns:

```text
Phase 5A
= deterministic execution-independence contract

Phase 5B
= runtime Finding Critic integration after #1978 evaluation gate
```

Phase 5A can be completed without weakening the evaluation gate.

## Contract

The minimum invariant is:

```text
finderRunId != verifierRunId
```

`evaluateReviewerIndependence()` accepts only non-empty string run IDs after trimming surrounding whitespace.
Run IDs remain case-sensitive opaque identifiers.
Non-string values and whitespace-only strings are treated as missing rather than coerced into identity.

The result distinguishes three states:

```text
independent
= both run IDs exist and differ

same-execution
= both run IDs exist and are equal

unknown
= one or both run IDs are missing
```

`same-execution` and `unknown` must never establish independent verification.

## Meaning of `independent`

`independent` has a deliberately narrow meaning.
It establishes only that the finder and verifier use different logical execution IDs.

It does not prove:

- finding correctness
- security truth or absence of vulnerabilities
- reviewer quality
- different human or agent identity
- different provider or model
- prompt or context isolation
- cryptographic authenticity
- Gate approval

Provider or model diversity may be recorded as future provenance, but it is not a correctness condition in Phase 5A.
Cryptographic Reviewer Identity, signatures, key handling, override records, and stronger actor provenance remain owned by #1760.

## Placement

Phase 5A deliberately keeps the predicate separate from the #1978 state machine.

```text
src/lib/reviewer-independence.mjs
  evaluateReviewerIndependence(...)
        |
        | future Phase 5B adapter only
        v
src/lib/finding-critic.mjs
  existing #1978 state machine
```

The helper is not imported by normal runtime paths in Phase 5A.
This keeps the existing Finding Critic behavior, normal PR latency, token usage, and Gate behavior unchanged.

## Security Audit integration boundary

When Phase 5B becomes eligible, an explicit focused or full Security Audit may use the contract as a precondition before claiming that a candidate finding received independent adversarial verification.

The intended future sequence is:

```text
candidate finding
  -> deterministic finding verification
  -> finder execution provenance
  -> verifier execution provenance
  -> evaluateReviewerIndependence()
  -> existing #1978 Finding Critic
  -> existing #1978 validation state machine
```

Rules:

- distinct run IDs satisfy only the minimum fresh-execution condition
- same run ID must not be presented as independent verification
- missing finder or verifier run ID must not be presented as independent verification
- a positive independence result must not change severity, confirmation state, or Gate decision by itself
- the runner must not generate its own unrelated run ID and use that value to self-attest independence
- normal `river-review-security` PR routing must not gain an extra Critic call from Phase 5A
- source-only Security Audit remains the default; no target-controlled execution is introduced

## Relationship to #1978

#1978 remains the SSoT for:

- `AGREE | DISAGREE_EVIDENCE | DISAGREE_CONCERN`
- Reviewer response `KEEP | REVISE | WITHDRAW`
- deterministic pre-verification bridge
- evidence grounding
- scope / ask relevance
- validation-loop cap
- timeout and parse-failure fail-safe behavior
- final validation status vocabulary

Phase 5A does not add or reinterpret any of those states.

The real LLM Critic runner, candidate-to-Critic fan-out, reviewer rebuttal loop, risk-based activation, and validated-finding routing remain deferred until #1978 paired evaluation can be executed and reviewed.

## Relationship to #1760

#1760 owns the broader Reviewer Identity problem, including actor identity, Review Record provenance, signatures, override, supersede, and tamper evidence.

Phase 5A intentionally avoids creating a second identity schema.
Its run-ID comparison is only a minimum logical separation contract that future #1760 provenance can strengthen.

## Compatibility invariants

Phase 5A must preserve all of the following:

- `finding-critic.mjs` behavior is unchanged
- no new finding lifecycle vocabulary
- no new public Reviewer Identity schema
- no normal PR review invocation
- no additional LLM call
- no Gate behavior change
- no automatic merge or approval authority
- no target-controlled execution
- no requirement for provider/model diversity
- no requirement for cryptographic signing

## Contract tests

`tests/reviewer-independence.test.mjs` covers the deterministic boundary.

Required cases include:

- distinct run IDs -> `independent`
- same run ID -> `same-execution`
- finder ID missing -> `unknown`
- verifier ID missing -> `unknown`
- both IDs missing -> `unknown`
- whitespace-only and non-string values -> missing
- surrounding whitespace is normalized before comparison
- case differences remain distinct because run IDs are opaque and case-sensitive
- provider/model metadata is not used to infer correctness or independence

Existing #1978 Finding Critic tests remain the regression guard for the validation state machine itself.

## Multi-perspective review checklist

### Architecture

- one #1978 state-machine SSoT
- independence predicate stays outside the Finding Critic state machine
- no new reviewer orchestration engine

### Security

- same or missing execution identity fails safe
- logical run separation is not presented as cryptographic identity
- a positive result cannot become a security guarantee

### Compatibility

- no runtime import in Phase 5A
- normal PR review behavior and latency remain unchanged
- Gate behavior remains unchanged

### Evaluation

- Phase 5A is deterministic and can proceed without model evaluation
- Phase 5B remains blocked until #1978 paired evaluation can measure precision, false positives, F1, cost, and latency

## No-go conditions

Do not expand Phase 5A if any of these become necessary:

- changing the #1978 final-status vocabulary
- wiring a real LLM Critic before paired evaluation
- adding Critic calls to normal PR review
- treating different provider/model names as proof of independence
- treating different run IDs as proof of correctness
- requiring a new public Reviewer Identity schema
- introducing signing or key management
- changing Gate behavior

## Exit criteria

Phase 5A is ready when:

- `finderRunId != verifierRunId` is machine-checkable
- same and missing execution identity are never independent
- #1978 state-machine behavior is unchanged
- the Security Audit integration boundary is documented
- the limitation of logical run separation is explicit
- #1760 ownership is preserved
- targeted and existing Finding Critic regression tests pass
- repository CI passes
