---
id: small-change-shadow-en
sidebar_label: Small-change Shadow Evaluation
---

# Small-change shadow evaluation (experimental)

> **Experimental / observe-only.** Neither the guide nor the script approves PRs, merges code, changes review depth or writes GitHub checks. A `candidate` is **not** an approval decision or a trusted attestation.

## Source and local responsibilities

Will Larson, [Speeding up code review with `small-change`](https://lethain.com/small-changes/) (2026-10-17). Imprint reports an early ~10% candidate share; that is _not_ proven time savings or quality improvement for River Review. Keep existing [review routing](https://github.com/s977043/river-review/issues/2034), [resolution](https://github.com/s977043/river-review/issues/2322), [historical learning](https://github.com/s977043/river-review/issues/2614), and [evolution](https://github.com/s977043/river-review/issues/1574) as their respective sources of truth.

A host supplies the PR's exact SHA, raw change manifest, risk-map application, review findings and coverage, completed CI, classified service scope, verified per-service prior merges, and repo-owned exclusions. The standalone script only tests the consistency of supplied data. A caller can forge JSON; **never** convert its output into a GitHub approve action, passing status check, bypass or merge authorization.

## No Look Merge and Ship / Show / Ask (shadow only)

The [October 2026 discussion by nrs](https://zenn.dev/nrs/articles/c777388530aa84) distinguishes skipping a human's line-by-line code reading from an organization's responsibility for merge decisions. River Review treats this as an **evaluation question for the existing shadow assessor**, not as a new approval engine. [ADR-016](https://github.com/s977043/river-review/blob/main/docs/adr/016-repo-operation-risk-tiers.md) remains **Proposed, not adopted**.

- **Ship (hypothetical)**: Assess when pre-merge human code reading might be omitted. Not enabled; retain Host / Human merge decisions.
- **Show (hypothetical)**: Assess sharing and auditing changes after integration rather than waiting for routine approval. Not enabled; do not bypass required checks or reviews.
- **Ask (current)**: Send high-risk, incomplete-evidence or ambiguous changes to humans under current branch protections.

### Three independent decisions

1. **Evidence (observation)**: Exact PR head SHA, complete changed-file manifest, risk classification, observed reviewer execution and Coverage, provenance of required checks, unresolved comments, and detection/rollback. A skipped, neutral, or missing observation is not proof that a semantic review executed and passed; distinguish zero findings from no LLM execution.
2. **Judgment (assessment)**: Record the existing small-change-shadow statuses candidate / excluded / unknown with their reason codes. A candidate is consistency of operator-supplied data, not verified quality. Do not omit unknown cases to inflate candidate share.
3. **Permission (authorization)**: Organizational accountability, separated credentials, GitHub protection, and explicit Human decisions remain outside the shadow output. Never translate candidate into a GitHub approval, passing required check, MERGE_READY, or auto-merge.

### Paired evaluation and stop conditions

On explicitly selected real PRs, compare **the existing human-review process (control)** with **a hypothetical no-look shadow classification (without actually skipping review)**. Record head SHA / observation source / unknowns / human disposition / material findings first caught by the actual review / review wait time / post-merge failures and detection; record unobserved values as unknown. Reuse the bounded batch under [#2722](https://github.com/s977043/river-review/issues/2722) instead of creating another risk or approval evaluator.

**Stop expansion after any false-green shadow case.** A small sample cannot prove safety. Relaxing review or enabling merge requires independently verified Host evidence, remediation of the misleading clean surface in [#2812](https://github.com/s977043/river-review/issues/2812), formal Human adoption of ADR-016, and proof of credential isolation. River Review output itself never grants merge authority; PlanGate's **C-4 / merge remains Human-owned**.

## Offline command

```bash
node scripts/experiments/small-change-shadow.mjs --input /path/to/observations.json
node --test tests/small-change-shadow.test.mjs
```

Required observation categories: `subject.headSha`; `change.changedLines/changedFiles`; `route.headSha/selectedMode/riskAction/policyApplied`; `review.headSha/state/coverage/majorOrCriticalCount`; `checks.headSha/state`; `scope.headSha/classifiedChangedFiles/classificationComplete/sharedLibraryTouched/sensitiveAreaTouched/services[].priorMergedPrs`; and `policy.maxServicesInclusive/excludedPathPrefixes`. Missing facts are not replaced with false or zero.

Possible results: `candidate`, `excluded`, `unknown`. Every result includes `authorizesApproval: false` and `evidenceTrust: "unverified-input"`. Article wording on “fewer than N” vs N=1 frontend/N=3 backend is ambiguous; this experiment requires a clearly defined inclusive repository-owned threshold. Changed lines must be below 1,000; per-service history must be at least 10. River Review Major/Critical findings are not assumed to map exactly to Imprint P1/P2.

## PR-cluster learning and rollout

Review a small batch of _real_ PRs for recurring findings, reviewer mistakes, incident gaps, and tests/CI that could replace manual review. Submit proposals through existing Resolution → Human-confirmed Feedback → Promotion/Evolution, never automatically promoting rules from repeated AI comments. Preserve provenance and redact sensitive data.

Begin with synthetic positive/negative fixtures. Then collect 5–10 real historical PR observations in read-only mode and compare with the existing baseline. Record candidate/excluded/unknown share, p50/p95 review delay, missed Major/Critical issues and human correction burden (unobserved is **unknown**). Stop on any false-green; no authorization expansion without a separate Host/Human decision.

Tracking: [#2722](https://github.com/s977043/river-review/issues/2722).

## Offline historical-PR batch and missing-evidence handling

The ten-PR metadata fixture (`tests/fixtures/small-change-merged-pr-metadata.json`) records only the historical merged PR heads, changed-line counts and file manifests observed via GitHub on 2026-10-18 (#2720, #2718, #2716, #2713, #2711, #2712, #2708, #2710, #2709, #2707). It does **not** include authenticated Review Coverage, applied risk-map, service experience or required-CI attestation.

```bash
node scripts/experiments/small-change-shadow-batch.mjs --input tests/fixtures/small-change-merged-pr-metadata.json
node --test tests/small-change-shadow-batch.test.mjs
```

Expected offline results: **candidate 0 / excluded 2 / unknown 8**, with `candidateShare: null`. Two cases touched GitHub Actions workflow files, which are explicitly excluded; eight lack sufficient evidence. This is **not a 0% eligible rate**. Every result has `authorizesApproval: false`.

Even with a numeric `candidateShare`, operator-editable JSON can be forged; it is an **input-based shadow statistic**, not a trusted production approval rate. Host verification of sources and HEAD SHA, independent review, scope sensitivity classification, Human confirmation, and paired baseline comparisons must precede any adoption claim. Follow up in [#2722](https://github.com/s977043/river-review/issues/2722).

This metadata sample is neither confirmed historical feedback from [#2614](https://github.com/s977043/river-review/issues/2614) nor Promotion/Evolution effectiveness evidence from [#2615](https://github.com/s977043/river-review/issues/2615). PR merge state, comments and zero AI findings never prove a change was correct.

## Bounded GitHub API observations (experimental, read-only)

With an authenticated GitHub CLI (`gh auth status`) and repository read access, you can observe exact merged-PR HEAD SHAs, additions/deletions, changed-file manifests, and check runs from the same SHA. Only explicitly selected PR numbers are accessed.

```bash
node scripts/experiments/small-change-host-observe.mjs --repo s977043/river-review --prs 2720,2718,2716,2713,2711 > historical-observations.json
node scripts/experiments/small-change-shadow-batch.mjs --input historical-observations.json
```

- Limit: **10 PRs per run**, with at most three 100-item pages each for files and check runs. Missing or truncated metadata fails the entire run. No implicit repository crawl, network fetch other than the `gh api` CLI, GitHub write, or automatic persistence.
- PR bodies, review-comment text, diffs and credentials are not included. API response bodies are never printed on failure.
- `observedChecks` are **separate metadata observations**, not verified required-check coverage, branch-protection configuration, completed review, service ownership, history, human approval or a signed GitHub attestation. The output file can be edited by an operator.
- The batch assessor intentionally does not convert `observedChecks` into approval evidence. `unknown` outcomes remain unknown; exclusions are still observation-only classifications.
- No generated snapshot is automatically committed. Inspect paths and other metadata before sharing any output.

Full reviewer evidence, service-level history and Human disposition remain acceptance gates in [#2722](https://github.com/s977043/river-review/issues/2722), [#2575](https://github.com/s977043/river-review/issues/2575) and [#2614](https://github.com/s977043/river-review/issues/2614). A passed CI run or merged PR is not evidence of review correctness.
