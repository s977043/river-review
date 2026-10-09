---
id: practice-evolution-en
title: Practice Evolution (OSS Governance)
---

# Evolving River Review's practices through agile values

River Review is open-source software for making review judgment team-owned, testable, and improvable. We apply those same ideas to how we develop, maintain, and collaborate on this project: **talk to people, validate useful outcomes, and learn from change**.

This page is the **public, living OSS governance guideline** for practice evolution. It helps contributors discuss proposals in Issues, pull requests, and Discussions. It is not a new mandatory gate, approval stage, or checklist.

## Values and their interpretation

We respect the four values of the [Manifesto for Agile Software Development](https://agilemanifesto.org/) and its [principles](https://agilemanifesto.org/principles.html). The values on the right still matter. The interpretations below are River Review's own, not quotations from the manifesto.

- **Individuals and interactions:** Human dialogue with users and contributors cannot be replaced by an AI verdict or a procedure.
- **Working software:** Prefer tested behavior and demonstrated user value to documents or plans alone.
- **Customer collaboration:** Understand actual problems and share both the rationale and outcome of decisions.
- **Responding to change:** Improve, simplify, or remove practices when the evidence changes.

## Values, boundaries, and replaceable practices

- **Values / Principles:** Favor collaboration, useful results, empirical learning, and responsiveness.
- **Safety / Authority:** Evidence is not judgment; a review verdict is not approval; an agent role is not execution authority. River Review returns decision material, while a human or host retains approval, merge, and release authority. High-risk decisions still require human approval.
- **Policies / Decisions:** Existing security, compatibility, contributor, CI, and governance rules remain in force. Changing these rules requires the project's established issue, review, and maintainer decision process.
- **Practices / Tools:** Skills, agents, evaluations, review routines, and checklists can be adapted, consolidated, or retired based on their results.
- **Evidence / History:** Distinguish measured outcomes, review runs, code, tests, user observations, and recorded decision reasons.

Being open to future improvement does **not** grant permission to bypass today's controls. Consult the [contribution rules](https://github.com/s977043/river-review/blob/main/CONTRIBUTING.en.md), [review policy](../../reference/review-policy.en.md), [design philosophy](../../explanation/design-philosophy.en.md), and [human judgment principles](../../explanation/human-judgment-focus.en.md).

## Compare local evidence with external knowledge

**Local Evidence:** Real behavior in this repository, tests, evaluations, PR feedback and its disposition, and observations from users.

**External Knowledge:** Primary documentation, research, standards, and experience from other OSS projects or teams.

We consider both, but do not assume that they have equal evidential weight. Check provenance, reproducibility, applicability, timing, and risk. Neither "we have always done it" nor "this is popular elsewhere" is sufficient.

Four decisions are equally legitimate:

- **Adopt:** Evidence indicates a safe and useful fit.
- **Adapt:** Retain an effective principle while adjusting it to River Review's context.
- **Transform:** Question the underlying assumptions, responsibilities, or measures of success.
- **Defer / Reject:** Evidence is insufficient, the fit is poor, or the cost and risk outweigh the benefit.

Declining a proposal is also learning. Where possible, explain why and what new information would justify revisiting it.

## Fast Feedback and Quick Recovery

- Begin with the **smallest useful verification**, rather than a large up-front process.
- Treat failures, false positives, waiting time, and needless process overhead as feedback.
- Favor reversible changes with risk-appropriate stopping and recovery plans. Never skip irreversible or high-risk authority boundaries.
- Evaluate **removing** unnecessary steps as well as adding skills, agents, or checks.

## How contributors can participate

Discuss a problem or hypothesis in [Discussions](https://github.com/s977043/river-review/discussions), then use an [Issue](https://github.com/s977043/river-review/issues) or [Pull Request](https://github.com/s977043/river-review/pulls) when the change is concrete. The [contribution guide](./CONTRIBUTING.en.md) describes the existing participation process.

Where available, share the **problem and desired outcome, observed local evidence, external sources, smallest useful experiment, and conditions for revisiting the decision**. This is guidance, not a new submission template. Consider alternative interpretations and trade-offs, including a justified decision to defer.

This policy is also revisable. If it stops helping people or imposes needless overhead, propose simplifying, integrating, or withdrawing it. Formal changes to policy and execution authority remain with the project's established governance and maintainer.

Related: [Concept](../../explanation/concept.en.md) / [Design Philosophy](../../explanation/design-philosophy.en.md) / [Contributing](./CONTRIBUTING.en.md). See [Issue #2631](https://github.com/s977043/river-review/issues/2631) and [PR #2632](https://github.com/s977043/river-review/pull/2632) for the original decision history.
