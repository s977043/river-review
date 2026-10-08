# #2564 Phase 3—Host attempt-accounting preflight

> Status: experimental, read-only helper. Not a telemetry producer or
> production accounting ledger. Execution Strategy routing remains disabled.

## Purpose

`buildHostAttemptAccountingObservation()` in
`src/lib/execution-strategy-attempt-accounting.mjs` evaluates an **explicit
Host declaration**. It never fetches data, executes a strategy, calls a
provider, changes a Gate, writes files, or approves a PR.

This helper is not wired to the default local-runner path because there is
currently no trustworthy Host strategy and transport-attempt feed. Fixture tests
only establish deterministic validation behavior, **not** real Host coverage,
provider completeness, price accuracy, or strategy improvement.

## Input boundary

The Host supplies an optional `hostExecution` declaration containing:

- `source: 'host-execution-log'` and `actualStrategy: single | cascade | critique`
- `inventoryScope: 'complete'`, meaning the Host **claims** the supplied
  inventory covers the run. This string is not independent attestation.
- Optional run-level `startedAtMs`, `endedAtMs`, `clockSource` for wall time

The Host must also supply non-empty, unique `legs[].legId`,
`expectedAttemptIds[]`, and `attempts[]` with unique
`attemptId` and known `legId`. A leg is one logical operation; an attempt
is one provider transport request. A retry is another attempt, **not
necessarily** another leg. Failed, cancelled, retry, fallback and escalation
attempts are required in the Host's declared inventory.

Only a matched declaration returns `status: 'host-declared-complete'`.
The helper cannot assert a provider actually reported every request.
Missing/duplicate/unexpected IDs or unknown scope return `incomplete`.
An empty inventory cannot assert zero usage without independent evidence.

A cost estimate is returned only when the claimed inventory is complete and
every attempt has a finite nonnegative USD estimate and non-empty pricing
provenance. Missing price/currency/provenance makes total cost `null`.
Estimated costs remain `host-estimate-unverified`. A literal `0` is only a
Host-declared estimate, not proof of free execution.

Wall-clock duration comes only from the Host's run-level clock boundary;
parallel leg durations are never added. Without a valid Host time boundary,
`wallClockMs` is `null`.

The output deliberately omits attempt IDs, provider names, prompts, diffs,
credentials and other raw Host payloads.

## Adoption and ownership

Every result has `inventoryTrust: 'unverified'`,
`eligibleForAdoption: false` and `recommendationApplied: false`.
Even a `host-declared-complete` result is **not** a trusted verified witness.

Remaining work for #2564:

1. A Host producer with correlation IDs, complete leg/transport attempt
   inventory, provider usage and pinned pricing provenance.
2. A separately trusted reconciliation step for coverage and pricing.
3. Paired baseline/candidate replay with held-out cases and independent
   verifier as specified by #1574, including quality, coverage, costs, latency,
   and human correction burden.
4. `critical regression = 0`, explicit budget checks and Human approval
   before any Host-side adaptive strategy could be considered.

This helper does not create new persisted schema or replace the existing
review/execution artifacts. The existing debug-only exploratory recommender
remains opt-in via `RIVER_EXECUTION_STRATEGY_SHADOW=1`.
