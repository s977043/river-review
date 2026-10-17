# Review Mode Router adoption: contract baseline (#2034)

## Decision and scope

River Review is plugin-first for Claude Code and Codex.
The existing `src/lib/review-mode-router.mjs` recommends review depth.
It uses changed files plus diff size and the repository risk map.
It does not perform reviews or determine finding truth.
It cannot grant execution or merge authority.

Do not copy another `.claude/commands` router from the source article.
Preserve the existing classifier and risk map.
Use the existing reviewer role selector and Flow contract as their owners.

This change adds `schemas/review-route.schema.json`.
It also adds deterministic regression tests for the current JSON response.
There is no change to routing behavior or plugin execution.
The new schema is Experimental.
The CLI is Internal under `pages/reference/stable-interfaces.md`.

## Responsibilities

- `src/lib/review-mode-router.mjs` owns pre-flow depth recommendations.
- `src/lib/file-classifier.mjs` owns changed-file classification.
- `src/lib/risk-map.mjs` owns risk escalation and human review requirements.
- `src/lib/reviewer-orchestrator.mjs` owns the reviewer role ledger.
- `schemas/flow.schema.json` owns runtime-independent execution ordering.
- `schemas/agent-contract.schema.json` owns logical agent authority.
- `schemas/review-route.schema.json` defines an advisory result.
- Review Artifact and Execution Manifest record actual work and provenance.

The route is advice before a Flow starts.
It must not redefine reviewer roles or selection thresholds.
It must not grant human approval or turn missing evidence into a passing gate.

## v1 contract

`selectedMode` is `light | standard | team | human-required`.
`confidence` describes the heuristic recommendation.
It is not evidence of finding correctness or completed coverage.

`reasons` and `matchedTriggers` explain the route.
`riskAction` retains the existing risk map action.
`nextCommand` is a suggestion and is never executed automatically.

`recommendedReviewers` is currently `"auto" | "none"`.
This is a hint rather than a list of executed reviewer roles.
The real role list comes from `selectRolesAuto()`.
Moving to an array requires an explicit compatibility decision.

## Next implementation slices

1. Review the risk routing of dependency manifests and lock files.
   Review CI workflows separately from generic configuration.
   Never downgrade a `require_human_review` decision.
2. Explain the selected roles with the existing `selectRolesAuto()`.
   Add fields without duplicating the role ledger.
   Assess consumers before introducing a new output version.
3. Document route-first usage for Claude Code and Codex.
   Keep the plugin usable without an installed CLI.
   Preserve all execution and approval boundaries.
4. Compare the baseline with the proposed routing behavior.
   Use fixed inputs and the existing Review Evolution pipeline.
   Include review quality and cost in the acceptance criteria.

## Review checks

- Deterministic output validates without a provider API key.
- Human-required cannot downgrade to AI-only review.
- A routing hint is not evidence of executed reviewer coverage.
- Unknown and missing evidence must never become verified success.
- No duplicate role maps or new dependencies are introduced.
- All exact-head tests must pass before merge.

Related: #2011 #2034 #2054 #2213 #1545 #1574.

## AIDLE task-nature lens (research proposal, 2026-10-18)

Source: [AIDLE Extended 2026 report, part 1](https://note.com/ai_dev_leaders/n/ndd23a2abf5be) (organizer account, 2026-10-15). Speakers distinguish exploratory/unknown work, replication of proven patterns, and known-solution work. This is **not evidence** that any River Review routing policy improves review quality.

**Separate the axes.** Task nature is a prospective *work-planning* hint. The existing `light | standard | team | human-required` mode is a deterministic **diff-risk** recommendation. Neither is proof of verified coverage, permission to write, independent reviewer approval, or Human merge authority. A known-solution task that touches auth/migration/CI must still receive its required risk escalation; an exploratory docs change does not automatically require a multi-agent team. Unknown task nature cannot silently reduce depth.

**No implementation/contract change in this proposal.** Keep `src/lib/review-mode-router.mjs`, `schemas/review-route.schema.json`, `risk-map`, Flow/Agent contracts and the existing reviewer role ledger as owners. Do not introduce a second route enum, overwrite `recommendedReviewers`, or auto-run the suggested command.

**Possible post-baseline evaluation** (track under #2034, coordinate with PlanGate #911 and DAT #93):

1. Independently annotate task nature from the original Plan/AC *before* outcome review. Record unknown/disagreement and source refs.
2. Retain exact diff-risk rules and fixed review command/Verifier for the baseline; first record shadow task-nature advice without executing a different mode.
3. In a separate preregistered comparison, assess matched finding correctness, escaped defects, false positives, coverage, reviewer/human time and total model cost; use blinded/independent judgments where possible.
4. Negative fixtures: “known” task with protected migration, uncertain requirements with small diff, missing AC, unknown file type, stale test evidence and Human-required risk-map. Any quality/authority regression blocks promotion.
5. Missing ground truth, small samples, changing risk rules, or lack of matched counterfactuals => `INCONCLUSIVE`. New routing behavior requires separate versioned contract/tests/PR and Human approval.

Self-review: source reporting is not a validated benchmark; task nature is not risk; route is advice, not execution; Human-required never downgrades.
