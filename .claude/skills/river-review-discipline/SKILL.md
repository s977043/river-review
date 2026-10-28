---
name: river-review-discipline
description: AI 駆動開発のレビュー品質を安定化させるレビュー規律。レビュー対象を分類し、要件・設計・差分・検証・報告を分けて見て、根拠に基づき approved / needs_revision / blocked / rejected を明示し、未検証事項と残リスクを隠さず memory に残す。「レビューして」「PR レビュー」「仕様/設計/差分/検証/報告をレビュー」「セキュリティ影響/データ影響を確認」「完了報告を検証」「/compact 前にレビュー記憶を作る」ときに使う。
allowed-tools: Read, Grep, Glob, Bash
---

# RiverReview Discipline

AI が「実装したつもり」「確認したつもり」「問題ないはず」で完了報告することを防ぐレビュー規律。
Fable 5 の検証習慣・レビュー観点・リスク発見・差分読解・次アクション決定を、日常モデルでも
継承できる運用ルールとして外部化したもの。

このスキルは RiverReview の既存資産の**上位の運用規律**であり、既存を置き換えない。
判断語彙・観点・記録は既存へ橋渡しする（下表・各節の「参照」を見よ）。

## When to use

- PR / 差分 / 仕様 / 設計 / 実装計画 / テスト / 検証レポート / 完了報告をレビューするとき
- セキュリティ影響・データ影響・破壊的変更を含む変更を判断するとき
- サブエージェントにレビューを分担させるか判断するとき
- `/compact` や要約でレビュー判断が失われそうなとき（memory 作成）

## When not to use

- 実装そのものを書くとき（本スキルはレビュー規律であって実装手順ではない）
- 語句・体裁のみの typo 修正（分類 `documentation`・low リスクで軽く通す）
- レビュー対象が単一・小さく、既に十分な検証証跡があるとき（過剰適用しない）

## 既存 RiverReview 資産へのマッピング（重複させない）

| 本スキルの概念   | 既存 RiverReview 資産                                                           |
| ---------------- | ------------------------------------------------------------------------------- |
| レビュー観点     | `docs/review/viewpoints.md` / `pages/reference/review-policy.md`（SSoT）        |
| 重要度           | `docs/review/output-format.md` の `critical` / `major` / `minor` / `info`       |
| 差分外の盲点発見 | `skills/agent-skills/adversarial-review`, `skills/upstream/pre-mortem`          |
| 要件の未決明示   | `skills/upstream/requirements-acceptance`                                       |
| 逸脱記録         | PR テンプレの Deviations 節 + `plangate-exec-conformance` の `design-deviation` |
| memory           | `docs/CONTINUITY.md`（plan 継続台帳）                                           |
| 機械判定（gate） | `src/lib/gate-decision.mjs` の `deriveGateDecision`（下表で対応づけ）           |

### レビュー工程の判断 ↔ gateDecision ↔ リスク階層

本スキルの `approved / needs_revision / blocked / rejected` は**人間/エージェントのレビュー工程の判断**。
RiverReview の機械 gate（host 側導出）とは責務が異なるが、次のように対応づく。

| レビュー判断   | gateDecision               | リスク階層  | 意味                                       |
| -------------- | -------------------------- | ----------- | ------------------------------------------ |
| approved       | GO / GO_WITH_OBSERVATION   | 原っぱ / 丘 | 続行可。観測付き続行を含む                 |
| needs_revision | NO_GO（BLOCKING_FINDINGS） | —           | 直せば通る。修正して再レビュー             |
| blocked        | ESCALATE                   | 崖          | 人間承認・追加情報・検証不能。止める       |
| rejected       | NO_GO（方針却下）          | —           | 要件不適合・設計矛盾・より安全な代替案あり |

## Core principles

1. **レビュー対象を最初に分類する**（下記 Classification）。分類前にレビューを始めない。
2. **要件・設計・差分・検証・報告を混同しない**。混ぜると観点が漏れる。
3. **「問題なさそう」で通さない**。approve する場合も**確認した根拠**を添える。
4. **変更されなかった重要箇所も見る**。差分外の互換性・整合性・盲点（pre-mortem / adversarial-review）。
5. **既存設計との整合性を最優先で確認する**（`viewpoints.md`・ADR・既存パターン）。
6. **実装差分が要求を満たすかを検証する**。差分の正しさと要件充足は別。
7. **テストは「ある」ではなく「適切な失敗を検知できる」かを見る**。
8. **未検証事項を隠さない**。「実装したこと / 確認できたこと / できていないこと / 推測 / 人間確認要」を分ける。
9. **破壊的変更・セキュリティ影響・データ影響は強制的に高リスク扱い**（下記 Risk）。
10. **判断は approved / needs_revision / blocked / rejected で明示**する。
11. **却下した案・懸念・残リスクを memory に残す**（`review-memory.md`）。
12. **次の一手は、最もリスクが高い未確認事項から決める**。

## Review target classification

レビュー前に対象を1つ以上に分類する。分類ごとに「見る観点」と「見なくてよい観点」を持つ。

| 分類                        | 見る                                                         | 見なくてよい                 |
| --------------------------- | ------------------------------------------------------------ | ---------------------------- |
| `requirements`              | 課題の明確さ・スコープ・受入条件・前提・曖昧さ               | 実装詳細・コードスタイル     |
| `design`                    | 既存整合・責務分離・データフロー・エラー処理・拡張性         | 具体的な変数名・行単位の実装 |
| `implementation_plan`       | 変更対象・影響範囲・検証手順・順序・ロールバック             | 最終コードの細部             |
| `diff`                      | 要件充足・計画外変更・既存挙動破壊・テスト・安全性           | 未変更ファイルの一般批評     |
| `test`                      | 適切な失敗検知・境界・回帰・偽陽性/偽陰性                    | 本番実装の設計論             |
| `verification_report`       | 実行/未実行の検証・証跡・残リスク・完了判定の妥当性          | コード美観                   |
| `report`                    | 実施内容の具体性・変更ファイルの明示・証跡の裏取り・残リスク | コードスタイル・美観         |
| `documentation`             | 正確性・実行例の動作・リンク・SSoT 整合                      | 実装内部                     |
| `release_readiness`         | CI・移行・ロールバック・監視・段階公開                       | 個別行レビュー               |
| `security_sensitive_change` | 認証認可・秘密情報・信頼境界・入力検証（強制 high 以上）     | —                            |
| `data_sensitive_change`     | データ破壊・不可逆・移行安全性・整合性（強制 high 以上）     | —                            |
| `unknown`                   | まず分類を確定させる。不明なまま進めない                     | —                            |

各対象の詳細チェックリストは `templates/` の各テンプレを使う。

## Fresh Context Plan Review（任意 / Shadow）

`design` / `implementation_plan` で実装前に設計判断が必要な変更には、
[Fresh Context Plan Review](templates/fresh-context-plan-review-template.md) を**任意のAdvisoryチェック**として使用する。
単純な低リスク修正へ追加のAgent・レビューラウンドを強制しない。

- **Comprehension**: 新しい担当者が許可された文書と参照コードだけで目的・スコープ・AC・依存関係を説明できるか。
- **Implementation Readiness**: 実装前に確定すべき設計判断と検証方法が明確か。局所的な実装詳細の選択まで強制しない。
- **Context境界**: Freshなsubagent/sessionが実際に起動できる場合は、会話履歴や他Reviewerの結論を渡さず、artifact・参照コード・制約を渡す。独立した実行のHost証跡がなければ `unknown` と記録し、Goldfish実行済みと主張しない。
- **判定の境界**: Existing Review Coverage・Provenance・Human権限を再利用。advisoryの結果や `findings=0` をGate PASS・C-3/C-4承認に変換しない。
- **重複防止**: `requirements-acceptance` / `plangate-plan-integrity` / `architecture-validation-plan` の既存Findingを別名で二重計上しない。

## Requirements review（要点）

ユーザー要求との整合 / 解決課題の明確さ / スコープ / Non-goals / 成功条件 / 受入条件 / エッジケース /
依存 / 制約 / 未定義の前提 / 仕様の曖昧さ / 実装前に確認すべき質問。
→ `templates/requirements-review-template.md`。既存 `requirements-acceptance` skill と併用。

## Design review（要点）

既存設計との整合 / 責務分離 / データフロー / エラー処理 / セキュリティ / パフォーマンス /
テスト容易性 / 保守性 / 拡張性 / 過剰設計 / 依存追加の妥当性 / 代替案 / ロールバック容易性。
→ `templates/design-review-template.md`。盲点は `pre-mortem` / `adversarial-review` を併用。

## Diff review（要点）

要件充足 / 計画外変更の有無 / 既存挙動破壊 / 命名・責務・構造の整合 / エラー処理明示 /
不要依存の追加 / テスト追加更新 / テストの失敗検知力 / セキュリティ / データ破壊・不可逆 /
秘密情報・PII・認証情報の混入 / パフォーマンス劣化 / ログ・監視・運用影響 / ドキュメント更新要否。
→ `templates/diff-review-template.md`。**差分に存在しないコードへの推測指摘は禁止**（`.claude/rules/review-core.md`）。

## Verification review（要点）

実行コマンド / 実行結果 / 成功 / 失敗 / スキップ / 未実行 / 手動確認 / 再現手順 / 証跡 / 残リスク /
完了判定の妥当性。次を必ず**分けて**書く: 実装したこと / 確認できたこと / 確認できていないこと /
推測していること / 人間確認が必要なこと。
→ `templates/verification-review-template.md`。

## Report review（要点）

実施内容の具体性 / 変更ファイルの明示 / 検証結果の観測可能性 / 未検証事項の隠蔽有無 /
残リスクの明示 / 判断が要る点の明示 / 次アクションの妥当性 / 「完了」に十分な証拠があるか。
**背景**: 完了報告は捏造されうる（もっともらしい PR 番号・テスト数・コマンド出力）。報告の質は実行の証拠ではない。
→ `templates/report-review-template.md`。

## Decision rules

- **approved**: 要件適合 + 既存設計整合 + 重大リスクなし + 必要な検証が成功 + 未検証事項が許容範囲で**明示**されている。**根拠を添える**。
- **needs_revision**: 方向性は正しく、修正すれば通せる。不足検証・説明、軽〜中の設計懸念がある。
- **blocked**: 重要情報の不足 / 人間承認が必要 / 本番・データ・認証・課金・セキュリティ影響が未確認 / 検証不能 / 外部仕様・料金・規約の確認要。→ ESCALATE（崖）。
- **rejected**: 要件不適合 / 既存設計と大きく矛盾 / リスク対効果が低い / 過剰実装 / セキュリティ・データ破壊・運用リスクが高い / より安全で安価な代替案が明確。

## Risk classification

`low` / `medium` / `high` / `critical`。以下は**強制的に high 以上**（迷ったら critical 寄り）:

データ削除 / DB schema 変更 / 認証・認可変更 / 課金・請求変更 / 外部 API 変更 / 本番設定変更 /
CI/CD 変更 / セキュリティ設定変更 / 依存の大幅追加 / 大規模リファクタ / irreversible な変更 /
PII・secret・credential の取り扱い / 監視・ログ・アラートへの影響。

fail-safe: **不明・未決・malformed は安全側（high / blocked / ESCALATE）へ倒す**。GO 方向に倒さない。

## Subagent review rules

**使う条件**: 複数観点の分離が要る / セキュリティ・設計・テストを分けたい / 差分が大きい /
外部仕様調査が要る / 重要判断のバイアスを減らしたい。

**使わない条件**: 小さな typo / 単純な docs 修正 / 差分が小さく観点が単一 / 起動コストの方が高い /
既に十分な検証証跡がある。→ **サブエージェント利用を目的化しない**。

使う場合は各サブエージェントに明示する: **Role / Review target / Context / Expected output /
Decision criteria / What not to review**。返ってきた指摘は**鵜呑みにせず**、レビュー主体が差分・
ソースで検証する（誤指摘はある）。

## Memory rules

`/compact` 後に失われると困る判断を `review-memory.md`（または `docs/CONTINUITY.md`）に残す:
採用したレビュー判断 / 却下した案と却下理由 / 既存設計上の制約 / 繰り返しそうなレビュー漏れ /
重要な検証コマンド / 未解決リスク / 次回見るべきファイル / 次の一手。

## Final report rules

レビュー報告には必ず含める: **Review target / Decision / Risk level / Findings /
Required changes / Verification status / Unverified items / Remaining risks / Recommended next action**。
「問題なし」と言う場合は**確認した根拠**を添える。

## このバンドルのファイル

- `river-review-loop.md` — 標準ループ（Intake→Classify→Review→Risk→Decision→Verify→Remember→Next Action）
- `review-memory.md` — セッション跨ぎの memory テンプレ
- `templates/requirements-review-template.md` ほか各レビューテンプレ
- `anti-patterns.md` — 避けるべきレビューの型
- `usage-prompts.md` — Claude Code 用の短い使用例プロンプト
