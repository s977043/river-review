# #2378 Phase A — Decision Surface Human Attention Evaluation Plan

> Issue: #2378
> Parent: #2368
> Cross-layer roadmap: s977043/PlanGate#1343
> Metric contract: s977043/PlanGate#1349
> Fixture source: `tests/fixtures/2378-decision-surface/cases.json`

## Status

This document freezes the evaluation design before any Human Attention result is interpreted.

It does **not** claim that Decision Surface reduces Human Attention.
It defines how that claim can be tested without hiding visibility or changing review semantics.

Execution remains blocked until:

- ADR #2369 is accepted
- implementation #2371 is accepted
- baseline and candidate SHAs are frozen in the result record

## Decision Summary

Phase A answers one question:

> Does Decision Surface help a Human identify required action, Human decision, and review uncertainty with less attention while preserving material visibility?

The evaluation uses the **same underlying review state** for both arms.

```text
same review state
   ├─ baseline renderer
   └─ candidate renderer
```

This isolates presentation effects from review-quality effects.

Adoption cannot be based on shorter output alone.

Minimum safety condition:

```text
Decision Extraction >= baseline
Material Visibility Regression = 0
Critical / Major visibility >= baseline
Incomplete coverage visibility = 100%
Provenance trace remains available
```

Human Attention is then considered as an additional benefit, not as a safety override.

## 1. Evaluation arms

### Baseline

River Review Markdown rendering immediately before the Human Decision Surface candidate.

The baseline SHA must be frozen at execution time.

### Candidate

The accepted #2371 implementation, with the exact candidate SHA frozen at execution time.

### Important

Do not compare:

- different reviewer outputs
- different LLM generations
- different findings
- different coverage results

Both arms must receive semantically identical review state.

## 2. Fixture set

The 10 fixture profiles are frozen in:

`tests/fixtures/2378-decision-surface/cases.json`

They cover:

1. clean complete run
2. critical + major findings
3. minor / info only
4. human-review-required
5. partial coverage
6. not_executed coverage
7. timeout + failed units
8. Team Lead blind spot
9. mixed action + incomplete coverage
10. legacy result without Review Coverage

These cases are presentation fixtures, not review-detection fixtures.

Therefore they are intentionally separate from `tests/fixtures/review-eval/cases.json`, which evaluates finding generation and review quality.

## 3. Frozen material reference set

Each fixture defines `materialReference`.

This is the oracle for visibility evaluation.

Baseline output itself is **not** the oracle.

Material items include, when applicable:

- required action count
- critical / major finding identity
- all finding traceability
- Human review requirement
- coverage status
- failed / timeout unit state
- known blind spot
- whether coverage state is unknown rather than clean

The reference set must be frozen before rendering either arm.

## 4. Frozen Human extraction rubric

For every rendered artifact, the Human evaluator answers the same five questions.

### Q1 — Action

What requires action now?

Pass:

- exact actionable count when count is material
- no false action requirement for lower-severity-only fixtures

### Q2 — Human decision / review

Is explicit Human review or decision required?

Pass:

- correct yes / no
- no new Human requirement invented by the presentation layer

### Q3 — Uncertainty

Is review / verification incomplete, failed, timed out, not executed, or otherwise uncertain?

Pass:

- correct state identified
- unknown is not interpreted as complete

### Q4 — Detail trace

Can the evaluator identify where to inspect the underlying finding / coverage / evidence detail?

Pass:

- L2 / L3 path is identifiable
- collapsed content still counts as visible when clearly reachable

### Q5 — Confidence

Can the evaluator state whether the run is clean, actionable, Human-gated, or uncertain without contradicting the material reference?

Pass:

- summary statement matches the fixture oracle

### Decision Extraction Success

A case succeeds only when Q1–Q5 all pass.

Do not compensate for a missed material item with faster reading time.

## 5. Visibility grading

For every material item, grade:

- `visible`
- `traceable`
- `lost`
- `misleading`

A material visibility regression occurs when the candidate changes a baseline/reference item into `lost` or `misleading`.

A summary not showing the full detail at L1 is not automatically a regression.

`traceable` is acceptable when the navigation path is explicit.

## 6. Human Attention measurement

Phase A is a pilot.

Accepted measurement modes follow PlanGate#1349:

- explicit
- bounded_approximation
- unavailable

Do not convert unavailable to zero.

### Explicit timing protocol

If explicit timing is used:

1. start when the rendered artifact is first shown
2. stop when Q1–Q5 are answered
3. exclude setup / fixture loading time
4. record obvious interruption separately
5. do not include AI execution latency

The timing result measures this evaluation task, not general developer productivity.

## 7. Ordering / learning-bias control

The same evaluator seeing baseline first for all fixtures will learn fixture answers before candidate evaluation.

Use counterbalanced order.

Suggested deterministic order:

| Fixture | First arm |
| --- | --- |
| HA-001 | baseline |
| HA-002 | candidate |
| HA-003 | baseline |
| HA-004 | candidate |
| HA-005 | baseline |
| HA-006 | candidate |
| HA-007 | baseline |
| HA-008 | candidate |
| HA-009 | baseline |
| HA-010 | candidate |

For a second evaluator or second session, reverse the order.

Where practical, present arms as A / B rather than baseline / candidate during scoring.

## 8. Sample-size interpretation

Ten fixtures are sufficient for:

- detecting deterministic visibility regressions
- validating the extraction rubric
- finding presentation contradictions
- obtaining a directional Human Attention pilot

Ten fixtures are **not** sufficient to claim a population-wide productivity improvement.

If one Human evaluator performs the pilot, the result means:

> This presentation helped / did not help this target workflow under the frozen fixture set.

It must not be generalized into a universal percentage improvement.

## 9. Secondary presentation metrics

These are diagnostic only.

- initially visible line count
- duplicated visible information count
- navigation steps to L2 / L3
- clarification needed
- number of contradictory positive / warning statements

They must not override Decision Extraction or Visibility safety.

In particular:

`fewer lines != better`

## 10. Expected v1 risk

The current #2371 implementation is additive:

```text
Headline
Decision Surface
existing Risk / Human Review / Team Lead
Findings
```

Therefore the candidate may improve Decision Extraction while increasing duplicated initially visible information.

This is an expected hypothesis, not a failure by itself.

If Phase A confirms extraction benefit with zero visibility regression but duplication remains high, create a **separate presentation candidate** for folding / relocating existing sections.

Do not combine that optimization into #2371.

## 11. Result record

The evaluation result must record:

```yaml
evaluation:
  issue: 2378
  fixtureRevision: <commit sha>
  baselineSha: <sha>
  candidateSha: <sha>
  evaluatorMode: human
  measurementMode: explicit | bounded_approximation | unavailable
  orderProtocol: counterbalanced
```

Per arm / case:

```yaml
caseId: HA-001
arm: baseline | candidate
q1_action: pass | fail
q2_human_required: pass | fail
q3_uncertainty: pass | fail
q4_trace: pass | fail
q5_confidence: pass | fail
attentionSeconds: number | null
visibility:
  lost: 0
  misleading: 0
  traceable: 0
notes: ''
```

The exact storage file can be selected at execution time.
No new runtime schema is required for Phase A.

## 12. Phase A decision rule

### Adopt for dogfood

All of the following:

- candidate Decision Extraction Success >= baseline
- material visibility regression = 0
- critical / major visibility >= baseline
- incomplete / not-executed / failed / timeout visibility = 100%
- no new clean-state contradiction
- provenance / L2-L3 trace remains available

And either:

- Human Attention improves directionally
- or Human Attention is unchanged while decision extraction materially improves

### Revise

Use when:

- safety is preserved
- but extraction does not improve
- or duplication / attention cost worsens enough to negate the benefit

### Reject

Use when:

- material visibility regresses
- Human-required state is hidden
- incomplete coverage looks clean
- actionable severity semantics are changed by the presentation layer

### Inconclusive

Use when:

- timing / scoring evidence is too incomplete
- fixture execution is not paired
- baseline or candidate SHA is not fixed
- material reference set was changed after seeing candidate output

## 13. Phase B gate

Repository dogfood begins only after Phase A is Adopt for dogfood.

Phase B then observes 10–20 River Review PRs.

Phase B does not reopen the Phase A oracle.
It tests operational behavior:

- repeated explanation burden
- actual intervention episodes
- Human reverse
- Time to Human Required
- coverage / provenance incidents

## 14. Non-goals

- new eval runner before the fixture protocol proves useful
- new shared rubric schema
- changing `docs/eval/rubric.yaml`
- using LLM judges for Human Attention timing
- individual employee productivity scoring
- production-wide telemetry before Phase A
- changing review finding semantics
- changing gate / merge authority
- modifying #2371 to optimize duplication before measurement

## 15. Review checklist before execution

- baseline / candidate SHA frozen
- fixture revision frozen
- material reference set frozen before outputs are inspected
- evaluator questions unchanged between arms
- arm order counterbalanced
- missing timing remains unavailable
- no baseline-as-oracle shortcut
- no top-N / line-count success criterion
- no individual performance interpretation
- raw outputs retained
- result classified as Adopt / Revise / Reject / Inconclusive
