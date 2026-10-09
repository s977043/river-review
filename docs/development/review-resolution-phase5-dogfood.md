# Phase 5 real-PR Feedback dogfood

Parent issue: #2575. Epic: #2322.
Implementation: #2613, #2617 and #2618.

## Goal

Evaluate the existing Review Resolution to Feedback path on five to ten real PRs.
Require genuine Host-backed Human decisions.
Do not count synthetic fixtures as real-PR evidence.
Phase 6 (#2614) and Phase 7 (#2615) remain gated by this evaluation.

This is an operator procedure.
It does not add a reviewer or change Gate authority.
It does not create a second Feedback writer or approval service.

## Baseline audit

A read-only audit examined the PR conversation comments of eight merged PRs.
The sampled PRs were #2617 / #2613 / #2611 / #2610.
They also included #2602 / #2594 / #2306 / #2308.
The audit was performed on 2026-10-09.

- Six PRs had at least one non-bot maintainer comment.
- Two PRs had no non-bot maintainer comment in the inspected conversation.
- None of the inspected comments included a full canonical finding/run/manifest link.
- PR #2306 reported review findings as addressed. This was not adapter evidence.
- **Qualifying cases from this inspection: zero.**

Source artifacts may exist outside these PR comments.
The read-only audit did not inspect private Host evidence.
The detailed evidence audit is recorded in issue #2575.

## Required source evidence

The operator must select five to ten real PRs.
Supply the records from the existing trusted Host.

1. Obtain the immutable source Review Artifact and original finding.
2. Check the canonical v1 fingerprint and reviewer provenance.
3. Obtain the source `reviewRunId` and Execution Manifest identity.
4. Obtain source revision and artifact hashes from their existing authority.
5. Load the matching Review Resolution sidecar and Author response.
6. Obtain targeted Verification evidence when the candidate needs it.
7. Supply the current revision and trusted Skill mapping.
8. Supply the existing canonical Feedback list to detect duplicates.

Do not infer any missing ID from the PR title or merge state.
Reviewer identity is not a trustworthy Skill ID mapping.

## Trusted Human approval

A real candidate requires an authenticated Human decision.
The Host must authenticate the actor independently.
The Host must also retain the approval audit reference.

The approval must bind the exact current proposal digest.
It must identify the finding and original review run.
It must identify the Skill and feedback type.
It must include a rationale and timestamp.

A digest prevents proposal mix-ups.
It does not authenticate a Human by itself.
A synthetic actor name is not evidence of real approval.

## Per-PR procedure

1. Validate the original finding and Review Resolution with existing contracts.
2. Verify source revision and applicable target revision.
3. Build the candidate using `buildReviewResolutionFeedbackProposals()`.
4. Supply canonical source findings and trusted Skill mapping.
5. Record `candidate`, `needs_human` or `no_proposal` with its reason.
6. Do not approve or write Feedback for a held candidate.
7. For a real approval, record the Host-authenticated decision.
8. Call `approveReviewResolutionFeedbackProposal()` for that exact proposal.
9. Record `ready`, `duplicate` or the rejection reason.
10. Store a Feedback append reference only if a separate authorized write occurred.
11. Require an independent source and outcome audit.

The proposal builder is in `src/lib/review-resolution-feedback.mjs`.
The approval adapter is in `src/lib/review-resolution-feedback-approval.mjs`.
Canonical Feedback creation remains owned by `src/lib/feedback.mjs`.

No automatic Skill promotion follows an approval adapter result.
Promotion is still governed by the existing #1568 contract.

## Redacted intake worksheet

This example is deliberately empty.
It is not a valid Review Resolution document or authorization.

```yaml
sourcePr: null
sourceReviewRunRef: null
sourceManifestRef: null
sourceFindingRef: null
sourceFingerprintAlgo: null
sourceRevisionRef: null
targetRevisionRef: null
verificationEvidenceRefs: []
hostApprovalAuditRef: null
approvalActorAuthenticatedByHost: false
proposalStatus: unavailable
proposalReasonCode: unavailable
approvalAdapterStatus: not_executed
canonicalFeedbackAppendRef: null
independentAuditRef: null
eligibleRealCase: false
notes: 'Await authenticated source evidence.'
```

Do not store raw PR comment bodies in the published worksheet.
Do not store credentials or private personal identifiers.
Store only minimal source references and redacted outcomes.
Missing or unavailable evidence must remain explicit.

## Acceptance and metrics

- Count only real cases with verified source identity and Human evidence.
- Require an independent review for every eligible case.
- Record held and duplicate outcomes separately from accepted outcomes.
- Count false automatic promotions. The target is zero.
- Count lost provenance in eligible cases. The target is zero.
- Count duplicate canonical Feedback writes. The target is zero.
- Include negative cases with incomplete coverage when available.
- Include stale revisions and ambiguous fingerprints when available.
- Report `N/A` for error rates when the eligible denominator is zero.

The number of reviewed PR comments is not the eligible denominator.
A merged PR does not prove a finding was verified.
A resolved review thread does not prove the finding was correct.

## Stop conditions

Stop when original findings or required identities are missing.
Stop when the Host actor is not authenticated.
Stop on stale target revisions or incompatible fingerprints.
Hold disputed and inconclusive findings for a Human decision.
Stop when independent audit evidence is unavailable.

Close #2575 only after five to ten qualifying real PR cases.
Publish their redacted audit results and Human signoff first.
Keep #2614 and #2615 gated until that decision.

## Responsibility boundaries

- Reviewer and Finding Critic own finding and verification evidence.
- Review Resolution owns Author response and verification lineage.
- Feedback adapters produce proposals and approved entry data only.
- Host and Human own authentication and any authorized writes.
- Promotion and Evolution reuse #1568 and #1574.

A GitHub PR comment never replaces this evidence chain.
