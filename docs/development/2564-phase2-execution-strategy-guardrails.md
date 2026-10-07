# #2564 Phase 2—Execution Strategy / Guardrails 観測設計

> Status: Design-only。Runtime、公開 schema、Gate、routing は変更しない。
> Tracking: #2564 Phase 2。Phase 1 は #2566 で完了。Phase 3〜5 は未着手。
> Diátaxis: 内部 Architecture / Design。

## 1. 設計上の決定

HydraFusion の Single / Cascade / Critique は上位 Harness の Execution Strategy 候補とする。River Review の新しい実行モードとして追加しない。

Execution Strategy は Model / Effort / Role / Autonomy / Judgment Placement から独立した軸である。Reviewer routing、Skill selection、Gate の既存責務を変えない。

### 上位 Harness / Host

Host は戦略の選択、モデルの割当、solver / revision / escalation / fallback の実行を所有する。patch 適用、deploy、merge、release の実行権限も Host / Human が所有する。

`single` は単独モデルによる処理であり、レビュー品質の保証ではない。`cascade` は provider の HTTP retry と異なる。`critique` は reviewer の多数決を意味しない。

### River Review

River Review は既存の `selectRolesAuto()` と Skill selection を使う。Review Coverage、Finding Critic、Verifier、Gate から判断材料を返す。

`docs/development/agent-contract.md` は論理 Agent と reviewer lens の責務を定義する。`#2455` の Review Planning Bridge は observe-only とし、別の routing SSoT を作らない。

### 判断と証拠の分離

Model ≠ Role。Execution Strategy ≠ Reviewer routing。Review ≠ Verification。Execution ≠ Judgment。

Runtimeのモデル選択だけで reviewer independence を証明しない。実行の観測だけで Human approval を得たことにしない。

## 2. Five guardrails の現状・不足・所有者

GitHub公式の HydraFusion 記事は五つの運用原則を説明している。ベンチマーク数値を River Review の目標値や合格しきい値には使わない。

### Complete accounting

**Current:** `src/lib/usage-persistence.mjs` は `RIVER_USAGE_TELEMETRY=1` で file×skill の JSONL を保存する。`src/lib/reviewer-orchestrator.mjs` は role duration と run duration を出力する。

**Gap:** 共通の Host strategy ID、leg ID、provider request / retry attempt ID がない。retry、fallback、critic、escalation の総費用を計算できない。

**Owner:** Host / provider instrumentation。Phase 2 は計測用の概念契約だけを固定する。

### Bounded execution

**Current:** #2566 では role×chunk の `AbortController` を LLM fetch と retry backoff まで伝播させた。host abort は再試行しない。

**Gap:** signal を無視する custom runner は実処理を止められない。merged Finding Critic や上位 Host leg の停止を本機能では証明しない。

**Owner:** Runtime / Host。既存の timeout disabled default と partial-result semantics を維持する。

### Isolated review

**Current:** `docs/development/2267-phase5a-reviewer-independence.md` は logical execution identity を区別する。#2543 の Critic provenance は観測用である。

**Gap:** 別の execution ID は actor、model、provider、context、tools、process の隔離を証明しない。

**Owner:** Host が実行 context と権限を制御する。River Review は宣言された独立性と検証済みの独立性を区別する。

### Fail-safe application

**Current:** River Review は Review Artifact、Review Coverage、Gate を返す。patch 適用や merge を実行しない。

**Gap:** Host 側の atomic patch application、rollback、workspace isolation は未検証である。

**Owner:** Host / Human。証拠欠損を自動 GO としない。

### Validated routing

**Current:** `src/lib/review-mode-router.mjs` と `selectRolesAuto()` が既存レビューの判断を担う。`#2455` の推奨値は observe-only である。

**Gap:** 複合 strategy の model availability、workflow graph、fallback、cost budget を事前検証する Host router はない。

**Owner:** Host が strategy 定義を検証する。Phase 3 が実装されるまで shadow recommendation を計算・適用したと主張しない。

## 3. 既存のメトリクスの解釈

`reviewerResults[].durationMs` は role の chunk duration の最大値である。全 provider call の実行時間の合計ではない。

`debug.durationMs` は reviewer orchestration の wall-clock duration である。並列 reviewer の duration は足し算しない。

`reviewCoverage` は Review Unit の実行状態を記録する。品質、retry回数、独立性、patchの安全性は示さない。

Review Coverage から Gate への接続は `RIVER_GATE_COVERAGE=1` で opt-in となる。未設定時に coverage incomplete が必ずmergeを阻止すると主張しない。

usage JSONL は dispatcher の file×skill 単位で記録される。全 provider request の網羅性は保証しない。cache token も確定した請求費用を意味しない。

Execution Manifest は構成のprovenanceに使う。provider callの網羅性や署名済み独立性まで証明しない。

## 4. 最小観測契約の提案

以下は将来の Host 計測で利用できる概念例である。現在の River Review が出力するJSONではない。公開 schema、永続化、CLI、runner への追加はしない。

```text
strategyObservation:
  schemaStatus: proposed-only
  source: null
  actualStrategy: null
  recommendedStrategy: null
  recommendationApplied: false
  executionIdentity: null
  latency:
    wallClockMs: null
    measured: false
  accounting:
    currency: null
    totalEstimatedUsd: null
    completeness: unknown
    inventoryScope: null
    inventoryVerified: false
    pricingVersion: null
  legs: []
  warnings:
    - no-host-leg-telemetry
```

`actualStrategy` は Host が実行経路を記録したときのみ設定する。`recommendedStrategy` は Phase 3 の shadow 出力ができるまでは null のままである。

`recommendationApplied` は Phase 2 / 3 では false とする。推奨結果を実行へ反映しない。

### 将来の leg identity

`legId` / `parentLegId` は Host が付与する識別子である。River Review の Review Unit ID と共有しない。

`purpose` は solver / critic / revision / escalation / retry / fallback の用途を表す。`REVIEWER_ROLES` の名前と同じ意味ではない。

`modelBinding` は provider / model を表す。未観測なら null とする。

`requestId` / `attemptId` は provider request と再試行を識別する。論理 leg 一つに複数の provider attempt があり得る。

`outcome` は completed / failed / cancelled / skipped / unknown を区別する。取消を完了扱いしない。

`durationMs`、`usage`、`costEstimateUsd` は出典を伴う実測または見積りのみを保持する。未取得は null とする。

`reviewIsolation` は no-tools / read-only のHost証拠を伴う場合のみ検証済みとする。異なるモデルを使っただけでは独立性を証明できない。

## 5. Accounting の安全条件

### Complete accounting

Host が対象実行境界を宣言する必要がある。全 solver / critic / retry / fallback / escalation / provider attempt の網羅を検証する。

見えている leg が全件だとは推測しない。未証明なら `completeness: unknown` とする。既知の欠損は `partial` とする。

`inventoryVerified: false` のとき総費用を確定できない。`totalEstimatedUsd` は null とし、未観測 leg を無料・成功・未実行とみなさない。

### No double counting

provider request / attempt ID と leg lineage を使って重複を検証する。同じ usage event を file×skill 行と leg 行で二重加算しない。

識別子が不足した場合は dedupe を主張しない。retryが増えれば provider attempt も増え得る。

### Null is not zero

`null` は未計測を意味する。`0` は計測済みで本当にゼロだった場合だけ使う。

並列 leg の処理時間の合計を end-to-end latency としない。Host の run boundary で wall-clock を測る。

### Evidence is not approval

観測結果を Gate、権限、routing、Human approvalへ自動昇格させない。

prompt本文、diff、生ログ、credential、secret を accounting に保存しない。

## 6. Phase 3 / 4 / 5 への接続

### Phase 3—Shadow routing

`recommendedStrategy` は観測専用とする。`actualStrategy` が無い場合は一致率と改善率を `not_evaluable` とする。

推奨と実行の不一致は観測事実である。実行結果を推奨側へ書き換えない。既存の reviewer / Skill routing を変更しない。

### Phase 4—Paired evaluation

`#1574` の paired replay を再利用する。input commit、dataset、prompt、Skill、model、routing、policy、evaluator を pin する。

品質、coverage、cost、latency、人間の修正負荷を比較する。`critical regression = 0` を保守的なfloorとする。

未計測のcostやlatencyを改善値に数えない。自己採点やlogical execution IDだけをadoption evidenceにしない。

### Phase 5—Adaptive routing

Phase 2完了はadaptive routingの承認ではない。Host policy approval、validated graph、bounded budget、trusted evidence、held-out evaluation が必要である。

Human approvalが無ければ実行戦略を変更しない。既存のdeterministic routingを維持する。

## 7. 失敗シナリオと判定

### 並列処理

450ms と 800ms の reviewer を並列実行した。1,250msをユーザー待ち時間として報告しない。Hostでwall-clockを測る。

### 再試行と課金

file×skill の usage 行が一つでも、provider retryが複数回なら総費用は未知である。`totalEstimatedUsd: null` とする。

### 未検証の独立性

Critic に異なる実行IDがあっても、solverとtools/contextを共有すればverified independentとは言えない。

### 部分的なtimeout

一つのreviewerがtimeoutし、他が完了した場合はpartial/timed_outとして記録する。Gateのcoverage判定はopt-inである。

### 計測ファイルなし

usage telemetryファイルが存在しなくても費用ゼロではない。未計測とする。

### 観測のみの戦略推奨

Hostが実行せずshadow recommendationだけを生成した。`actualStrategy: null` のままにする。品質向上の根拠に使わない。

### Write可能なCritic

Criticが異なるmodel familyでもwrite権限があればread-only隔離の証拠はない。Hostのpermission evidenceを要求する。

## 8. Exit criteria

Phase 2では設計文書のみ完了する。計測・shadow routing・自動適用の実装は含まない。

- [x] Strategy / Role / Model / Authority の区別
- [x] Five guardrails の current / gap / owner
- [x] 既存metricと観測契約の欠損条件
- [x] Fail-safe failure-mode review
- [ ] PRレビューとexact-head CIがPASS
- [ ] PRマージと親Issue更新

## References

- [GitHub HydraFusion official article](https://github.blog/ai-and-ml/github-copilot/project-hydrafusion-frontier-quality-via-multi-model-orchestration/)
- [Phase 1 PR #2566](https://github.com/s977043/river-review/pull/2566)
- [#1574 Design](1574-p0-design-contract.md)
- [#1574 Paired replay](1574-p2-paired-replay.md)
- [#2499 Model and Harness](1574-model-harness-evolution-screening.md)
- [#2455 Review Planning Bridge](2455-phase3-review-planning-bridge.md)
- [#2267 Reviewer Independence](2267-phase5a-reviewer-independence.md)
- [Execution Manifest](execution-manifest.md)
- [Review Coverage](review-coverage-contract.md)
- [Agent Contract](agent-contract.md)
