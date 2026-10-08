# #2343: Critic validation incomplete - existing Gate opt-in

## Decision

Review Coverage answers whether assigned reviewer units executed. Finding Critic
validation answers whether candidate Findings received a usable validation result.
These are different facts and must not share the same `reviewCoverage.status`.

An **observed active Critic** may have missing or contradictory accounting.
An outstanding `humanReview` obligation must never silently produce `CONVERGED_CLEAN`.
The existing Gate therefore accepts one new **optional** input:
`criticIncomplete: true`.

No second Gate, Decision Engine, Evidence State enum, or execution authority is created.

## Operation

`RIVER_GATE_CRITIC_VALIDATION=1` opts in. It is OFF by default. Near-miss
values do not enable it.

| Finding Critic observation                                        | Gate-side reduction      |
| ----------------------------------------------------------------- | ------------------------ |
| Critic off / no observation / zero evaluated Findings             | no new signal            |
| active, fully resolved, consistent accounting                     | no new signal            |
| active, one or more `humanReview` Findings                        | `criticIncomplete: true` |
| active, evaluated Findings, inconsistent or missing status counts | `criticIncomplete: true` |

The reduction is pure and shared by `river run` and `river review exec`.
It reuses the Critic's own `FINAL_STATUS` vocabulary.
A `confirmed` finding may still require `humanReview` when ask relevance is uncertain.
The unresolved-status count is therefore a lower bound, not an exact equality check.
If unresolved statuses exceed `humanReview`, the result is incomplete.
An unknown final-status key also produces an incomplete result.
An executed review with unresolved Critic validation receives
`ESCALATE / CRITIC_VALIDATION_INCOMPLETE` instead of clean GO.
Mandatory escalation and strict blocking retain precedence.
Review-not-executed and incomplete Review Coverage retain precedence.
Blocking findings retain their existing NO_GO result.
The host decides how to enforce an ESCALATE decision.

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

`tests/critic-validation-gate.test.mjs` pins the default-off contract.
It checks exact opt-in and observed timeout escalation.
It also checks malformed status accounting and blocking precedence.
Gate replay and the `river run` consumer are tested without provider calls.

## Follow-ups

Issue #1978 retains the paired-evaluation and quality-promotion dependency.
Issue #2267 still requires security audit provenance and final-record verification.
Separate evaluation is required before Gate activation by default.

## Gate replay and trust boundary

This signal is produced from an existing Critic observation at the Gate
derivation boundary. The repository under review does not gain permission to
approve itself. A host consuming the Gate must independently replay its
`inputs` with the pinned Gate contract before acting on the decision.

The `inputsHash` is a regression fingerprint, not authentication. With this
opt-in disabled, no `criticIncomplete` key is emitted. With it enabled and
triggered, the echoed input is `true`, so replay preserves the ESCALATE
outcome. Critical/major finding revisions still retain their existing NO_GO
precedence.

This is not a replacement for the #1978 paired model evaluation.
Deterministic replay verifies only the observed Critic-state Gate contract.
It does not establish that a Critic model is accurate.
