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

Source: [AIDLE Extended 2026 report, part 1](https://note.com/ai_dev_leaders/n/ndd23a2abf5be).
The article is an organizer's report, not a measured River Review benchmark.

The speakers describe three kinds of work:

- Exploratory tasks with unknown answers.
- Replication of patterns that have worked before.
- Known-solution tasks with testable acceptance criteria.

### Ownership boundaries

Task nature is a work-planning hint.
The existing `light | standard | team | human-required` mode is a diff-risk recommendation.
Task nature must never reduce required review depth.

- A known-solution change to auth, migration, or CI still follows risk-map policy.
- Exploratory docs changes do not automatically require a multi-agent team.
- Unknown task nature requires more evidence, not a lower review mode.
- A route suggestion is not executed coverage or approval.
- Human-required never becomes AI-only review or merge authority.

This document changes no runtime or contract.
Keep `src/lib/review-mode-router.mjs` and the current risk map as owners.
Keep the existing Flow, Agent contracts, and reviewer role ledger.
Do not add another enum or overwrite `recommendedReviewers`.
Do not execute `nextCommand` automatically.

### Docs-only review evidence (observed)

During PR #2715, the opt-in self-review workflow finished successfully.
It reported `No changes to review compared to main.`
This is **not** evidence that a reviewer inspected the new text.

The workflow uses `midstream`.
The current `buildLlmDiffView()` excludes `.md` in that phase.
Markdown is included for `upstream`, which was not run in this observation.
The reported no-op is consistent with that documented code path.
No `reviewCoverage` run artifact was uploaded.

Track the observability gap in #2396.
Do not count a successful no-op as review coverage or PR approval.
If document review becomes required, test `upstream` as a separate opt-in.
Changing the workflow default or gate requires its own approved change.

### Post-baseline evaluation candidate

Track with #2034, PlanGate #911, and DAT #93.

1. Annotate task type from Plan and AC before reviewing outcomes.
   Preserve unknown labels, disagreement, and source references.
2. Keep baseline review mode and verifier unchanged.
   Record task-nature advice in shadow mode before enabling an intervention.
3. Predeclare matched quality, coverage, escaped-defect, and cost outcomes.
   Use independent judgments where possible.
4. Include negative cases: protected migration and uncertain small diff.
   Also include missing AC, unknown file types, and stale test evidence.
5. Fail promotion on any Human-required downgrade or critical regression.
   Missing ground truth or unmatched comparisons mean `INCONCLUSIVE`.

Any new routing behavior requires a separate contract, tests, PR, and Human decision.
Source reporting is not proof of an effective routing policy.
