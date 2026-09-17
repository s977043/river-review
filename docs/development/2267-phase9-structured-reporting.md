# #2267 Phase 9—Structured Reporting and Repeat-run Coverage

## Status

Phase 9 slice for #2267 (PR split item 7).

This slice is experimental and observe-only.
It adds no Gate behavior, no target-controlled execution, and no normal PR review change.
Phase 8 (independent final record verification) and Phase 12 (Gate integration) stay out of scope.

## What this slice adds

Two modules, each with one responsibility:

- `src/lib/security-audit-report.mjs` builds the machine-readable run record and projects the
  `.river/security-audit/` artifact set from it.
- `src/lib/security-audit-repeat-run.mjs` reconciles a repeat audit run against a prior run's coverage.

## Artifact layout

The Epic pins the layout, and `buildSecurityAuditArtifactSet` emits exactly it:

```text
.river/security-audit/
  run-metadata.json
  architecture.md
  audit-coverage.json
  candidates.json
  findings.json
  REPORT.md
  NEEDS-VALIDATION.md
```

`run-metadata.json` holds the run identity and target.
It also holds the execution policy, the evidence-state counters, the repeat-run summary, and the
record digest.
The three payload documents are split out of the same record.
No field is therefore written twice with a chance to disagree.

## The machine-readable record is the SSoT

`REPORT.md`, `NEEDS-VALIDATION.md`, and `architecture.md` are pure projections.
The renderers read fields; they classify nothing.

Consequences enforced in code:

- An unresolved finding carries no severity. `buildSecurityAuditRunRecord` rejects one that does,
  and the renderer has no fallback severity to substitute.
- An unknown evidence state is rejected rather than defaulted, so prose cannot invent a state.
- `0 findings` is printed as a count and is explicitly stated not to be a proof of safety.
- `recordDigest` content-addresses the record, so a rendered report can be tied back to the exact
  record it came from. It reuses `canonicalJson` and `sha256Hex`, the repo-wide hashing SSoT.

## Repeat-run coverage

The Epic DoD requires that a repeat run does not treat changed source as stale coverage.
`reconcileRepeatRunCoverage` implements that as a demotion-only reconciliation.

Carry-over of a prior `covered` unit happens only when all of the following hold:

1. the current run left the semantically matching unit in `planned`
2. the prior unit recorded a `sourceRevision`
3. the current run declares no different reviewed path set
4. every reviewed path has a caller-supplied content digest
5. the recomputed revision equals the recorded one

Anything else returns the unit to `planned` and adds an entry to `revalidationRequired` with one of:

```text
source_changed | source_digest_unavailable | reviewed_paths_changed | no_prior_source_revision
```

The function never promotes.
A prior unit that was `blocked`, `deferred`, or `out_of_scope` is not a carry-over source at all.
A repeat run therefore cannot launder an unresolved surface into coverage.

`deriveUnitSourceRevision` hashes the reviewed path set together with each path's content digest.
Both "this file changed" and "a different file set was reviewed" therefore move the revision.
A path with no supplied digest is recorded as `null` rather than skipped, so an unknown path can
never hash the same as an unchanged one.

The caller supplies the path to content digest map. This module reads no files, which keeps the
slice source-only and free of any target execution.

## Boundary against #1574

```text
Security repeat-run
= accumulated audit coverage of a target repository

#1574 Review Evolution Cycle
= improvement of River Review's own reviewer capability
```

The two never share state.

## Schema additions

- `schemas/security-audit-run-record.schema.json` is new. It embeds the Phase 3 coverage schema by
  `$id` rather than restating it.
- `schemas/security-audit-coverage.schema.json` gains two additive optional unit fields,
  `sourceRevision` and `carriedOverFrom`. Existing Phase 3 records stay valid without them.

## Follow-ups left open

- Writing the artifact set to disk has no caller yet. The audit entry skill describes the contract;
  wiring a CLI subcommand is deliberately deferred until Phase 8 settles the final record shape.
- `candidates.json` carries traceability fields only. Candidate state machine ownership stays with
  #1978 and `finding-critic.mjs`.

## References

- `docs/adr/010-security-audit-harness-integration.md`
- `docs/development/2267-phase3-security-audit-coverage.md`
- `schemas/security-audit-run-record.schema.json`
- `src/lib/security-audit-report.mjs`
- `src/lib/security-audit-repeat-run.mjs`
- `tests/security-audit-report.test.mjs`
- `tests/security-audit-repeat-run.test.mjs`
