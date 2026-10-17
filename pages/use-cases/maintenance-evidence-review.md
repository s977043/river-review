---
id: maintenance-evidence-review
sidebar_label: 保守変更のEvidenceレビュー
---

# AI保守変更をEvidenceでレビューする（検証用ガイド）

> Status: **proposed / report-only**（2026-10-17）
> External reference: [OpenAI — Maintaining software with the GPT-6 family](https://developers.openai.com/blog/maintaining-software-with-the-gpt-6-family)
> This guide is not a review-policy amendment or a new mandatory gate. The normative review and severity policy remains [Review Policy](../reference/review-policy.md).

AIが未使用コード・依存関係・古いFeature Flag・CI最適化・Flaky Testの改善候補を発見しても、**候補発見、変更の安全性、最終承認は別**である。既存のreview skillやfixtureを先に利用し、不足が再現されてからのみ新規Skillを提案する。

## 候補別の反証と停止条件

| Candidate | 必須の確認（例） | 誤った承認の反証例 |
| --- | --- | --- |
| Unused code / dependency | 呼び出し元、動的参照、公開API、build/runtime両方の利用、lockfile整合 | 静的grepで0件でも動的importや外部consumerで使われる |
| Stale feature flag | 設定の現在値・有効範囲、運用Kill Switch、ロールバック、owner | permanentフラグでも運用で切替が必要 |
| CI optimization | 変更前後の実CI jobと実行時間、同等の検証範囲・exit code | テストをskipして速くなっただけ |
| Flaky test | 元の失敗ログ、再現条件、retry/隔離の作用、修正後の実走 | greenが失敗を隠すretry増加の結果 |
| Test or snapshot removal | 消すassert/variantが守っていた契約、残る回帰検知 | テスト件数だけ減りcoverageが失われる |

## Report-only review protocol（既存の正本を置き換えない）

1. **Source**: 対象repo、正確なbase/head SHA、PR/Issue・該当箇所、観測日の出典を列挙する。外部記事の成功談はこのrepoでのEvidenceではない。
2. **Hypothesis**: 何が未使用・遅い・不安定と推定されるかを観測と区別する。動的参照、管理上の用途、実CIカバレッジなどの反証を探す。
3. **Verification**: 使用したコマンド・実行環境・exit code・測定値・失敗・未実行を明記する。観測できなければUNKNOWNと記録し、PASSに丸めない。
4. **Risk**: 安全性、データ／API互換性、間接consumer、rollback手段、再発検出シグナルを確認する。証拠なしの「安全に削除できる」は承認しない。
5. **Disposition**: 既存review出力契約でfindingを報告する。誤検知、抑制、採否とHuman/Hostの承認は別の記録で扱う。AI review verdictはGitHub approvalではない。
6. **Outcome**: 修正を別の承認済みworkflowが実行した場合のみ、CI実走・回帰・レビュー人時・改善効果を記録する。未計測を0とみなさない。

## 最小dogfood（新しい判定エンジンは作らない）

- 既存の未使用依存関係整理の一例：[PR #2707](https://github.com/s977043/river-review/pull/2707)。依存ファイルの差分だけで不要と断言せず、Node APIのimports、依存のdirect/transitive位置付け、lockfile、Node 22環境でのbuild/testとCIを突き合わせる。**このガイドはPR #2707を承認したことにはならない**。
- 正例（安全に除去できる）と負例（間接参照・運用Kill Switch・検証削除）をそれぞれ用意し、既存Skillのdetected/missed/false positiveを評価する。真偽は後知恵なしに独立確認する。
- [Incident/revert-grounded eval #2701](https://github.com/s977043/river-review/issues/2701) と既存のpaired eval/Review Resolutionを参照し、専用corpus・別の学習エンジン・自動mergeフローを新設しない。
- 既存の[簡素化観点 #1452](https://github.com/s977043/river-review/issues/1452)との重複を調べ、追加するなら最小のgapのみ。初期は3候補を確認し、重大なfalse accept 0件を観測する（**少数件による安全性保証ではない**）。

## 拒否・保留条件

判断に必要なprovenanceがない、権限や利用状況を検証できない、CIの検証範囲が削られる、実行環境が一致しない、機密が混入する、またはHuman所有の承認がない場合は**保留／エスカレーション**。データの欠測はno problemを意味しない。

## 境界

本ガイドは新しいスキル、フック、必須Gate、プロダクションの修正手順、権限緩和、API依存を追加しない。既存の[実践進化方針](../guides/governance/practice-evolution.md)のAdopt / Adapt / Deferを踏襲する。採用は実PRでの再現検証後に独立判断する。
