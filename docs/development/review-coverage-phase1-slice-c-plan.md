# Review Coverage Phase 1 / Slice C—File Scope Ledger

Issue: #2212

## Goal

Add a deterministic, observe-only file-scope ledger to Review Coverage so an operator can distinguish:

- files selected into the LLM-facing `filesForReview` view;
- files excluded from that LLM-facing selection scope;
- why a changed file is absent from that scope.

This slice does **not** change Gate, decision, auto-approve, or Human Review policy.

## Current boundary

Review Coverage already records `reviewer role × diff chunk` execution units and their outcomes. The remaining Phase 1 gap is that a consumer cannot reconstruct the LLM-facing file-selection scope alongside those execution observations.

Two existing boundaries affect that selection:

1. configured exclusions: `config.exclude.files` in `local-runner.mjs` removes matching paths from the local review diff before review processing;
2. LLM diff optimization: files absent from `filesForReview` are omitted from generated review prompts. They remain available to deterministic review logic through raw `diff.files`.
   Examples include documentation, lock files, generated `dist/` output, or changes whose hunks are removed by the optimizer.

The ledger must describe this selection scope as selection, not as file-level execution coverage. It must also not imply that optimizer-excluded files are invisible to all review processing.

## Compatibility with #2230

Current `main` preserves the optimized `filesForReview` scope across reviewer chunking via #2230. Slice C observes that scope and does not reimplement chunking or diff optimization.

Final verification must run on a branch current with #2230. This pins selection telemetry to the same LLM-facing scope used when review prompts are constructed.

## Contract

Add an optional `fileScope` property to `reviewCoverage`:

```yaml
fileScope:
  selected:
    - src/app.mjs
  excluded:
    - path: docs/notes.md
      reasonCode: diff_optimization
    - path: fixtures/generated.json
      reasonCode: configured_exclusion
```

Closed reason vocabulary for this slice:

- `configured_exclusion`: matched `config.exclude.files` and was removed from the local review diff before review processing;
- `diff_optimization`: remained after config filtering but was not present in the LLM-facing `filesForReview` set. Deterministic review logic may still inspect it through raw `diff.files`.

`selected + excluded` reconstructs the raw changed-file set relative to these two filtering boundaries. Order follows the original changed-file order and duplicate paths are removed in first-seen order.

## Why no `coveredFiles` field yet

A file can appear in multiple Review Units because execution is `reviewer role × diff chunk`. Deterministic review logic can also inspect raw files that the LLM-facing optimizer omitted. A simple file-level `covered` boolean would therefore need policy about required vs optional reviewers, deterministic processing, and partial failures. That is Gate-adjacent semantics and is intentionally deferred.

Execution completion remains represented by Review Units. `fileScope` only records LLM-facing selection scope.

## Implementation

1. `local-runner.mjs`
   - derive file scope at the boundary where raw repo diff, optimized LLM-facing diff, and configured exclusions are all available;
   - keep the derivation pure and deterministic;
   - carry the ledger in the planned context;
   - when reviewer orchestration produced Review Coverage, attach the ledger without recomputing counters/status/units;
   - single-reviewer path continues to omit `reviewCoverage`.

2. `schemas/review-coverage.schema.json`
   - add optional `fileScope`;
   - keep existing artifacts valid;
   - use closed reason codes and `additionalProperties: false`.

3. Documentation
   - update the Review Coverage contract to distinguish Review Unit execution coverage from LLM-facing file selection scope;
   - keep the surface Experimental.

4. Tests
   - configured exclusion is recorded with `configured_exclusion`;
   - optimizer-only exclusion is recorded with `diff_optimization`;
   - selected/excluded form a deterministic partition with no overlap;
   - schema accepts the new ledger and rejects unknown reason codes;
   - existing Review Coverage without `fileScope` remains valid;
   - Gate/decision remains untouched.

## Non-goals

- no Gate integration;
- no `REVIEW_COVERAGE_INCOMPLETE` reason code;
- no file-level completion/coverage percentage;
- no new LLM calls or tool/network permissions;
- no change to optimizer behavior;
- no Markdown/YAML/HTML rendering in this slice;
- no `skipped` / `unrunnable` Review Unit status.

## Verification

Required before completion:

- branch current with `main`, including #2230;
- focused tests for scope derivation and Review Coverage schema;
- existing Review Coverage runtime/surface tests;
- repository CI required checks;
- generated GitHub Action dist fresh;
- unresolved blocking review threads = 0.

## Mandatory multi-perspective final review

Before this task is considered complete, review the latest PR head from these independent perspectives and address blocking findings:

1. Architecture / responsibility boundaries;
2. Contract / schema SSoT;
3. Reliability / deterministic partitioning;
4. Backward compatibility;
5. Security / trust boundary;
6. Operations / packaging and observability;
7. Testing / regression and CI.

Completion requires blocking findings = 0 after any fixes.
