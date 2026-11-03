# Incident/revert review smoke: case metadata preflight (#2701)

This experiment is a **read-only preparation check** for the existing
[#2701 Phase 0 contract](../../docs/development/2701-incident-revert-reviewer-benchmark-gap-analysis.md)
and [#1574 paired replay](../../docs/development/1574-p2-paired-replay.md).
It is not a bug oracle, a new persisted schema, a reviewer evaluator, or a
production Quality Gate. No model calls, external artifact retrieval, writes,
precision/recall calculations, approvals, or promotion are performed.

## Start from an intentionally incomplete template

```bash
node scripts/experiments/incident-review-smoke-preflight.mjs \
  < scripts/experiments/incident-review-smoke-template.json
```

The template has no cases and no frozen held-out set. It returns an
`incomplete` report and exit code **3** by design. Do not populate this public
template with private incident data. Keep real operator inputs and independent
adjudication records outside candidate-controlled repositories; submit only
non-sensitive identifiers and opaque evidence references. The preflight does
not resolve references or validate their authenticity.

The JSON input uses `kind: incident-review-smoke/v1`, an operator-reported
`heldOutFrozenAt` UTC timestamp, and up to 30 `cases`. Each case has only the
following permitted metadata fields:

| Field                                                                                        | Required meaning                                                                                                                                            |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `caseId`                                                                                     | Stable, non-sensitive unique ASCII identifier; no raw PR text.                                                                                              |
| `partition`                                                                                  | `development` or `held_out`; both partitions must occur.                                                                                                    |
| `usedForTuning`                                                                              | Required boolean: `false` for held-out; either value for development. This is an unverified operator claim.                                                 |
| `label`                                                                                      | Operator-reported `bug` or `clean`; both labels must occur.                                                                                                 |
| `source.reviewedTarget`                                                                      | Opaque repository/review target reference, not a file payload.                                                                                              |
| `source.reviewedCommit`, `source.mergeBase`                                                  | Exact 40-hex review and merge-base SHAs.                                                                                                                    |
| `source.reviewedAt`, `source.diffScopeRef`, `source.evidenceDigest`                          | Original review time, visible diff-scope reference and sanitized source SHA-256.                                                                            |
| `source.reviewVisibility`                                                                    | Must be `reviewable`; unknown/unreviewable cases remain incomplete.                                                                                         |
| `oracle.claimedStatus`                                                                       | `independently_checked` is only a **claim**, not authenticated proof.                                                                                       |
| `oracle.adjudicatorRef`, `oracle.evidenceRef`, `oracle.adjudicatedAt`                        | Non-sensitive references to independent confirmation and its time.                                                                                          |
| `source.bugIntroducingCommit`, `source.fixEvidenceRef`, `source.fixObservedAt`               | Bug cases only: introduction revision, later fix evidence reference, later fix time.                                                                        |
| `oracle.causeRef`, `oracle.locationRef`                                                      | Bug cases only: independently documented failure mechanism and code location.                                                                               |
| `oracle.cleanScopeRef`, `oracle.alternativeAssessment`                                       | Clean cases only: independently checked **specific absence scope**, and `checked_valid` or `checked_not_applicable` for a valid alternative implementation. |
| `isolation.labelsWithheld`, `isolation.laterFixWithheld`, `isolation.privateReportsWithheld` | Explicit `true` claims about reviewer context. The caller must independently inspect actual context.                                                        |

Dates are UTC ISO 8601 (`2026-10-01T00:00:00Z`), and source digest is 64 hex
characters. References are short opaque tokens (letters, digits, `/._:#@-`),
not arbitrary prose, paths to automatically load, or URLs containing secrets.
Unknown fields are rejected: do not paste raw diffs, prompts, internal logs,
private reports or personal information into this input.
The same exact review snapshot cannot occur in both partitions, even under
different case IDs. A difference in source metadata does not prove that cases
are independent or that the held-out set was never exposed during tuning.

The output reports fixed reason codes and case **indices**, never source
references, adjudicators, case identifiers, evidence content or user strings.
Its `metadataStatus: complete` and CLI exit code **0** mean _only that the
operator-reported fields passed shape checks_. `evidenceTrust` remains
`unverified-input`, `decision` remains `null`, `writeEffects` is empty, and
all quality and attention metrics remain `null`. Exit **2** denotes invalid
JSON/contract or input transport; the process reads up to 128 KiB from
explicit stdin with a five-second timeout.

## Minimal experiment proposal (not performed here)

1. The authorized operator selects approximately **five confirmed bug cases and
   five independently checked clean or valid-alternative changes**. Include
   severity and reproduction evidence in _private, independent_ oracle records.
   Do not infer a bug from a revert or a clean PR from lack of complaints.
2. Freeze `development` and `held_out` identities before tuning. Independently
   verify defect chronology, review-time visibility, the exact reviewed code,
   the inspected negative scope, and whether future fixes/oracle data were
   absent from reviewer prompts, tools and retrieval context. The preflight
   cannot authenticate any of these claims.
3. On the **same case revisions and review context**, record current baseline
   and one candidate configuration through existing reviewer run paths. Fix
   model/version, prompt/Skill digests, tool access, sampling, budget and
   evaluator. If harness differs, report this as a joint Model + Harness test.
   Keep a per-case saved-run reference and any execution failure; do not
   transform missing runs into clean outcomes or false negatives.
4. Reuse `river evolve replay` for paired saved-run comparison. Separately
   have an independent reviewer adjudicate **every finding**, including novel
   ones outside the original incident oracle. Match **failure mechanism and
   location**, not just a fingerprint; treat fixed-target absence separately
   from harmful false assertions. Record reviewable positives detected/total,
   harmful-FP clean cases/clean cases, adjudicated findings/total findings,
   critical misses, unknowns, review failures, latency, actual cost and Host-
   measured human confirmation time. Zero denominators are **N/A**, not zero.
5. Compare against the baseline under equal conditions; review major misses,
   increased harmful false positives, label leakage and operational cost.
   Leave Keep/Adapt/Revert/Defer to the authorized Human. Ten cases can test
   wiring and identify regressions, **not establish production effectiveness**.

Source questions motivating this input contract include
[ReviewBench](https://github.blog/ai-and-ml/github-copilot/reviewbench-an-open-benchmark-for-ai-code-review/)
(independent finding labels and novel findings),
[VerifierBench](https://arxiv.org/abs/2610.28679) (valid alternatives),
[SecPRBench](https://arxiv.org/abs/2610.33509) (bug-introducing revision and
failure mechanism), and
[ESEM 2026 LLM-as-Judge](https://drops.dagstuhl.de/entities/document/10.4230/LIPIcs.ESEM.2026.21)
(adjudicator fallibility). These are design leads, not benchmarks reproduced by
this script.

## Validation and residual work

```bash
node --experimental-test-isolation=none --test tests/incident-review-smoke-preflight.test.mjs
npm run lint && npm test
```

The real corpus, oracle, confidentiality check, baseline/candidate executions,
finding-level independent adjudication, attention/cost measurement and human
adoption decision remain open in #2701/#1574. Structural preflight cannot
complete those tasks.
