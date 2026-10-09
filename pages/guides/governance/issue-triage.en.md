---
id: issue-triage
sidebar_label: Issue Triage and HOTL
---

# Issue Triage Living Playbook — From Evidence to Action

> **Status:** Living Practice / v0.1 (under evaluation)
> **Owner:** River Review maintainer
> **Started:** 2026-10-10
> **Tracking:** [Issue #2635](https://github.com/s977043/river-review/issues/2635)
> **Rules SSoT:** [Issue / Project operation rules](./issue-management.en.md)
> **Values:** [Practice Evolution Policy](./practice-evolution.en.md)

## Purpose and authority

Keep open Issues as a backlog of verifiable, actionable work rather than a store of historical discussions. GitHub Issues/PRs, current main, tests and execution evidence are the factual sources of truth. This page is an **adaptable practice**, not a new mandatory gate or a replacement for the existing rules about labels, contributions, approval, merging or releases.

**HOTL (Human-on-the-Loop)** in this guide describes the development agents helping maintain River Review: they may investigate, propose, build fixtures, implement within delegated authority, test, prepare PRs and assemble a decision packet before escalating only the actual owner decision. The River Review **product** remains a read-only review and decision-support system. It does not own code changes, Gate changes, merging, releases or risk acceptance.

**Evidence is not Judgment; Review Verdict is not Approval; Observation is not Attestation; Trigger is not Permission.** Gathering sufficient evidence does not create new authority.

## 1. Small-batch triage (Loop A)

Start with **3–5 Issues** and verify the outcome of a batch before applying similar changes elsewhere. Triage security, credentials, approval bypasses and other severe risks separately.

1. **Select:** Record the Issue set, observation date, main SHA, relevant PRs and scope.
2. **Observe:** Compare Issue body **and latest comments**, PR merge status, code, tests and acceptance criteria (AC). Do not treat stale body text as the latest fact.
3. **Propose:** Mark each AC as `verified / unverified / unmet`; specify dependencies, residual risks, proposed outcome and independently executable next work.
4. **Review:** Check for premature closure, lost AC, false green, security failure, authority confusion and incorrect relationships. A self-review is not an independent approval.
5. **Apply:** Within existing permission, update evidence, dependencies and links; create small fixes/PRs; and conduct verification. Move remaining AC and create bidirectional links **before** closing a duplicate.
6. **Verify:** Re-fetch GitHub state, closure reason, links, remaining AC, PR head and CI. Keep an Issue open if the essential evidence is missing.
7. **Recover:** On a false closure, lost AC or permission breach, stop changes of the same kind, reopen/correct the record and inspect affected items.

Test a single case before bulk updates. Neither an unchecked checklist nor a merged PR's `Closes #N` text proves that all AC are complete. Conversely, do not leave old Issues stalled indefinitely: use the cheapest useful verification and evaluate present-day residual risk.

### Triage outcomes (not new labels)

| Outcome | Evidence | Action |
| --- | --- | --- |
| Completed | All AC fulfilled in current main with verification | Record evidence and close as completed |
| Duplicate | Same goal and remaining AC; safe transfer to one representative Issue | Transfer AC, add bidirectional links, close as duplicate/not planned |
| Superseded | Replaced by an adopted design or successor Issue | Document successor and transfer; close as not planned |
| Obsolete / not reproducible | Checked against current behavior; residual risk acceptably low | Record limits and reopen trigger; close as not planned |
| Out of scope | Explicit, authorized decision to defer or reject | Record reason and revisit condition; close as not planned |
| Actionable | A verification, implementation or evaluation slice can proceed | Keep open and identify smallest slice |
| Blocked / decision required | Mandatory prerequisite or human-owned authority is missing | Keep open; record unblock condition **and parallel work** |

Related/parent Issues are not necessarily duplicates. Never close a still-relevant security, privacy, data-loss, fail-open or approval-bypass risk merely because it is old or hard to reproduce.

## 2. HOTL: do not equate owner decisions with a total work stop

Treat **ability to work** and **authority to decide** as independent dimensions:

- **E0 Observe:** Read existing code, Issues, PRs and constraints.
- **E1 Prepare:** Provide alternatives, recommendation, trade-offs, fixtures, rollback and stop conditions.
- **E2 Execute:** Within previously delegated authority, carry out reversible Issue maintenance, small changes, tests, PR creation and review; re-fetch evidence.
- **E3 Decision packet:** Isolate the remaining owner decision and continue independent work that is safe to perform.
- **E4 Human-owned authority:** Risk acceptance, irreversible operations, formal policy approval, mandatory independent approvals and merging follow existing repository governance. E0–E3 do not replace E4.

A decision packet should provide `Problem / Evidence (refs and observation time) / Unknown / Options / Recommendation / Cost & risk / Executable now / Explicit owner decision / Stop & recovery`. Unavailable evidence is not `0` or `PASS`.

**Examples:** #2601 can proceed with dogfood independently of a proposal for navigable artifact links. #2455 can improve offline fixtures and contracts without implying permission for provider-backed evaluation or promotion.

## 3. Evolve the process itself (Loop B)

After approximately two batches, choose **one** recurring friction or failure and run **one** small improvement experiment over the next one or two batches. Use evidence to decide `Keep / Adapt / Revert / Defer` and update this playbook only as useful.

Observe incorrect closures, missing AC transfers, wrong links/dependencies, unnecessary human escalation, time to actionable next step, recovery time and reviewer effort. **The number of closed Issues is not a success metric.** Report missing measurements as unknown.

The initial hypothesis is that batches of 3–5 plus immediate re-fetch identify harmful triage errors sooner than a single large cleanup. **The benefit is not yet demonstrated.** Reduce or revert the process if the first trials show unnecessary overhead.

## 4. Safety and SSoT boundaries

- [Issue operation rules](./issue-management.en.md) own the actual labels. Do not bulk replace `P0/P1/P2` and `priority:P1/P2/P3` before inspecting automation and semantic differences.
- Merging a child PR is not completing a parent Epic. Keep unmet AC traceable and the parent open.
- Before merging, check current head, required CI, comments, blocked labels and the maintainer approval policy. Self-review is not independent review.
- Stop the same kind of change upon evidence of false closure, secret exposure, permission escalation, data loss or false green; document recovery and affected scope.
- Prefer existing Issue/PR records and the [Practice Evolution Policy](./practice-evolution.en.md), rather than adding mandatory agents, bots, databases, labels or gates without demonstrated value.

## 5. Initial pilot

Log batch-level findings in [Issue #2635](https://github.com/s977043/river-review/issues/2635). Batch A: #2601, #2577, #2633, #2455 (delivered slices vs remaining AC); Batch B: #2033, #2203, #2202 (secret and suppression risk). If #2633 is already closed, verify its closure evidence; do not reopen and reclose it without cause.

Review the impact after these two batches. This page may change with evidence; it does not rewrite historical decisions or their source records.
