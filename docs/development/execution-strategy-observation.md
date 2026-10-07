# Execution Strategy observation contract (proposal)

Status: non-canonical design note. Parent: #2564, Phase 2. Related: PlanGate#1507, #1574, #2455, #2543.

## Decision and boundary

Execution Strategy is a **Host/Harness-owned** axis, orthogonal to Model, Effort, Role, Graph topology, reviewer routing, and Judgment/Authority. River Review consumes evidence about a candidate and performs review coordination; it does not schedule Builder work, apply patches, or authorize merges.

| Strategy | Interpretation | Required guard |
| --- | --- | --- |
| single | One solving path | No implied independent review |
| cascade | Initial low-cost path with bounded escalation | Escalation signal and budget specified before execution |
| critique | Candidate, separate read-only critique, bounded revision | Critic is not Verifier; review has no write/merge authority |

A review run may contain several reviewers without proving that the upstream candidate was produced by a critique strategy. Never infer strategy from model count.

## Five guardrails: current state, gap, owner

| Principle | Current / established | Gap / next owner |
| --- | --- | --- |
| Complete accounting | Provider/model/token usage and reviewer duration exist | Host owns strategy/leg totals; River Review may correlate review execution evidence; #2564 Phase 3 |
| Bounded execution | #2566 propagates host cancellation through reviewer LLM request and retry backoff | Host must bound Builder legs and report unsupported cancellation; #2564 Phase 3 |
| Isolated review | Reviewer role and logical provenance exist | Logical IDs alone do not prove model/provider/context/tool/host separation; #2543 |
| Fail-safe application | River Review does not apply patches or merge | Preserve unknown/partial/timeout as non-clean; Host owns application |
| Validated routing | Deterministic reviewer selection exists | Host-owned shadow recommendations and paired evidence before opt-in; #1574, #2564 Phases 3–5 |

## Proposed minimum observe-only envelope

This is a **conceptual event envelope**, not a persisted schema, new required field, or API contract. The Host supplies values when known; unknown values remain explicitly unknown.

- `runCorrelationId`: opaque join key across Host and River Review, not proof of isolation.
- `strategy`: `single | cascade | critique | unknown`; actual strategy must not be inferred from number of reviewers.
- `recommendedStrategy`: optional shadow-only recommendation, never an execution instruction.
- `recommendationReason`: deterministic rule identifier or bounded explanation, plus rule version.
- `leg`: opaque ID, kind (`candidate | escalation | critique | revision | verification | other`), predecessor IDs, owner, and terminal outcome.
- `execution`: provider/model when available; start/end, duration, tokens, estimated cost with currency and pricing provenance; retry and fallback counts.
- `limits`: declared timeout, retry, token, latency and cost budgets; cancellation requested/acknowledged/unsupported.
- `independence`: declared separation dimensions (`model | provider | context | tools | host`), each `verified | declared | unknown`; never promote a declaration to verification.
- `result`: `succeeded | failed | cancelled | timed_out | partial | unknown`; evidence reference and redaction policy.

Every attempted leg—including retries, fallbacks, cancellations and failures—must be accounted for; no fabricated zero cost or success on missing telemetry. A Host-side aggregate must distinguish `unknown` from zero and must avoid double-counting retry usage already included in a provider total. Do not record secrets, raw prompts, or sensitive review payloads in telemetry.

## Shadow evaluation and promotion gates

1. Phase 3: generate a recommendation from declared task complexity, risk, uncertainty, concern, budget and independence needs. Log actual versus recommended without changing execution.
2. Phase 4: paired baseline/candidate replay (#1574), held-out cases and independent verification. Compare quality, critical regressions, coverage, total cost, latency, retries and human correction burden; publish missing-data rates.
3. Phase 5: only after evidence and Human approval, allow opt-in Host routing with preflight provider availability, explicit budgets, validated fallback, deterministic preference and fail-safe Human escalation.
4. A recommendation must not change acceptance criteria, Reviewer/Verifier authority, protected operations or Human-owned merge/release authority. Unknown or conflicting inputs are not silently treated as `single`.

## Review checklist

- Ownership: no new River Review Builder orchestration, patch application, or authority.
- Accounting: leg completeness, units, unknown semantics, provenance and no double counting.
- Safety: cancellation/timeout/fallback and partial-result fail-closed behavior.
- Evidence: no adaptive default before paired held-out evaluation.
- Compatibility: no schema, CLI, default or runtime behavior changed by this note.
