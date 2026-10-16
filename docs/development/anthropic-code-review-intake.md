# Anthropic code review practices: River Review evidence-led intake

> Status: design / adoption plan only. No default behavior, gate, merge authority, or reviewer implementation changes.
>
> Source: [How the Claude Code team does code review](https://claude.dev/blog/solving-code-review-at-anthropic/) (Anthropic, 2026-10-15).
> Repository baseline reviewed: main at f52dc055ecd9bb823b4968177ae3208ac65b2482 (2026-10-17).

## Why

Anthropic optimizes human review time while tracking reversions and incidents as guardrails. It describes six check layers with rollback beneath them. The incident evaluation and bounded review-loop ideas can inform River Review. Its reported improvements are not River Review baselines or causal proof of our results.

River Review already owns review findings, resolution, review improvement, and human judgment contracts. We adopt ideas into existing components; we do not reproduce Anthropic's internal infrastructure.

The detailed team-learning lifecycle, trust classification and Human approval flow are documented in [Review Judgment Learning Loop](./review-judgment-learning-loop.md). Historical PR observations are not automatically accepted as reviewer ground truth.

## Existing ownership and gap map

<!-- prettier-ignore -->
| Anthropic practice | Existing River Review source of truth | Decision / gap |
| --- | --- | --- |
| Pre-PR verification | Fast Verification, review plan/exec, existing caller workflow | Reuse; require runnable evidence in host workflows where appropriate |
| Multi-reviewer verification | reviewer-orchestrator, Finding Critic, W-check | Reuse; do not add a second voting or judge system |
| Security and deterministic CI | existing skill/gate and CI contracts | Preserve independent high-risk scrutiny; deployment enforcement remains host-owned |
| Risk-tiered human oversight | Human Judgment Focus, risk-map, gate decision | Preserve cliff/hill/field; do not turn AI approval into required Human approval |
| Resolution and review thread handling | #2322 (implemented phases 1–4), #2575 | Dogfood authoritative Human resolution before calling integration complete |
| Reviewer improvement on incidents and reverts | #1574, #2615, #2701 | Build provenance-bound evaluation cases, then reuse paired replay |
| Convergent re-review | #2007 and loop-convergence contract | Define caller advice after round three; no autonomous gate or hidden retry |
| Human attention and quality | #2378 and #1990 | Measure usefulness and human time with quality guardrails |
| Merge queue, staged rollout and rollback | host/CI/deployment system | Out of core scope; document expected handoff only |

## Dependency-aware execution plan

### Slice A: Review Resolution dogfood (#2322, #2575)

1. Verify current Organizer exposes all findings and unresolved work. Check incomplete coverage, revision freshness, and primary evidence location.
2. Dogfood 5–10 genuine Host-authenticated Human resolutions using the existing Phase 5 operator procedure.
3. Distinguish author-reported fix, observed absence, and verified resolution. Never upgrade partial/not-executed coverage to confirmed.
4. Report duplicate comment burden, repeated author explanations, and how accurately Human reviewers identify required actions.

Exit: confirmed host evidence, zero unauthorized canonical Feedback writes, zero provenance loss, explicit Human signoff. As of this intake, #2575 remains open because qualifying real cases are not complete.

### Slice B: Incident/revert evaluation corpus (#2701)

1. Explicitly select 5–10 incident/revert cases, with an eventual minimum of 10 representative cases before comparing reviewer changes.
2. Record affected revision and the failure mode. Include Human-confirmed bug location, minimal evidence refs, and source digest.
3. Keep unknown truth as unknown. Incident reports, PR titles, merged state, or closed threads alone are insufficient evidence.
4. Separate should-detect cases from clean should-not-detect cases to measure harmful false positives.
5. Keep a held-out split; prohibit candidate reviewer prompts from seeing ground-truth labels and post-incident fixes.

Exit: human-confirmed, sanitized, replayable cases with a clear trust boundary and no automatic historical GitHub crawl.

### Slice C: Reviewer effectiveness (#2615, #1574)

1. Reuse existing paired replay instead of creating a second evaluator.
2. Verify input revision, configuration, and constraints match. Confirm activation path and independent scoring.
3. Report major/critical detection, harmful false-positive rate, duplicate findings, cost/latency and round count.
4. Mark reviewer failure, missing coverage, environment drift, or missing evidence as inconclusive.
5. Do not start Phase 7 effectiveness adoption before #2575 real Human dogfood acceptance.

Exit: zero critical regression, no harmful false-positive regression, no attribution without controlled paired evidence. Keep/Rollback/Retire remains Human-owned.

### Slice D: Bounded review loops (#2007)

1. Keep rounds-to-pass as a metric separate from finding recall and correctness.
2. After three reviewer/author rounds, advise the caller to reassess approach, scope, and repeated findings. Do not treat three rounds as proof of convergence.
3. After initial full review, prefer new-diff review when safe; retain initial snapshot evidence and recheck high-risk context as needed.
4. Suppress re-posting exactly the same finding without new supporting evidence; do not hide persistent critical/major findings.
5. Use existing STOP_MAX_ITERATIONS / oscillation / coverage signals; caller owns stop/retry/escalation.

Exit: deterministic conformance tests for repeated findings, oscillation, missed coverage, blocking issue persistence and round count. Do not change existing gate authority.

### Slice E: Human Attention dogfood (#2378, #1990)

1. Complete fixed-fixture Human decision-extraction and visibility checks before expanding real-world observation.
2. Observe Human approvals per PR and Human comments. Measure wait-on-human time, rounds-to-pass, and decision correctness when available.
3. Do not interpret time savings alone as success. Treat incident/revert rates and critical/major visibility as guardrails.
4. Record measurement mode: explicit, bounded approximation, or unavailable. Unavailable is not zero.
5. Compare by risk level and PR size where sample size permits; do not use individuals' attention time for performance evaluation.

Exit: Human review effort improves or stays similar without correctness/visibility regression and without worsening reverts/incidents.

## Safety and trust boundaries

- Evidence is not judgment; a verified input, a Human decision, and runtime enforcement are separate.
- Candidate evidence is not automatically verified evidence. A closed conversation does not validate a finding.
- The review source, reviewed revision, baseline labels, and evaluation set must have independent provenance.
- Changes to risk policy, required Human approvals, suppression or promotion need their existing owner and review process.
- No automatic merge or deployment. Do not import incidents, activate Skills, append Feedback, or change security policy.
- No new LLM provider requirement or external dependency for the initial intake.

## Review protocol

Review the implementation slices independently from three perspectives:

1. **Reviewer quality:** Check coverage, severe-bug detection, and harmful false positives.
2. **Trust/security:** Check that the authoring agent cannot forge Human consent. Validate revision identity, incident labels, and clean outcomes.
3. **Architecture/operations:** Check for duplicate owners and vendor lock-in. Require bounded reviewer rounds and cost.

For each slice use: proposal → adversarial review → narrow implementation → independent review → exact-head CI → canary observation. Rollout decisions and merges remain with the repository's authorized owners.

## Issue map

- Epic: [#2322 Review Resolution Loop](https://github.com/s977043/river-review/issues/2322)
- Human dogfood dependency: [#2575 Review Resolution Feedback Bridge](https://github.com/s977043/river-review/issues/2575)
- Historical observations: [#2614 Team Knowledge Bootstrap](https://github.com/s977043/river-review/issues/2614)
- Evaluation lifecycle: [#2615 Review Evolution effectiveness](https://github.com/s977043/river-review/issues/2615), [#1574 Evolution Cycle](https://github.com/s977043/river-review/issues/1574)
- Incident corpus: [#2701 Incident/Revert-grounded Reviewer Benchmark](https://github.com/s977043/river-review/issues/2701)
- Human Attention: [#2378 Decision Surface eval](https://github.com/s977043/river-review/issues/2378), [#1990 Human Judgment Learning](https://github.com/s977043/river-review/issues/1990)
- Loop convergence: [#2007 Multi-role review stopping contract](https://github.com/s977043/river-review/issues/2007)

Each slice must produce reproducible evidence and independent review. Adoption or rollback requires explicit authorization and traceable references. This document does not complete those slices.
