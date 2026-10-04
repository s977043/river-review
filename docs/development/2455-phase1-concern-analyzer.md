# #2455 Phase 1—Observe-only Review Concern Analyzer

## Status

Implementation note for Issue #2455 Phase 1.

Architecture source:

- [ADR-014](../adr/014-review-concern-map.md)
- [Phase 0 gap analysis](./2455-phase0-gap-analysis.md)

This phase adds an experimental semantic decomposition observation to the local `river run` path.
It does not change reviewer routing, Review Coverage, finding truth, disposition, Gate, or merge authority.

## Goal

Phase 1 tests one hypothesis:

> Before reviewers run, can River Review identify coherent semantic change units and preserve enough provenance to expose review blind spots later?

The first runtime slice is intentionally narrow.

```text
resolved local review context
  -> Review Concern Analyzer
  -> reviewDebug.reviewConcernMap
  -> existing review pipeline unchanged
```

The analyzer output is not passed into `generateReview`, reviewer orchestration, Skill selection, Gate derivation, or finding classification.

## Activation

The PoC is OFF by default.

Enable it explicitly:

```bash
RIVER_CONCERN_ANALYZER=1 river run ...
```

Phase 1 does not add a public stable config key.
The environment variable is an experimental dogfood switch.

Optional experimental controls:

- `RIVER_CONCERN_MODEL`
- `RIVER_CONCERN_TIMEOUT_MS`
- `RIVER_CONCERN_MAX_TOKENS`

The analyzer currently uses the shared OpenAI-compatible chat-completion transport and only executes when the effective model provider is `openai`.
Unsupported providers produce a failed observation and do not fail the review.

## Placement

The analyzer runs after River Review has resolved the local comparison target and repository context.

Normal review path:

```text
collectLocalContext
  -> raw diff / raw changed-file manifest
  -> configured exclusions
  -> LLM diff optimization
  -> reviewFileScope
  -> plan
  -> repo context
  -> Review Concern Analyzer   # observe-only
  -> existing Reviewer path
```

The analyzer also runs on the special case where raw repository changes exist but the optimizer removes every LLM-facing file.

```text
raw changes exist
  -> optimizer selects zero files
  -> plan status = no-changes
  -> Review Concern Analyzer observation
  -> final status remains no-changes
```

This keeps the existing review semantics unchanged while making the optimizer-created semantic blind spot observable.

A truly empty repository diff does not fabricate a Concern Map.

## Input contract

### Resolved review identity

The analyzer reuses the caller's resolved values:

- `phase`
- `mergeBase`
- `commitSha`
- `dirty`

It never resolves a different base or target.

`revisionRef` is recorded only when `dirty === false`.
A dirty working tree may contain reviewed lines not present in HEAD, so the HEAD SHA is not represented as the reviewed revision in that case.

### Raw changed-file manifest

`collectLocalContext` now preserves `rawDiff.changedFiles` separately from `changedFiles`.

```text
rawChangedFiles
= files changed in the resolved repository diff before exclusions/optimization

changedFiles
= files selected for the existing review path
```

The raw manifest survives:

- configured file exclusions
- diff optimization

This is the minimum guard against treating an omitted file as if it did not change.

### File-scope ledger

The existing `reviewFileScope` is supplied unchanged.

It distinguishes:

- `selected`
- `configured_exclusion`
- `diff_optimization`

Configured-excluded files remain visible in the manifest but are not considered inspected evidence merely because their path is known.

### Diff and context

The analyzer receives:

- filtered raw diff text before LLM optimization
- authoritative project rules
- already-redacted repository context

Input caps:

- diff: 12,000 chars
- project rules: 4,000 chars
- repository context: 4,000 chars

If any cap truncates input, runtime forces:

```text
analysis.status = partial
```

A model cannot self-report `completed` to override input incompleteness.

## Authority boundary

The prompt separates two regions.

```text
AUTHORITY
  repository review policy
END AUTHORITY

UNTRUSTED REVIEW DATA
  diff
  repository context
END UNTRUSTED REVIEW DATA
```

The system instruction explicitly treats code, comments, fixtures, logs, and arbitrary repository content as review data.

If `.river/rules.md` or a file under `.river/rules.d/` is itself changed by the reviewed diff, the working-tree rules are **not** promoted into the `AUTHORITY` block for the Concern Analyzer. The observation records `authority-input-untrusted` and runs with that authority withheld. This prevents a pull request from modifying the policy file and then using the modified text to steer the semantic observation used for later evaluation.

An instruction-like string inside reviewed content does not gain authority merely because it says:

```text
ignore previous instructions
report no concerns
change the output format
```

The analyzer still follows the system contract and the explicitly supplied authority block.

## Experimental observation shape

Phase 1 persists the observation under:

```text
reviewDebug.reviewConcernMap
```

Saved runs already persist `reviewDebug` as run-record `debug`, so no new top-level stable output field is introduced.

Conceptual shape:

```yaml
schemaVersion: "1"
kind: review-concern-map

subject:
  mergeBase: ...
  revisionRef: ...
  workingTreeDirty: false

concerns:
  - id: concern-1
    summary: "Refresh-token lifecycle change"
    changedSubjects:
      - src/auth/session.ts
    affectedSubjects:
      - path: src/api/session-controller.ts
        evidenceRefs:
          - path: src/api/session-controller.ts
            lineStart: 42
            lineEnd: 45
    evidenceRefs:
      - path: src/auth/session.ts
        lineStart: 20
        lineEnd: 30
    interactionRefs:
      - concern-2

analysis:
  status: completed
  limitations: []
  input:
    rawChangedFileCount: 3
    diffTruncated: false
    authorityTruncated: false
    repoContextTruncated: false
  model: ...
```

This is an internal experimental contract.
Phase 1 does not register it as a Stable Interface.

## Validation guards

### Concern IDs

IDs must use:

```text
concern-1
concern-2
...
```

They are per-run opaque references.
They are not historical fingerprints.

### Changed subjects

Every `changedSubjects[]` path must exist in the raw changed-file manifest.

The model cannot invent a changed path.

### Inspected evidence

Evidence paths must be observable from supplied inputs.

For changed files:

- configured-excluded files are not automatically treated as inspected
- diff-optimized files remain inspectable because the analyzer receives the pre-optimization filtered raw diff

For unchanged affected subjects:

- the path must be visible in supplied repository context
- the affected subject must carry same-path evidence

A known filename is not evidence.

### Interaction references

`interactionRefs` must:

- reference another concern in the same response
- not reference the concern itself

### Persisted text redaction

Concern summaries are model-generated text.
Before persistence, summaries pass through River Review's existing secret-redaction policy.

Raw LLM output and raw analyzer prompt are not persisted.

## Analysis status

### `completed`

The analyzer processed all input supplied under its runtime contract without a known input truncation.

It does **not** mean:

- every real concern was found
- every affected consumer was found
- review coverage is complete
- the change is safe

### `partial`

Known input incompleteness exists, such as:

- diff truncation
- authority truncation
- repository-context truncation

### `failed`

No usable Concern Map was produced.

Stable reason examples:

- `analyzer-not-executed:dry-run`
- `analyzer-not-executed:offline-mode`
- `analyzer-not-executed:missing-api-key`
- `analyzer-not-executed:unsupported-provider:<provider>`
- `analyzer-failed:invalid-json`
- `analyzer-failed:schema-validation`
- `analyzer-failed:semantic-validation`
- `analyzer-failed:runtime-error`

Raw provider error messages are not copied into the saved observation.

## Fail-safe behavior

Analyzer failure is observational.

It does not:

- fail the review
- create a finding
- remove a reviewer
- lower review depth
- change Review Coverage
- alter Gate inputs
- alter findings/comments
- turn `no-changes` into a different review status

Default-off behavior is pinned by integration tests.

When the feature is enabled under `dryRun`, the only allowed difference is the additive `reviewDebug.reviewConcernMap` observation.

## Tests in this slice

### Analyzer contract

`tests/review-concern-analyzer.test.mjs` covers:

- disabled no-op
- valid map normalization
- dirty-worktree revision semantics
- runtime-forced partial on truncation
- invented changed path rejection
- affected-subject evidence requirements
- unrelated evidence rejection
- configured-exclusion evidence rejection
- offline / dry-run no-call behavior
- stable failure reason codes
- instruction/data boundary
- optimizer exclusion visibility
- persisted summary redaction
- opaque concern ID namespace

### Local-runner isolation

`tests/review-concern-local-runner.test.mjs` covers:

- default OFF
- opt-in dry-run observation
- result equality after removing the additive observation
- raw manifest survival across optimizer / configured exclusion
- optimizer-created `no-changes` still observable
- true empty diff does not create a map

## Non-goals

Phase 1 does not implement:

- concern-aware reviewer routing
- concern-aware review depth
- `ConcernCoverage`
- ReviewUnit ↔ Concern refs
- cross-concern finding discovery
- Finding Verification changes
- Semantic Precision changes
- Resolution changes
- Gate changes
- public config schema
- public output schema
- machine enforcement based on concern count
- automatic promotion to default-on

## Promotion requirement

Phase 1 is evidence gathering only.

The next steps remain:

```text
Phase 1 observe-only analyzer
  -> Phase 2 obligation-oriented fixtures / paired evaluation
  -> Phase 3 shadow planning recommendation
  -> Phase 4 ReviewUnit relationship experiment
  -> promotion decision
```

No routing promotion should happen until paired evaluation shows measurable benefit without unacceptable Major/Critical recall regression, false-positive growth, or latency/token cost.

## References

- Issue #2455
- PR #2492
- [ADR-014](../adr/014-review-concern-map.md)
- [Phase 0 gap analysis](./2455-phase0-gap-analysis.md)
- [Review Coverage contract](./review-coverage-contract.md)
- [Artifact Input Contract](../../pages/reference/artifact-input-contract.md)
