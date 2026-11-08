# Verification-First × River Review—レビュー最適化の検討・評価計画

> Status: **Proposal / shadow-only**（2026-11-09）。本書は設計・評価の検討記録であり、製品仕様、Gate、承認ポリシーを変更しない。
> 対象: `s977043/river-review` の観測時 `main` = `ea345b0907600efc21f6e3b761a7bfce7907eaac`。実行・採用時には最新 HEAD と Issue/PR の状態を再取得する。
> 対応する PlanGate 側の検討資料: `s977043/PlanGate` の `docs/working/discussions/2026-11-09-verification-first-river-review-integration.md`（別 PR）。

## 1. Decision / 目的と非目的

**検証の質を第一に高め、重大な見逃しを増やさずに、重複レビュー・人間の確認負荷・モデルコストを減らせるかを検証する。** 結論を先取りして敵対的レビューを廃止しない。River Review の責務は、チーム所有の判断基準をもとに要件・差分・テスト・証拠をレビューし、呼び出し側へ判断材料を渡すこと。マージの許可・承認トークン発行はしない。

本書が**行わない**こと:

- 新規レビューエンジン / Risk Engine / Gate / 永続 Schema / 必須 Skill の追加。
- `gateDecision`、`riskAction`、`selectedMode` の既定値や既存判断の緩和。
- AI verdict を Human approval に変換すること、no-look merge の一般化、レビューの一律省略。
- 既存 Issue の重複起票、評価結果を持たない Skill の増設、無制限の自動修正ループ。

## 2. 外部入力の評価（事実・仮説・採用判断を分離）

起点: [kaito 氏の投稿（2026-11-08）](https://x.com/cu30rry_/status/2119388210057171374) と、引用元の [ひさじゅ氏の投稿](https://x.com/hisaju01/status/2119256029745778753)。投稿本文は Jina 経由で取得して確認した。これは**運用仮説の入力**であり、性能・安全性の実証ではない。

| 主張                                     | 評価         | 採用時の条件                                                                                             |
| ---------------------------------------- | ------------ | -------------------------------------------------------------------------------------------------------- |
| 実アプリの E2E・再現できる検証証拠を重視 | 支持         | テストの期待値・実行環境・対象 SHA を検証する。テスト成功だけで十分性を主張しない                        |
| 形式検証で全ケースを網羅できる           | 条件付き     | 証明対象の仕様・モデル・仮定・対象実装を明記。仕様が欠けていれば保証外                                   |
| コードベースを決定論的にする             | 有効な方向性 | hermetic fixture、再現可能なコマンド、安定したアサーションを対象にし、外部状態の不確実性は消せないと明記 |
| 敵対的レビューは無駄である               | 未実証       | 重大見逃し・false escalation・コストの対照実験が必要。独立反証と多重人格レビューを混同しない             |
| 誰でも no-look merge できる              | 不採用       | Human-owned merge / Host authority / GitHub protections を維持する                                       |
| fresh context・別モデルは有利            | 検証仮説     | 同条件の paired replay で独立性・再現性・費用を測る。モデルを変えたことを保証とみなさない                |

参考となる一次資料:

- [AWS: Automated reasoning の効果と仮定の限界](https://aws.amazon.com/blogs/security/an-unexpected-discovery-automated-reasoning-often-makes-systems-more-efficient-and-easier-to-maintain/)—数学的検証も環境モデルの前提に依存する。
- [Google Research: Spec-driven test generation](https://research.google/pubs/grounding-ai-agents-in-contracts-an-empirical-evaluation-of-spec-driven-test-generation/)—仕様起点のテスト生成に関する限定された実験結果。
- [SWE-Proof（2026、preprint）](https://arxiv.org/abs/2609.21190)—テスト合格の不足と、AIによる形式仕様生成の忠実性の問題。論文内の数値を本 OSS の性能に外挿しない。

## 3. 既存の正本・Owner と、現時点の Gap

| Concern                        | 既存 Owner / SSoT                                                                                                                                                                   | 今回の検討で扱う差分                                                                          |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 判断と権限                     | `pages/explanation/what-is-river-review.md`、ADR-003、`src/lib/gate-decision.mjs`                                                                                                   | Review verdict は助言であり、マージ権限ではないと固定                                         |
| Review execution coverage      | [#2212](https://github.com/s977043/river-review/issues/2212)、`src/lib/reviewer-orchestrator.mjs`                                                                                   | `0 findings` / `complete` / `partial` / `not_executed` を混同しない。現状は observe-only      |
| Evidence-grounded risk         | [#2781](https://github.com/s977043/river-review/issues/2781)、Risk Map / Router                                                                                                     | 5軸（Alignment / Impact / Verification / Rollback / Detection）と hard floor を shadow で評価 |
| Incident / revert ground truth | [#2701](https://github.com/s977043/river-review/issues/2701)、#1574 / #2615                                                                                                         | 人間確認済みの positive / clean negative ケースを既存 paired replay に供給                    |
| Resolution / Human attention   | [#2322](https://github.com/s977043/river-review/issues/2322)、#2378、#2575                                                                                                          | 必要な追加検証と unknown を Decision Brief に出す。新しい履歴 DB を作らない                   |
| 独立反証と Security Coverage   | [#2267](https://github.com/s977043/river-review/issues/2267)                                                                                                                        | Finder と Verifier、Candidate と Confirmed を区別。security audit と PR review を分離         |
| 計画・検証の実行側             | [PlanGate #870](https://github.com/s977043/PlanGate/issues/870)、[#1430](https://github.com/s977043/PlanGate/issues/1430)、[#1640](https://github.com/s977043/PlanGate/issues/1640) | River Review は PlanGate の Verifier を再実装せず、証拠・仕様・Coverage を評価する            |

**優先して閉じる必要がある実測された弱点（本書では修正しない）**:

- [#2880](https://github.com/s977043/river-review/issues/2880): コメント接頭辞を含むコード行が diff 最適化で除外され、検出器・Gate に届かない。
- [#2870](https://github.com/s977043/river-review/issues/2870): routing のため key / conflict の detector が複数パスで走らない。
- [#2867](https://github.com/s977043/river-review/issues/2867) / [PR #2872](https://github.com/s977043/river-review/pull/2872): verifier が deterministic finding を棄却する経路を修正中。最新 PR の merge / CI 結果は採用前に再確認。
- [#2812](https://github.com/s977043/river-review/issues/2812): LLM が走らないのに `auto-approve / 100` と表示される misleading clean surface。
- [#2875](https://github.com/s977043/river-review/issues/2875): 同一 PR の4回の観測で River Review と別モデルの判断が相違。1 PR の小標本であり、どちらが正しいかを盲目的に決めない。

これらの存在を、現時点でレビュー削減・no-look merge を有効化しない理由とする。**shadow 評価の実施は可能**。

## 4. 証拠監査の観点（新 Schema ではなく既存 artifact の projection）

検証結果が `PASS` でも、次を独立した観測軸として扱う。各項目は既存 artifact / Execution Manifest / Review Coverage から取れるかを Phase 0 で調べる。

1. **同一性**: repo、base/head の完全 SHA、検証対象のファイル・変更範囲、plan / 受入基準の revision。
2. **実行性**: verifier の実行有無、コマンドと exit、実行環境、時刻、ログ・trace・screen capture などの参照。
3. **忠実性**: Assertion / 形式仕様が要件の WHAT に一致するか。AI が実装から期待値を逆算していないか。
4. **十分性**: 重要な negative / boundary / state transition、未検証の user journey、対象外・skip・timeout。
5. **独立性**: Builder、Verifier、Reviewer の actor / context / model / run と参照範囲。推測した独立性は `unknown`。
6. **証拠の状態**: `confirmed`、`candidate`、`unknown`、`stale`、`not_executed`、`failed` を混ぜない。既存 vocabulary に写像し、新 enum は勝手に追加しない。
7. **安全性・運用**: secret/PII、セキュリティ境界、不可逆操作、ロールバック、障害検知、利用者への影響。

失敗する例: CI job green だがテストは step=0、古い SHA の E2E、形式仕様が実装と同じ誤りを表す、対象 chunk が timeout しているのに finding 0。これらは **clean と同義ではない**。

## 5. Risk-based review depth（shadow 仮説、採用済み policy ではない）

| 変更例                                              | 推奨候補                                                   | 強制しないこと                             |
| --------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------ |
| docs / reversible、十分な根拠あり                   | 決定論的チェック中心。不要な全員レビューを減らす余地を評価 | `0 findings` だけで complete とみなさない  |
| 通常の機能変更                                      | Unit / Integration / 必要な E2E + 該当観点のレビュー       | 毎回すべての specialist を走らせない       |
| auth / permission / state machine / retry-resume    | 不変条件・異常系の反例 + 独立レビュー / unknown coverage   | テストの成功で重大な独立観点を省かない     |
| security / migration / irreversible / policy / Gate | 専門検証、必要に応じて形式手法、独立反証、Human cliff      | 自動承認・Human-owned merge の代行をしない |

リスク低下に使える証拠と、hard floor を上げる証拠を別に管理する。**Shadow 段階では review depth を下げない**。#2781 の意図どおり、初期統合は既存判定を厳しくする方向の advisory signal のみ。

## 6. 比較検証（既存 eval へ接続）

### 3群の仮説

| 群                                     | 評価対象                                                                      | 確認点                                   |
| -------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------- |
| A: multi-review baseline               | 現行の複数観点レビュー                                                        | 検出力とコストの基準線                   |
| B: Verification-First                  | 仕様 / Unit / Property / Integration / E2E / targeted formal と必要なレビュー | 実行証拠によって反復レビューを減らせるか |
| C: Verification-First + evidence audit | B に対し証拠の十分性・provenance・coverage 監査を追加                         | false-clean と重大見逃しを減らせるか     |

本比較は `ai-agent-template#220` の検討と連携可能だが、River Review 側に別の評価エンジンは作らない。実装側の PoC と reviewer 側の paired replay は **同じ評価基準でも責務を分ける**。

### ケースと評価条件

- まず #2701 の方針で **人間が原票と不具合を確定した 5〜10 件**を候補にする。clean negative と未確定ケースも分離。未収集は 0 件の見逃しとは報告しない。
- 最小の反例を含む。例えば auth の1行変更、正常系だけ green の不可逆 migration、再開状態の不変条件違反。
- さらに、Requirement と実装の不整合、E2Eの期待値を実装に合わせる改変、タイムアウト/skip、stale SHA。
- detector routing gap、prompt injection、reversible docs も比較対象に含める。
- baseline/candidate は **同一対象 SHA・同一可視 evidence・同一 task profile**。環境・モデル・Skill 版と run identity を記録する。
- 候補が事例を学習しないよう development / held-out を分ける。評価 oracle と Reviewer を独立させる。
- 実行自体が成立しなければ `inconclusive`。差分検出力の改善を、単なるプロンプトの長さで評価しない。

### 必須メトリクス

1. confirmed critical / major の **見逃し件数と対象件数**（不明・未実行は別集計）。重大見逃しの悪化は不合格。
2. verified clean negative に対する harmful false escalation / false positive。
3. reviewer execution / context coverage の complete / partial / not_executed、stale evidence。
4. 人間の attention time（p50 / p95）、rounds-to-pass、再レビューの重複指摘。
5. LLM token / 費用、wall-clock latency、失敗後の復旧時間。
6. Negative controls / mutation の検出率（母数・未実行・対象範囲を明示）。

閾値は **結果を見てから決めない**。評価開始前に baseline と候補の受入閾値、critical regression、停止条件を事前固定する。少数ケースのゼロ見逃しを一般的な安全性保証とは呼ばない。

## 7. 実行順序と採用判断

| Phase                            | 既存 Owner                            | 出口条件                                                                             |
| -------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------ |
| 0. 安全な基準線                  | #2880 / #2870 / #2867 / #2812 / #2875 | false-clean / 未実行 / severity gap を再現し、既存修正 Issue に戻す。Gate を緩めない |
| 1. 契約・Gap確認（docs-only）    | #2781 / #2212、PlanGate #1430 / #1640 | 既存の evidence / review coverage / SSoT へマップ。重複 schema・新 Gate は作らない   |
| 2. paired shadow eval            | #2701 / #1574 / #2615 / #2378         | Ground truth、固定評価条件、coverage、費用・人間負荷を観測する                       |
| 3. advisory 限定導入             | #2781 / #2322                         | false-low 0、major/critical missed regression 0、既存判定を下げない、安全な rollback |
| 4. review depth の縮小を別途判断 | Owner + Host + Human                  | 十分な実証・新たな独立レビュー・承認境界の確認後のみ、別 Issue/PR で判断             |

停止条件: confirmed major/critical の回帰、provenance 不明の PASS、判定境界の迂回、未実行を clean に変換、モデルコスト上限超過、評価条件の事後変更、独立性の自称。
いずれかが起きた場合、shadow-only へ戻す。Human へ事実と証拠を報告する。

## 8. 本提案のレビュー観点 / 残る不確実性

- テスト数・Coverage 数を増やしても、要求された挙動を正しく表している保証にはならない。
- 形式検証は特定の不変条件には非常に強いが、仕様の忠実性・環境モデル・証明対象の実装範囲を別監査する必要がある。
- 独立 reviewer が問題を見つけた #2875 は重要な事例だが、4回/1PRで一般的効果は立証しない。
- River Review の Gate は依然として Host authority の下にある。Human cliff、C-4 merge、GitHub保護設定の緩和は扱わない。
- 配布済みバージョンと `main` は一致しない場合がある。Gate 挙動は必ず latest head / plugin distribution / CI で再確認する。

**本書は検討事項を追跡可能にした記録である。設計の採用、実装、評価の完了を示さない。**
