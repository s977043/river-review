---
id: intro-en
title: Welcome to River Review
---

River Review (RR) is an OSS framework that **turns your team's review judgment into versioned, repo-owned skills and runs them across SDLC gates**. It operates over artifacts such as plan, diff, test-cases, JUnit, and prior review outputs, acting as the **team-owned audit layer** for AI-assisted development.

Its core idea is **Review Judgment as Code**. The current product is positioned as a **Review Judgment Platform / team-owned audit layer** for owning, executing, observing, and improving team review judgment.

This page is a short introduction for first-time readers. The full concept — the problems, the core model, the responsibility boundary, and the non-goals — is collected in [Concept](./concept.en.md).

The foundation stays the same: it turns your team's tacit knowledge into versioned, repo-owned **Skills (the Skill Registry)** that you reuse as a shared asset. River Review delivers that foundation along three core axes:

- **Capability pack**: a bundle of skills / agent definitions that strengthens an AI agent's review ability. It usually needs no LLM key; only the headless GitHub Action / `river run` path requires one.
- **Review skills (Skill Registry)**: the foundation that shares team judgment criteria as versioned, repo-owned Skills.
- **Review team**: a dedicated review agent (`agents/river-review.md`) plus a review team that runs perspective-based reviewers in parallel. In a generate → review → revise loop it acts as the verdict-bearing critic for the review stage.

## What River Review reviews

River Review is not a tool that looks only at the PR diff. It treats the **requirements, design, plan, diff, and report** produced during AI-assisted development as review targets, applying the team's criteria consistently from before the work starts through to after it completes.

| Target      | Goal                                                                           | Examples                                      |
| ----------- | ------------------------------------------------------------------------------ | --------------------------------------------- |
| Requirement | Reduce ambiguity in purpose, success conditions, and scope                     | Issue, PBI, user request, acceptance criteria |
| Design      | Check consistency with the existing design, separation of concerns, over-build | ADR, design memo, architecture direction      |
| Plan        | Check that work breakdown, risks, and verification policy exist up front       | Plan, Work Packet, test policy                |
| Diff        | Check that the implementation matches requirements, design, and plan           | PR diff, changed files, test diff             |
| Report      | Check that rationale, verification results, and open items remain              | Final report, review results, evidence        |

River Review therefore serves both **pre-execution review** and **post-execution review**: requirements, design, and plan before implementation; diff, tests, and report after it.

## Core Model

- **Skills define judgment** — A skill describes how a review decision should be made (security, accessibility, migration safety, dependency policy, plan conformance, ...). Skills are written as YAML frontmatter + Markdown and validated against `schemas/skill.schema.json`.
- **Gates execute judgment** — `river review plan` / `exec` / `verify` run those skills at the right point in the delivery flow — not only after the PR is already complete.
- **Riverbed remembers judgment** — Review outcomes and decisions persist as operating memory, with suppression and prior-decision recall keeping future reviews consistent ([Riverbed Memory](./riverbed-memory.en.md)).

## Review Coverage

River Review treats **"zero findings" and "the required review work completed" as separate facts**.

The experimental Review Coverage Contract records review-unit execution in machine-readable form. It preserves states such as `completed`, `failed`, and `timed_out`, then exposes aggregate coverage as `complete`, `partial`, or `not_executed`.

At this stage it is observe-only. Review Coverage does not change Gate or decision behavior; it is recorded as evidence about whether the review execution itself completed.

This documentation covers:

- **Explanation**: Design philosophy and the three-layer model in depth.
- **Tutorials**: Hands-on guides for creating skills.
- **How-to**: Practical guides for GitHub Actions integration, tracing, etc.
- **Reference**: Schema definitions and CLI references.

Which page to read next depends on what you need. For the overall concept see [Concept](./concept.en.md); for features, usage, and the execution model see [What is River Review](./what-is-river-review.en.md). The breakdown of review targets is collected in [Review scope and use cases](./review-scope.en.md). How human supervision is allocated across the cliff, hill, and field tiers is covered by [Human Judgment Focus](./human-judgment-focus.en.md). The internal SSoT for the concept lives at [`docs/vision.md`](https://github.com/s977043/river-review/blob/main/docs/vision.md) in the repository root.
