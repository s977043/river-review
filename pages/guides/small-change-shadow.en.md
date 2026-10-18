---
id: small-change-shadow-en
sidebar_label: Small-change Shadow Evaluation
---

# Small-change shadow evaluation (experimental)

> **Experimental / observe-only.** Neither the guide nor the script approves PRs, merges code, changes review depth or writes GitHub checks. A `candidate` is **not** an approval decision or a trusted attestation.

## Source and local responsibilities

Will Larson, [Speeding up code review with `small-change`](https://lethain.com/small-changes/) (2026-10-17). Imprint reports an early ~10% candidate share; that is *not* proven time savings or quality improvement for River Review. Keep existing [review routing](https://github.com/s977043/river-review/issues/2034), [resolution](https://github.com/s977043/river-review/issues/2322), [historical learning](https://github.com/s977043/river-review/issues/2614), and [evolution](https://github.com/s977043/river-review/issues/1574) as their respective sources of truth.

A host supplies the PR's exact SHA, raw change manifest, risk-map application, review findings and coverage, completed CI, classified service scope, verified per-service prior merges, and repo-owned exclusions. The standalone script only tests the consistency of supplied data. A caller can forge JSON; **never** convert its output into a GitHub approve action, passing status check, bypass or merge authorization.

## Offline command

```bash
node scripts/experiments/small-change-shadow.mjs --input /path/to/observations.json
node --test tests/small-change-shadow.test.mjs
```

Required observation categories: `subject.headSha`; `change.changedLines/changedFiles`; `route.headSha/selectedMode/riskAction/policyApplied`; `review.headSha/state/coverage/majorOrCriticalCount`; `checks.headSha/state`; `scope.headSha/classifiedChangedFiles/classificationComplete/sharedLibraryTouched/sensitiveAreaTouched/services[].priorMergedPrs`; and `policy.maxServicesInclusive/excludedPathPrefixes`. Missing facts are not replaced with false or zero.

Possible results: `candidate`, `excluded`, `unknown`. Every result includes `authorizesApproval: false` and `evidenceTrust: "unverified-input"`. Article wording on “fewer than N” vs N=1 frontend/N=3 backend is ambiguous; this experiment requires a clearly defined inclusive repository-owned threshold. Changed lines must be below 1,000; per-service history must be at least 10. River Review Major/Critical findings are not assumed to map exactly to Imprint P1/P2.

## PR-cluster learning and rollout

Review a small batch of *real* PRs for recurring findings, reviewer mistakes, incident gaps, and tests/CI that could replace manual review. Submit proposals through existing Resolution → Human-confirmed Feedback → Promotion/Evolution, never automatically promoting rules from repeated AI comments. Preserve provenance and redact sensitive data.

Begin with synthetic positive/negative fixtures. Then collect 5–10 real historical PR observations in read-only mode and compare with the existing baseline. Record candidate/excluded/unknown share, p50/p95 review delay, missed Major/Critical issues and human correction burden (unobserved is **unknown**). Stop on any false-green; no authorization expansion without a separate Host/Human decision.

Tracking: [#2722](https://github.com/s977043/river-review/issues/2722).
