# Review Evolution Cycle P0 設計契約（#1574）

> Status: Design contract（P0・実装未着手）。本ドキュメントは #1574 Epic の P0 フェーズ成果物です。
> Source: issue #1574 の 2026-07-24 採否コメント（条件付きGO、issue comment ID 5064856987）。
> 実装 PR は本契約を DoD として参照し、P1 Shadow aggregate から段階導入します。

## 1. 目的とスコープ

Review Evolution Cycle（#1574）は、複数の完了 run から改善投資先を選定し、統制された実験で採否を判断する外側の制御ループです。採否コメントの決定に従い、実装前に固定すべき設計契約6点を本ドキュメントで文書化します。

Issue #1574 の責務は次に限定する。

- multi-run から改善投資先を選定する
- 1 candidate = 1 hypothesis の実験を編成する
- baseline / candidate の統制された paired evaluation を実行する
- shadow canary を観測する
- 最終採否時は #1568 の CLI を呼び、結果への参照を記録する

実装順は P0（本契約）→ P1 Shadow aggregate → P2 Historical paired replay → P3 Shadow canary → P4 Limited canary です。Shadow mode 着手は GO、paired replay は P0 完了後に GO、自動 canary と自動 Keep/Rollback は保留と決定されています。

## 2. #1568 Judgment Promotion Loop との責務境界

Issue #1568 の Phase 1〜3 は実装済みで、v1.62.0 としてリリース済みです。#1574 は次の既存機構を再実装しません。

| 既存機構                              | 実装（file:line）                                                                   | #1574 での扱い                                                     |
| ------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 候補生成（#1568-A / #1627）           | `src/lib/promotion-candidates.mjs`（`buildPromotionCandidateEntry`）                | 生成契約を拡張して利用（契約4・5）                                 |
| 承認 CLI / PR 雛形（#1568-B / #1629） | `src/cli/commands/promote.mjs:98-281`、`src/lib/promotion.mjs:138-209`              | 最終採否時に呼び出す（再実装しない）                               |
| Retire / 効果測定（#1568-C / #1641）  | `src/lib/promotion.mjs:211-560`（retire / `reviewPromotionEffectiveness`）          | effectiveness / needs_review / expiry / supersede / archive は委譲 |
| Riverbed 永続化                       | `src/lib/riverbed-memory.mjs:30-116`（`appendEntry` / `updateEntry` / `supersede`） | エントリ形式を共有する                                             |

Keep / Rollback / Retire の最終処理は P4 でも #1568 の lifecycle を利用し、#1574 側での重複実装を禁止します。

## 3. 設計契約

### 契約1: Evidence provenance / trust boundary

#### 既存実装の現状

- saved run は `.river/runs/`（`src/lib/result-store.mjs:6`）に置かれ、被レビューリポジトリの内側にある。
- `src/lib/result-store.mjs:34-43` の trust-boundary note は、run store が被レビューエージェントの書き込み権限下にあり、tamper-evident な証拠ではないと明記している。
- `buildRunRecord`（`src/lib/result-store.mjs:44-80`）が保持するのは runId / timestamp / phase / findings 等で、証拠の出所や検証者を示すフィールドはない。
- GitHub Actions 上では run が自動保存される（`src/cli/commands/run.mjs:151-159`、`RIVER_AUTO_SAVE=false` で opt-out）。

#### 固定する契約内容

- local saved run は canary 採用の根拠として単独利用しない。
- Candidate / Experiment には最低限、次のフィールドを保持する。
  - `evidence_source`: `local` / `CI` / `protected-branch` / `human`
  - `source_commit_sha`
  - `artifact_sha256`
  - `collector_version`
  - `trusted_by`
  - `generated_by_candidate: false`
- baseline は protected main または信頼済み CI artifact から取得する。
- Shadow mode では local evidence を許容するが、candidate 採用には candidate の変更権限外で実行した verifier の trusted evidence を必須とする。
- trust level は schema と採用 gate の両方に定義する（DoD 1項目め）。

#### 未決事項

- `trusted_by` の署名・検証方式（CI attestation または人手承認記録）は P2 でも確定していない。P1 と P2 はどちらも `trust_level` を `untrusted` に固定しており、trusted への昇格経路は検証機構の実装まで閉じたままとする。

### 契約2: Canonical `review_run_id`

#### 既存実装の現状

- runId は timestamp + ランダム短ハッシュで生成され（`src/lib/result-store.mjs:20-25`）、run record 内に閉じている。
- feedback エントリ（`src/lib/feedback.mjs`）は `.river/feedback/<YYYY-MM>.jsonl` に保存されるが、run への参照を持たない。
- promotion_candidate の evidence は `pr` と nullable な `findingFingerprint` のみで（`scripts/feedback-rule-candidates.mjs:145-150`）、run へ辿れない。
- eval ledger（`artifacts/evals/results.jsonl`、`scripts/compare-eval-ledger.mjs:25`）も run との結合キーを持たない。

#### 固定する契約内容

- canonical な `review_run_id` を定義する。結合対象は Review Artifact、saved run、feedback、Riverbed entry、evaluation ledger、ReviewImprovementCandidate、ReviewExperimentResult の7箇所である。
- 後方互換のため、まず optional フィールドとして追加し、上記7箇所へ順に伝播させる。
- これにより selected skill、finding、feedback、usage/cost/latency、reversal を同一 run へ追跡できる状態を作る（DoD 2項目め）。

#### 実装状況（#1574 P1 / #1681）

read 側の解決は P1 の `river evolve aggregate` で、書き手の生産者は v1.66.0（#1681）で実装しました。詳細は `docs/development/1574-p1-shadow-aggregate.md` を参照してください。

- 既存 runId をそのまま canonical ID として採用し、別名レイヤは挟まない。run record は `deriveReviewRunId` が `review_run_id` → `reviewRunId` → `runId` の順に解決する。
- feedback 側の生産者は `river feedback add --run-id <id>` である。省略時に直近 run へ暗黙解決する動作は持たせない。誤った run へ紐づいた証拠が混ざるためである。
- 7箇所のうち生産者が存在するのは saved run（既存 `runId` の流用）と feedback（#1681）である。Review Artifact / Riverbed entry / evaluation ledger は未着手である。
- ReviewImprovementCandidate と ReviewExperimentResult は、集約時に evidence 側の値から導出する（`sourceReviewRunIds` / `reviewRunIds`）。永続化側の生産者ではない。

#### 未決事項

- Review Artifact / Riverbed entry / evaluation ledger への伝播時期は、後続フェーズで決める。

### 契約3: Immutable Experiment Manifest

#### 既存実装の現状

- `scripts/compare-eval-ledger.mjs:1-18` は ledger 末尾エントリの差分比較プリミティブで、KPI 後退時に exit code 1 を返す。
- ledger 比較だけでは baseline / candidate の実行条件が統制されず、paired experiment とは言えない。

#### 固定する契約内容

- 実験ごとに immutable な Experiment Manifest を作成し、次を固定する。
  - baseline / candidate の commit SHA
  - dataset manifest / hash / held-out set hash
  - evaluator / collector version
  - provider / model / temperature
  - Skill Registry commit
  - trial ID / trial count
  - activation evidence
  - environment / config snapshot
  - metrics denominator
  - terminal reason
- 評価は deterministic check → semantic/rubric verification → adversarial review の順で実行する。
- LLM の PASS で決定論的 FAIL を上書きしない（`.claude/rules/review-core.md` の責務分界と同方向）。
- paired replay は ledger 比較と区別し、activation / held-out / independent verifier を伴う（DoD 3・4項目め）。

#### 実装状況（#1574 P2 paired replay）

`river evolve replay` として実装しました。詳細は `docs/development/1574-p2-paired-replay.md` を参照してください。実装で確定した内容は次のとおりです。

- manifest の不変性は content hash で担保する。`experimentKey` は実験条件のみ、`manifestHash` は `createdAt` と導出 ID を含めた全体を対象とする。
- `manifestId` は `RR-EXP-<experimentKey の先頭12桁>` とし、candidate の `RR-PC-` と名前空間を分ける。
- terminal reason は manifest に語彙（`terminalReasonVocabulary`）だけを固定し、観測値は結果アーティファクト側に持つ。結果を manifest へ書き戻すと不変性が壊れるためである。
- manifest の保存先は固定しない。CLI は spec ファイルの中に前回の manifest を同梱できる形とし、標準出力以外へは書き込まない。保存は呼び出し側の責務とする。
- 評価順序のうち P2 が担うのは deterministic check のみである。semantic / rubric verification と adversarial review は後続フェーズの担当とする。

#### 未決事項

- 独立 verifier の実体（candidate の変更権限外で走る実行主体）は P3 以降で確定する。P2 は自己申告を記録するだけで、`independentVerifierVerified` は常に false である。

### 契約4: Stable CLI / content-addressed candidate ID

#### 既存実装の現状

- `river promote` は list / approve / reject / template / retire / review-effectiveness を持つ（`src/cli/commands/promote.mjs:9-15`）。
- 候補生成は `scripts/feedback-rule-candidates.mjs` の内部 script で、stable CLI としての I/O 契約は未定義である。
- candidate ID は `RR-PC-<日付>-<clusterKey slug>` の日付ベースである（`scripts/feedback-rule-candidates.mjs:208`）。同一証拠でも実行日が異なると別 ID になる。

#### 固定する契約内容

- 内部 script への直接依存ではなく、stable CLI の入出力を定義する。例:

  ```bash
  river promote propose \
    --input candidate-feedback.jsonl \
    --cluster-key skill::feedbackType \
    --index .river/memory/index.json \
    --output json
  ```

- candidate ID は日付ではなく、正規化した evidence 集合・cluster・policy version の content hash から生成する。
- 同一証拠からの再実行は同一 candidate へ収束させる（冪等）。
- 本契約は #1624（#1568-D: interface B 起動契約、Phase 4）の前提となる。#1624 側の設計は本契約の CLI I/O と candidate ID を参照して行う。

#### 実装状況（#1624）

`river promote propose` として実装済みです。実装で確定した内容は次のとおりです。

- 候補生成のコアは `src/lib/promotion-candidates.mjs` へ移設し、`scripts/feedback-rule-candidates.mjs` は検知 CLI と再 export のみの薄い wrapper とする。
- candidate ID は `RR-PC-<sha256(clusterKey, 正規化 evidence, policyVersion) の先頭12桁>` とし、policyVersion の初期値は `1` である。
- exit code は既存 promote に揃えて成功 0 / usage・I/O エラー 1 とし、script の「候補ありで exit 2」は持ち込まない。
- `--input` のエントリが `--cluster-key` と一致しない場合は暗黙 filter せずエラーにする。
- `--input` の各行は feedback 捕捉契約（`src/lib/feedback.mjs`）で検証し、違反行は行番号付きでエラーにする。
- 再発件数の判定・`recurrenceCount`・content hash は、いずれも正規化・重複除去した evidence 集合を単一の真実として用いる。
- `contentHash` と `policyVersion` を `context.promotionCandidate` へ保存し、収束時は保存値と再計算値を突合する。不一致（12桁 ID の衝突）は fatal とする。
- `--policy-version` は既知値の allowlist で検証し、`--cluster-key` の feedbackType も既知語彙に限定する。
- 出力の `created` は「この実行が実際に書き込んだか」を表し、`wouldCreate` は「候補が未存在だったか」を表す。`--dry-run` では `created` は常に false である。
- 同一 index への並列実行は非対応とする。index は read-modify-write で書き換えるため、呼び出しは直列化する。

#### 実装状況（#1574 P1 shadow aggregate）

`river evolve aggregate`（P1）も同じ ID 体系を使います。shadow 側で独自 hash を持つと、観測した candidate と `river promote propose` が永続化した candidate が別 ID になり、同一性を判定できなくなるためです。

- shadow aggregate は ID 導出を再実装せず、`normalizeEvidence` と `computeCandidateContentHash` をそのまま呼ぶ。
- hash 入力は `{ clusterKey, 正規化 evidence, policyVersion }` に揃え、shadow 固有の `subClusterKey` や生成日時は hash に入れない（出力メタデータとしては保持する）。
- prefix は `RR-PC-` に統一し、同一証拠からは shadow 出力と propose 永続化が同一 ID へ収束する。
- policy version は `CANDIDATE_POLICY_VERSION`（`1`）を共有し、未知の値は shadow 側でも reject する。
- shadow から propose へ渡すのは cluster 全体の JSONL ではなく、candidate の `sourceFeedbackRefs`（stage2 サブクラスタ単位の evidence）とする。cluster 全体を渡すと、どのサブクラスタとも一致しない別 ID になるためである。
- `sourceFeedbackRefs` の各要素は propose の入力契約（`validateFeedbackEntryShape`）を満たす形にする。`skillId` はそのために含めるフィールドで、hash 入力ではないため candidate ID には影響しない。
- content hash はキーソートした canonical JSON 上で計算し、保存する `evidence` は hash 対象と同一の配列とする。保存値から contentHash を再導出できることを round-trip テストで担保する。

#### 未決事項

- 既存の日付ベース ID からの移行方法は「新規のみ content hash・既存 ID は書き換えない併記」とした。`scripts/feedback-rule-candidates.mjs --promote` の削除時期は次の minor で判断する。

### 契約5: Two-stage clustering

#### 既存実装の現状

- clusterKey は `skillId::feedbackType` の1段階である（`scripts/feedback-rule-candidates.mjs:144`）。
- `findingFingerprint` は Phase 1 で nullable であり（`scripts/feedback-rule-candidates.mjs:147-148`）、値がある場合は16桁 hex に検証される（`src/lib/feedback.mjs:88-89`）。
- 効果測定の重複排除は fingerprint 単位で行われている（`src/lib/promotion.mjs:400-405`）。

#### 固定する契約内容

- 第1段階: `(skillId, feedbackType)` で反復検知する（現行 clusterKey を維持）。
- 第2段階: fingerprint / category / scope / failure mode で実験 candidate へ分割する。
- fingerprint がない候補は Shadow 表示までは許可し、自動実験・昇格の対象にはしない。
- cluster を反復検知と原因仮説へ二段階分割できることを DoD とする（DoD 6項目め）。

#### 未決事項

- 第2段階の failure mode 分類語彙は P1 の Shadow aggregate で観測してから確定する。

### 契約6: Profile-specific acceptance

#### 既存実装の現状

- run record には `reviewMode`（default `medium`）が保存される（`src/lib/result-store.mjs:55`）。
- レビューモードルータは `light` / `standard` / `team` / `human-required` を定義している（`src/lib/review-mode-router.mjs:5`）。
- profile ごとの受入基準（precision / recall / cost / reversal のしきい値）は未定義である。

#### 固定する契約内容

- 「代表10件」は smoke test の最低条件とし、統計的十分性を示す固定値として扱わない。
- review profile ごとに precision / recall / cost / reversal の基準、必要サンプル数、critical regression の定義を決める。
- critical regression 0 は P2 paired replay の必須条件とする。
- profile 別の評価基準とサンプル数の決定方法を持つことを DoD とする（DoD 7項目め）。

#### 実装状況（#1574 P2 paired replay）

profile 別受入基準の宣言と評価を `river evolve replay` で実装しました。

- profile は manifest の `acceptance.profiles` として宣言する。名前だけを必須とし、単位（reviewMode か、対象リポジトリ×phase の組か）は運用観測の後に決める。
- critical regression 0 は契約が定める floor として全 profile へ無条件に注入し、`source: 'contract-6'` として区別できるようにする。宣言側はより厳しくする方向にだけ有効とし、`threshold` を 0 でクランプし、`required: false` を無視する。必須条件を宣言側から外せてはならないためである。
- held-out に宣言できるのは両側に存在する case key だけとする。片側だけの key は評価対象が空集合になり、全 metric が 0 で必須条件を満たしたように見えるためである。
- 評価対象の paired case が 0 件なら、全 criterion を `evaluable: false` / `satisfied: null` として報告する。
- `minSampleSize` の単位は `metrics.denominator`（`paired-finding` / `paired-case`）で決まる。語彙は閉じており、集計単位が実際に切り替わる。
- `minSampleSize` は未宣言なら `null` を報告する。既定値を置くと「代表10件」が統計的十分性として読まれてしまうためである。
- held-out 集合の宣言があれば、受入評価は held-out 側で行う。candidate の導出に使った case での評価は自己確認になる。
- precision / recall / cost / reversal は paired replay の入力から観測できないため、`evaluable: false` と `satisfied: null` を返す。黙って充足扱いにはしない。
- しきい値の自動適用は行わない。`decision` は常に null、`applied` と `autoPromotion` は常に false である。

#### 未決事項

- profile の語彙と必要サンプル数の決定方法は、`river evolve replay` の出力を数サイクル観測してから確定する。

## 4. DoD 9項目とフェーズ対応

採否コメントの追加 DoD を再掲し、P0（本ドキュメント）で満たすものと後続フェーズのものを区別します。

| #   | DoD                                                                                      | P0 での扱い         | 充足フェーズ                                      |
| --- | ---------------------------------------------------------------------------------------- | ------------------- | ------------------------------------------------- |
| 1   | evidence provenance / trust level が schema と採用 gate に定義されている                 | 契約1で内容を固定   | P1〜P2 実装                                       |
| 2   | canonical `review_run_id` で run → finding → feedback → experiment を追跡できる          | 契約2で内容を固定   | P1 実装                                           |
| 3   | immutable Experiment Manifest が定義されている                                           | 契約3で内容を固定   | P2 実装済み                                       |
| 4   | paired replay を ledger 比較と区別し activation / held-out / independent verifier を実装 | 契約3で内容を固定   | P2 実装済み（独立 verifier は自己申告の記録まで） |
| 5   | stable CLI I/O と content-addressed candidate ID が定義されている                        | 契約4で内容を固定   | P1 実装                                           |
| 6   | cluster を反復検知と原因仮説へ二段階分割できる                                           | 契約5で内容を固定   | P1〜P2 実装                                       |
| 7   | profile 別の評価基準とサンプル数の決定方法がある                                         | 契約6で内容を固定   | P2 実装済み                                       |
| 8   | Shadow mode の観測結果を人間が確認してから canary へ進む                                 | 運用条件として明記  | P3 運用                                           |
| 9   | #1574 が #1568-C の Retire lifecycle を重複実装していない                                | §2 の責務境界で固定 | 全フェーズ                                        |

P0 の完了条件は、6契約すべての「固定する契約内容」が本ドキュメントで確定し、レビューを通過することです。schema・CLI・実装の変更は P0 に含めません。

## 4.1 2026-10 addendum: Model + Harness attribution / Gated Evolution Screening

Issue #2499 で、外部の agent harness 研究を参考にしつつ、#1574 の既存責務を変えない additive な能力帰属・screening 契約を追加しました。

- 能力差は model 単体へ早計に帰属せず、Model + Harness configuration と固定した evaluation conditions の組で観測する。
- `Harness` は prompt / Skill / tool / context / routing / policy / evaluation を差分確認する分析上の envelope とする。新しい runtime object / schema / SSoT ではない。
- 1 candidate = 1 hypothesis = minimal change を維持し、変更 surface と固定 surface を区別する。
- adoption readiness は Candidate integrity → Experiment integrity → Evaluation quality → Independence / trust の順に確認する。その後、Human approval と Post-adoption effectiveness を既存 lifecycle 上で扱う。
- pre-adoption evidence は `experimentHistory[]`、post-adoption evidence は `effectivenessHistory[]` に分離する。
- paired replay 単独では adoption / canary を許可しない。Human-owned GO / NO-GO、merge、release 境界を維持する。

詳細は `docs/development/1574-model-harness-evolution-screening.md` を参照してください。

## 5. 未決事項（横断）

- Codex 外部レビュー（2026-07-24）の指摘として、候補名を `ImprovementOpportunity` へ改名する案が未決事項として残っている。
- 各契約の「未決事項」に記載した項目は、対応フェーズの実装 PR で確定し、本ドキュメントへ反映する。

## 6. 参照

- issue #1574（Epic）: Review Evolution Cycle 設計
- issue #1574 採否コメント（2026-07-24、comment ID 5064856987）: 条件付きGO・6契約・実装順・追加 DoD の一次ソース
- issue #1624（#1568-D）: interface B 起動契約（Phase 4）— 契約4を前提とする
- `docs/development/skill-improvement-loop-design.md`: feedback ループの既存設計
- `docs/development/1401-deterministic-command-execution-design.md` §1: ADR-003 を含む trust boundary の既存整理
