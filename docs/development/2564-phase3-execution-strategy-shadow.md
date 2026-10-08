# #2564 Phase 3—Execution Strategy shadow observation

> Status: observe-only experimental implementation.
> No production strategy routing is introduced.
> No public JSON Schema or Gate authority is added.
> Provider budget enforcement and candidate-generation orchestration are not added.

## Scope and opt-in

The Host owns Single / Cascade / Critique **execution**. River Review owns
review coordination and evidence. They are different routing decisions.

Use `RIVER_EXECUTION_STRATEGY_SHADOW=1` to enable a debug-only recommendation.
It is emitted by `runLocalReview` for a planned non-empty diff. The default is OFF.
The `executionStrategyShadow` observation is never used by reviewer or Skill selection.
It also never changes planning, findings, Review Coverage or Gate.

The pure evaluator lives in `src/lib/execution-strategy-shadow.mjs`.
`local-runner.mjs` only passes already-planned signals. No extra model or tool
is invoked. Tests compare default-off and opt-in outputs with the observation
removed, ensuring identical review results.

## Deterministic exploratory rules

Current `heuristicVersion` is `exploratory-v0`. These thresholds are
provisional experiment hypotheses, **not validated quality or cost gates**.

- `require_human_review`: no strategy recommendation; human authority remains.
- Explicit independent-review need, risk `escalate`, or three observed
  concerns: recommend `critique`.
- High uncertainty, at least five changed files, or 8,000 estimated diff
  tokens: recommend `cascade`.
- A limited non-empty diff can receive a provisional `single` recommendation.
  The existing deterministic risk result must explicitly be `comment_only`.
  This is **not** a security or risk clearance.
- No usable evidence: return `no-recommendation`.

Missing risk-map evidence remains `null`, adds `risk-not-classified`, and never implies `single`.
A failed Concern Map never counts as zero observed concerns. No raw file path,
prompt, diff, or credential is copied into the observation.

## Actual versus recommended

`recommendedStrategy` is **never executed**. The output always has
`recommendationApplied: false`.

`actualStrategy` stays `null` in the current local-runner integration.
The pure evaluator only accepts a declared actual strategy when accompanied by
`actualStrategySource: 'host-execution-log'`. The result still says
`trust: 'unverified'`: a string tag alone does not establish trusted
provider execution evidence. Any comparison is marked `exploratory`.

Cost and latency budgets are not wired from the current Host. Missing values
remain `null`. Existing dispatcher usage and reviewer duration metrics are
**not** treated as complete multi-leg accounting.

## Required follow-up before adoption

- Acquire a reliable Host strategy log, leg and provider-attempt inventory, and
  an explicit comparison time window. Unobserved actual strategy is not a
  negative result or a baseline match.
- Validate the exploratory heuristics with #1574 paired replay on held-out cases.
  Pin the model and prompt. Pin the Skill, context and evaluator.
- Measure quality and required review coverage.
  Measure cost and wall-clock latency with provenance.
  Include human correction burden.
  Never infer zero cost from missing telemetry.
- Confirm isolated review with independent tool/context evidence, not only
  distinct execution identifiers.
- Keep `critical regression = 0` as a floor and require Host/Human approval
  before any opt-in adaptive strategy execution.
- Stop or revise if the shadow recommendation threatens an existing Gate or
  deterministic routing contract.

**No-go:** Phase 3 shadow outputs cannot authorize Phase 5 adaptive routing.
They cannot authorize extra provider calls or patch changes.
They do not authorize merges or releases.

## References

- [#2564 issue](https://github.com/s977043/river-review/issues/2564)
- [Phase 2 design](2564-phase2-execution-strategy-guardrails.md)
- [Model + Harness screening](1574-model-harness-evolution-screening.md)
- [Review planning bridge](2455-phase3-review-planning-bridge.md)
