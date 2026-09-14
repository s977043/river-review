---
id: what-is-river-review-en
title: What is River Review
---

River Review is an **OSS framework that runs a team's own review judgment across requirements, design, plan, diff, and report**.

Its core idea is **Review Judgment as Code**. The current product is a **Review Judgment Platform / team-owned audit layer** for owning, executing, observing, and improving team review judgment.

This page covers features, usage, and the execution model. The overall concept — the problems, the core model, and the responsibility boundary — is collected in [Concept](./concept.en.md).

A typical AI review tool treats the PR diff as its main input. River Review does not stop there: it also reviews the requirements, design, and plan that come before an AI agent starts implementing, and stays consistent through the diff, tests, and completion report afterwards.

This approach is also called _Context Engineering_ — designing how the context needed for a review judgment is structured and handed to an LLM. By defining team-specific judgment criteria and procedures as version-controlled **Agent Skills**, it makes review findings reproducible while keeping operating costs in check. River Review is built around three core ideas:

- **Capability pack**: a bundle of skills / agent definitions that strengthens an AI's review ability.
- **Skill Registry**: a way to share team judgment criteria as versioned, repo-owned Skills.
- **Review agent and review team**: a dedicated review agent plus a review team that runs perspective-based reviewers in parallel.

Turning tacit knowledge into versioned, repo-owned Skills as a shared asset stays unchanged. The third axis defines who runs that asset and how.

## In one sentence

River Review is a framework for reviewing **the flow of development itself, not only the code**.

- Requirements: are the purpose, success conditions, and scope clear?
- Design: is it consistent with the existing architecture and constraints?
- Plan: are the work breakdown, risks, and verification policy in place?
- Diff: does the implementation deviate from the requirements, design, or plan?
- Report: does it retain the rationale, verification results, and open items?

## Purpose

- Reduce ambiguity in requirements, design, and plans before implementation.
- Detect drift between plans and implementation during and after execution.
- Reduce regression and coverage gaps before test or release.
- Make review judgment reusable as team-owned Skills.
- Audit AI-agent output against team-owned criteria.
- Separate findings from review-execution completeness so a partial review is not mistaken for a clean review.

## Positioning

River Review does not replace human reviewers. By handling skill-based checks to reduce oversights, it allows humans to focus on intent and team-specific judgments.

Its role also differs from PlanGate: River Review **reviews**, while PlanGate **blocks / passes**.

The responsibility split across the four actors — River Review, humans, AI implementation agents, and PlanGate / the caller — is collected in [Concept](./concept.en.md). How human supervision is allocated across the cliff, hill, and field tiers is covered by [Human Judgment Focus](./human-judgment-focus.en.md).

## Execution model (who runs the review)

River Review's skills are not configuration for River Review to call an LLM itself — they are a **capability pack (skills / agent definitions) that strengthens an AI's review ability**. There are three ways they get executed, and **whether an LLM key is needed is decided by this model, not by the execution surface**.

1. **AI-agent-driven (primary)** — an agent (Claude Code / Cursor / Codex …) loads the skills (`skills/agent-skills/`) or the sub-agent (`agents/river-review.md`) and **runs the review with its own model**. The agent _is_ the LLM, so **no River Review LLM key is needed**. This covers `/review-local`, sub-agent delegation, loading Agent Skills, etc.
2. **Mechanical checks (heuristic / no model)** — perspectives that can be decided deterministically (e.g. via regex) **run with no LLM and no key**. Today this covers security perspectives (hardcoded secrets / `eval` & XSS / disabled TLS / weak hash / command injection / GitHub Actions risks / invisible Unicode injection (GlassWorm and Trojan Source style)) plus quality and test perspectives (silent-catch / leftover `debugger` / merge-conflict markers / type-check suppression / missing tests / focused & disabled tests / accumulating caller special-cases / closures retaining a large enclosing scope / temporary-fix comments with no exit criteria), handled by nine skills across the security / logging / typescript / test / simplify / knowledge-alignment domains. More mechanically-decidable perspectives can be added over time.
3. **Headless LLM (GitHub Action / standalone `river run`)** — with no interactive agent present, River Review **calls an LLM itself** to execute the skills. **Only this path needs an LLM key** (`ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GOOGLE_API_KEY`); the mechanical checks (2) still run without one.

> In short: normal AI-driven development needs **no LLM key** because the agent applies the skills. A key is required only for **headless execution (GitHub Action / standalone CLI)** running skills beyond the mechanical checks.

## Review agent and review team

River Review does more than bundle skills — it ships a **dedicated review agent** that runs them. This is a concrete form of the "AI-agent-driven" execution model above.

- **Dedicated review agent** — shipped as a sub-agent definition (`agents/river-review.md`) and invoked via `/review-local` and similar. The host agent loads this definition and runs the review with its own model.
- **Parallel perspective reviewers with merge (review team)** — `src/lib/reviewer-orchestrator.mjs` runs perspective-based reviewer roles (bug-hunter / security-scanner / test-gap / dependency-reviewer / frontend-reviewer / ci-cd-reviewer) in parallel, then clusters and merges their findings via connected-components. With `--reviewers auto`, the roles relevant to the diff are selected automatically.

Here, "multi-agent" means a single orchestrator running perspective-based reviewer roles in parallel and merging the results. It is not a set of fully autonomous, independent agents — it is specifically **parallel execution and merge of perspective reviewers**.

## Review Coverage

River Review treats **"zero findings" and "the required review work completed" as separate facts**.

The experimental Review Coverage Contract records the result of each review unit in machine-readable form. The current minimum unit is reviewer role × diff chunk, and units preserve states such as `completed`, `failed`, and `timed_out`.

Aggregate coverage is exposed as `complete`, `partial`, or `not_executed`. This prevents a successful subset of reviewer work from silently implying that the entire review completed.

At this stage Review Coverage is observe-only. It is persisted in JSON artifacts and saved runs, but it does not change existing Gate or decision behavior. Gate integration is a later step after observation and regression validation.

## Iteration loop and decision material critic

River Review serves as the **review stage** in a generate → review → revise iteration loop.

- On each pass, it returns review results as **decision material (findings / verdict / suggestedLoopSignal)**.
- The verdict is decision material only; it does not assert GO / NO-GO, auto-approval, or auto-merge. Whether to keep iterating or stop is the **caller's responsibility**.
- Mechanisms such as `auto-approve` are advisory and do not bypass human-in-the-loop (HITL) review. The cliff still requires human approval, and the field tier's autonomous continuation is not merge authority.

This contract and its reference implementation are defined in the [loop convergence contract](../reference/loop-convergence-contract.en.md) and the in-repo reference agent (`examples/loop-reference-agent/`).

## Flow Connection

- **Upstream**: Check requirements, design, and ADRs to reduce downstream risks.
- **Midstream**: Review code and PRs, ensuring alignment between design intent and implementation diffs.
- **Downstream**: Check tests, QA, and release readiness to prevent regression and quality degradation.

For details, see [Review scope and use cases](./review-scope.en.md) and [Upstream, midstream, downstream](./upstream-midstream-downstream.en.md).
