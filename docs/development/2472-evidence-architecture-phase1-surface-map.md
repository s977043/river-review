# Evidence Architecture Phase 1—current-state surface map

Issue: #2472

## Observation baseline

```text
main: 1e130774eb2f7eaec5f37df333c782dd6c28d812
ADR-013 blob: 59f371f3d8e8ad0c3d264d076a096954df01872c
observed: 2026-10-04
```

Evidence precedence:

```text
current source code / JSON Schema
  > current stable reference docs / stability labels
  > ADR / development notes
  > Issue / PR prose
```

本書は runtime / schema を変更しない。既存 owner の値を再計算せず、利用可能性と consumer を対応付ける。

## Post-baseline update (2026-10-10)

この文書の ownership matrix / availability matrix / scenario G1 は上記の **2026-10-04 baseline** に対する調査結果です。表の `P4: helper-only / runtime 未配線` はその日時点では正しく、その後の実装状態を意味しません。基準状態を消さず、変更履歴をここに追記します。

- #2481 / PR #2501: multi-reviewer の Review Coverage unit に `executionId`、merged finding に `sourceExecutionIds[]` を追加（logical task provenance、observe-only）。
- #2543 / PR #2571: Finding Critic は既存の `evaluateReviewerIndependence()` を opt-in で利用する。観測値の owner は `src/lib/finding-critic-stage.mjs:buildExecutionIndependence`。
- verifier execution ID は Critic 呼び出し前に orchestrator/caller が割り当てる。
- 主な観測先は `debug.findingCritic.executionIndependence[]`。通常の `findings[].validation` と別の debug observation であり、Review Artifact に新たな必須の independence field が存在するわけではない。
- Critic が既定 off、ID欠落、Critic未実行、LLM利用不可などの状態を `independent` へ格上げしない。runtime経路が有効でも、この述語の保証は **異なる logical execution ID** のみ。
- actor authenticity / actor authorization / model/provider separation / trust / correctness / adversarial verification quality は引き続き #1760 の未完了の境界。Evidence State、Semantic Precision、Gate、`decision` と Human authority は変更しない。

**Phase 1 の結論 `not-needed-existing-surface` は据え置きます。** producer gap の一部が後続PRで解消したことは、汎用 Review Evidence Projection の必要性を自動的に証明しません。将来その必要性を主張する場合も、具体的な consumer/fixture と既存ownerでは不足する理由が必要です。

## Executive result

Phase 1 の結論は **`not-needed-existing-surface`** です。

現在の evidence は分散しています。必要な truth / coverage / provenance / derived signal は既存 artifact、saved run、Decision Surface、renderer fallback、Gate contract から辿れます。新しい Review Evidence Projection を入れないと表現できない consumer gap は確認できませんでした。

一方で、以下は current producer gap です。

- Reviewer Independence は helper-only で runtime 未配線。
- Review Resolution sidecar は planned で schema 未実装。
- Semantic Precision の `disposition` は owner 定義済みだが finding field として未実装。
- Security Audit Run Record は Experimental contract だが runtime writer 未配線。

これらは projection を追加しても evidence が増えない。必要なら各 owner を実装する必要がある。

### Reviewer execution provenance update

Issue #2481 では Reviewer Independence の判定を配線せず、multi-reviewer orchestration の実行 provenance だけを runtime へ追加する。
Review Unit の `executionId` と finding の `sourceExecutionIds[]` は observation-only とする。actor identity、trust、vote、correctness、independent verification を表さない。

この追加により「実際に別 execution が存在したか」は観測できるが、P4 Reviewer Independence state は引き続き helper-only / runtime 未配線のままとする。将来 P4 を配線する場合は、実 execution provenance と verifier trust model の両方を入力として検証する。

## Data-flow map

```text
review / verifier producers
  |
  +--> findings[] -----------------------------+
  |     +--> validation.finalStatus            |
  |           +--> Evidence State helper       |
  |                                            |
  +--> Review Coverage ------------------------+--> Review Artifact / runtime result
  |                                            |       |
  +--> Execution Manifest ---------------------+       +--> L1 Decision Surface
  |                                                    +--> Markdown / JSON / GitHub surface
  +--> decision / Layer-1 suggestedLoopSignal --------+
                                                       |
river run --save -------------------------------------+--> saved-run
                                                            |
                                                            +--> runs diff
                                                                  |
                                                                  +--> Layer-2 suggestedLoopSignal

Review Artifact / runtime result
  +--> Gate derivation
        +--> gate.decision / reasonCode / inputs / inputsHash
              +--> --gate / Action gate: enforcement adapter
                    +--> process exit / CI status

Review Evidence Projection is NOT required in either path.
Host / Human keeps merge, release, and production-promotion authority.
```

## Mapping A—ownership / availability / stability

同じ Row ID を Mapping A2 / B でも使う。3表を合わせて #2472 の required columns を満たす。

<!-- prettier-ignore -->
| ID | Concept / field | Evidence reference | Runtime path | Producer | Owner | Runtime availability | Activation condition | Default state | Stability | Compatibility impact |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| F1 | `findings[]` | `schemas/review-artifact.schema.json#$defs.finding`; review engine / orchestrator | `river run`, `review exec`, Action | review engine / reviewer orchestration | Review Artifact / finding contract | normal runtime | review path executes | path-dependent | not-published | consumer-visible |
| F2 | `findings[].validation.finalStatus` | `src/lib/finding-critic.mjs:FINAL_STATUS`; `src/lib/finding-critic-stage.mjs:runFindingCriticStage`; Review Artifact schema | `river run` and orchestrated review paths where stage is wired | Finding Critic stage | Finding Critic | opt-in | env `RIVER_FINDING_CRITIC=1` or config `review.findingCritic.mode=active`; env `0` is kill switch | off | not-published | additive-safe optional field |
| F3 | `findings[].validatedStatus` | `schemas/review-artifact.schema.json:validatedStatus`; `src/lib/finding-critic.mjs` separation note | artifact schema only; no current writer found by source search at baseline | no active Finding Critic writer | legacy/synthesis schema vocabulary | optional / effectively producer-absent | external/legacy producer only | absent-by-default | not-published | additive-safe when omitted; semantic change is consumer-visible |
| F4 | Evidence State projection | `src/lib/finding-evidence-state.mjs:projectFindingEvidenceState` | helper / Security Audit composition | pure helper over `validation.finalStatus` | Evidence State owner | helper available; not general persisted field | explicit caller invocation | not-applicable | not-published | internal-only helper; persisted use would be consumer-visible |
| F5 | Security Audit `finding.evidenceState` | `schemas/security-audit-run-record.schema.json` | planned Security Audit writer | no current runtime writer | Security Audit Run Record | planned / schema only | no automatic emission | off | Experimental | consumer-visible if writer is added |
| F6 | `severity` / `confidence` | `schemas/output.schema.json:issues[].severity/confidence`; `src/lib/finding-factory.mjs:prefilterFindings`; `src/lib/verifier.mjs:checkSeverityJustified` | normal review | reviewer / heuristic producer + verifier/prefilter | finding semantics | normal runtime | normal review execution | on | Stable | breaking-major for meaning changes |
| F7 | Semantic Precision `disposition` | ADR-007 / ADR-008; ADR-011 ownership table | no active finding field | no current writer | Semantic Precision | planned / owner-defined | none | off | not-published | future consumer-visible |
| E1 | `reviewCoverage` / `units[]` / `fileScope` | `src/lib/review-coverage.mjs:deriveReviewCoverage/deriveReviewFileScope`; `schemas/review-coverage.schema.json` | `river run`, `--reviewers`, single reviewer; saved-run; `runs diff` | reviewer execution | Review Coverage | optional observation | actual LLM attempt / orchestration outcome | path-dependent | Experimental | additive-safe optional field; status meaning is consumer-visible |
| E2 | `llmNotExecuted: true` | `src/lib/review-coverage.mjs:allLlmAttemptsSkipped`; `src/lib/result-store.mjs:buildRunRecord` | runtime result -> saved-run -> `runs diff`; optional Gate | review execution | LLM-execution observation | optional; emitted only when true | every observed unit intentionally skips LLM | absent-by-default | Experimental | additive-safe optional field; meaning is consumer-visible |
| E3 | Team Lead `blindSpots` | `src/lib/team-lead-synthesizer.mjs:synthesizeTeamLeadReport`; `schemas/output.schema.json:teamLeadReport` | multi-reviewer path | deterministic Team Lead synthesizer | Team Lead report | path-dependent | reviewer orchestration | absent outside path | not-published | consumer-visible |
| P1 | Review Artifact `trace.run_id` | Review Artifact schema; `src/lib/review-plan.mjs:defaultGenerateRunId` | `review plan\|exec` artifact | Review Artifact finalization | Review Artifact trace | optional on older artifacts | artifact finalization | path-dependent | not-published | additive-safe optional field |
| P2 | saved-run `runId` + provenance | `src/lib/result-store.mjs:buildRunRecord/buildRunProvenance` | `river run --save` | result store | saved-run contract | only with save path | `--save` | off without save | Internal | internal-only storage; persisted semantics are consumer-visible to CLI tools |
| P3 | Execution Manifest `reviewRunId` | Execution Manifest schema; `src/lib/execution-manifest.mjs:buildExecutionManifest/verifyExecutionManifest`; `deriveReviewRunId` | saved-run and `review plan\|exec` when producer attaches manifest | execution-manifest producer | Execution Manifest | additive / optional | producer and required pins available | path-dependent | Experimental | additive-safe optional block; digest semantics consumer-visible |
| P4 | Reviewer Independence state | `src/lib/reviewer-independence.mjs:evaluateReviewerIndependence` | helper only | helper caller | Reviewer Independence | helper-only; runtime not wired | explicit call only | off by lack of wiring | not-published | internal-only until wired |
| D1 | `decision` | `schemas/output.schema.json:decision`; Review Artifact schema; current finalization path | review result / artifact / saved-run | existing decision derivation | Review decision contract | normal runtime | review finalization | on | Stable | breaking-major for top-level JSON meaning changes |
| D2 | Artifact `suggestedLoopSignal` Layer 1 | Review Artifact schema; loop-signal contract | `river run` / artifact | artifact finalization | Layer-1 loop signal | normal artifact path | artifact finalization | on for applicable artifact path | not-published | consumer-visible |
| D3 | `runs diff` `suggestedLoopSignal` Layer 2 | `src/lib/loop-signal.mjs:qualifyLoopSignalForCoverage`; loop-convergence reference | `river runs diff` | run differ / loop signal | Layer-2 loop convergence | saved-run comparison path | two or more relevant saved runs | path-dependent | Internal | internal-only CLI surface |
| D4 | `gate.decision/reasonCode/inputs/inputsHash` | `src/lib/gate-decision.mjs:deriveGateDecision/computeGateInputsHash` | runtime artifact / host replay | Gate derivation | Gate | normal derivation; some inputs opt-in | coverage: `RIVER_GATE_COVERAGE=1`; LLM requirement: `RIVER_GATE_REQUIRE_LLM=1` | both opt-ins off | not-published | consumer-visible gate object; semantic changes can affect hosts |
| X1 | Gate enforcement adapter / exit semantics | `src/lib/gate-exit.mjs:gateDecisionExitCode/resolveGateExitCode`; Stable Interfaces | `river run --gate`, Action `gate:` | CLI / GitHub Action adapter | enforcement boundary | opt-in enforcement | CLI flag or Action input | off | Stable for Action gate exit meanings; CLI implementation Internal | breaking-major for Stable exit meanings |
| H1 | Human Decision Surface | `src/cli/render.mjs:buildHumanDecisionSurface/formatHumanDecisionSurfaceMarkdown/printMarkdownReport` | CLI / GitHub comment / Markdown | renderer | Human Attention | normal human output path | human-readable output selected | path-dependent | Internal | internal-only renderer; PR comment marker behavior separately Stable |
| R1 | Review Resolution sidecar | ADR-011 / ADR-013; no `schemas/review-resolution.schema.json` | none today | planned | Review Resolution | planned | none | off | not-published | future consumer-visible contract |

## Mapping A2—SSoT / persistence / lineage / consumer

<!-- prettier-ignore -->
| ID | Source of truth | Persistence | Transformation | Lineage | Observed or derived | Consumer |
| --- | --- | --- | --- | --- | --- | --- |
| F1 | emitted finding contract | Review Artifact / runtime JSON / saved-run copy | observe / normalize / merge / persist / project | producer finding -> artifact -> saved/display copies | review observation / judgment output | renderer, decision scoring, Gate inputs indirectly |
| F2 | Finding Critic `validation.finalStatus` result | finding.validation in Review Artifact/result | validate -> persist | F1 finding -> Critic -> F2 | derived validation judgment | Evidence State helper, human/debug consumers |
| F3 | supplied artifact field; no active runtime SSoT at baseline | Review Artifact only when supplied | persist/copy only | separate from F2 | legacy/synthesis metadata | schema consumers only |
| F4 | `projectFindingEvidenceState()` over F2 | in-memory unless a caller persists its own contract | derive | F2 -> F4 | derived projection | Security Audit / future structured reporting |
| F5 | Security Audit Run Record when a writer exists | planned `.river/security-audit/` record | persist/project | F4-compatible vocabulary under Security Audit ownership; not a general Review Artifact field | persisted derived state in that separate contract | Security Audit prose projection / future consumers |
| F6 | emitted finding fields | finding / output artifact | observe -> verify/prefilter -> project | finding producer -> verifier/prefilter -> output | review judgment metadata | renderer, scoring, prioritization |
| F7 | Semantic Precision owner definition | none today | future adjudication | separate axis; never infer from F2/F4/F6 | unavailable runtime semantic | none currently |
| E1 | `deriveReviewCoverage()` result | runtime result / JSON / saved-run | observe -> persist -> qualify/project | review units -> E1 -> saved-run -> D3/H1/D4 opt-in | derived execution-completeness observation | Decision Surface, `runs diff`, optional Gate |
| E2 | `allLlmAttemptsSkipped()` result | runtime result / saved-run when true | observe -> persist -> qualify | LLM attempt debug -> E2 -> saved-run -> D3/D4 opt-in | derived execution observation | `runs diff`; Gate with env opt-in |
| E3 | `teamLeadReport.blindSpots` | runtime result / JSON output | derive -> project | reviewerResults -> E3 -> H1/detail | derived coverage-of-role projection | Decision Surface / Markdown / GitHub output |
| P1 | Review Artifact trace | Review Artifact | generate | artifact finalization only | generated identifier | trace/debug/manifest-resolution inputs |
| P2 | saved-run record | `.river/runs/*.json` | generate / normalize / persist | runtime result -> P2; ID is distinct from P1 | persisted observation + self-reported provenance | `runs list/diff/digest`, evolve aggregate |
| P3 | Execution Manifest | top-level `executionManifest`; saved-run / artifact | derive / hash / verify | resolved execution pins -> P3; reviewRunId resolved by owner helper | derived content-addressed provenance/integrity record | replay / conformance / provenance inspection |
| P4 | `evaluateReviewerIndependence()` output | none by default | derive | finderRunId + verifierRunId -> P4 | derived helper state | no current runtime consumer |
| D1 | finalized review decision | runtime artifact / saved-run copy | derive -> persist/project | findings/scoring policy -> D1 | derived advisory judgment | Human surface, D4 |
| D2 | finalized artifact Layer-1 signal | Review Artifact | derive -> persist | current-run state -> D2 | derived advisory signal | D4 / host |
| D3 | `river runs diff` output | command output only | derive / qualify | saved-run observations -> D3 | derived qualified advisory signal | loop-running host / human |
| D4 | Gate block from `deriveGateDecision()` | Review Artifact/runtime output when emitted | derive | D1 + D2 + risk/execution inputs -> D4 | derived advisory signal | renderer, host, X1 |
| X1 | D4 + Stable exit mapping | process exit / CI job status only | enforce | D4 -> X1 | enforcement mapping, not evidence | CI / autonomous host |
| H1 | no new SSoT; reads canonical values | human-rendered output only | project | D1/D4/E1/E3 + renderer fallbacks -> H1 | derived presentation projection | Human |
| R1 | future Review Resolution sidecar | none | future persist | future author/human state | unavailable / planned | future author/human handling |

## Mapping B—absence / failure / visibility / trust / authority

<!-- prettier-ignore -->
| ID | Missing semantics | Failure behavior | Failure visibility | Human surface | Visibility fallback | Gate relationship | Trust / integrity semantics | Authority |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| F1 | empty means no emitted findings; not proof every review dimension ran | finding pipeline keeps its own verifier/prefilter policies | findings sections / debug depending path | L1 count + L2 finding details | E1/E3/execution details prevent an empty list from becoming universal proof | blocking findings contribute through existing Gate inputs | finding content is review output, not external attestation | none |
| F2 | absent means Critic did not provide validation; never confirmed | active-stage unavailable/error retains finding and sets human review | finding validation/debug observation | L2 finding detail / L3 artifact | keep F1 finding; do not fabricate F4 | MUST NOT override severity or Gate | Critic result is not independent proof by itself | none |
| F3 | absent is normal | no current writer-specific failure path | none unless supplied | L3 only if present | none needed | not consumed | legacy/synthesis metadata only | none |
| F4 | no F2 means no runtime Evidence State observation to claim | helper maps missing/unknown status to unresolved only when explicitly called | caller-owned output only | no general L1 field | F2/L3 remains canonical input | not consumed | derived epistemic view, not independent evidence | none |
| F5 | absent because writer is not wired | no runtime failure policy exists | none | none today | schema alone is not runtime evidence | not consumed | schema can preserve state but gives no runtime attestation | none |
| F6 | missing values follow producer/schema rules | existing verifier/prefilter can cap/suppress | finding/detail surfaces | findings / score summary | full artifact | severity contributes to existing blocking/scoring path | reviewer/deterministic judgment as produced | none |
| F7 | absent because field path is not implemented | no runtime policy | none | none | owning ADR only | not consumed | owner definition only | none |
| E1 | absent = no coverage observation; not complete and not automatically incomplete | inconsistent `complete` counts are demoted; failed units produce partial/not_executed | L1 when present; JSON/saved-run | L1 coverage line | L3 JSON/saved-run; execution details | Layer 2 uses incompleteness by default; Gate only opt-in | execution-completeness observation, not finding correctness | none |
| E2 | absent does not prove LLM executed | true preserves intentional all-skip fact | execution details / saved-run / Layer-2 output | L2 execution details; special empty-review renderer paths | saved-run / D3 even when not L1 | D3 demotes CONVERGED by default; D4 only opt-in | runtime observation, not quality proof | none |
| E3 | absent outside multi-reviewer path | failed/timed-out/unselected roles become blind spots | L1 count + Team Lead detail | L1 / Team Lead detail | JSON output | not direct Gate input | deterministic role-coverage summary | none |
| P1 | absent on older artifacts | preserve absence | L3 artifact | L3 | artifact itself | not Gate input | identifier only | none |
| P2 | no saved run means no runId/provenance record | producer vocabulary drift can fail `--save`; unknown caller block is dropped with stderr warning; `trustedBy` re-pinned null | stderr + saved-record omission | runs digest / saved JSON | top-level commitSha remains documented fallback when provenance block is dropped | not direct Gate input | self-reported / untrusted; `evidenceSource=CI` is not CI attestation | none |
| P3 | missing/unavailable blocks are explicit; null is not resolved | verify digests; replayability can remain unavailable | verify/replay diagnostics + artifact | L3 machine-readable | manifest verification tooling | not Gate input; riskMapDigest may mirror a Gate input | tamper-detection/replayability does not prove actor authenticity | none |
| P4 | missing run IDs => `unknown` | equal => same-execution; distinct => independent in narrow ID sense | helper output only | none today | none until runtime wiring exists | not consumed | does not prove actor/model/provider/prompt independence or correctness | none |
| D1 | absent/unknown stays distinct from auto-approve | owner derivation keeps its existing policy | verdict/artifact | verdict headline | L3 artifact | direct D4 input | derived judgment, not evidence | advisory signal only |
| D2 | missing/unknown does not become CONVERGED | Layer 1 intentionally has no E1/E2 demotion | artifact/report | artifact / report | D3 provides separate qualified loop view | direct D4 input | current-run derived signal | advisory signal only |
| D3 | historical missing E1 is unknown, not incomplete; missing E2 is not true | only CONVERGED is demoted for incomplete coverage or llmNotExecuted | `runs diff` output | `runs diff` | max-iteration bound remains caller responsibility | separate from D4; defaults differ | derived qualification of saved observations | advisory signal only |
| D4 | absent/unknown inputs never imply GO through pure derivation | unknown/risk uncertainty => NO_GO; deterministic unrunnable may ESCALATE; E1/E2 inputs follow opt-ins | verdict / machine artifact | verdict / machine output | X1 logs enforced decision | this is Gate derivation | `inputsHash` is not tamper-proof; replaying inputs is integrity check | advisory signal only |
| X1 | unknown decision maps fail-safe non-zero when enforcement requested | GO/GO_WITH_OBSERVATION -> 0; NO_GO -> 1; ESCALATE -> 3; unknown -> 1 | CLI stderr / CI job status | CI / process outcome | D4 artifact keeps reason/inputs | consumes D4; never a new Gate input | proves process/CI outcome only, not evidence correctness | enforcement adapter; Host/Human keeps irreversible authority |
| H1 | missing L1 item does not mean missing evidence | renderer has dedicated empty/failure/skip paths and detailed execution blocks | Markdown / PR comment / CLI | L1 -> L2 detail | L3 artifacts preserve machine state | display-only; never recomputes D1/D4 | presentation only | none |
| R1 | unavailable/planned | no runtime behavior | none | none | none | none | no evidence can be claimed | none |

## Runtime-path notes

### `river run`

- Review Coverage can be produced by single-reviewer or reviewer orchestration when an LLM attempt is observed.
- Finding Critic is opt-in and defaults to off.
- Gate derivation is separate from rendering.
- `--gate` maps an already-derived Gate decision to process exit.

### `river run --save`

- `buildRunRecord()` copies existing `reviewCoverage` without recomputing it.
- `llmNotExecuted` is persisted only when true.
- saved-run `runId` is its own identifier and must not be equated with Review Artifact `trace.run_id`.
- provenance is self-reported and remains untrusted.

### `river runs diff`

- Layer-2 loop signal reads saved observations.
- incomplete coverage demotes `CONVERGED` to `NO_SIGNAL` by default.
- `llmNotExecuted: true` performs the same convergence demotion.
- historical absence of those fields is preserved as absence/unknown.

### `river review plan|exec`

- Review Artifact owns `trace.run_id`, decision, findings, and optional Execution Manifest.
- Stable Interfaces states that Review Coverage on `review exec` is a no-op until that engine path returns `reviewCoverage`.
- Review Resolution is not a current artifact source.

### Gate enforcement

X1 consumes D4. `gateDecisionExitCode()` maps:

```text
GO / GO_WITH_OBSERVATION -> 0
NO_GO                   -> 1
ESCALATE                -> 3
unknown                 -> 1
```

This is an enforcement adapter. It does not transfer merge/release authority away from the Host/Human.

## Availability matrix

<!-- prettier-ignore -->
| Capability | Default | Optional activation | Current state |
| --- | --- | --- | --- |
| Finding Critic | off | config `review.findingCritic.mode=active` or env `RIVER_FINDING_CRITIC=1`; env `0` overrides config | runtime wired, evaluation-gated |
| Evidence State helper | no automatic persistence | explicit helper call | implemented helper |
| Review Coverage | observation-dependent | actual LLM attempt / orchestration outcome | runtime wired |
| Gate coverage input | off | `RIVER_GATE_COVERAGE=1` | runtime wired |
| Gate require-LLM input | off | `RIVER_GATE_REQUIRE_LLM=1` | runtime wired |
| Layer-2 coverage qualification | on when observation exists | none | runtime wired |
| Reviewer Independence | off by absence of wiring | none | helper-only |
| Execution Manifest | path-dependent | producer attaches manifest | runtime wired, optional |
| Security Audit Run Record | no writer | none | schema only |
| Review Resolution | unavailable | none | planned |
| Semantic Precision `disposition` | unavailable | none | owner reserved, finding field not implemented |

## Human-surface mapping

```text
L1 Decision Surface
  - action-required count
  - human-review-required
  - incomplete Review Coverage when present
  - blind-spot count

L2 existing detailed surfaces
  - findings sections
  - Team Lead summary / blind spots
  - execution details
  - LLM used/skipped/error state
  - risk summary

L3 machine-readable surfaces
  - Review Artifact
  - Review Coverage
  - Execution Manifest
  - saved-run
  - Security Audit artifact when/if a writer exists
```

Team Lead summary is not the future Review Resolution Summary. The names and ownership stay separate.

## Adversarial consumer-gap check

Phase 2 を必要とする可能性が高い4候補を逆方向から確認した。

<!-- prettier-ignore -->
| Candidate | Current visibility | Gap judgment | If a future consumer needs more |
| --- | --- | --- | --- |
| `llmNotExecuted` / semantic review not executed | saved-run and Layer-2 signal keep the machine observation. Markdown execution details expose LLM used/skipped/error state. Missing API-key empty runs have an explicit renderer fallback. | No projection-shaped loss found. It is not an L1 field, but the uncertainty is not erased. | Extend H1/L2 wording if user research requires a stronger L1 callout. |
| Execution Manifest / run provenance | L3 machine-readable artifact/saved-run only; not summarized by the current L1 Decision Surface. | No current human consumer requirement was found that requires a new contract. L3 remains the canonical source. | Add a display-only renderer row/section from P2/P3. Do not create another provenance SSoT. |
| Finding Critic validation / Evidence State | `finding.validation` is persisted when the opt-in stage runs. Evidence State is derivable by its owner helper but is not a general persisted Review Artifact field. | No need for a new review-level projection. | Add finding-level display from F2/F4 only if a concrete human workflow requires it. |
| Reviewer Independence | No runtime artifact field exists. The helper is not wired. | This is a producer gap, not a presentation gap. A projection cannot make the evidence exist. | Wire P4/#1760 first, then project only the owning output. |

The challenge preserves the Phase 1 recommendation. Existing surfaces are sufficient for current consumers, while missing producers remain separate work.

## Source/docs drift register

<!-- prettier-ignore -->
| Drift | Source reality | Action |
| --- | --- | --- |
| ADR-011 says Finding Critic is pipeline-unwired and Review Artifact lacks `validation` | current `finding-critic-stage.mjs` is wired opt-in, and Review Artifact schema has optional `validation` | treat ADR-011 observation as historical; ADR-013/current source wins |
| ADR-011 reserves Semantic Precision `disposition` as unimplemented | current source still has no active finding-level disposition writer | no drift; keep unavailable |
| Review Resolution sidecar is described as owner in ADR-011/013 | no `schemas/review-resolution.schema.json` exists | keep planned, not evidence |
| Reviewer Independence helper exists | current runtime still does not emit it | keep helper-only |
| Security Audit Run Record schema exists | Stable Interfaces says writer is not wired | keep Experimental schema-only |

## Scenario review

This section is a static source/schema walkthrough at the pinned baseline. It does not claim that Phase 1 added or executed new runtime fixtures. A new fixture is required only if a concrete missing semantic is found.

<!-- prettier-ignore -->
| Scenario | Result | Evidence-backed judgment |
| --- | --- | --- |
| A clean findings + partial coverage | PASS | F1 empty cannot erase E1 partial. L1 shows incomplete coverage. Layer 2 demotes convergence. Gate reacts only with coverage opt-in. |
| B Critic / Evidence State unavailable | PASS | F2 stays absent when Critic does not run. F4 is not fabricated as persisted evidence. |
| C Gate enforced with `--gate` | PASS | D4 derivation, X1 enforcement, and Host/Human authority are separate. |
| D Review Resolution not implemented | PASS | R1 is planned only and cannot be counted as current evidence. |
| E historical / omitted fields | PASS | E1 absence is unknown/no observation, E2 absence is not execution proof, P1/P2 IDs are not equated. |
| F provenance without trust | PASS | P2 remains self-reported/untrusted. D4 `inputsHash` is not tamper-proof. P3 integrity does not imply actor authenticity. |
| G path-specific availability | PASS | `river run --gate` opt-ins differ from `review exec`; path is explicit in the map. |
| H surface composition / fallback | PASS | H1 is only L1. `printMarkdownReport` and L2/L3 retain LLM/execution uncertainty. |
| I lineage / no double count | PASS | E1 observation -> saved-run copy -> Layer-2 qualification / L1 projection remains one observation lineage. |
| J owner-extension compatibility | PASS | Stable exit semantics are separated from Experimental coverage/manifest and Internal CLI renderer. |
| K activation/default asymmetry | PASS | Finding Critic env/config precedence and Gate opt-ins are explicit; Layer-2 qualification remains default-on for observed data. |
| L failure-policy asymmetry | PASS | retain+human-review, demote, preserve-unknown, Gate fail-safe, and provenance trust behavior remain separate. |
| M truth vocabulary collision | PASS | `validation.finalStatus != validatedStatus != Evidence State != Security Audit evidenceState`. |

## Gaps and duplication candidates

### G1—Reviewer Independence is unavailable at runtime

This is a producer gap. A projection must not synthesize independence from generic provenance.

Resolution path if needed: wire the existing owner/helper or complete #1760 provenance work.

### G2—Review Resolution is planned

This is a lifecycle/author-response producer gap. It is not a Review Evidence Projection gap.

Resolution path if needed: implement the ADR-011 sidecar contract in its own workstream.

### G3—Semantic Precision disposition is reserved

This is a semantic-owner gap. A projection must not infer disposition from severity, confidence, or Evidence State.

### G4—Security Audit writer is absent

The schema cannot act as runtime evidence until a writer exists.

### G5—L1 does not show every provenance field

This is intentional compression, not evidence loss. L3 preserves the machine-readable source. If user research later proves that a specific provenance datum must move to L1, extend the existing Decision Surface additively. Do not introduce a new decision/projection owner.

## Phase 2 entry-criteria scorecard

<!-- prettier-ignore -->
| Criterion | Yes / No | Evidence |
| --- | --- | --- |
| 1. concrete consumer for a new Review Evidence Projection is identified | **No** | Existing consumers are Decision Surface, renderer, saved-run/runs-diff, Gate, and hosts. None currently requires a new projection contract. |
| 2. a missing current artifact/Decision Surface semantic is reproducible by fixture | **No** | The static walkthrough found no projection-shaped data-loss semantic to encode as a new fixture. Existing uncertainty is preserved in L1/L2/L3, or the producer itself is unavailable. |
| 3. existing owner additive extension is insufficient | **No** | Any future L1 visibility request can extend H1. Missing Independence/Resolution/Disposition/Security-Audit data requires producer work, not a new projection. |
| 4. expected projection can be deterministic from canonical inputs | **Yes** | ADR-013 constraints and the current mapping make a deterministic view possible, but it would duplicate existing surfaces. |
| 5. no Gate / `decision` / `suggestedLoopSignal` change is required | **Yes** | The mapping preserves all three as independent existing derived contracts. |

All five criteria are not `Yes`.

## Recommendation

```text
Phase 2 = not-needed-existing-surface
```

Do not implement a Review Evidence Projection now.

Reopen Phase 2 only when a concrete consumer demonstrates a fixture where:

1. canonical evidence exists,
2. existing L1/L2/L3 surfaces cannot expose it without semantic duplication,
3. extending the owning surface is insufficient, and
4. the new view remains deterministic and outside Gate/decision authority.

## Exit-criteria result

- [x] observation baseline main SHA recorded
- [x] required mapping columns covered across Mapping A/B
- [x] producer -> persistence -> consumer chain traced by runtime path
- [x] transformation and upstream lineage recorded
- [x] copy / projection / qualification are not double-counted as independent evidence
- [x] `river run` / saved-run / `runs diff` / `review plan\|exec` / Gate path differences recorded
- [x] each row has source path + symbol/schema evidence reference
- [x] current runtime availability checked against source/schema
- [x] source/docs drift recorded explicitly
- [x] existing Decision Surface overlap reviewed
- [x] L1/L2/L3 and renderer fallback traced
- [x] missing L1 data distinguished from complete visibility loss
- [x] current Gate inputs and enforcement path reviewed
- [x] helper-only / opt-in / planned states separated
- [x] activation/default/precedence recorded
- [x] stability / compatibility impact considered
- [x] truth vocabularies kept separate
- [x] artifact run id / saved-run id / manifest reviewRunId separated
- [x] Layer-1 / Layer-2 loop signals separated
- [x] omission semantics recorded
- [x] failure behavior and visibility recorded
- [x] provenance / integrity / replayability / trust separated
- [x] `inputsHash` non-security boundary recorded
- [x] all 13 scenarios reviewed as static source/schema walkthroughs
- [x] five Phase 2 criteria scored individually
- [x] runtime / schema behavior change = 0
- [x] recommendation recorded as `not-needed-existing-surface`
