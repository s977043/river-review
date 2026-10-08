# #2564 Phase 3—Host attempt-accounting preflight

> Status: experimental, read-only helper.
> Not a telemetry producer or production accounting ledger.
> Execution Strategy routing remains disabled.

## Purpose

`buildHostAttemptAccountingObservation()` is implemented in
`src/lib/execution-strategy-attempt-accounting.mjs`.
It evaluates an explicit Host declaration.
It does not fetch data or execute a strategy.
It cannot change a Gate or approve a pull request.
It has no network or filesystem side effects.

This helper is not connected to the default local runner.
A trustworthy Host strategy log and provider-attempt feed are not connected.
Tests establish deterministic validation behavior.
Fixtures do not prove real Host coverage or billing accuracy.
Fixtures do not demonstrate strategy improvement.

## Input boundary

The Host may supply `hostExecution`.
Its strategy is `single`, `cascade` or `critique`.
The source must be `host-execution-log`.
The Host may set `inventoryScope: 'complete'` to claim complete inventory.
This declaration is not independent attestation.

For wall time, the Host may provide `startedAtMs` and `endedAtMs`.
A nonempty `clockSource` is also required.

Each logical leg needs a unique `legId`.
The Host also declares `expectedAttemptIds[]`.
Each transport attempt requires an `attemptId` and a known `legId`.
A retry is another transport attempt.
A retry is not necessarily another logical leg.
Failed and cancelled attempts must remain visible.
The Host inventory must also cover fallback and escalation attempts.

Only an exhaustive declared match yields `host-declared-complete`.
A missing or duplicate attempt is incomplete.
Unexpected IDs are also incomplete.
Empty inventory cannot prove zero usage.

## Cost and latency

Cost is derived only from a matching Host inventory.
Every attempt must contain a finite nonnegative USD estimate.
Every attempt also requires a nonempty `pricingSource`.
Missing pricing evidence yields `totalEstimatedCostUsd: null`.
The status remains `host-estimate-unverified` even when a total exists.
A literal cost of zero remains a Host estimate.
It does not establish free execution.

Wall-clock time uses the Host run boundary.
Parallel leg durations are not added.
A missing or invalid run boundary produces `wallClockMs: null`.

The output omits transport IDs and provider names.
It also omits prompts and source diffs.
Credentials and raw Host records are never copied into the output.

## Adoption and ownership

Every output retains `inventoryTrust: 'unverified'`.
Every output retains `eligibleForAdoption: false`.
Every output retains `recommendationApplied: false`.
A Host-declared complete inventory is not trusted provider evidence.

Outstanding work in #2564:

1. Build a Host producer with a complete leg and attempt inventory.
   Record strategy identity and source provenance.
2. Reconcile usage and prices with separately trusted evidence.
   Check missing attempts and duplicated cost records.
3. Run the #1574 paired baseline/candidate evaluation.
   Use held-out tasks and an independently verifiable reviewer.
   Compare quality and coverage.
   Include costs and wall time.
   Measure human correction burden.
4. Enforce zero critical regressions.
   Verify budgets and Host execution boundaries.
   Require Human approval before considering adaptive routing.

This helper does not create a new persisted schema.
It does not replace existing review or execution artifacts.
The current exploratory recommender is still opt-in.
Enable it with `RIVER_EXECUTION_STRATEGY_SHADOW=1`.
