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
