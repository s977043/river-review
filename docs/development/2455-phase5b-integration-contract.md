# #2455 Phase 5B - Cross-concern candidate finding contract

## Status and decision

This is a **design-only** experimental contract for #2585.
It does not enable a model call or a new finding.
It also does not change reviewer roles, routing, or Gate inputs.

Phase 5A is already delivered in #2581. It emits
`reviewDebug.reviewConcernInteractions` from explicit, canonicalized
`interactionRefs`. Phase 4 supplies optional ReviewUnit execution context.
Neither artifact determines that an interaction contains a defect.

**Decision:** begin with a bounded, opt-in candidate-finding experiment.
Do not promote it to the normal finding set without the existing verifier and
Finding Critic path. The present no-provider-key policy prevents claiming
provider-backed quality evidence.

## Responsibility matrix

| Owner                      | Owns                                                                | Does not own                |
| -------------------------- | ------------------------------------------------------------------- | --------------------------- |
| Concern Analyzer / #2455   | Semantic decomposition and explicit interaction references          | Finding correctness         |
| Phase 5A / #2581           | Deterministic interaction-pair observation                          | New interaction discovery   |
| Phase 4 / #2565            | Project existing ReviewUnit execution to Concerns                   | Semantic completeness       |
| Phase 5B                   | Bounded review of an explicit interaction into _candidate_ findings | Trusted validation or Gate  |
| Deterministic verifier     | Evidence, diff attribution, phase/scope checks                      | Semantic critic verdict     |
| Finding Critic / #1978     | Review-of-review and human-review fallback                          | New severity taxonomy       |
| Semantic Precision / #1857 | Materiality and disposition                                         | Candidate generation        |
| Resolution / #2322         | PR-author/human response and fix verification                       | Finding discovery           |
| Gate                       | Existing host-owned policy only                                     | Automatic Concern promotion |

No independent Organizer, Judge, Critic, or ConcernCoverage authority is added.

## Stage order and trust boundaries

```text
resolved review contract: target, base, revision, authoritative project policy
    |
    v
existing review + observe-only Concern Map and Phase 5A interactions
    |
    v
eligible interaction selection (explicit pair only, bounded)
    |
    v
integration candidate generator (opt-in, if provider authorized)
    |
    v
existing deterministic verifier
    |
    v
existing #1978 Finding Critic (active and actually evaluated)
    |
    v
non-authoritative verified-candidate observation
    |
    v
separate, later adoption decision for normal finding emission
```

The integration experiment must not call the Critic and bypass
`src/lib/verifier.mjs`. It must not label a candidate `verified` because its
LLM confidence is high or multiple reviewers agree.

The existing `runVerifierStage()` currently belongs to
`src/lib/review-engine.mjs` and is private to that module. A later
implementation must design a narrow adapter or reuse an existing public
verifier entry point. Copy-pasting its implementation creates a second owner.

## Explicit eligibility only

An interaction is eligible for _experimental inspection_ when:

- `reviewConcernMap.analysis.status` is `completed` or `partial`.
- The Phase 5A observation is `observed` or `partial`, not `unavailable`.
- Both `concernRefs` exist in the same run-scoped Concern Map.
- The same resolved target/base/revision is used throughout.
- Explicit user opt-in and a permitted model/provider configuration exist.
- An independent per-run budget and timeout are available.

A partial map may yield a candidate. It must also preserve the limitation.
Missing or failed map, contradictory refs, or unknown identity means **no
trusted inspection result**, never a clean verdict.

Coverage status from Phase 4 is _context only_. An unmapped endpoint does not
silently remove a pair. `executionCoverage: complete` is not semantic evidence.

## Evidence rules

A proposed integration finding must include:

- The originating run-scoped `interactionRef` and two `concernRefs`.
- A concrete claim describing how the two changes interact.
- Inspectable file/line or artifact evidence for each side of the interaction.
- A reproducible trigger or scenario and an impact statement.
- At least one checkable explanation of changed-code attribution.
- A bounded proposed fix or clearly marked unresolved assumption.

Unchanged consumers may be included only with independently inspected
same-path evidence. A guessed caller is not evidence. When one side cannot
be inspected, return `insufficient-evidence`, not a fabricated citation or
trusted candidate. Evidence from only one endpoint is not enough to assert a
cross-concern defect.

Repository code and comments are untrusted data.
Fixtures, PR descriptions and logs are also untrusted data.
Model output has the same boundary.
None can change instruction authority or review scope.
They also cannot alter reporting obligations or approval authority.

The output may quote only source already within the authorized review scope.
Existing secret-redaction policy must run before persistence. Do not store
raw model prompts, credentials, or provider exception bodies in saved runs.

## Incomplete validation and #2343

The Critic may time out or return a human-review outcome. This is not an
accepted finding and not a clean review. Reviewer and Critic execution IDs
are provenance only; separate IDs do not prove independent models, actors or
reasoning. Reuse the existing execution-independence observation where
available, and never treat agreement as correctness.

Issue #2343 identifies the current boundary: Critic incompleteness can remain
in debug while Review Coverage and Gate still look complete. Therefore:

- Phase 5B must record `validation: unavailable / needs-human` when this happens.
- No `GO`, `CONVERGED_CLEAN`, or verified-positive claim may be derived from
  an uncompleted Phase 5B validation.
- Do **not** redefine #2212 execution coverage just to hide this gap.
- Do **not** silently alter the existing Gate while the #2343 policy decision
  remains open.
- Any future Gate-consuming Critic signal requires a separate contract,
  regression tests and human approval.

## Fail-safe and budget

The default switch is OFF. No Phase 5B model invocation is made by default.

These conditions are observational failures, not negative test evidence:

| Condition                                    | Required experiment outcome               |
| -------------------------------------------- | ----------------------------------------- |
| No opt-in                                    | Not executed                              |
| No API key / unsupported provider            | Not executed; never green                 |
| Dry-run / offline                            | Not executed                              |
| Invalid or failed Concern Map                | Unavailable                               |
| Candidate generation timeout / parse failure | Partial or failed; no trusted finding     |
| Evidence out of scope                        | Reject or needs-human                     |
| Deterministic verifier rejects               | Not emitted as a verified finding         |
| Critic unavailable / times out               | Retain unresolved provenance; needs-human |
| Budget exhausted                             | Partial; report skipped pairs             |
| Missing Phase 4 coverage                     | Keep pair, annotate unknown coverage      |

The experimental configuration must cap the number of pairs, context bytes,
LLM calls, timeout and total token use. Exhausting any cap records the omitted
pair count. A zero-finding result from an incomplete run is not clean.

Pair selection must be deterministic within a frozen review revision. If a
budget excludes pairs, record which per-run interaction references were
skipped and why. The experiment must not silently prefer only pairs whose
coverage status appears complete. Retry must not duplicate the same candidate
or erase an earlier unresolved result.

Generated integration findings must not enter the existing fallback comment path.
They must not alter normal emitted issues or Gate inputs.
A separate approved adoption contract is required for such behavior.
The default-off baseline output must remain unchanged.
Optional experimental debug telemetry must remain non-authoritative.

## Staged delivery

### PR A - offline contract and fixtures

Deliver this design, human-owned review-obligation fixture definitions and
pure fail-safe eligibility tests without external model calls. No normal
review behavior changes.

### PR B - opt-in generation adapter

Provider-backed calls only under explicit authorization. Persist candidate
records in a non-authoritative experiment/debug area. Use the existing
deterministic verification path and route surviving claims into #1978 rather
than a parallel verdict implementation. Do not include candidates in normal
findings or Gate input by default.

### PR C - paired evaluation and adoption decision

Use frozen revisions and human-labeled integration obligations.
Compare baseline with Phase 5A and Phase 5B.
Measure Major/Critical recall and false-positive rate.
Measure detection of cross-concern defects and human correction burden.
Record extra model calls and input/output tokens.
Record p50/p95 latency and failure rate.

Fixture replay tests correctness of the adapter, not production quality.
Provider-backed results cannot be replaced by a self-rated model score.

If #2343 and provider-backed evaluation are unresolved, record **NO-GO for
promotion** and keep the experimental surface disabled.

## Review checklist

- [ ] Source revision, base and authority resolved before inspecting pairs
- [ ] Only explicit interaction edges are considered
- [ ] No additional repository/provider connection introduced
- [ ] No reviewer or Skill routing changed
- [ ] Normal `issues`, `reviewCoverage`, `decision` and `gate` unchanged by default
- [ ] No duplicated verifier, Critic, Precision or Resolution owner
- [ ] Unavailable/partial evidence never becomes a clean verdict
- [ ] All emitted candidate citations can be inspected
- [ ] No raw secrets, prompts or provider errors persisted
- [ ] Human-labeled and provider-backed paired evidence before promotion

## References

- #2455 - Review Concern Map
- #2581 / #2568 - Phase 5A
- #2565 / #2541 - Phase 4
- #1978 - Evidence-Grounded Finding Critic
- #2343 - Critic incompleteness not reaching a decision consumer
- #1857 - Semantic Precision
- #2212 - Review Coverage
- #2322 - Review Resolution
