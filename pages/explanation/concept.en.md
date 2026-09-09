---
id: concept-en
title: 'Concept: turning review into an organizational judgment asset'
---

River Review is an OSS framework that makes a team's own review judgment explicit as versioned, repo-owned, testable Skills, and applies them to the Artifacts of the SDLC. It creates a state where whatever an AI produces can be evaluated against criteria the team owns.

This page explains what problem River Review starts from, what value it provides, and where it stops. For a feature and execution-model overview see [What is River Review](./what-is-river-review.en.md); for a short first-time introduction see [Welcome to River Review](./intro.en.md).

## Why review, and why now

AI raised the speed of building. At the same time, the load of deciding what to trust went up. River Review starts from four problems.

1. **Build speed and judgment speed are asymmetric** — AI can generate code and Artifacts in volume, but decision quality does not improve on its own.
2. **Review knowledge scatters** — criteria stay buried in PR comments, individual experience, and conversations, so the next project rarely reuses them.
3. **The same review repeats** — a team explains the same perspective from scratch every time, which raises reviewer cognitive load and waiting time.
4. **Ownership of the criteria** — even when the model or the review SaaS changes, team-specific criteria must remain an asset the team itself keeps.

## Redefining the value of review

> The value of review is not only finding bugs. It is raising the quality of decisions.

Review is the activity of offering a different perspective, evidence, risk, and alternatives against an artifact so that a more trustworthy decision becomes possible. Finding bugs is an important part of it, but the value of review does not end there. River Review aims to turn review, understood as an activity that raises decision quality, into something reusable, measurable, and improvable.

## How to describe River Review

The vocabulary has four layers. Each layer has a different role, so keep them apart instead of mixing them.

| Layer               | Wording                                           | Role                                              |
| ------------------- | ------------------------------------------------- | ------------------------------------------------- |
| Tagline             | Turn review into an organizational judgment asset | States the value in one line                      |
| Core Mechanism      | Review Judgment as Code                           | The core idea. Mechanism explanations belong here |
| Current Product     | Review Judgment Platform / Team-owned Audit Layer | How to name what ships today                      |
| Long-term Direction | Engineering Judgment Infrastructure               | A long-term direction, not today's headline       |

The core idea, **Review Judgment as Code**, means managing review perspectives, criteria, scope of responsibility, evidence, escalation conditions, and quality-evaluation methods in a form that can be reused, evaluated, and improved. Engineering Judgment Infrastructure names a future destination, so it is not used to describe what River Review ships today.

**Judgment Placement** is not a fifth headline alongside these four layers. It is the principle that decides where the Core Mechanism executes, so it belongs to the Core Mechanism layer. Where Review Judgment as Code turns "what to judge" into an asset, Judgment Placement designs which evaluation layer — Deterministic, Heuristic, Agentic Review, or Human Judgment — each judgment is placed in (see [Judgment Placement](./judgment-placement.en.md)).

## Define judgment, execute it, remember it

The core model of River Review has three layers.

- **Skills define judgment** — a Skill is the unit that expresses a review job, its criteria, and its responsibility boundary. It is managed as a versioned, testable, portable asset ([Skills](./skills.en.md)).
- **Gates execute judgment** — Skills run at the right SDLC phase: requirements, design, plan, implementation, and verification ([Upstream, midstream, downstream](./upstream-midstream-downstream.en.md)).
- **Riverbed remembers judgment** — suppressions, WontFix decisions, prior judgments, and feedback persist, which keeps future reviews consistent and drives improvement ([Riverbed Memory](./riverbed-memory.en.md)).

Those three layers form the following judgment loop.

```text
review judgment -> turn into a Skill -> apply to an Artifact -> Finding / Evidence / Verdict
  -> a human or the caller decides -> remember and evaluate the outcome -> improve the Skill
```

The loop starts from a review judgment the team actually made. That judgment is written out as a Skill, applied to an Artifact, and yields Finding, Evidence, and Verdict as decision material. The final decision belongs to a human or to the caller, and the outcome is remembered, evaluated, and fed back into improving the Skill.

## Reviewing the flow of development, not only the code

River Review is not a tool that looks only at a PR diff. It applies the team's criteria consistently to SDLC Artifacts, from before implementation to after it. The nine Artifact types in scope are the following.

- **Requirement** — reduce ambiguity in purpose, success conditions, and scope
- **Design** — check consistency with the existing design, separation of concerns, and over-implementation
- **ADR** — check that the reason, the alternatives, and the blast radius of a decision are recorded
- **Plan** — check that work breakdown, risks, and verification approach are ready before implementation
- **Diff** — check that the implementation stays consistent with requirements, design, and plan
- **Tests** — check that tests are sufficient against the specification and the risks
- **Security Report** — check security findings and how they were handled
- **Final Report** — check that rationale, verification results, and open items are recorded
- **Operations Artifact** — check that release preparation and operational procedures have no gaps

These nine types are a breakdown of the five categories used as an introduction in [Welcome to River Review](./intro.en.md): requirements, design, plan, diff, and report. They map as follows.

| Five categories | Matching Artifacts             |
| --------------- | ------------------------------ |
| Requirements    | Requirement                    |
| Design          | Design / ADR                   |
| Plan            | Plan                           |
| Diff            | Diff / Tests                   |
| Report          | Security Report / Final Report |
| (extension)     | Operations Artifact            |

Upstream, River Review checks requirements, design, ADRs, and plans to reduce risk in later phases. Midstream, it reviews code and pull requests to keep design intent, plan, and diff aligned. Downstream, it checks tests, QA, completion reports, and release readiness.

Those nine types are the **conceptual** review targets. The implemented input contract is the 14 inputs defined in [Artifact Input Contract](../reference/artifact-input-contract.en.md) (`plan`, `diff`, `junit`, `test-cases`, and others), so not every one of the nine has a dedicated input type. Skill coverage is also uneven across phases. Security Report and Operations Artifact in particular are defined as target areas, but their input contract and skills are still being expanded. For how far the CLI is implemented today, see [Review scope and use cases](./review-scope.en.md).

## More decision material, no transfer of responsibility

River Review is a mechanism for adding decision material, not for delegating responsibility. Roles divide as follows.

| Actor                   | Responsibility                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------ |
| River Review            | Reviews Artifacts and supplies Finding / Evidence / Verdict. Makes the team's criteria reproducible                |
| Humans                  | Final accountability, business validity, irreversible changes, serious security calls, approval in high-risk areas |
| AI implementation agent | Generates and edits Artifacts. River Review evaluates whether that output conforms to team criteria                |
| PlanGate / caller       | Decides GO / NO-GO / NEEDS_REVISION, iteration, stop, and approval based on River Review output                    |

Within the product development flow, the roles split like this.

- **PlanGate** — decides what to build
- **AI implementation agent** — handles how to build it
- **River Review** — evaluates whether it is actually good
- **AI Loop** — drives how to improve it

River Review is responsible up to "review it"; the decision to stop or to let it through belongs to PlanGate or the caller. This boundary is maintained in both the concept and the implementation.

These four stages describe a division of roles, not a dependency on a particular product. The core contract of River Review is artifact-based. PlanGate and AI Loop are two useful workflow shapes, but River Review does not depend on a single planning method or on one loop implementation.

The weight of human supervision is allocated across three risk tiers.

- **Cliff** — high-risk change. Human approval is mandatory, and anything unclear is escalated.
- **Hill** — the change may continue, but under time-boxed observation and a follow-up check.
- **Field** — low risk. Autonomous convergence is allowed, with after-the-fact audit from the records.

For details on the three tiers, see [Design philosophy](./design-philosophy.en.md); for where human judgment should be concentrated, see [Human Judgment Focus](./human-judgment-focus.en.md).

## Mission and vision

- **Mission** — turn review from a one-off comment into an organizational judgment asset that can be reused, evaluated, and improved.
- **Vision** — reach a state where people and AI collaborate under a risk-based split of responsibility and keep improving review judgment.

## What ships today, and the long-term direction

Today River Review is a **Review Judgment Platform**. What it provides is the following four things.

- Turning review judgment into Skills
- Review across Artifacts
- A team-owned audit layer
- Continuous improvement through evaluation and operating memory

The long-term direction is **Engineering Judgment Infrastructure**: extending to judgment jobs beyond review, turning ADR, design, operations, and SRE decisions into assets, and making the craft of good judgment an organizational capability. That remains a future direction, so it is kept separate from what ships today.

## What River Review does not aim to be

- **A general-purpose AI code review SaaS** — such a product cannot carry team context, so it is not the goal.
- **A replacement for implementation agents** — River Review is designed as an inspection gate that runs alongside them.
- **A replacement for static analysis** — it concentrates on judgment that spans Artifacts.
- **A full substitute for human reviewers** — human approval at the cliff is part of the contract, and supervision is allocated by risk tier.
- **Automatic code fixing** — River Review reports problems and stops there; it does not transform or auto-fix code.
- **Automatic approval or automatic merge** — a verdict is decision material, not the approval itself.
- **Autonomous judgment without sufficient evidence** — automation widens only where verification and feedback provide backing.

The SSoT for this list is the internal document [`docs/vision.md`](https://github.com/s977043/river-review/blob/main/docs/vision.md), and this page carries the same items. The last item is the same principle as "the precondition for higher accuracy" in [Design philosophy](./design-philosophy.en.md). Areas without backing do not go first; coverage widens from perspectives with a verification track record.

## Related pages

- [Welcome to River Review](./intro.en.md) — a short introduction for first-time readers
- [What is River Review](./what-is-river-review.en.md) — product overview including features, usage, and execution model
- [Human Judgment Focus](./human-judgment-focus.en.md) — human supervision, risk tiers, and responsibility boundaries
- [Judgment Placement](./judgment-placement.en.md) — the principle that decides which evaluation layer executes each review judgment
- [Review scope and use cases](./review-scope.en.md) — Artifacts in scope and the phases where they are used
- [Design philosophy](./design-philosophy.en.md) — design principles and risk-tiered human supervision
- [AI review policy](../reference/review-policy.en.md) — the SSoT for review perspectives and output format
- [`docs/vision.md`](https://github.com/s977043/river-review/blob/main/docs/vision.md) — the internal SSoT for design intent
