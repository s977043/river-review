# Incident / Revert-grounded Reviewer Benchmark: Phase 0

> Status: reviewed proposal for #2701, not a collected benchmark.  
> Owner of execution and paired replay: #1574.  
> Owner of Human feedback and outcome: #2322 / #2575 / #2615.  
> Owner of attention measurements: #2378.  
> Runtime impact: none. No new schema, evaluator, model call, or mandatory gate.

## Decision

Reuse existing saved review runs and `river evolve replay`.
Treat incident/revert evidence as a **separately verified evaluation oracle**.
Do not infer a true bug from a revert, merged PR, review comment, or fingerprint.
A reviewer does not certify its own ground truth.

Phase 0 prepares a bounded, human-confirmed case list.
No historical incidents were collected or independently confirmed in this PR.
Do not report a zero miss rate when no eligible cases exist.

## Existing owners and actual gaps

- `src/lib/paired-replay.mjs` derives case identity from explicit `caseId`,
  or `reviewedTarget@mergeBase`. It pairs baseline and candidate by finding
  fingerprint. It does not execute LLM reviewers or inspect incidents.
- `schemas/paired-replay.schema.json` keeps an immutable Experiment Manifest.
  Its run evidence is self-reported and untrusted by default.
  `acceptance.decision` is not an adoption approval.
- `src/lib/replay-verification.mjs` and
  `docs/development/1574-p3-signed-replay-verification.md` cover separately
  supplied verifier attestations. A digest alone does not authenticate an actor.
- `schemas/review-resolution.schema.json` records finding disposition,
  author response, resolution, and targeted verification.
  `src/lib/review-resolution-feedback.mjs` only proposes feedback.
  The Host owns authentication and approval; a PR merge is not Human feedback.
- `docs/development/2378-human-attention-evaluation-contract.md` evaluates
  decision presentation and material visibility. It does not measure whether a
  reviewer found an actual bug. Its fixtures are not incident cases.
- `docs/development/1574-model-harness-evolution-screening.md` requires
  Model + Harness attribution. Model-only attribution is invalid when the prompt,
  Skill or source revision changes. Changes to context or evaluator also matter.

**Missing from the current replay:** authorized incident source selection and
pre-fix bug oracle. Evidence must establish the defect at the reviewed revision.
The incident corpus also needs confirmed negative cases and independent bug
adjudication. Review round counts and actual cost must be measured separately.

These are **input/evaluation process gaps**, not reasons to create a parallel
Review Resolution database or change the existing replay schema.

## Case eligibility contract (operator checklist)

An operator explicitly selects the incident/revert and receives permission to
use the evidence. Start with five to ten cases and expand only after quality
and execution cost are reviewed. Selection does not equal confirmation.

For **each** proposed positive case, collect and independently review:

1. A stable, non-sensitive `caseId` and authorized incident reference.
   Store source access restrictions separately from shared evaluation data.
2. Exact repository, **bug-introducing revision**, PR/diff and merge base.
   Record original review timestamp and the diff scope visible at that time.
   A fix commit is separate from the pre-fix snapshot under review.
3. Record expected and actual behavior with affected code and reproduction
   evidence. Confirm impact and severity. Explain how the incident establishes
   the failure. An unexplained revert is insufficient.
4. **Before-review visibility**: establish whether the reviewer could see
   the defective lines and relevant evidence at that time. Record `reviewable`,
   `not_reviewable` or `unknown`. Do not grade hindsight-only discoveries
   as an ordinary reviewer miss.
5. Human-confirmed expected detection and location references, independent
   verifier/decision reference, confirmation time, and evidence digest.
   A self-reported reviewer verdict is not confirmation.
6. Whether the case has been used to tune a candidate, plus the proposed
   `development` or `held_out` partition. Separate held-out cases before
   changing prompts or thresholds.

For **clean negative cases**, require an independently supported absence of
the particular class of defect within the reviewed scope. No reported
incident is _not_ proof of a clean change. Record the scope and limitations
of the negative adjudication.

Use `unknown` or `ineligible` if the source or evidence is unavailable.
This also applies to unverified labels and uncertain author identity.
Mark unreviewable diffs and unclear chronology as ineligible or unknown.
Do not treat those records as true or false negatives.

### Review worksheet (not a new persisted schema)

```yaml
caseId: CASE-REDACTED-001
sourceRef: access-controlled-reference
sourceDigest: sha256-of-sanitized-evidence
bugIntroducingCommit: verified-full-sha
reviewedTarget: verified-repo-and-revision
mergeBase: verified-full-sha
fixEvidenceRef: independently-checked-reference
reviewVisibility: unknown
oracle:
  status: pending_human_confirmation
  findingLocation: not_recorded
  expectedSeverity: unknown
  adjudicatorRef: not_recorded
partition: unassigned
```

The worksheet is illustrative. These keys are **not** additions to
`schemas/paired-replay.schema.json` or an automatically accepted replay spec.
Do not save private postmortems, credentials, personal data, or full internal
PR threads to a public repo.

## Mapping to existing paired replay

1. Approve and freeze eligible case identities and positive/negative labels
   **outside the candidate-controlled repository**.
2. Save baseline and candidate review runs via existing execution paths.
   Freeze the pre-fix code and merge base for each paired case. Keep source
   scope and context equivalent. Record tools and prompt/Skill digests.
   Freeze evaluator and execution budget. Disclose any difference as a
   **joint Model + Harness** comparison.
3. Supply the matching `caseId` for both saved runs. When using derived case
   keys, verify the exact `reviewedTarget@mergeBase` identity.
   Do not pair by array index, PR title, or review creation time.
4. Predeclare `dataset.heldOutCaseKeys` from case keys that are present on
   both sides. The replay implementation rejects one-sided held-out keys;
   that is an integrity check, not proof that ground truth exists.
5. Use `river evolve replay --spec <verified-spec.json> --output json`
   after both run sets exist. Replay is read-only and runs no LLM.
   Check manifest integrity and activation. Report `unpairedCaseCount`.
   Check missing evidence and runtime failures separately.
   Zero paired cases means **inconclusive**.
6. Separately match findings to independently labeled bugs. Fingerprint
   additions/removals and `criticalRegressionCount` alone do **not**
   establish true positives, recall, precision, or bug severity.
7. Keep `acceptance.decision` and promotion under their existing Human
   authority. Neither a CLI exit code nor a signed replay artifact grants
   automatic adoption.

## Scorecard and denominators

Report **per arm**, per trial and for the same fixed evaluation window:

- **Eligible positives**: number of confirmed, reviewable bug cases.
  **Detected positives**: those cases with independently matched findings.
  Recall = detected / eligible. Multiple findings for one bug count once.
- **Eligible clean negatives**: independently labeled clean cases.
  **Harmful false-positive cases**: eligible negatives with an adjudicated
  harmful finding. Rate = harmful cases / eligible clean negatives.
- **Finding precision**, if a complete adjudicated finding set exists:
  confirmed correct findings / adjudicated findings. Also report
  unadjudicated findings; never discard them to improve precision.
- **Critical / major misses**: separately count eligible labeled bugs that
  an arm failed to detect or materially downgraded. No numeric claim if
  detection or severity matching has not been independently checked.
- **Coverage and execution**: record completed and failed reviews.
  Report timeouts and unexecuted units separately. Count unpaired cases.
  Track ineligible and held-out cases. Record contaminated or undecidable cases.
  Missing runs are not clean outcomes or successful reviews.
- **Efficiency**: measure tokens and actual cost when available.
  Include latency and retry count. Record verified review rounds only
  when Host evidence exists.
- **Human Attention**: use a separately documented Host-backed observation.
  Do not infer human minutes or rounds-to-pass from number of PR comments.

For every rate, retain numerator, denominator, and sampling window.
An empty denominator is **N/A**, not zero. Report exact evaluated case IDs
and dropped-case reasons using non-sensitive references.

Do not mix the existing presentation-only Human Attention dataset with bug
discovery accuracy. No single aggregate score may hide critical misses.

## Evaluation and leak controls

- Include positive and clean negative examples. Start with a small smoke
  sample; five to ten cases cannot establish statistical superiority.
- Freeze the held-out set before tuning. Neither candidate prompt nor
  provider tool context may access labels, later fixes, or private
  postmortems. Verify context boundaries at execution time.
- Use the same evaluator and independent oracle for both arms.
  Candidate authors may not self-adjudicate their own findings.
- Multiple trials capture reviewer variability. Record model and version.
  Store effort and configuration. Include prompt/Skill and context digests.
- Stop or classify as `blocked` if provider execution or authenticated
  provenance is unavailable. Do not fabricate a run, model identity, cost,
  or reviewer activation to complete a comparison.
- Stop the adoption assessment on critical or major detection regression.
  Halt for increased harmful false positives or privacy exposure.
  Uncontrolled spend and evidence contamination are also blockers.
  Adoption decisions belong to the authorized Human.

## Phase 0 disposition / next executable work

**Supported now:** field mapping and read-only replay boundaries.
Human confirmation and negative-case criteria are documented. Denominators
and experiment stop/recovery rules are specified.
This is a protocol candidate rather than empirical evaluation evidence.

**Not yet supported:** an authorized incident corpus or confirmed oracle.
Paired reviewer executions and independent bug adjudication are outstanding.
No actual latency or cost/round measurements support an adoption decision.

Next proceed in this order:

1. Ask the authorized Host/operator to nominate safe incident and clean PR
   references, without exporting private raw material.
2. Independently review visibility, source chronology and ground truth;
   exclude cases that cannot be evaluated.
3. Assemble matching saved runs and replay inputs using current contracts.
4. Run bounded paired evaluation, measure denominators, review adverse
   outcomes and report to #1574 / #2615.
5. Request a Human Keep / Adapt / Revert / Defer decision on real evidence.

This protocol does not authorize new runtime behavior or a persistent schema.
Background crawling and unattended model execution remain out of scope.
Gate changes and auto-merge are not authorized.
