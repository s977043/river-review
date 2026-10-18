---
id: maintenance-evidence-review-en
sidebar_label: Evidence review for maintenance
---

# Reviewing AI-assisted maintenance changes with evidence (proposed guide)

> Status: **proposed / report-only** (2026-10-17)  
> External reference: [OpenAI — Maintaining software with the GPT-6 family](https://developers.openai.com/blog/maintaining-software-with-the-gpt-6-family)  
> This guide does not change mandatory Gates or Review Policy. [Review Policy](../reference/review-policy.en.md) remains the source of truth for review criteria.

Identifying a maintenance opportunity is different from demonstrating that a change is safe or approving it. Start with the existing review skills and fixtures, and only consider new Skills when a reproducible gap remains.

## Counterexamples and stop conditions by candidate type

### Unused code / dependency

Inspect callers and dynamic references. Check public APIs, build/runtime usage, and lockfile consistency. Zero references in a static grep do not exclude dynamic imports or external consumers.

### Stale feature flag

Inspect the current configuration values and their effective scope. Check operational kill switches, rollback paths, and ownership. A seemingly permanent flag may still be required for incident response.

### CI optimization

Compare CI jobs and execution times before and after the change. Verify that test coverage and exit-code behavior remain equivalent. Merely skipping tests is not a valid speed improvement.

### Flaky test

Record the original failure logs and reproduction conditions. Investigate the effect of retries or quarantine, and execute the test after the change. A green result may hide a higher retry count.

### Test or snapshot removal

Check the intended assertions and variants before removing them. Verify that the remaining suite can detect relevant regressions. A smaller test count is not itself an improvement.

## Report-only review protocol

### Source

Record the exact target repository and base/head SHAs. Cite the relevant PR/Issue, source lines, and observation date. Keep results reported in external articles distinct from measurements in this repository.

### Hypothesis

Separate observations from assumptions about unused code, latency, or instability. Seek counterexamples involving dynamic references and operational use. Inspect the coverage of the CI jobs.

### Verification

Record the commands, execution environment, and exit codes. Preserve measurements, failures, and checks that were not executed. When evidence is unavailable, use UNKNOWN rather than assuming success.

### Risk

Check compatibility, safety, and indirect consumers. Identify rollback options and signals that would detect a recurrence. Do not approve an unsupported claim that a deletion is safe.

### Disposition

Report findings through the existing review output contract. Keep false positives separate from decisions to accept or reject findings. An AI-generated review verdict is not GitHub approval.

### Outcome

Only record an outcome after an approved workflow has performed the change. Relevant measurements include real CI runs, regressions, reviewer time, and observed benefit. Never turn an unmeasured value into zero.

## Minimal dogfooding case

[PR #2707](https://github.com/s977043/river-review/pull/2707) is an existing example concerning an apparently unused dependency. Do not infer that the dependency is unnecessary from the package diff alone. Inspect Node API imports, dependency relationships, and the lockfile; verify the Node 22 build/tests and CI. This guide does not approve PR #2707.

Prepare a positive case (safe removal) and negative cases (indirect references, kill switches, and insufficient test evidence). Evaluate detections, misses, and false positives with existing Skills. Verify expected outcomes independently.

Refer to [incident/revert-grounded evaluation #2701](https://github.com/s977043/river-review/issues/2701), existing paired evaluations, and Review Resolution. Do not introduce a dedicated corpus, another learning engine, or an auto-merge flow.

Check for overlap with [simplification review #1452](https://github.com/s977043/river-review/issues/1452). Start by observing three candidates. Even zero critical false accepts among a few cases would not demonstrate safety.

## Reject / defer criteria

Defer when provenance is insufficient or the permissions and usage cannot be verified. Escalate when CI coverage is reduced, environments differ, confidential information is at risk, or human-owned authorization is missing.

## Boundary

Do not add Skills, hooks, or mandatory Gates in this proposal. Production code changes, relaxed permissions, and new API dependencies are out of scope. Follow the existing [practice evolution policy](../guides/governance/practice-evolution.en.md). Decide on adoption only after independent reproduction in real PRs.
