# PR Decision Brief — observe-only experiment

> Status: proposal / non-normative. Tracks [#2896](https://github.com/s977043/river-review/issues/2896). This is not a new policy, required check, approval, or merge authorization.

## Hypothesis

A concise decision brief can reduce reviewer reading time **without** reducing recognition of missing evidence, stale evidence, scope drift, or unresolved risks. A shorter PR body is not itself evidence of safety.

## Suggested PR body (six sections)

### Why
Problem and intended outcome, with a link to the accepted plan if available.

### What changed
Material behavior and design changes; do not reproduce the diff.

### Scope
Included and explicitly excluded work; call out deviations from the approved plan.

### Tradeoffs
Relevant rejected alternatives and residual limitations.

### Blast Radius
Affected systems, security/privacy implications, rollback and residual risk.

### Verification
Observed tests/checks, their result and exact target head SHA; link to detailed evidence. Explicitly disclose NOT_RUN, UNKNOWN, FAIL and STALE. Never imply that a previous commit's passing check covers a newer head. State missing independent review and human approval separately.

No fixed 40-line requirement: safety-relevant unknowns take precedence over brevity.

## Evidence attachment (outside the short PR body)

For each test or check capture: source URL/artifact, executed command or check name, observed result, timestamp, head SHA (and merge-commit/base context if applicable), limitations, and provenance. Suggested states: PASS, FAIL, NOT_RUN, UNKNOWN, STALE. A green summary is not an approval. A stale result is not PASS. Do not expose secrets or sensitive raw logs.

## Paired evaluation protocol

1. Select 5–10 existing PRs with different sizes and risks; freeze diff, evidence and head SHA. Do not edit live PR bodies.
2. Prepare an original-body view and a concise-body view referencing identical evidence. Blind the evaluator to expected conclusions where feasible; randomize presentation order and avoid having one reviewer see the same case twice.
3. Include negative cases: stale SHA, missing tests, out-of-scope changes, unresolved security finding and unapproved merge. These may be synthetic fixtures, clearly labeled.
4. Record per case: time-to-decision; correctness of purpose/scope/risk; critical omissions; evidence provenance recognition; number of clarification requests; evaluator and presentation order.
5. Compare paired observations, report sample size and confounders. Do not claim statistical significance from this small pilot.
6. Independently review the findings for safety, UX, maintainability and measurement validity; choose Keep / Adapt / Revert / Defer with evidence.

## Stop conditions

Stop adoption if a critical risk is missed, stale evidence is accepted as current, unexecuted verification is presented as PASS, or an approval/merge authority boundary is crossed. Record failures rather than retroactively changing acceptance criteria.

## Responsibility boundary

- PlanGate owns execution readiness, plan and C-3/C-3' authorization; C-4/merge remains Human-owned.
- River Review evaluates evidence, coverage and review judgments. Verdict != approval.
- GitHub branch/ruleset controls and authorized humans determine merge permission.
- This experiment adds no required status check, bot, new gate, provider, automatic approval, or Origin dependency.

## Source

- [pstack: Opening a PR](https://github.com/cursor/plugins/blob/main/pstack/skills/poteto-mode/playbooks/opening-a-pr.md)
- [River Review existing overview](../../README.md)
- [PlanGate related discussion](https://github.com/s977043/PlanGate/pull/1644)
