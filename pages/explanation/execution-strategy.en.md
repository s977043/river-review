---
title: Execution Strategy and Orchestration Guardrails
---

# Execution Strategy and Orchestration Guardrails

This is a **design explanation**, not a new CLI option, persisted schema, runtime configuration, or agent scheduler. It documents Phase 2 of [#2564](https://github.com/s977043/river-review/issues/2564), inspired by HydraFusion's Single / Cascade / Critique patterns and its five execution guardrails. External benchmark results are not River Review adoption evidence.

## Separate the axes

- **Model** identifies the provider and model; **Effort** controls reasoning resources.
- **Role** assigns responsibilities to Builder / Reviewer / Verifier; Review Team roles are a River Review concern.
- **Execution Strategy** describes the Host's execution sequence: Single, Cascade, or Critique.
- **Autonomy** specifies allowed actions.
- **Judgment Placement** determines which evaluation layer makes a judgment (see [Judgment Placement](./judgment-placement.md)).
- **Authority** remains with the Host / Human for applying changes, merging, or releasing.

These are analytical axes, **not names of current configuration fields**. In particular, `--reviewers auto` selects *review perspectives*, not a candidate-generation execution strategy. River Review provides findings, coverage, evidence, and recommendations; it does not own implementation-agent scheduling, automatic edits, or merge/release authority.

```text
Host / Harness -> Single | Cascade | Critique -> candidate
  -> River Review: review roles / findings / verification / coverage
  -> Host / Human: revise / approve / merge / release
```

A Critique strategy does not, by its label alone, prove independent model, provider, context, or tool isolation.

## Five guardrails: current reality and gaps

| Guardrail | Existing capability | Remaining gap / owner |
| --- | --- | --- |
| Complete accounting | Opt-in file×skill usage in `src/lib/usage-persistence.mjs`; role duration/timeout in `reviewer-orchestrator.mjs` | No guaranteed end-to-end strategy/leg cost, retry, fallback, and token ledger. Host owns full workflow; River Review owns observed review legs |
| Bounded execution | [#2566](https://github.com/s977043/river-review/pull/2566) aborts an in-flight review request and retry backoff after reviewer timeout | Other/custom execution paths require separate cancellation testing |
| Isolated review | Logical execution ID comparison in `reviewer-independence.mjs` | Different IDs are not proof of model/provider/context/tool isolation; unknown stays unknown ([#2543](https://github.com/s977043/river-review/issues/2543)) |
| Fail-safe application | Review findings / verdict are advisory; no patch or merge authority | Caller must not turn an advisory signal into unconditional GO |
| Validated routing | Deterministic, explainable reviewer auto-selection | Adaptive *execution-strategy* routing requires shadow observation and paired evidence first |

## Proposed observation contract, not implemented

A **run** groups comparable work under pinned task, input, and evaluation conditions. A **strategy** is the Host's candidate-generation choice. A **leg** is an actual LLM call or clearly defined deterministic operation; a **role** may span multiple legs. An **attempt** is one retry attempt within a leg.

Future leg observations would associate run/leg identity, strategy, role, provider/model, start/duration/outcome, attempt count, fallback reason, token/cache usage, cost and pricing provenance, observation source, coverage, and independence evidence. **None of this list defines a new active API or JSON schema.**

Current telemetry can report some model/token counts on an opt-in file×skill basis, and review orchestration reports some role timing/timeout. Neither is a complete, guaranteed one-to-one leg ledger.

Rules for future accounting and experiments:

1. Do not add overlapping file×skill and role counts for the same provider call.
2. Parallel role durations cannot be summed as end-to-end wall-clock latency.
3. Never turn missing usage, retry or isolation evidence into zero/verified values; mark the total partial or unknown.
4. Pin baseline/candidate task, input commit, model, prompt, skill, context and evaluator. Multiple simultaneous changes do not support single-factor attribution.
5. Logical execution ID inequality is not evidence of strong reviewer isolation.
6. Cost or latency savings never outweigh critical regressions, incomplete coverage or Human approval requirements.
7. Store identifiers, hashes, and aggregated counters rather than raw prompts, diffs, secrets, or hidden reasoning.

## Evaluation before activation

Phase 3 proposes **shadow-only** strategy recommendations, recording actual versus recommended choices without changing routing. Phase 4 uses paired baseline/candidate evidence ([#1574](https://github.com/s977043/river-review/issues/1574)), held-out checks, an independent verifier and **zero critical regressions as a floor, not sufficient approval**. Phase 5 may consider opt-in adaptive routing only with bounded budgets, safe fallback and Host/Human authority.

No general-purpose Builder orchestration, automatic PR merge, new canonical strategy enum, or end-to-end accounting collector is introduced by this document.

See [Architecture](./river-architecture.md), [Cost estimation](../guides/cost-estimation.md), and [Run store and regressions](../guides/track-runs-and-regressions.md).
