# PR risk factors shadow: evidence boundaries

This is an offline experiment for issue #2781, not a production Gate or an
approval policy. The existing Risk Map, Review Mode Router and reviewer roles
remain their respective sources of truth.

## Input qualification

All observations remain caller-reported, even when their structure and revision
match. A reference is not authenticated evidence; matching file names is not
proof that the code or its behavior was reviewed.

- `subject.headSha` must be a string containing exactly 40 hexadecimal characters.
  The report returns only this sanitized subject, or `headSha: null` when invalid.
- `change.headSha`, `route.headSha` and each evidence axis must exactly match that
  subject. Stale or malformed observations cannot qualify the current revision.
- `route` consumes the existing router vocabulary: `selectedMode` and `riskAction`.
  A reported human requirement imposes a high floor; team or escalation imposes
  at least medium. Missing, stale or invalid routing evidence makes the assessment
  incomplete. A known stronger requirement is retained if another field is invalid.
- `verification` can be `reported-complete` only with passed checks, complete
  coverage, a nonblank `evidenceRef` and `checkedFiles` matching the entire current
  change manifest. Order does not matter; duplicates, omissions and extra files do.
  `checkedFiles` describes the claimed verification scope, not semantic coverage.
- Failed checks retain their high floor even without a reference or scope. This
  conservative negative signal is still reported, never independently verified.
- Manifests have at most 500 unique repository-relative paths, each at most 4096
  JavaScript string code units. C0/DEL characters, backslashes, traversal segments,
  empty entries and sparse arrays are rejected. Valid Unicode names remain allowed.

## Experimental compatibility

This tightens the experimental v1 input qualification. Existing callers without
`route`, `verification.evidenceRef` or `verification.checkedFiles` now receive
`assessmentStatus: incomplete`. They must supply actual observations, not invent
successful defaults to restore a reported result. Production schemas are unchanged.

`riskFloor` is a lower bound, not a final risk classification or permission.
An incomplete observation may still have a low floor; that does not make it safe.
Every output retains `authorizesApproval: false` and
`evidenceTrust: unverified-input`. Unknown evidence is never filled with success.

The explicit policy-path floor covers the existing JSON/YAML configuration forms
in `src/config/loader.mjs` and `.river/rules.md`. Example files and similarly named
documents are not automatically policy changes. Custom policy paths must be
represented through the existing caller/router policy rather than guessed here.

## Reproducible validation

From the repository root with Node 22:

```bash
node --experimental-test-isolation=none --test tests/pr-risk-factors-shadow*.test.mjs
node --test --experimental-test-coverage tests/pr-risk-factors-shadow*.test.mjs
```

### Execution record: 2026-11-03

Baseline: main `5023c57bf5f51e688925d54587eb1d4dc1a5f90e` (1.138.1).
The four baseline files were fetched through GitHub and matched to their Git blob
hashes in an isolated Node 22.16.0 workspace. A full clone was unavailable because
DNS resolution failed. These local results cover the isolated subset, not a full
repository install, full lint or an independent reviewer.

| Cycle | Validation and review | Correction and rerun |
| --- | --- | --- |
| 1 | Baseline 15 passed; revision tests added, 2 failed | Strict SHA identity and sanitized output; 17 passed |
| 2 | Route tests added, 4 failed | Preserve reported policy floors and unknown routing; 21 passed |
| 3 | Verification scope tests added, 3 failed | Require reference and exact current scope; 26 passed |
| 4 | Boundary tests added, 2 failed | YAML/rules policy paths and malformed manifests; 30 passed |
| 5 | Final regressions, coverage and contract review | 34 passed; clarified lower-bound/unverified semantics; no further behavior fix required |

The final suite includes 360 deterministic policy combinations, repeated-output
and input-immutability checks. The isolated assessor reached 100% line, branch and
function coverage in that run. These synthetic checks are not human-labeled
precision/recall measurements or incident benchmarks.

Independent coding-subagent execution: **NOT_EXECUTED**. No active dispatcher or
local Claude/Codex executable was available. Full-repository lint/test, external
review comments and merge readiness must be established on the actual PR HEAD by
GitHub CI and the existing repository governance; this note does not assert them.

Human-confirmed incident labels, source-artifact authenticity, semantic alignment,
and controlled production integration remain open under #2781 and #2701.
