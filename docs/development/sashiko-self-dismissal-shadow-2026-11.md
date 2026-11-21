# Sashiko-style Self-Dismissal Audit: shadow evaluation plan

> Status: **Proposal / shadow-only** (2026-11-22). No runtime wiring or change to Gate, Review Coverage, approval, merge authority, or QA execution.
>
> Baseline: s977043/river-review main e78b523464992f3a37200e8974fa732d65638ebe. Recheck its head and open PRs before implementation or merge.

## Source and observed gap

Google's [Sashiko report](https://cloud.google.com/blog/products/application-development/lessons-from-building-sashiko-an-agentic-code-review-system) describes specialist reviews returning both proposed bugs and concerns they dismissed. Separate triage and verification can revisit the dismissed concerns. Production numbers from Linux are **not** acceptance criteria for River Review.

River Review already has candidate finding deduplication in src/lib/reviewer-orchestrator.mjs, deterministic verification in src/lib/verifier.mjs, opt-in Finding Critic in src/lib/finding-critic-stage.mjs, and run-ID separation in src/lib/reviewer-independence.mjs. The state projection in src/lib/finding-evidence-state.mjs treats reviewer withdrawal as unresolved, not refuted. These are existing owners to reuse.

The remaining **hypothesis**, not a proven production defect, is that a reviewer may dismiss a concern before emitting a finding, so Finding Critic never observes it. No stable production source of such rejected concerns has yet been demonstrated.

## Decision and scope

Implement an isolated offline evaluation of self-dismissal **recovery candidates**, not a new review runtime. The pure helper compares second-pass bug claims to human-frozen benchmark labels and returns structural audit candidates only. A claim never becomes an accepted finding or an input to severity, scoreReview, deriveVerdict, Review Coverage, completion status, or merge decisions.

The checks are deliberately weak and explicit: same subject revision, syntactically plausible path and line references, and logical run-ID separation using the existing helper. These do **not** prove cited source exists, bug correctness, model independence, or cryptographically trustworthy provenance. Every candidate still needs human evidence audit.

Cases require unique id, self-dismissed original disposition, human oracle (bug or not-bug), subject revision and finder run ID. Optional verification records a claim (bug, not-bug, unresolved), subject revision, verifier run ID and evidence references. Frozen oracle assignment occurs before evaluating candidate output. Malformed input and duplicate IDs fail loudly. Stale revision, missing citation, unknown run identity and missing or unresolved verifier result produce no audit candidate.

## Stages and stopping rules

- **Stage 0 / baseline**: confirm main, #1978, #2212, #2455 and QA intake PR #2934; no conflicting owner.
- **Stage 1 / offline evaluation**: pure helper, synthetic tests and this proposal. Targeted test and repository CI required. Absolutely no production-path import.
- **Stage 2 / paired replay**: freeze historical human-labeled cases, run same-revision A/B comparison; measure bug recovery, false alarms, unresolved coverage, elapsed time, token usage and human review effort.
- **Stage 3 / opt-in adapter**: evaluate a bounded source for dismissed concerns, reusing existing Finding Critic and deterministic verifier. Requires schema, skill, risk and rollback review first.
- **Stage 4 / adoption**: opt-in only after demonstrating benefits without critical or major recall regression, false-clean, or unbounded cost.

Stop if an LLM claim is treated as confirmed, a stale or same-execution report counts as independently verified, unrun checks become clean, human labels are changed after evaluation, or any new merge/approval authority is proposed. Missing data is unknown, never success.

## Five-perspective design review

- **Security**: fabricated citations and run IDs can appear structurally valid. Human evidence audit is mandatory; no promotion or approval authority.
- **Quality assurance**: a precision gain may hide critical misses. Freeze human oracles, report independent denominators, and retain negative controls.
- **Architecture**: reuse existing Critic, reviewer-independence and Review Coverage owners; do not create a competing truth-state or Gate mechanism.
- **Maintenance**: avoid runtime, registry, or schema changes while QA intake PR #2934 is under review.
- **Operations / cost**: avoid new model calls until recall, false alarms, time, costs and human attention have been measured.

This is a reasoned five-perspective assessment, **not five independently executed agent attestations**. It cannot replace an independent PR review.

## Validation and human merge handoff

Run targeted Node tests, npm run lint, npm test, and applicable npm run meta:validate on the actual PR head; CI is the authoritative full-tree check. Inspect the diff for production imports, new schemas, leaked secrets, inconsistent records, and weakened guardrails. Review both PR comment channels, current HEAD, and all eight required GitHub checks.

ADR-016 stage 1 forbids **agent merge of any tier**. Only a human maintainer may merge after confirming complete checks, no blocked label, review findings resolved, and no stale approvals. Do not enable auto-merge or alter branch protection.

## Related work

- #1978 — Evidence-Grounded Adversarial Review and Finding Critic
- #2212 — Review Coverage
- #2455 — Review Concern evaluation
- #1857 — Semantic Precision
- PR #2934 — Proposed QA evidence intake
- PR #2881 — Verification-First proposal
