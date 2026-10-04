# Evidence Architecture Phase 1—Existing Surface / Ownership Map

Issue #2472 / ADR-013 の Phase 1 調査結果です。

## Observation baseline

- main commit: `1e130774eb2f7eaec5f37df333c782dd6c28d812`
- ADR-013 blob: `59f371f3d8e8ad0c3d264d076a096954df01872c`
- 調査日: 2026-10-04
- Phase 1 の変更範囲: docs / analysis only
- runtime / schema / Gate behavior change: **0**

実装現実を優先するため、根拠は次の順序で扱います。

```text
current source code / JSON Schema
  > current stable reference docs / stability labels
  > ADR / development notes
  > Issue / PR prose
```

文書と runtime が一致しない場合は、文書へ暗黙に寄せず drift として記録します。

## Executive conclusion

Phase 2 の新しい `Review Evidence Projection` は、**現時点では実装しません**。

結論は次です。

```text
Phase 2 = not-needed-existing-surface
```

理由は3つあります。

1. 新projectionを必要とする concrete consumer が特定されていない。
2. 現在の evidence / uncertainty / provenance は、既存 Review Artifact、saved run、Execution Manifest、Review Coverage、Decision Surface へ分散して保持できる。
3. 見つかった不足は横断projection不足ではなく、Reviewer Independence、Review Resolution、Security Audit writer など既存 owner の availability / maturity の不足である。

したがって、現時点で新しい run-level projection を作ると、既存 owner の成熟前に第二の集約contractを作ることになります。

## Responsibility model

```text
Domain observations
  ├─ findings / validation
  ├─ Review Coverage
  ├─ provenance / Execution Manifest
  └─ optional owner-specific state
           │
           ├───────────────┐
           v               v
Derived projections     Advisory signals
  ├─ Evidence State       ├─ decision
  └─ Decision Surface     ├─ suggestedLoopSignal
                          └─ Gate
                               │
                               v
                         Enforcement adapter
                         --gate / Action gate:
                               │
                               v
                         Host / Human authority
```

`Review Evidence Projection` を Gate の上流にも、Decision Surface の必須中間層にも置きません。

## Availability summary

| Concept | Current availability | Default | Stability / compatibility |
| --- | --- | --- | --- |
| Review Artifact findings / decision / Layer 1 signal | runtime | on when artifact is emitted | versioned public schema |
| Finding Critic validation | opt-in runtime | off | additive optional field |
| Evidence State helper | helper-only derived view | not persisted by general review | internal helper / owner-specific |
| Review Coverage | runtime observation when LLM attempt exists | path-dependent | Experimental |
| `llmNotExecuted` | saved-run observation when true | omitted otherwise | additive optional |
| Execution Manifest | runtime on supported paths | optional | Experimental |
| Reviewer Independence | helper-only | not runtime-wired | internal helper |
| Security Audit Run Record `evidenceState` | schema-only / writer not wired | unavailable | Experimental |
| Review Resolution sidecar | planned architecture owner | unavailable | not published |
| Human Decision Surface | runtime Markdown projection | on when renderer needs attention surface | internal renderer over public state |
| Gate derivation | runtime advisory signal | path/config dependent | public artifact field; exit semantics separately Stable |
| `--gate` / Action gate enforcement | runtime enforcement adapter | opt-in | exit code meaning Stable |
| Host / Human merge/release authority | external to River Review | host policy | outside artifact schema |

## Mapping rows

以下の各rowは #2472 の required mapping columns をまとめて記録します。

### F1—`findings[]` / severity / confidence / `validatedStatus`

- **Evidence reference:** `schemas/review-artifact.schema.json::$defs.finding`。特に `severity`、`confidence`、`validatedStatus`。
- **Runtime path:** `river run`、JSON / YAML / HTML / Markdown output、saved run、GitHub Action。
- **Producer / owner:** reviewer + verifier / synthesis pipeline が finding を生成する。finding schema が field contract を所有する。
- **Runtime availability / activation / default:** findings はartifact surfaceで通常利用できる。個別 optional field はproducer依存である。
- **Stability / compatibility:** Review Artifact v1 の versioned public schemaである。既存fieldの意味変更は高コストである。optional metadata追加は additive である。
- **Source of truth / persistence:** Review Artifact の finding と saved-run finding が各surfaceの記録である。
- **Transformation / lineage:** observe → verify / synthesize → persist / render。表示コピーを独立Evidenceとして数えない。
- **Observed or derived:** finding claim はreview outputである。`validatedStatus` は synthesis verdict であり `validation.finalStatus` とは別である。
- **Consumer:** renderer、saved-run digest/diff、caller。
- **Missing semantics:** optional metadata欠損は「未観測」である。severity / confidence以外の欠損をPASSへ昇格しない。
- **Failure behavior / visibility:** verifier/synthesis経路の各契約に従う。欠損metadataはartifact上で欠損として残る。
- **Human surface / fallback:** L1は件数中心である。finding本文はMarkdown details / L3 artifactに残る。
- **Gate relationship:** blocking finding countsはGate入力になり得る。`validatedStatus` 自体はGateを上書きしない。
- **Trust / integrity:** reviewer outputであり、provenance強度は別contractである。
- **Authority:** none。

### F2—`findings[].validation.finalStatus`

- **Evidence reference:** `schemas/review-artifact.schema.json::$defs.finding.validation`。Finding Critic runtime は `src/lib/finding-critic.mjs::FINAL_STATUS` と `src/lib/finding-critic-stage.mjs::runFindingCriticStage`。
- **Runtime path:** Finding Criticが有効な review engine / reviewer orchestration path。
- **Producer / owner:** Finding Critic state machine がownerである。stageは配線だけを担当する。
- **Runtime availability:** opt-in runtimeである。
- **Activation condition:** `review.findingCritic.mode: active` または `RIVER_FINDING_CRITIC=1`。envがconfigより優先し、`RIVER_FINDING_CRITIC=0` はkill switchである。
- **Default state:** off。
- **Stability / compatibility:** additive optional Review Artifact metadataである。`FINAL_STATUS` vocabularyはownerに従う。
- **Source of truth / persistence:** findingの `validation.finalStatus`。
- **Transformation / lineage:** finding → adversarial validation → optional validation block。別のtruth vocabularyへ書き換えない。
- **Observed or derived:** validation protocolのterminal stateである。
- **Consumer:** Finding Critic-aware reporting / Evidence State helper。
- **Missing semantics:** default runではabsentである。absentはconfirmed / refuted のどちらとも確定していない。
- **Failure behavior:** LLM unavailable / timeout / exceptionは clean にせず `critic-timeout`、retain finding、human reviewである。
- **Failure visibility:** finding validation / stage observation / debug surface。
- **Human surface / fallback:** finding details / L3。Human Decision Surfaceはこのfieldから新しいjudgmentを作らない。
- **Gate relationship:** display / triage metadata。severityやGateを直接上書きしない。
- **Trust / integrity:** validation protocolの結果であり、actor provenanceとは別である。
- **Authority:** none。

### F3—Finding-level Evidence State projection

- **Evidence reference:** `src/lib/finding-evidence-state.mjs::projectFindingEvidenceState`。
- **Runtime path:** helper consumerが明示的に呼ぶ場合のみである。
- **Producer / owner:** Evidence State helper。
- **Runtime availability:** helper-only。general Review Artifactには `evidenceState` persisted fieldを仮定しない。
- **Activation / default:** explicit callのみ。default persistenceなし。
- **Stability / compatibility:** owner-specific derived helperである。新しいcommon enumとして拡張しない。
- **Source of truth:** `validation.finalStatus` のみ。
- **Persistence:** general reviewではnone。
- **Transformation / lineage:** `validation.finalStatus` → deterministic projection。
- **Observed or derived:** derived projection。
- **Consumer:** Security Audit / structured reporting候補。
- **Missing semantics:** missing / unknown source statusは fail-safeに `unresolved`。
- **Failure behavior:** unknown vocabularyを established / refutedへ推測しない。
- **Failure visibility:** helper resultの reasonCode。
- **Human surface / fallback:** general L1には直接出ない。元validationはfinding/L3に残る。
- **Gate relationship:** not consumed。
- **Trust / integrity:** upstream validationを超えるtrustを追加しない。
- **Authority:** none。

### F4—Security Audit Run Record `evidenceState`

- **Evidence reference:** `schemas/security-audit-run-record.schema.json`、`pages/reference/stable-interfaces.md`。
- **Runtime path:** 現在のgeneral review pathにはない。
- **Producer / owner:** Security Audit Run Record contract。
- **Runtime availability:** schema published / runtime writer未配線。
- **Activation / default:** unavailable by default。
- **Stability / compatibility:** Experimental。
- **Source of truth / persistence:** 将来は `.river/security-audit/` artifact。現時点ではruntime emissionなし。
- **Transformation / lineage:** finding Evidence Stateとのowner関係はあるが、general artifactへ横流ししない。
- **Observed or derived:** structured audit artifact field。
- **Consumer:** future security-audit consumer。
- **Missing semantics:** general reviewでabsentなのが正常である。
- **Failure behavior / visibility:** writer未配線のため current runtime evidence と数えない。
- **Human surface / fallback:** current general surfaceなし。
- **Gate relationship:** Gate integrationなし。
- **Trust / integrity:** schema存在はruntime attestationを意味しない。
- **Authority:** none。

### F5—Semantic Precision / disposition ownership

- **Evidence reference:** ADR-007、#1857、および Review Artifact schemaの既存finding metadata。
- **Runtime path:** current finding ranking / reporting pathの一部は存在するが、ADR-013が想定する finding-level disposition main path は完全なowner surfaceとしては未成熟である。
- **Producer / owner:** Semantic Precision owner。
- **Runtime availability:** partial / owner-defined。Evidence Architectureが再実装しない。
- **Activation / default:** existing reporting policy依存。
- **Stability / compatibility:** existing finding semanticsの意味変更はconsumer-visibleである。
- **Source of truth:** owning contract。
- **Persistence / transformation:** ownerが出したmetadataのみを使用する。
- **Lineage:** dispositionを Evidence StateやGateへ再計算しない。
- **Consumer:** reporting / human attention。
- **Missing semantics:** missing dispositionからmaterialityを推測しない。
- **Failure behavior / visibility:** owning pathに従う。
- **Human surface:** finding rendering / L2-L3。
- **Gate relationship:** Evidence Architectureからはnot consumed / not recomputed。
- **Trust / authority:** none。

### E1—Review Coverage

- **Evidence reference:** `schemas/review-coverage.schema.json` と `src/lib/review-coverage.mjs::deriveReviewCoverage`。LLM attempt 判定は `classifyLlmAttempt`、公開契約は `pages/reference/stable-interfaces.md`。
- **Runtime path:** single reviewer、`--reviewers`、JSON、saved run、`runs diff`。Gate効果は `river run --gate` のopt-in時のみである。
- **Producer / owner:** Review Coverage contract。
- **Runtime availability:** LLM callを実際にattemptしたrunで観測される。intentional skipだけのrunではfieldを生成しない。
- **Activation / default:** observationはattempt依存。Gate input化は `RIVER_GATE_COVERAGE=1` のみである。
- **Stability / compatibility:** Experimental。optional field追加は想定される。
- **Source of truth / persistence:** runtime `reviewCoverage` object。saved runは同じobjectをrecomputeせず保存する。
- **Transformation / lineage:** review units → `deriveReviewCoverage` → artifact / saved-run copy → Layer 2 qualification / Decision Surface projection。
- **Observed or derived:** execution completenessのderived observationである。finding countとは独立である。
- **Consumer:** saved-run analytics、`runs diff`、Decision Surface、optional Gate。
- **Missing semantics:** absenceは `complete` でも `partial` でもない。historical / skipped runでは observationなしである。
- **Failure behavior:** required unit不完了は `partial` / `not_executed`。inconsistent stateはconsumer側でconservativeに扱う。
- **Failure visibility:** artifact / saved-run / Decision Surface / Gate reason when opt-in。
- **Human surface / fallback:** L1 coverage observation、Markdown details、L3 object。
- **Gate relationship:** defaultではdecision/Gate非影響。opt-inで `COVERAGE_INCOMPLETE`。
- **Trust / integrity:** execution observation。review correctnessの証明ではない。
- **Authority:** none。

### E2—`llmNotExecuted` / deterministic-unrunnable observation

- **Evidence reference:** `src/lib/review-coverage.mjs::allLlmAttemptsSkipped` と `src/lib/result-store.mjs::buildRunRecord`。consumer contract は `pages/reference/loop-convergence-contract.md`。
- **Runtime path:** review runtime → saved run → `runs diff`; optional Gate path。
- **Producer / owner:** LLM-attempt classifier / run gate owner。
- **Runtime availability:** `llmNotExecuted` はtrueのときsaved runへ出る。falseはfieldとして永続化しない。
- **Activation / default:** Layer 2 qualificationはrecordにtrueがあれば既定で有効。Gateは `RIVER_GATE_REQUIRE_LLM=1` のときだけ有効である。
- **Stability / compatibility:** additive optional observation。
- **Source of truth / persistence:** runtime observation / saved run。
- **Transformation / lineage:** attempt debug → boolean observation → Layer 2 qualification / optional Gate input。
- **Observed or derived:** derived execution observation。
- **Consumer:** `runs diff`、Gate。
- **Missing semantics:** absentは「LLM実行済み」の証拠ではない。
- **Failure behavior:** latest saved runがtrueなら Layer 2 `CONVERGED` を `NO_SIGNAL` へ降格する。
- **Failure visibility:** saved run / runs diff / Gate reason。
- **Human surface / fallback:** Markdown rendererにはLLM未設定/失敗用の別fail-safe headerもある。
- **Gate relationship:** opt-inで `LLM_NOT_EXECUTED` → `ESCALATE`。dry-runの `NOT_EXECUTED` 等の先行規則を尊重する。
- **Trust / integrity:** execution observationでありsemantic correctnessではない。
- **Authority:** none。

### E3—`deterministicUnrunnable`

- **Evidence reference:** `src/lib/deterministic-command-orchestrator.mjs` と `src/lib/run-gate.mjs::deriveRunGate`。Gate 導出は `src/lib/gate-decision.mjs::deriveGateDecision`、契約は `pages/reference/loop-convergence-contract.md`。
- **Runtime path:** deterministic execution gate → `river run --gate` / Gate derivation。
- **Producer / owner:** deterministic command orchestratorがstaging incompletenessを観測し、run gateがGate inputへ渡す。
- **Runtime availability:** opt-in。
- **Activation / default:** `RIVER_GATE_STAGING_UNRUNNABLE=1` のときだけstaging incompleteを `deterministicUnrunnable: true` としてGateへ持ち込む。既定はoffである。
- **Stability / compatibility:** Gateの独立入力である。Review Coverage vocabularyへ統合しない。
- **Source of truth / persistence:** runtime Gate input。`strictBlock` とは別fieldである。
- **Transformation / lineage:** staging incomplete observation → boolean Gate input → `ESCALATE / DETERMINISTIC_UNRUNNABLE`。
- **Observed or derived:** execution incompleteness observation。
- **Consumer:** deterministic Gate derivation。
- **Missing semantics:** false / absentを「deterministic checkが完全に実行された証明」として一般化しない。opt-inがoffならGateへ持ち込まれないためである。
- **Failure behavior:** empty / incomplete sandboxのchecker exit 0を変更へのPASSとして扱わず、opt-in時は `ESCALATE` へ倒す。
- **Failure visibility:** Gate `reasonCode=DETERMINISTIC_UNRUNNABLE`。
- **Human surface / fallback:** Gate / Decision Surface / L3 inputs。
- **Gate relationship:** independent Gate input。`strictBlock` や Review Coverageへfoldしない。
- **Trust / integrity:** staging observationの完全性に依存する。
- **Authority:** none。

### P1—Review Artifact `trace.run_id`

- **Evidence reference:** `schemas/review-artifact.schema.json::trace.run_id`。
- **Runtime path:** finalized Review Artifact。
- **Producer / owner:** artifact finalization。
- **Runtime availability:** optional / older artifactではabsent。
- **Activation / default:** artifact finalization時。
- **Stability / compatibility:** additive optional trace metadata。
- **Source of truth / persistence:** Review Artifact。
- **Transformation / lineage:** finalization-generated identifier。
- **Observed or derived:** identity metadata。
- **Consumer:** debugging / handoff。
- **Missing semantics:** absentはolder artifact等を意味し得る。
- **Failure visibility:** absent。
- **Human surface:**通常L3。
- **Gate relationship:** not consumed。
- **Trust / integrity:** identifierだけではattestationにならない。
- **Authority:** none。

### P2—saved-run `runId` / provenance

- **Evidence reference:** `src/lib/result-store.mjs::buildRunRecord`、`buildRunProvenance`、`normalizeProvenance`。
- **Runtime path:** `river run --save` / GitHub Actions auto-save / `river runs *`。
- **Producer / owner:** result store。
- **Runtime availability:** save時のみ。
- **Activation / default:** `--save` またはhost auto-save。
- **Stability / compatibility:** result-store recordはaudit convenienceである。tamper-evident contractではない。
- **Source of truth / persistence:** `.river/runs/*.json`。
- **Transformation / lineage:** runtime result → saved record copy。coverageはrecomputeしない。
- **Observed or derived:** `runId` はstore identity。`trace.run_id` と同一性を仮定しない。
- **Consumer:** runs list/diff/summary/digest。
- **Missing semantics:** provenance absentはtrust verifiedを意味しない。`dirty: null` はunknownである。
- **Failure behavior:** caller-supplied unknown `evidenceSource` は provenance blockをdropしstderr warningを出す。`trustedBy` は常にnullへrepinする。
- **Failure visibility:** stderr + record omission。
- **Human surface / fallback:** digest / L3 saved record。
- **Gate relationship:** saved gateを記録できるがstore自体はGate authorityではない。
- **Trust / integrity:** SELF-REPORTED / untrusted。repo内storeはagent write authority内である。
- **Authority:** none。

### P3—Execution Manifest

- **Evidence reference:** `schemas/execution-manifest.schema.json`、`src/lib/execution-manifest.mjs`、`pages/reference/stable-interfaces.md`。
- **Runtime path:** supported `river run --save`、`review plan`、`review exec` / replay。
- **Producer / owner:** Execution Manifest contract。
- **Runtime availability:** additive / optional runtime。
- **Activation / default:** supported pathがmanifest specをbuildできる場合。
- **Stability / compatibility:** Experimental。
- **Source of truth / persistence:** `executionManifest` block + separate schema。
- **Transformation / lineage:** resolved execution inputs → canonicalized manifest + hashes。`review plan` / `review exec` のproduction testでは `manifest.reviewRunId === artifact.trace.run_id` を固定している。
- **Observed or derived:** execution provenance / replayability metadata。saved-run側のcanonical `review_run_id` は `deriveReviewRunId()` が `review_run_id` → `reviewRunId` → legacy `runId` の順でread-side解決する。artifact trace idとsaved-run idの普遍的な同一性は仮定しない。
- **Consumer:** `verifyExecutionManifest` / replayability assessment。
- **Missing semantics:** absent artifactはmanifest-backed replayabilityを主張できない。`reviewRunId` がnullの場合も、別identityを推測して補完しない。
- **Failure behavior:** integrity verificationとreplayability assessmentを分離する。
- **Failure visibility:** verifier / artifact。
- **Human surface / fallback:** L3 artifact / manifest references。
- **Gate relationship:** manifest自体はGate decisionを再計算しない。
- **Trust / integrity:** content integrity / replayabilityとactor authenticityは別である。
- **Authority:** none。

### P4—Reviewer Independence helper

- **Evidence reference:** `src/lib/reviewer-independence.mjs`、`docs/development/2267-phase5a-reviewer-independence.md`。
- **Runtime path:** current general review runtimeには未配線。
- **Producer / owner:** Reviewer Independence helper。
- **Runtime availability:** helper-only。
- **Activation / default:** explicit helper call。
- **Stability / compatibility:** internal / not published as current artifact contract。
- **Source of truth:** finderRunId / verifierRunId comparison。
- **Persistence:** none in current general runtime。
- **Transformation / lineage:** two run ids → same / distinct / unknown logical execution separation。
- **Observed or derived:** derived independence state。
- **Consumer:** future provenance-aware validation。
- **Missing semantics:** unknownをindependentへ昇格しない。
- **Failure behavior:** missing id → unknown。
- **Human surface:** none by default。
- **Gate relationship:** not consumed。
- **Trust / integrity:** distinct run idはdifferent actor/provider/model/correctnessを証明しない。
- **Authority:** none。

### S1—`decision`

- **Evidence reference:** `schemas/review-artifact.schema.json::decision`、scoring engine。
- **Runtime path:** Review Artifact / saved run / renderer。
- **Producer / owner:** scoring verdict。
- **Runtime availability:** optional on older / plan-only artifacts。
- **Activation / default:** review scoring path。
- **Stability / compatibility:** public Review Artifact semantics。
- **Source of truth / persistence:** artifact `decision`。
- **Transformation / lineage:** findings/scoring → advisory verdict。
- **Observed or derived:** advisory signal。
- **Consumer:** renderer、Layer 1 signal、Gate。
- **Missing semantics:** absentはauto-approveではない。
- **Failure behavior:** downstream rules must preserve unknown / no signal。
- **Human surface:** headline / L1。
- **Gate relationship:** Gate inputの1つである。Gateと同一ではない。
- **Trust / integrity:** derivation contextのtrustに従う。
- **Authority:** none。

### S2—Layer 1 `suggestedLoopSignal`

- **Evidence reference:** `schemas/review-artifact.schema.json::suggestedLoopSignal`、`pages/reference/loop-convergence-contract.md`。
- **Runtime path:** single Review Artifact。
- **Producer / owner:** loop signal derivation。
- **Runtime availability:** additive / optional。
- **Activation / default:** decision + blocking finding countsがあるreview path。
- **Stability / compatibility:** public artifact additive signal。
- **Source of truth / persistence:** Review Artifact top-level field。
- **Transformation / lineage:** decision + blocking counts → `NO_SIGNAL | REVISE_REQUIRED | CONVERGED | ESCALATE_HUMAN`。
- **Observed or derived:** advisory signal。
- **Consumer:** agentic fix loop / Gate input。
- **Missing semantics:** absent / unknownはstop許可ではない。
- **Failure behavior:** undeterminedは `NO_SIGNAL`。
- **Human surface:** machine-readable / docs。必要に応じrendererがdecisionを表示する。
- **Gate relationship:** inputでありGateそのものではない。
- **Trust / integrity:** Layer 1はcoverage / oscillationを内包しない。
- **Authority:** none。

### S3—Layer 2 `river runs diff` signal

- **Evidence reference:** `pages/reference/loop-convergence-contract.md`、saved-run `reviewCoverage` / `llmNotExecuted`、review differ。
- **Runtime path:** `river runs diff <id...>`。
- **Producer / owner:** saved-run differ / loop qualification。
- **Runtime availability:** saved runsが必要である。
- **Activation / default:** coverage / llm-not-executed qualificationはrecordが存在すれば既定で適用する。3+ runsではoscillationも評価する。
- **Stability / compatibility:** caller-facing derived output。Layer 1とは別derivationである。
- **Source of truth / persistence:** saved run records。Layer 2 output自体をcanonical truthとして再保存しない。
- **Transformation / lineage:** Layer 1-like base signal + latest coverage / llmNotExecuted + oscillation → qualified signal。
- **Observed or derived:** advisory qualification。
- **Consumer:** loop caller。
- **Missing semantics:** missing coverageはowner-specific `unknown` として扱い、incompleteとは断定しない。missing `llmNotExecuted` もtrueとはみなさない。
- **Failure behavior:** incomplete coverage / llmNotExecutedは `CONVERGED` のみ `NO_SIGNAL` へ降格する。oscillationはstop/escalate方向である。
- **Human surface:** CLI diff output。
- **Gate relationship:** Gateとは別経路である。
- **Trust / integrity:** saved-run storeのself-reported trust boundaryを継承する。
- **Authority:** none。

### S4—Gate

- **Evidence reference:** `schemas/review-artifact.schema.json::gate`、`src/lib/gate-decision.mjs::deriveGateDecision`、`src/lib/run-gate.mjs`。
- **Runtime path:** `river run` / supported review pathでGate derivationが有効な場合。
- **Producer / owner:** deterministic Gate derivation。
- **Runtime availability:** path/config dependent。
- **Activation / default:** Gateは複数existing inputからderiveする。coverage / require-LLMは別々のopt-inである。
- **Stability / compatibility:** artifact gateはadditive machine-readable signal。Gate exit code意味はStableである。
- **Source of truth / persistence:** artifact `gate` + deterministic replay through inputs。
- **Transformation / lineage:** decision / loop signal / risk / execution / coverage opt-in等 → Gate。
- **Observed or derived:** advisory signal。
- **Consumer:** renderer / `--gate` / host。
- **Missing semantics:** unknown inputをGOへ昇格しない。
- **Failure behavior:** conservative `NO_GO` / `ESCALATE` rules。
- **Failure visibility:** `reasonCode` / renderer / process exit when enforced。
- **Human surface:** L1 Decision Surface can point to Gate escalation; full inputs remain L3。
- **Gate relationship:** self。
- **Trust / integrity:** `inputsHash` はregression summaryでありtamper-proofではない。trusted hostはinputsをreplayできる。
- **Authority:** Gate derivation itself has none。

### H1—Human Decision Surface / Markdown renderer

- **Evidence reference:** `src/cli/render.mjs::buildHumanDecisionSurface`、`formatHumanDecisionSurfaceMarkdown`、`printMarkdownReport`。
- **Runtime path:** Markdown / GitHub comment。
- **Producer / owner:** Human Attention renderer。
- **Runtime availability:** renderer path。
- **Activation / default:** attention-required stateがある場合L1を表示する。
- **Stability / compatibility:** internal projection over existing state。新しいtruth / judgmentを所有しない。
- **Source of truth / persistence:** input artifact/result。renderer outputはprojectionである。
- **Transformation / lineage:** existing decision / gate / risk / coverage / blind spots → selective L1 display。
- **Observed or derived:** presentation projection。
- **Consumer:** human reviewer。
- **Missing semantics:** L1に無い情報を「存在しない」とみなさない。
- **Failure behavior:** LLM failed-empty / llmless-emptyにはL1 builder外のfail-safe headerがある。
- **Failure visibility:** Markdown header / coverage observation。
- **Human surface / fallback:** L1 → finding sections / Team Lead report / L3 artifact。
- **Gate relationship:** Gateを表示するが再計算しない。
- **Trust / integrity:** underlying ownerを超えない。
- **Authority:** none。

### H2—Team Lead summary / blind spots と L2 Resolution Summary

- **Evidence reference:** `src/cli/render.mjs::buildHumanDecisionSurface` の `teamLeadReport.blindSpots`、ADR-012、ADR-011。
- **Runtime path:** reviewer orchestration / Markdown reporting。
- **Producer / owner:** Team Lead reportはcurrent runtime owner。Resolution SummaryはReview Resolution architecture ownerである。
- **Runtime availability:** Team Lead summaryはpath-dependent。L2 Resolution Summary sidecarは未実装である。
- **Activation / default:** reviewer orchestration等。
- **Stability / compatibility:** current Team Lead surfaceとplanned Resolution surfaceは別contractである。
- **Source of truth / persistence:** Team Lead result / future sidecar。
- **Transformation / lineage:** blind spotsはcurrent reportからL1へprojectionされる。
- **Observed or derived:** summary / presentation。
- **Consumer:** human reviewer。
- **Missing semantics:** Team Lead summary absentからResolution stateを推測しない。
- **Failure behavior / visibility:** current surfaceはblind spotを保持する。future resolutionは未利用である。
- **Human surface:** L1/L2候補。
- **Gate relationship:** blind spotsをGateの新inputへ変換しない。
- **Trust / authority:** none。

### R1—Review Resolution sidecar

- **Evidence reference:** ADR-011 / #2322。
- **Runtime path:** current runtimeなし。
- **Producer / owner:** Review Resolution architecture owner。
- **Runtime availability:** planned / schema未実装。
- **Activation / default:** unavailable。
- **Stability / compatibility:** not published。
- **Source of truth / persistence:** future sidecar。現時点では存在しない。
- **Transformation / lineage:** author/human handling + later verificationを所有する予定である。
- **Consumer:** future L2 Resolution Summary。
- **Missing semantics:** current absenceはunresolved findingを意味しない。単にcontract未実装である。
- **Failure behavior / visibility:** current evidence sourceとして数えない。
- **Human surface:** future L2。
- **Gate relationship:** current Gate inputではない。
- **Trust / authority:** future owner contractに従う。merge authorityは持たせない。

### A1—`--gate` / GitHub Action `gate:` enforcement

- **Evidence reference:** `src/lib/gate-exit.mjs::gateDecisionExitCode`、`pages/reference/stable-interfaces.md`。
- **Runtime path:** CLI / GitHub Action。
- **Producer / owner:** enforcement adapter。
- **Runtime availability:** opt-in。
- **Activation / default:** `--gate` または Action `gate:`。
- **Stability / compatibility:** gate decision exit code `0/1/2/3` semanticsはStableで、意味変更はmajor対象である。
- **Source of truth / persistence:** Gate decision。exit code自体はprocess stateである。
- **Transformation / lineage:** `GO | GO_WITH_OBSERVATION → 0`、`NO_GO → 1`、`ESCALATE → 3`。
- **Observed or derived:** enforcement mapping。
- **Consumer:** shell / CI runner / host。
- **Missing semantics:** Gateなしで勝手にPASSを生成しない。
- **Failure behavior:** non-GOをprocess statusへ反映する。
- **Failure visibility:** process exit / CI status。
- **Human surface:** CI status + artifact reason。
- **Gate relationship:** Gateを執行するが意味を変えない。
- **Trust / integrity:** host境界の強度に依存する。
- **Authority:** process-control adapter。merge/release authorityそのものではない。

### A2—Host / Human authority

- **Evidence reference:** ADR-013、Review Artifact Gate description、stable interface docs。
- **Runtime path:** GitHub / CI / deployment / human review process。
- **Producer / owner:** host policy / human。
- **Runtime availability:** River Review外。
- **Activation / default:** host policy。
- **Stability / compatibility:** River Review artifact contract外である。
- **Source of truth / persistence:** host system。
- **Transformation / lineage:** advisory signalを受けてactionを決める。
- **Observed or derived:** authority decision。
- **Consumer:** repository / release / production systems。
- **Missing semantics:** River Review signalだけでmerge authorityが生まれない。
- **Failure behavior / visibility:** host責務。
- **Human surface:** host UI / approvals。
- **Gate relationship:** Gate consumer。
- **Trust / integrity:** host trust boundary。
- **Authority:** merge / release / promotionの最終authority。

## Data-flow map

### Review execution

```text
diff / artifacts
  -> reviewer / verifier
  -> findings
  -> optional Finding Critic
       -> validation.finalStatus
       -> optional Evidence State helper
  -> scoring
       -> decision
       -> Layer 1 suggestedLoopSignal
  -> optional Review Coverage observation
  -> optional Execution Manifest
  -> optional Gate derivation
  -> Review Artifact
       ├─ Markdown / Decision Surface
       ├─ JSON / YAML / HTML
       └─ optional save
            -> .river/runs/<runId>
                 -> runs diff
                      -> Layer 2 qualification
```

### Enforcement

```text
Gate
  -> --gate / Action gate:
       -> process exit / CI status
            -> Host / Human
                 -> merge / stop / continue / release
```

GateとHost authorityの間に、新しいprojectionやJudgeを追加する必要はありません。

## Runtime path differences

### `river run`

Review executionの主要pathです。Review CoverageはLLM attemptが存在するときだけ観測されます。

### `river run --save`

runtime resultをsaved-run recordへcopyします。`reviewCoverage` はrecomputeしません。`llmNotExecuted` はtrueのときだけ保存します。

`trace.run_id` とsaved-run `runId` は別identityです。

### `river runs diff`

saved-run evidenceを読み、Layer 2 signalを導出します。

これはLayer 1 signalをそのまま表示するだけではありません。最新runのcoverage / `llmNotExecuted` と、3+ run時のoscillationでqualificationします。

### `river review plan` / `review exec`

Execution Manifest等のartifact contractを利用できます。一方、Review CoverageのGate効果は `river run --gate` と同じとはみなしません。

stable interface docsが示すとおり、`review exec` 側はengineがcoverage observationを返さないpathでは coverage Gate inputがno-opになります。

### GitHub Action

ActionはRiver Review signalをCIへ接続します。Action / process statusはenforcement surfaceであり、merge authorityそのものではありません。

## Surface mapping

### L1—Decision Surface

現在の `buildHumanDecisionSurface()` は次を既存stateから直接読みます。

- action-required finding count
- `decision`
- Gate escalation
- risk-map / risk-assessment human-review requirement
- Review Coverage status / incomplete units
- Team Lead blind spots

Review Evidence Projectionを必須中間層にする必要はありません。

### L2—summary surfaces

現在はfinding sections / Team Lead report等があります。

ADR-012 / ADR-011が想定する Review Resolution由来のL2 Resolution Summaryは、current runtime ownerとしては未実装です。

Team Lead summaryをResolution Summaryとして扱いません。

### L3—canonical machine-readable surfaces

- Review Artifact
- saved run
- Execution Manifest
- owner-specific sidecar / artifact where implemented

L1に表示されない情報があっても、L3で保持されるならcomplete lossではありません。

## Trust / integrity boundaries

### saved-run provenance

`buildRunProvenance()` が書く provenance は self-reported です。

- `evidenceSource: CI` は「CIであると自己申告した」以上のattestationではない。
- `trustedBy` はnullに固定する。
- `dirty: null` はunknownである。
- repo内 `.river/runs/` はreviewed agentのwrite authority内である。

### Execution Manifest

Manifest hash / verificationはcontent integrity / replayabilityを扱います。

actor authenticityやexternal trustを同時に証明するものではありません。

### Gate `inputsHash`

`inputsHash` はsame-input regression comparison用です。

tamper-proof security controlではありません。

## Source / docs drift register

### Drift 1—Review Resolution owner vs runtime availability

ADR-011はReview Resolution sidecarのownerを定義します。

current repositoryには、そのsidecarをcurrent evidence sourceとして扱えるruntime schema / writerはありません。

**Disposition:** architecture ownerとして残し、Phase 1 mappingでは `planned / unavailable` とします。

### Drift 2—Reviewer Independence design vs runtime wiring

Reviewer Independence helperはlogical run separationを定義しています。

current general runtime artifactへは配線されていません。

**Disposition:** `helper-only`。distinct run idsをactor/model/provider independenceへ拡大解釈しません。

### Drift 3—Security Audit Run Record schema vs writer

Security Audit Run RecordはExperimental schemaとしてpublishedです。

stable interfacesは runtime writer未配線を明記しています。

**Disposition:** schema existenceをcurrent observationとして数えません。

### Drift 4—Review Coverage “observe-only” wording vs optional Gate use

Review Coverage自体はdecision/Gateのownerではありません。

一方、current runtimeでは `RIVER_GATE_COVERAGE=1` を明示した `river run --gate` がcoverageを独立Gate inputとして読みます。

**Disposition:** “coverage owner does not decide” と “Gate may opt-in consume coverage” を分離します。

### Drift 5—upstream review execution availability

PR #2471の実運用では、#2474適用後にMarkdown ADRがupstream review inputへ入ることを確認しました。

同時に、workflowがLLM dry-runで executable skillを選べない場合、source diffが存在してもsemantic reviewは未実行になり得ます。

**Disposition:** source diff existence、review input existence、semantic execution、coverageを別事実として保持します。

## Scenario validation

| Scenario | Result | Evidence / judgment |
| --- | --- | --- |
| A — clean findings + partial coverage | PASS | Review Coverageはfinding countと独立です。L1はcoverage gapを表示でき、Gate consumptionはopt-inです。 |
| B — Finding Critic / Evidence State unavailable | PASS | Critic default off。validation absentをtruthにしません。Evidence State helperはmissing statusをunresolvedへ倒します。 |
| C — Gate enforced with `--gate` | PASS | Gate derivation、gate exit adapter、Host/Human authorityを別rowで表現できました。 |
| D — Review Resolution not implemented | PASS | ownerはADR-011、runtime evidence sourceはplanned/unavailableとして分離しました。 |
| E — historical / omitted fields | PASS | coverage欠損をcompleteとせず、`llmNotExecuted` 欠損をexecutedの証拠とせず、trace / manifest / saved-run identityをpath-specificに保持します。 |
| F — provenance exists but trust absent | PASS | saved-run provenanceはself-reported。Manifest integrityとauthenticityを分離し、`inputsHash`もsecurity controlにしません。 |
| G — path-specific availability | PASS | `river run --gate` と `review exec` のcoverage Gate pathを分離しました。 |
| H — surface composition / fallback | PASS | L1 builder外のLLM failure headerを含め、final rendererとL3 fallbackを追跡しました。 |
| I — evidence lineage / no double counting | PASS | coverage observation → saved copy → Layer 2 qualification / L1 projectionを1 lineageとして扱います。 |
| J — owner extension compatibility | PASS | Stable gate exit semanticsとExperimental Coverage / Manifestを別compatibility costとして扱います。 |
| K — activation / default asymmetry | PASS | Critic env>config + kill switch、Gate coverage / require-LLM opt-in、Layer 2 default qualificationを分離しました。 |
| L — failure-policy asymmetry | PASS | Critic retain+escalate、provenance drop-with-warning、coverage incompleteness、deterministic staging incompleteness、preserve-unknown、conservative Gateを別policyとして記録しました。 |
| M — truth vocabulary collision | PASS | `validation.finalStatus != validatedStatus != Evidence State != Security Audit evidenceState` を保持しました。 |

13シナリオすべてで、新しいrun-level projectionを必須とするfailureは再現しませんでした。

## Gaps and duplication candidates

### Gap 1—Reviewer Independence runtime availability

runtime availability の不足は確認できますが、current consumer gap は確認できません。

そのため Phase 1 の残タスクにはしません。

将来 consumer requirement が発生した場合は #1760 / owning provenance contract側でruntime wiringを検討します。

### Gap 2—Review Resolution runtime availability

current runtimeには存在しませんが、Phase 1で必要とするconsumerも確認できません。

author / human resolutionをmachine-readableに扱うconsumerが具体化した場合だけ、#2322 / ADR-011 owner側を実装します。

新projectionがresolution stateを独自に作ってはいけません。

### Gap 3—Security Audit writer

schemaは存在しますが、current Phase 1 consumer requirementはありません。

Security Audit Run Recordをconsumerが必要とする場合だけ、そのowner writerを配線します。

general Review Artifactへ `evidenceState` をコピーする理由にはなりません。

### Gap 4—Human-facing cross-owner summary

現行Decision Surfaceは主要なattention signalを既に直接読めます。

新しいconsumer requirementが出るまで、横断summary objectを追加しません。

## Owner-extension compatibility assessment

| Candidate | Stability | Preferred action |
| --- | --- | --- |
| Reviewer Independence | internal/helper-only | owner側runtime wiringが必要になった時だけadditiveに実装 |
| Review Resolution | planned / not published | #2322 ownerでschema + sidecarを定義 |
| Security Audit Run Record | Experimental | owner writerを配線。general artifactへ複製しない |
| Review Coverage | Experimental | owner field追加は可能だが、Gate意味変更とは分離 |
| Execution Manifest | Experimental | provenance/replayability ownerとしてadditiveに拡張可能 |
| Gate exit semantics | Stable | Phase 2都合で意味変更しない |
| Human Decision Surface | internal projection | existing stateの表示改善は可能。新truthは作らない |

## Phase 2 entry criteria scorecard

### 1. Concrete consumer が特定されている

判定: **NO**

現在のDecision Surface、saved-run consumer、Gate、CLIは既存ownerを直接消費できます。

「Review Evidence Projectionという新objectを必要とするconsumer」は特定できませんでした。

### 2. Current artifact / Decision Surface の不足をfixtureで再現できる

判定: **NO**

13シナリオはavailability / trust / path differenceを再現しましたが、いずれも既存owner stateを保持したまま説明できます。

新projectionが無いことによる安全性failureは再現しませんでした。

### 3. Existing owner の additive extensionだけでは解決しにくい理由がある

判定: **NO**

確認したgapはReviewer Independence、Review Resolution、Security Audit writerなどowner-specificです。

必要になればowning contractをadditiveに成熟させる方が責務境界に合います。

### 4. Canonical input から expected projectionを決定論的に記述できる

**NO—consumer未確定のため設計しない**

pure deterministic projection自体は技術的に可能です。

しかしconsumer requirementが無い状態でshapeを固定すると、不要な第二surfaceになります。

そのためPhase 2 entry判定ではNOとします。

### 5. Gate / `decision` / `suggestedLoopSignal` の変更を必要としない

判定: **YES**

仮に将来projectionを追加しても、ADR-013によりこれらexisting signalを再計算・上書きしません。

## Phase 2 recommendation

```text
not-needed-existing-surface
```

現時点では concrete consumer gap を再現できず、current consumer needs は existing surfaces で満たせます。

確認できた owner-specific maturity gap は、Phase 2 の残タスクとして自動的に実装しません。

将来 concrete consumer gap が発生した場合だけ、次の順で再評価します。

1. existing surface で解決できるか
2. existing owner の additive extension で解決できるか
3. それでも不足する場合だけ Review Evidence Projection を検討する

new Review Evidence Projection は最後の選択肢です。

## Reopen condition

Phase 2を再検討するのは、次をすべて示せるときです。

1. concrete consumerがある
2. existing surfacesでは不足するfixtureがある
3. owner-specific additive extensionでは解決しにくい
4. deterministic expected projectionを定義できる
5. Gate / decision / loop signalを変更しない

条件を満たさない要求は、Phase 2再開理由にしません。

## Exit criteria result

- [x] observation baseline の main commit SHA を記録
- [x] required mapping columns が全対象をカバー
- [x] producer → persistence → consumer chain を runtime path別に追跡
- [x] transformation / upstream lineage を記録
- [x] copy / projection / qualification を独立Evidenceとして重複計上しない
- [x] `river run` / saved-run / `runs diff` / `review plan|exec` / Gate enforcement の差を明示
- [x] mapping row に path + symbol / field の evidence reference を記録
- [x] runtime availability を source / schema で確認
- [x] docs / runtime drift を register化
- [x] existing Decision Surfaceとの重複を確認
- [x] L1 / L2 / L3 / renderer fallbackを追跡
- [x] current Gate inputs / enforcement pathを確認
- [x] `deterministicUnrunnable` をcoverageとは別のopt-in incompleteness inputとして確認
- [x] helper-only / opt-in / plannedを分離
- [x] activation condition / default / precedenceを記録
- [x] stability / compatibility impactを評価
- [x] truth vocabulary差を明示
- [x] artifact run id / saved-run id / manifest reviewRunIdを分離
- [x] Layer 1 / Layer 2 signalを分離
- [x] field omission semanticsを記録
- [x] failure behavior / visibilityを記録
- [x] provenance / integrity / replayability / trustを分離
- [x] `inputsHash` の非security境界を明記
- [x] 13 scenariosを検証
- [x] Phase 2 entry criteria 5項目を yes / no / evidence で判定
- [x] runtime / schema behavior change = 0
- [x] recommendationを evidence付きで決定

## Final decision

Phase 1は完了です。

current consumer needs は existing surfaces で満たせます。

新しい Review Evidence Projection を作るより、既存ownerをcanonical sourceとして維持する方が安全です。

```text
Evidence State != Review Evidence Projection
Review Evidence Projection != Decision Surface
Decision Surface != Gate
Gate != Enforcement
Enforcement != Host / Human Authority
```

現時点では Review Evidence Projection 自体を追加しません。
