# Review Mode Router adoption — contract baseline (#2034)

## Decision and scope

River Review is plugin-first for Claude Code and Codex. The **existing** deterministic
`src/lib/review-mode-router.mjs` recommends a review depth from changed files,
diff size and the repository risk map. It does not perform review, determine
finding truth, execute suggested commands, or grant merge authority.

Do not copy a second `.claude/commands` router from the source article.
Keep the classifier, risk map, reviewer-role selection and Flow contracts as
separate single sources of truth.

This slice adds `schemas/review-route.schema.json` and regression tests for
the **current** `river review route --format json` response. It changes no
default routing rule or runtime semantics. This schema is **Experimental**;
the CLI remains **Internal** under `pages/reference/stable-interfaces.md`.

## Existing architecture and ownership

| Surface | Responsibility |
| --- | --- |
| `src/lib/review-mode-router.mjs` | Pre-flow, deterministic depth recommendation |
| `src/lib/file-classifier.mjs` | Coarse changed-file classification |
| `src/lib/risk-map.mjs` | Repository-owned risk escalation and human-review requirement |
| `src/lib/reviewer-orchestrator.mjs` | Reviewer-role definitions and `selectRolesAuto()` |
| `schemas/flow.schema.json` | Runtime-independent ordering and execution protocol |
| `schemas/agent-contract.schema.json` | Logical agent roles and authority boundaries |
| `schemas/review-route.schema.json` | Experimental v1 route result; no executable policy |
| Review Artifact / Execution Manifest | Actual selected/executed/skipped work and provenance |

The router is a **pre-flow advisor**. It must not redefine judgment, reviewer
roles, skill selection rules, Flow thresholds, reviewer independence, or
human authorization. Plugin adapters may present its advice, but must not
silently turn it into execution or a passing gate.

## v1 contract

`selectedMode` is `light | standard | team | human-required`.
`confidence` describes the heuristic route, **not** the correctness of a
finding. `reasons` and `matchedTriggers` explain the decision.
`riskAction` retains the canonical risk-map action.
`nextCommand` is an untrusted **suggestion**, not a command to auto-run.

`recommendedReviewers` is currently `"auto" | "none"`: this is a legacy
hint consumed by existing flows. The actual reviewer list belongs to
`selectRolesAuto()`; it is not the same as completed Review Coverage.
Changing this field to an array would break existing consumers and must be
handled in a separate versioned contract/compatibility slice.

## Explicit next slices (not implemented here)

1. **Risk-trigger review:** compare dependency manifest/lock, CI workflow and
   generic config changes using a fixed test matrix. Keep existing risk-map
   `require_human_review` as the stronger decision. Do not simply escalate
   every configuration change.
2. **Explain roles without duplicate selection logic:** use
   `selectRolesAuto()` and its current auto-selection contract; introduce an
   additive role explanation or a versioned array response after checking
   plugin consumers and compatibility.
3. **Plugin-first route-first guide:** document a route recommendation as
   optional/advisory and preserve no-CLI skill execution. Neither Claude Code
   nor Codex may acquire new approvals via adapter behavior.
4. **Evidence-backed evaluation:** pair the same changed-file/risk cases
   under baseline and candidate routing; measure review coverage, misses,
   precision, cost, latency and added human escalations. Use existing
   Review Evolution (#1574), not another evaluation engine.

## Review checks for every follow-up

- Deterministic output with no API key; JSON conforms to its declared version.
- `human-required` cannot downgrade to a pure AI review.
- Routing recommendation cannot be mistaken for actual reviewer execution.
- Unknown/missing evidence does not become `pass` or `verified`.
- No duplicated role maps, Flow policy, authority, or new dependencies.
- Regression tests, formatter, markdown lint, exact-head CI and independent
  review must be green before any merge.

Related: #2011, #2034, #2054, #2213, #1545, #1574.
