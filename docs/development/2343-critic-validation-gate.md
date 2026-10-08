# #2343 — Critic validation incomplete: existing Gate opt-in

## Decision

Review Coverage answers whether assigned reviewer units executed. Finding Critic
validation answers whether candidate Findings received a usable validation result.
These are different facts and must not share the same `reviewCoverage.status`.

For an **observed active Critic** with evaluated Findings, an outstanding
`humanReview` obligation must not silently result in `CONVERGED_CLEAN`.
The existing Gate therefore accepts one new **optional** input:
`criticIncomplete: true`.

No second Gate, Decision Engine, Evidence State enum, or execution authority is created.

## Operation

`RIVER_GATE_CRITIC_VALIDATION=1` opts in. It is OFF by default. Near-miss
values do not enable it.

| Finding Critic observation | Gate-side reduction |
| --- | --- |
| Critic off / no observation / zero evaluated Findings | no new signal |
| active, fully resolved, consistent accounting | no new signal |
| active, one or more `humanReview` Findings | `criticIncomplete: true` |
| active, evaluated Findings, inconsistent or missing status counts | `criticIncomplete: true` |

The reduction is pure and shared by `river run` and `river review exec`.
On a non-blocked executed review, it produces
`ESCALATE / CRITIC_VALIDATION_INCOMPLETE` rather than clean GO.
Existing mandatory escalation, strict block, review-not-executed,
incomplete Review Coverage, and blocking-finding decisions keep precedence.
The host decides whether and how to enforce an ESCALATE decision.

The input and new reason are emitted only when opted in and triggered.
Without the opt-in, the Gate fields and canonical `inputsHash` are unchanged.
A host can replay the returned `gate.inputs` through `deriveGateDecision`.

## Boundaries

- Critic is not automatically enabled.
- Nothing changes `validation.finalStatus`, severity, consensus, or finding text.
- No provider/API key and no additional Critic calls are required.
- This is **not** Phase 2 paired evaluation (#1978) and does not approve
  default-on Critic, broad routing, or model-quality claims.
- Absent evidence is not proof that the Critic executed successfully.
  It simply does not fire this opt-in signal without observed active work.
- Does not redefine Review Coverage or silently equate no Findings with verified security.

## Deterministic verification

`tests/critic-validation-gate.test.mjs` pins default-off byte identity,
exact opt-in, observed timeout escalation, inconsistent status accounting,
unchanged confirmed blocking precedence, Gate replay integrity, and the
`river run` consumer. No network or model evaluation is involved.

## Follow-ups

#1978 retains the real paired-evaluation / quality-promotion dependency.
#2267 security-audit adoption still requires provenance, final-record
verification, and separate evaluation before Gate activation by default.
