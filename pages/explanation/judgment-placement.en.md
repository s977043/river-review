---
id: judgment-placement-en
title: Judgment Placement
---

River Review treats review not as a single ceremony attached to a pull request, but as a **distributed judgment system that places each decision in the most appropriate evaluation layer**.

We call this design principle **Judgment Placement**.

> The goal of review is not to make humans read every line of code.  
> The goal is to place each judgment in the most reproducible, efficient, and trustworthy layer, while preserving human responsibility where automation is not appropriate.

Judgment Placement complements River Review's core idea of [Review Judgment as Code](./concept.en.md) by answering a different question: **where should a judgment execute?**

## Why Judgment Placement is needed

As AI increases implementation throughput, a workflow where humans review every change at the same depth does not scale. Simply reducing human review, however, weakens both quality and accountability.

The useful move is not “review or no review,” but to decompose the responsibilities traditionally concentrated in code review.

These questions do not need the same evaluation mechanism:

- Does the code type-check?
- Does a dependency direction violate an architecture rule?
- Does temporary code have an exit condition?
- Does the diff preserve the intent of the approved plan?
- Does a concurrent change introduce conflicting ownership?
- Should a change to an authentication boundary be accepted?

Sending all of these to an LLM or a human reviewer increases cost and reduces reproducibility and explainability.

Judgment Placement chooses an evaluation layer according to the nature of the decision.

## Four judgment layers

This page is the SSoT for the four layers and the judgment steps below. Other pages keep a summary and a link instead of restating them.

```text
Can it be proven?
  ↓ yes
Deterministic

Can it be reliably detected by explicit rules?
  ↓ yes
Heuristic

Does it require semantic or contextual judgment?
  ↓ yes
Agentic Review

Does it require responsibility or value judgment?
  ↓ yes
Human Judgment
```

- **Deterministic** — facts that can be mechanically proven or checked. Examples: types / tests / schemas / dependency boundaries / architecture tests
- **Heuristic** — high-signal detection through explicit rules. Examples: temporary code / suspicious patterns / known smells
- **Agentic Review** — decisions requiring semantic understanding across artifacts. Examples: plan-diff conformance, design intent, responsibility, semantic conflict
- **Human Judgment** — decisions involving responsibility, values, or irreversibility. Examples: security boundaries, personal data, billing, irreversible migrations, business validity

### Principle: place correctly, not merely cheaply

Judgment Placement does not mean “make everything deterministic.”

A judgment should move toward a more deterministic layer only when safety, explainability, and maintainability are preserved or improved.

For example, “this dependency direction is forbidden” can often become an architecture test. But “is moving this responsibility into a new layer the right design decision?” cannot be reduced safely to a regex or dependency rule.

Likewise, decisions that require human accountability must not be replaced by an AI verdict.

## Mapping to River Review

River Review already supports the following Skill evaluation types:

- `deterministic`
- `heuristic`
- `agentic`

See [Skill Schema](../reference/skill-schema.en.md) for the definition of each value and how the schema treats it.

Judgment Placement does not introduce a parallel execution engine. It connects those existing layers with Human Judgment Focus under one design principle.

```text
Review Judgment
      ↓
Judgment Placement
      ↓
┌────────────────────────────────────┐
│ Deterministic                      │
│ Heuristic                          │
│ Agentic Review                     │
│ Human Judgment                     │
└────────────────────────────────────┘
      ↓
Finding / Evidence / Verdict
      ↓
Caller / Human
```

River Review produces Findings / Evidence / Verdict. GO / NO-GO, retry, stop, approval, and merge remain responsibilities of the caller, PlanGate, or humans.

## Keep Action Review separate from artifact review

When an AI agent can execute commands, repository writes, network operations, or deployments,
“may this action execute now?” is a different judgment from “is the produced artifact correct?”

River Review keeps three responsibilities distinct:

```text
Action Review
  = may the proposed action execute now?

Artifact Review
  = is the plan / design / diff / report acceptable?

Verification
  = does the claim / behavior / evidence actually hold?
```

Artifact Review and Verification are core River Review responsibilities.
Action Review may consume River Review material or recommendations, but permission brokering and execution authority stay with the caller, PlanGate, the host, or humans.

Action Review itself is subject to Judgment Placement.
Mechanical policy checks can be Deterministic, contextual risk decisions can use Agentic Review, and approvals involving responsibility or irreversibility stay in Human Judgment.

After a denial, changing tools while pursuing the same effective action is not automatically a safer alternative.
A consumer that retries must define a circuit breaker, stop reason, escalation target, and reopen condition.
Thresholds depend on host and risk policy, so River Review core does not hard-code a universal value.

Related: [Issue #2545](https://github.com/s977043/river-review/issues/2545)

## Promoting review judgments

Judgment Placement is not a static classification.

When the same Agentic or Human judgment repeats and its conditions become stable enough to express explicitly, it can be **promoted** into a more reproducible layer.

```text
Repeated Human / Agentic Judgment
  ↓
Can the condition be made explicit?
  ├─ no  → keep as semantic / human judgment
  └─ yes
       ↓
Can it be checked deterministically?
  ├─ yes → test / schema / checker / deterministic gate
  └─ no  → heuristic rule / skill
```

This improves more than the model or prompt. It moves organizational judgment into the system so future runs do not depend on a human or LLM noticing the same issue again.

Riverbed, fixtures, evaluation, and the Review Evolution Cycle are used to verify that the promotion actually improves outcomes.

## Architecture invariants

River Review should not reimplement architecture checkers.

When an existing compiler, test, linter, dependency rule, or architecture checker can determine a fact mechanically, that tool should remain the source of truth. River Review should normalize its result into Evidence and Findings.

```text
Architecture / Policy
      ↓
Existing deterministic checker
      ↓
Machine result
      ↓
River Review
      ↓
Finding / Evidence / Verdict
```

This keeps semantic judgment in the agentic layer while moving hard invariants from “something a reviewer should notice” to “something the system can check.”

## Semantic conflict and agent trajectory

In parallel AI development, the final diff may not contain enough information to evaluate the change safely.

Judgment Placement therefore motivates two additional review subjects.

### Semantic Change Conflict Review

Concurrent changes may avoid Git conflicts while still creating semantic conflicts such as:

- duplicate responsibility
- ownership conflict
- contract divergence
- duplicated abstraction
- incompatible assumptions
- rationale conflict

Machine-checkable contract or ownership violations should live in deterministic or heuristic layers; conflicts in responsibility and design intent belong in Agentic Review.

Related: [Issue #1813](https://github.com/s977043/river-review/issues/1813)

### Agent Trajectory Review

River Review can also evaluate a structured execution trace from a builder agent for patterns such as:

- repeated failure
- ignored errors
- unverified completion
- plan deviation
- ineffective recovery
- claim / evidence mismatch

This must not require hidden chain-of-thought or raw session transcripts. The review subject is the auditable record of **what the agent did, what happened, and what evidence supports its completion claims**.

Related: [Issue #1814](https://github.com/s977043/river-review/issues/1814)

## Relationship to Human Judgment

The purpose of Judgment Placement is not to eliminate Human Review.

It reallocates human attention away from repeatable mechanical checks and toward decisions such as:

- business value and requirement validity
- security boundaries
- personal data and billing
- irreversible changes
- long-term architecture responsibility
- choosing between multiple valid alternatives

Judgment Placement and risk-tiered supervision (cliff / hill / field) are two orthogonal axes. The former classifies each individual review judgment by its nature and decides which evaluation layer executes it. The latter classifies the change itself by risk and decides how heavy human supervision is (the gateDecision). The two axes meet at Human Judgment and the cliff: a change that carries a judgment placed in Human Judgment is treated as a cliff and requires human approval. Conversely, even on a cliff change, detection and evidence still come from the Deterministic, Heuristic, and Agentic Review layers.

See [Human Judgment Focus](./human-judgment-focus.en.md) for the cliff / hill / field supervision model in detail.

## Decision checklist for new review concerns

When adding a new review concern, evaluate it in this order:

1. **Can an existing compiler, test, linter, or checker evaluate it?**
2. **Can a deterministic rule, schema, or trusted command evaluate it?**
3. **Can a heuristic detector narrow it down with high precision?**
4. **If semantic understanding across artifacts is required, use Agentic Review.**
5. **If the decision involves responsibility, values, or irreversibility, preserve Human Judgment.**
6. **Feed outcomes back into Riverbed, fixtures, and evaluation to verify that the placement remains appropriate.**

## Non-goals

Judgment Placement is not intended to:

- reduce code review to zero as a KPI
- replace human approval with AI approval
- make every judgment deterministic
- reimplement architecture checkers, linters, or test runners inside River Review
- reduce semantic judgment to simple regex rules
- couple River Review core to a provider-specific agent runtime

## Summary

River Review judgments do not all need the same execution mechanism.

**If Review Judgment as Code defines what judgment should be owned and versioned, Judgment Placement defines where that judgment should execute.**

The goal is not to make humans, agents, rules, and tests compete. It is to let each of them own the decisions they are best suited to make, so judgment quality can scale with AI-assisted development throughput.

## Related pages

- [Concept](./concept.en.md) — Review Judgment as Code and the Core Mechanism in full
- [Human Judgment Focus](./human-judgment-focus.en.md) — human supervision, risk tiers, and responsibility boundaries
- [Design Philosophy](./design-philosophy.en.md) — design principles and risk-tiered human supervision
- [Skill Schema](../reference/skill-schema.en.md) — skill metadata reference, including `evaluationType`
