# #2564 Phase 2—Execution Strategy / Orchestration Guardrails 観測設計

> Status: **Design-only / observation contract proposal**。この文書をマージしても runtime / public schema / Gate / routing は変更しない。
> Owner: #2564 Phase 2。Phase 1 の中断処理は #2566 で実装済み。次段は Phase 3 shadow routing、Phase 4 paired evaluation。
> Classification: 内部の Architecture / Design（公開 Reference / Stable API ではない）。

## 1. Decision / responsibility

HydraFusion の Single / Cascade / Critique を River Review の既定実行モードとして取り込まない。
上位 Harness の **Execution Strategy** を独立した設計軸として扱い、River Review のレビュー・証拠・判断という既存責務を維持する。

```text
Human / Host-owned authority
   │
   ├─ Model + Effort + Role + Autonomy + Judgment Placement
   ├─ Execution Strategy: single | cascade | critique（上位 Harness の候補語彙）
   │    ├─ solver / revision / escalation / fallback（実装と変更適用は Host）
   │    └─ candidate artifact
   └─ River Review
        ├─ deterministic Skill / reviewer routing（既存）
        ├─ reviewer fan-out + Review Coverage
        ├─ Finding Critic / Verifier / judgment evidence
        └─ advice to Host / Human (not merge or release authority)
```

異なる軸を混同しない。

- **Model / Effort**
  - **Question**: どのモデル・推論資源か
  - **Owner / authoritative source**: Provider / Host config。#2499 の change envelope

- **Role**
  - **Question**: 誰が何を担当するか
  - **Owner / authoritative source**: `docs/development/agent-contract.md` / `REVIEWER_ROLES`

- **Execution Strategy**
  - **Question**: single / cascade / critique のどの複合経路か
  - **Owner / authoritative source**: **Host**。River Review に実行 strategy SSoT は作らない

- **Reviewer / Skill routing**
  - **Question**: レビューすべき対象・観点・reviewer は何か
  - **Owner / authoritative source**: `selectRolesAuto()` / Skill selection / Review Planning Bridge (#2455)

- **Judgment Placement**
  - **Question**: 何を誰が承認するか
  - **Owner / authoritative source**: existing Gate / Host / Human。#2499

- **Authority**
  - **Question**: patch apply / deploy / merge / release を誰が行うか
  - **Owner / authoritative source**: **Host / Human**。River Review に新権限を付与しない

`single` は LLM 単独実行が正しいことを意味しない。
`cascade` は timeout に伴う同じ provider 内の retry ではない。
`critique` は複数 reviewer の多数決でもない。
いずれも本フェーズでは**設計語彙**であり、実行値・選択値・品質結果の事実として生成しない。

## 2. Five-guardrail gap map（既存コードで確認）

GitHub の公式 HydraFusion 記事は complete accounting / bounded execution / isolated review / fail-safe application / validated routing を要件として挙げる。
ただし記事の benchmark の数値を River Review の期待値や acceptance threshold に転用しない。

- **Complete accounting**
  - **Current evidence / contract**: `src/lib/usage-persistence.mjs` は opt-in の file×skill JSONL。
    `src/lib/reviewer-orchestrator.mjs` は role duration / run duration / timeout を出力する
  - **Remaining gap**: 共通 strategy / leg / provider request ID がなく、retry・fallback・critique・escalation の総費用や end-to-end latency は結合できない
  - **Owner / this phase decision**: **Host/provider instrumentation**。Phase 2 は observation の必要フィールドと欠損 semantics のみ設計

- **Bounded execution**
  - **Current evidence / contract**: #2566: per role×chunk の `AbortController` → `generateReview` → `callChatCompletion` / fetch / retry backoff
  - **Remaining gap**: custom runner が signal を無視する経路、Host の外側の workflow leg、merged Finding Critic と provider 側課金の完全停止証明は範囲外
  - **Owner / this phase decision**: **Runtime/Host**。Phase 1 適用範囲を明示。budget policy は後続に委譲

- **Isolated review**
  - **Current evidence / contract**: `docs/development/2267-phase5a-reviewer-independence.md` / #2543: logical execution provenance / observation
  - **Remaining gap**: 別 execution ID は別 actor / model / provider / context / tools / process の隔離を証明しない
  - **Owner / this phase decision**: **Host** が tool permission / context / isolation を制御。River Review は「宣言」と「検証済み」の区別を維持

- **Fail-safe application**
  - **Current evidence / contract**: Review Artifact、Review Coverage、Gate は Host に判断材料を返す。River Review は patch 適用・merge を所有しない
  - **Remaining gap**: Host 側の作業領域・rollback・commit atomicity は検証されていない
  - **Owner / this phase decision**: **Host/Human** が write authority を持つ。欠損 evidence を GO に昇格させない

- **Validated routing**
  - **Current evidence / contract**: `src/lib/reviewer-orchestrator.mjs` の `selectRolesAuto()`。
    `src/lib/review-mode-router.mjs` と #2455 の observe-only Bridge も参照する。
  - **Remaining gap**: Single/Cascade/Critique の model availability、workflow graph、fallback、budget を事前検証する Host strategy router は未実装
  - **Owner / this phase decision**: **Host** が strategy 定義・model bindings を検証。River Review は shadow recommendation を実行へ接続しない

### 既存 metric の意味を上書きしない

- `reviewerResults[].durationMs` は role の chunk duration の **max** であり、全 leg の合計時間でも全ての provider call duration でもない。
- `debug.durationMs` は reviewer orchestration の wall-clock duration。並列 reviewer の duration を足さない。
- `reviewCoverage` は「実行された Review Unit が完了したか」であり、strategy の成果品質、provider retry、patch の安全性、reviewer independence の検証ではない。
- `usage-persistence.mjs` の JSONL は `RIVER_USAGE_TELEMETRY=1` でのみ有効。
dispatcher file×skill の記録であり、複合 workflow の各 leg を網羅する ledger ではない。
cache token の項目はあるが、モデル単価に基づく確定請求金額ではない。

- Execution Manifest の provenance は実行構成の再現性を支えるが、provider call の網羅性や独立性・署名を単独では保証しない。

## 3. Minimal observation contract（**非永続 / 概念設計**）

既存の Review Artifact / Execution Manifest / Review Coverage / saved-run / `#1574` の Experiment Manifest に新しい schema field を追加しない。
以下は Host 側で将来計測するときの **評価用 projection 例**。
名称・値・安定性は provisional、生成コード・JSON Schema・public CLI は追加しない。

```text
# Example only. Never claim this was emitted by River Review.
strategyObservation:
  schemaStatus: proposed-only
  source: null          # proposed producer = Host instrumentation。実装されるまでは null
  actualStrategy: null   # Host execution log が実在する場合だけ single | cascade | critique
  recommendedStrategy: null # Phase 3 が導入されるまでは null
  recommendationApplied: false # Phase 2/3 は提案を実行に接続しない
  executionIdentity: null # Host の stable run identifier; 既存IDから捏造しない
  latency:
    wallClockMs: null    # start/stop 観測がある場合のみ
    measured: false
  accounting:
    currency: null
    totalEstimatedUsd: null
    completeness: unknown # complete | partial | unknown
    inventoryScope: null  # Host-declared execution boundary, not inferred from leg array
    inventoryVerified: false # exhaustive provider-attempt enumeration is NOT proven
    pricingVersion: null
  legs: []               # 観測できた独立実行単位だけを列挙（未計測は[]≠実行0）
  warnings:
    - no-host-leg-telemetry
```

各 leg は将来少なくとも次の意味を保持する。
`role` は actor role ではなく **workflow leg purpose**（solver / critic / revision / escalation / retry / fallback）であり、`REVIEWER_ROLES` の reviewer lens 名と混ぜない。

- **`legId` / `parentLegId`**
  - **Meaning / invariant**: Host が付与する安定した leg ID と親。重複なし、循環なし。River Review の Review Unit ID と別。1 leg に複数 provider attempt があり得る

- **`purpose` / `modelBinding`**
  - **Meaning / invariant**: leg の用途、provider/model。unknown は null。model family が違うだけでは independence 証明にならない

- **`startedAt` / `endedAt` / `durationMs`**
  - **Meaning / invariant**: 同じ clock domain で測った leg 区間。実測不能なら null。wall-clock と leg elapsed は別

- **`outcome` / `terminationReason`**
  - **Meaning / invariant**: completed / failed / cancelled / skipped / unknown と原因。cancelled は完了扱いしない

- **`requestId` / `attemptId` / `usage` / `usageSource`**
  - **Meaning / invariant**: Provider request / retry attempt は Host logical leg とは別の identity。raw input/output/cache token のうち計測された値と情報源。未取得は null であって 0 ではない

- **`costEstimateUsd` / `pricingVersion`**
  - **Meaning / invariant**: 料金テーブル・cache分類・retry範囲が確認できた場合だけ推定値。請求金額ではない

- **`reviewIsolation` / `evidenceRefs`**
  - **Meaning / invariant**: review の no-tools/read-only 等は Host 証拠があるときだけ observed/verified とする

- **`sideEffects`**
  - **Meaning / invariant**: Host が持つ patch / network / external-write と結果。River Review はこの情報から自動適用しない

### Accounting と identity の hard rules

1. **Complete accounting needs a proven inventory boundary**: Host の実行境界を宣言する。
   solver / critic / retry / fallback / escalation / provider attempt の網羅を検証する。
   見えている leg が全件だとは推測しない。
   証明できなければ `completeness: unknown`。
   既知の欠損は `partial` とする。
   `inventoryVerified: false` を保ち、未観測 leg は無料・成功・未実行と扱わない。

2. **No double counting**: Host が provider request ID / attempt ID と leg lineage を結合して重複を検証する。
   同じ usage event を file×skill 行と leg 行で二重加算しない。
   request/attempt ID が無ければ dedupe を主張しない。
   1 leg 内で retry が3回なら、provider attempt は3つあり得る。

3. **Unknown differs from zero**: missing token/cost/latency は `null`。`0` は計測可能で実際にゼロだった場合にのみ使う。
4. **Parallel latency is not a sum of leg durations**: end-to-end wall-clock は Host の run boundary で測る。並列 leg の duration 総和をユーザー待ち時間としない。
5. **Evidence is not approval**: observation を routing / Gate / allowlist / merge authority / Human approval に自動昇格させない。
   `RIVER_GATE_COVERAGE=1` を明示しなければ、Review Coverage から Gate への伝播は無効。

6. **No source/secret capture**: request body、prompt本文、diff、生ログ、credential を leg accounting に保存しない。識別子もレビュー対象 repo の untrusted input と区別する。

## 4. Evidence and comparison before Phase 3

- **This is not implemented telemetry.** `strategyObservation` は説明用の擬似契約。
  現行 runner / artifact がこの object を出力するとは主張しない。
  `source` を Host の宣言だけで `verified` に昇格させない。

- `actualStrategy` は Host の実行履歴に完全な経路がある場合だけ値を入れる。provider/model や reviewer role の数から `cascade` / `critique` を推測しない。
- `recommendedStrategy` が計算されても `actualStrategy=null` なら一致率・改善率は `not_evaluable` とし、分母にも含めない。
- actual / recommended の不一致は **観測**として残し、Phase 3 では実行経路の変更や、失敗を自動的に推奨値へ再分類する処理を禁止する。
- `totalEstimatedUsd` は全 leg と retry/fallback inventory が揃い、単価 version と重複排除の根拠がある場合だけ合算できる。欠損がある run の合計は `null` のままにし、観測済み leg の部分小計を complete total と誤表示しない。

## 5. Phase 3 / 4 handoff and gate

Phase 3 の `recommendedStrategy` は **shadow-only**。
既存実行結果に対する予測であって actual routing を変更せず、actual 未観測の場合は比較対象を捏造しない。
`#2455` Concern Map は利用可能な signal 候補であり、新たな reviewer/skill selection owner ではない。

Phase 4 は `#1574` の paired replay を再利用する。
比較条件を Experiment Manifest に固定する。
対象は input commit / dataset / prompt / Skill / model / routing / policy / evaluator。
品質・coverage・cost・latency・human correction burden を比較する。
`critical regression = 0` を保守的 floor とする。
未測定の cost や latency を改善値へ集計しない。
evaluator 自己採点や logical execution ID だけの independence claim は adoption evidence としない。

**Phase 5 opt-in routing GO は Phase 2 完了を意味しない。**

Host-owned policy approval と validated workflow graph が必要。
bounded budget、trusted independent evidence、held-out evaluation も必須。
最終判断は Human approval に委ねる。
証拠が揃わなければ existing deterministic route に留める。

## 6. Failure-mode reviews (design fixtures)

- **2 reviewer tasks execute in parallel (450ms / 800ms)**
  - **Naive mistake**: 1,250ms user latency
  - **Required reading**: Actual Host wall-clock measure only; do not sum durations

- **Provider request retried twice; dispatcher JSONL contains one file×skill row**
  - **Naive mistake**: 1 request / 1 charge
  - **Required reading**: attempt inventory unknown; `totalEstimatedUsd: null` until request-level accounting

- **Critic declares separate logical ID, but inherits solver tools/context**
  - **Naive mistake**: “verified independent review”
  - **Required reading**: provenance observed only; Host tool/context isolation not verified

- **Timeout aborted one reviewer, others completed**
  - **Naive mistake**: “review complete / clean”
  - **Required reading**: Review Coverage は partial/timed_out を区別する。Gate への coverage 接続は opt-in（`RIVER_GATE_COVERAGE=1`）であり、未設定時に自動ブロックしたと主張しない

- **No usage telemetry file exists**
  - **Naive mistake**: cost = $0
  - **Required reading**: cost unknown, not zero

- **Host cascade and River reviewer role fan-out both occur**
  - **Naive mistake**: auto-select cascade from role count
  - **Required reading**: Strategy belongs to Host, reviewer selection to River Review

- **Host emits a shadow recommendation although it ran no strategy**
  - **Naive mistake**: recommendation means implementation success
  - **Required reading**: `actualStrategy: null` / `recommendationApplied: false`; no agreement/quality scoring

- **Critique leg reports different model, but reviewer had write-capable tools**
  - **Naive mistake**: independent read-only critic certified
  - **Required reading**: independence/tool isolation unverified; do not treat model diversity as read-only security

## 7. Exit criteria / follow-up

Phase 2 **design** closes only when (measurement implementation remains a separate follow-up):

- [x] vocabulary and authority axes are separated without new runtime owner
- [x] all five guardrails have current/gap/owner mapping linked to existing evidence
- [x] strategy / leg observation semantics distinguish unknown / partial / complete, actual / recommended, cost / usage / latency
- [ ] fail-safe scenarios and explicit non-goals are reviewed in three loops
- [ ] CI / docs checks pass and PR is merged

**Out of scope:** provider SDK instrumentation、new public schema、routing engine。
#1574 の再実装、patch 適用、automatic merge/deploy、performance claims も含めない。

## References

- [GitHub Project HydraFusion (2026-09-04)](https://github.blog/ai-and-ml/github-copilot/project-hydrafusion-frontier-quality-via-multi-model-orchestration/)
- [#2564](https://github.com/s977043/river-review/issues/2564), [#2566](https://github.com/s977043/river-review/pull/2566)
- [#1574 Design](1574-p0-design-contract.md)
- [#1574 P2 paired replay](1574-p2-paired-replay.md)
- [#2499 Model + Harness screening](1574-model-harness-evolution-screening.md)
- [#2455 Review Planning Bridge](2455-phase3-review-planning-bridge.md)
- [#2267 Reviewer independence](2267-phase5a-reviewer-independence.md)
- [Execution Manifest](execution-manifest.md)
- [Review Coverage](review-coverage-contract.md)
- [Agent Contract](agent-contract.md)
