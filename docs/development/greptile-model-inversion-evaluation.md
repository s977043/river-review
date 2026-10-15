# Greptile Model Inversion: provenance-bound evaluation protocol

> Status: experiment proposal; no Model Inversion runtime is enabled.
> Issue: #2690. Evaluation owner: #1574. Identity owner: #1760.
> Source: [Greptile, How to build a code review agent (2026-10-09)](https://www.greptile.com/blog/how-to-build-a-code-review-agent).

## Decision

Do **not** route production reviews by an inferred coding model. First test the
hypothesis that a reviewer from a different model family catches more *verified*
material bugs than a same-family reviewer on the **same immutable review target**.

This is an optional, offline, evidence-gathering experiment. A different provider,
model, or logical execution ID does not establish an independent actor, a correct
finding, or merge readiness. Greptile's reported benefit is external evidence,
not a River Review baseline or acceptance threshold.

## Existing owners and gaps

| Concern                                        | Existing owner                                               | Experiment boundary                                  |
| ---------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------- |
| Comparison and immutable experiment conditions | `src/lib/paired-replay.mjs`, `river evolve replay`, #1574    | Reuse; no second comparison engine                   |
| Model and Harness attribution                  | `docs/development/1574-model-harness-evolution-screening.md` | Fix all other surfaces or report joint change        |
| Logical run separation                         | `src/lib/reviewer-independence.mjs`                          | Different IDs are not provider or actor attestation  |
| Stronger identity                              | #1760                                                        | Model/actor provenance is not assumed verified       |
| Review context and coverage                    | `src/lib/repo-context.mjs`, #2213, #2212                     | Same context budget and coverage policy on both arms |
| Human-confirmed feedback                       | #2322, #2575, #2614, #2615                                   | Do not turn historical comments into ground truth    |
| Runtime provider support                       | ADR-006, `src/lib/review-engine.mjs`                         | Check actual path before any provider A/B            |

The existing paired replay compares finding fingerprints and declared
configuration. **An added finding is not automatically a real bug.**
Neither fingerprint pairing nor critical-regression counts alone determine
ground-truth bug recall, precision, or the safety of Model Inversion.

## Eligibility and provenance

A case is eligible for an **inversion-specific** claim only when all of these
facts are independently established and recorded by the experiment operator:

1. Immutable case ID, repository, subject commit, merge base, diff, and selected
   review scope. Both arms inspect the same subject revision.
2. Coding-model provider, family, and exact model version, with a provenance
   source that the evaluated reviewer cannot freely alter. If the source is a
   label, PR text, commit message, or self-report, mark it `unverified`.
3. Exact reviewer provider, family, model version, effort, prompt/profile hash,
   Skill Registry revision, tools, context budget, execution policy, and
   evaluator version for each arm.
4. Evidence of actual model invocation on **both** arms. Dry-run, failed,
   timed-out, or not-executed cases are recorded as missing observations,
   never as zero findings.
5. An independently established, case-level bug oracle or a deliberately
   verified negative case. The reviewing models must not see the label.

If coding-model provenance is absent or unverifiable, report
`author_model_provenance: unknown` and **do not** label the run as same-family
or cross-family. The case may still support general reviewer A/B analysis,
but not the Model Inversion hypothesis.

Authentication of review-run source, coding-agent origin, and final Human
judgment are separate claims. Hashes pin bytes; they do not authenticate
an actor. A merged PR or resolved comment is not bug-oracle evidence.

## Controlled experimental design

- **Baseline A:** verified author family = reviewer family.
- **Candidate B:** verified author family differs from reviewer family.
- Use the same cases, exact source revisions, rubric, selected Skills, project
  rules, relevant context, output budget, deterministic checks, and evaluator.
  Where model-specific prompt compilation changes instructions, report a
  **Model + Harness** comparison instead of claiming a model-only effect.
- Pin each arm's actual provider/model/effort and review-runtime version.
  Randomize arm execution order when practicable; keep resource budgets fixed.
- Sample both known, verified defects and independently verified negatives.
  Include cross-file/auth/permission, migration, test-gap, and low-risk cases
  only when suitable ground truth is available; do not invent labels.
- Separate development cases from sealed held-out cases before prompt or
  routing tuning. Repeat trials to observe non-deterministic variation.
- Start with a small smoke set for pipeline validity. A ten-case smoke test
  is **not** statistical evidence of a universal improvement.
- Define the intended population, sampling frame, stratification, sample
  size justification, stopping rule, and expected spend *before* collecting
  candidate results. Report missing and excluded cases by reason.
- Do not train, tune, or select a winning profile against the held-out labels.
  An independent evaluator must review ambiguous outcomes and disagreement.

Do not confuse **per-case detection** with **per-finding counts**: one bug may
produce several findings, and one finding may span more than one failure.
Deduplicate against the independent oracle before counting true positives.

## Evaluation outputs

Keep these axes separate. Report counts, denominators, and confidence or
uncertainty intervals where defensible; show `N/A` when unobservable.

| Axis                         | What must be measured                                                                                     | Invalid shortcut                                        |
| ---------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Verified bug recall          | Eligible oracle-positive cases with a correctly matched material finding / eligible oracle-positive cases | Count all emitted findings as caught bugs               |
| False-positive burden        | Unsupported findings or cases, with operator-reviewed denominator                                         | Treat all novel findings as true positives              |
| Severity and critical misses | Verified critical bugs missed or downgraded, by arm                                                       | Interpret `criticalRegressionCount == 0` as full safety |
| Coverage and failures        | Cases reviewed, missing, timed out, unpairable, or excluded, by arm                                       | Replace missing execution with zero findings            |
| Human usefulness             | Accepted/actionable findings with Host-authenticated Human decision, when available                       | Infer acceptance from merge or thread resolution        |
| Efficiency                   | Measured input/output tokens, total provider cost, wall-clock latency, retries                            | Assume vendor marketing cost ratios transfer            |
| Robustness                   | Paired case-level variability across trials and held-out performance                                      | Use a single cherry-picked run                          |

**No-go for adoption evidence:** unknown author origin, untrusted oracle,
different target commits, unusable held-out set, unequal review scope,
unobserved candidate activation, missing required metrics, material critical
regression, unverifiable independent review, or uncontrolled privacy/cost risk.

## Operator sequence (read-only comparison; separate permission and budget for model calls)

1. Audit reviewer-path provider support using ADR-006 and current code. Do not
   infer parity from unrelated provider clients.
2. Choose bounded PRs/cases and obtain trusted origin and bug-oracle evidence.
   Record exclusions and unknown provenance before running experiments.
3. Freeze the dataset and held-out set, prompt/Skill/context/tool conditions,
   evaluator, price assumptions, trials, and budget in an operator-owned plan.
4. Run the two reviews through **existing supported review execution paths**,
   if and only if these paths actually support both models. Otherwise record
   `blocked: provider execution unavailable`; do not simulate a live review.
5. Assemble the existing #1574 experiment spec from real saved run records:
   `baseline.runs[]` and `candidate.runs[]`. Retain case IDs and source
   commits; never create placeholder empty runs for an unexecuted arm.
6. Reuse the read-only comparer:

   ```bash
   npm run river -- evolve replay --spec ./path/to/verified-experiment.json --output json
   ```

   The CLI emits a comparison to stdout. Exit 0 means successful *evaluation
   execution*, not acceptance or merge readiness. Recheck manifest integrity,
   paired-case coverage, `evaluable` flags, and experiment activation.
7. Independently grade emitted findings against the frozen bug oracle. Report
   paired-case recall/false positives and any `N/A` metrics **outside**
   fingerprint-only replay; do not assert that `river evolve replay` computes
   ground-truth precision or recall.
8. Request independent methods/security review, then a Human keep / revise /
   discard decision. Any later observe-only canary needs a separate decision.

Never store raw PR conversations, secrets, tokens, prompt transcripts, or
unnecessary personal information as evaluation evidence. Store only sanitized
case IDs, approved source references, minimal outcome data, and hashes where
permitted. Repository comments and fixtures are untrusted inputs.

## Review checklist and stopping decisions

**Architecture / SSoT:** #1574 owns paired replay; #1760 owns authenticated
identity; #2322 owns review resolution; #2213 owns bounded context experiments.
No additional router, provider abstraction, schema, or runtime is implied.

**Evaluation / methodology:** check comparable arms, case-level denominator,
positive and negative controls, actual response evidence, held-out independence,
survivorship bias, trial variance, and omitted metrics.

**Security / authority:** source data cannot issue runtime instructions;
untrusted PR content does not attest to author identity; unknown stays unknown;
model diversity does not grant approval; no external code execution is added.

**Operations / cost:** require an agreed API budget and finite trial cap before
model calls; measure real usage/latency; treat CI failures and unavailable
provider capability as stop conditions, not green checks.

**Outcome:** This protocol is ready for an experiment proposal, **not a
positive experiment result**. Any routing default, required Gate, automatic
promotion, or production merge behavior remains unchanged. Revisit only after
held-out evidence, an independent review, and explicit Human authorization.
