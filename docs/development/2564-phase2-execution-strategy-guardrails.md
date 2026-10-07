# #2564 Phase 2—Execution Strategy / Guardrails 観測設計

> Status: Design-only。Runtime、公開 schema、Gate、routing は変更しません。
> Tracking: #2564 Phase 2。Phase 1 は #2566 で完了。Phase 3〜5 は未着手。
> Diátaxis: 内部 Architecture / Design。

## 1. 設計上の決定

HydraFusion の Single / Cascade / Critique は上位 Harness の Execution Strategy 候補とします。River Review の新しい実行モードとして追加しません。

Execution Strategy は Model / Effort / Role / Autonomy / Judgment Placement から独立した軸です。Reviewer routing、Skill selection、Gate の既存責務を変えません。

### 上位 Harness / Host

Host は戦略の選択、モデルの割当、solver / revision / escalation / fallback の実行を所有します。patch 適用、deploy、merge、release の実行権限も Host / Human が所有します。

`single` は単独モデルによる処理であり、レビュー品質の保証ではありません。`cascade` は provider の HTTP retry と異なります。`critique` は reviewer の多数決を意味しません。

### River Review

River Review は既存の `selectRolesAuto()` と Skill selection を使います。Review Coverage、Finding Critic、Verifier、Gate から判断材料を返します。

`docs/development/agent-contract.md` は論理 Agent と reviewer lens の責務を定義します。`#2455` の Review Planning Bridge は observe-only とし、別の routing SSoT を作りません。

### 判断と証拠の分離

Model ≠ Role。Execution Strategy ≠ Reviewer routing。Review ≠ Verification。Execution ≠ Judgment。

Runtimeのモデル選択だけで reviewer independence を証明しません。実行の観測だけで Human approval を得たことにはなりません。

## 2. Five guardrails の現状・不足・所有者

GitHub公式の HydraFusion 記事は5つの運用原則を説明しています。ベンチマーク数値を River Review の目標値や合格しきい値には使いません。

### Complete accounting

**Current:** `src/lib/usage-persistence.mjs` は opt-in の usage JSONL を保存します。
環境変数は `RIVER_USAGE_TELEMETRY=1` です。
`src/lib/reviewer-orchestrator.mjs` は role と run の duration を出力します。

**Gap:** 共通の Host strategy ID、leg ID、provider request / retry attempt ID がありません。retry、fallback、critic、escalation の総費用を計算できません。

**Owner:** Host / provider instrumentation。Phase 2 は計測用の概念契約だけを固定します。

### Bounded execution

**Current:** #2566 では role×chunk の `AbortController` を LLM fetch と retry backoff まで伝播させました。host abort は再試行しません。

**Gap:** signal を無視する custom runner は実処理を止められません。merged Finding Critic や上位 Host leg の停止を本機能では証明しません。

**Owner:** Runtime / Host。既存の timeout disabled default と partial-result semantics を維持します。

### Isolated review

**Current:** `docs/development/2267-phase5a-reviewer-independence.md` は logical execution identity を区別します。#2543 の Critic provenance は観測用です。

**Gap:** 別の execution ID は actor、model、provider、context、tools、process の隔離を証明しません。

**Owner:** Host が実行 context と権限を制御します。River Review は宣言された独立性と検証済みの独立性を区別します。

### Fail-safe application

**Current:** River Review は Review Artifact、Review Coverage、Gate を返します。patch 適用や merge を実行しません。

**Gap:** Host 側の atomic patch application、rollback、workspace isolation は未検証です。

**Owner:** Host / Human。証拠欠損を自動 GO としません。

### Validated routing

**Current:** `src/lib/review-mode-router.mjs` と `selectRolesAuto()` が既存レビューの判断を担います。`#2455` の推奨値は observe-only です。

**Gap:** 複合 strategy の model availability、workflow graph、fallback、cost budget を事前検証する Host router はありません。

**Owner:** Host が strategy 定義を検証します。Phase 3 が実装されるまで shadow recommendation を計算・適用したと主張しません。

## 3. 既存のメトリクスの解釈

`reviewerResults[].durationMs` は role の chunk duration の最大値です。全 provider call の実行時間の合計ではありません。

`debug.durationMs` は reviewer orchestration の wall-clock duration です。並列 reviewer の duration は足し算しません。

`reviewCoverage` は Review Unit の実行状態を記録します。品質、retry回数、独立性、patchの安全性は示しません。

Review Coverage から Gate への接続は `RIVER_GATE_COVERAGE=1` で opt-in となります。未設定時に coverage incomplete が必ずmergeを阻止すると主張しません。

usage JSONL は dispatcher の file×skill 単位で記録されます。全 provider request の網羅性は保証しません。cache token も確定した請求費用を意味しません。

Execution Manifest は構成のprovenanceに使います。provider callの網羅性や署名済み独立性まで証明しません。

## 4. 最小観測契約の提案

以下は将来の Host 計測で利用できる概念例です。現在の River Review が出力するJSONではありません。公開 schema、永続化、CLI、runner への追加はしません。

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

`actualStrategy` は Host が実行経路を記録したときのみ設定します。`recommendedStrategy` は Phase 3 の shadow 出力ができるまでは null のままです。

`recommendationApplied` は Phase 2 / 3 では false とします。推奨結果を実行へ反映しません。

### 将来の leg identity

`legId` / `parentLegId` は Host が付与する識別子です。River Review の Review Unit ID と共有しません。

`purpose` は solver / critic / revision / escalation / retry / fallback の用途を表します。`REVIEWER_ROLES` の名前と同じ意味ではありません。

`modelBinding` は provider / model を表します。未観測なら null とします。

`requestId` / `attemptId` は provider request と再試行を識別します。論理 leg 1つに複数の provider attempt があり得ます。

`outcome` は completed / failed / cancelled / skipped / unknown を区別します。取消を完了扱いしません。

`durationMs`、`usage`、`costEstimateUsd` は出典を伴う実測または見積りのみを保持します。未取得は null とします。

`reviewIsolation` は no-tools / read-only のHost証拠を伴う場合のみ検証済みとします。異なるモデルを使っただけでは独立性を証明できません。

## 5. Accounting の安全条件

### Complete accounting

Host が対象実行境界を宣言する必要です。全 solver / critic / retry / fallback / escalation / provider attempt の網羅を検証します。

見えている leg が全件だとは推測しません。未証明なら `completeness: unknown` とします。既知の欠損は `partial` とします。

`inventoryVerified: false` のとき総費用を確定できません。`totalEstimatedUsd` は null とし、未観測 leg を無料・成功・未実行とみなしません。

### No double counting

provider request / attempt ID と leg lineage を使って重複を検証します。同じ usage event を file×skill 行と leg 行で二重加算しません。

識別子が不足した場合は dedupe を主張しません。retryが増えれば provider attempt も増え得ます。

### Null is not zero

`null` は未計測を意味します。`0` は計測済みで本当にゼロだった場合だけ使います。

並列 leg の処理時間の合計を end-to-end latency としません。Host の run boundary で wall-clock を測ります。

### Evidence is not approval

観測結果を Gate、権限、routing、Human approvalへ自動昇格させません。

prompt本文、diff、生ログ、credential、secret を accounting に保存しません。

## 6. Phase 3 / 4 / 5 への接続

### Phase 3—Shadow routing

`recommendedStrategy` は観測専用とします。`actualStrategy` が無い場合は一致率と改善率を `not_evaluable` とします。

推奨と実行の不一致は観測事実です。実行結果を推奨側へ書き換えない。既存の reviewer / Skill routing を変更しません。

### Phase 4—Paired evaluation

`#1574` の paired replay を再利用します。input commit、dataset、prompt、Skill、model、routing、policy、evaluator を pin します。

品質、coverage、cost、latency、人間の修正負荷を比較します。`critical regression = 0` を保守的なfloorとします。

未計測のcostやlatencyを改善値に数えない。自己採点やlogical execution IDだけをadoption evidenceにしません。

### Phase 5—Adaptive routing

Phase 2完了はadaptive routingの承認ではありません。Host policy approval、validated graph、bounded budget、trusted evidence、held-out evaluation が必要です。

Human approvalが無ければ実行戦略を変更しません。既存のdeterministic routingを維持します。

## 7. 失敗シナリオと判定

### 並列処理

450ms と 800ms の reviewer を並列実行しました。1,250msをユーザー待ち時間として報告しません。Hostでwall-clockを測ります。

### 再試行と課金

file×skill の usage 行が1つでも、provider retryが複数回なら総費用は未知です。`totalEstimatedUsd: null` とします。

### 未検証の独立性

Critic に異なる実行IDがあっても、solverとtools/contextを共有すればverified independentとは言えません。

### 部分的なtimeout

1つのreviewerがtimeoutし、他が完了した場合はpartial/timed_outとして記録します。Gateのcoverage判定はopt-inです。

### 計測ファイルなし

usage telemetryファイルが存在しなくても費用ゼロではありません。未計測とします。

### 観測のみの戦略推奨

Hostが実行せずshadow recommendationだけを生成しました。`actualStrategy: null` のままにします。品質向上の根拠に使いません。

### Write可能なCritic

Criticが異なるmodel familyでもwrite権限があればread-only隔離の証拠はありません。Hostのpermission evidenceを要求します。

## 8. Exit criteria

Phase 2では設計文書のみ完了します。計測・shadow routing・自動適用の実装は含みません。

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
