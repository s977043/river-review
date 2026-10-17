---
id: maintenance-evidence-review
sidebar_label: 保守変更のEvidenceレビュー
---

# AI保守変更をEvidenceでレビューする（検証用ガイド）

> Status: **proposed / report-only**（2026-10-17）  
> External reference: [OpenAI — Maintaining software with the GPT-6 family](https://developers.openai.com/blog/maintaining-software-with-the-gpt-6-family)  
> 本書は新しい必須GateやReview Policyの変更ではありません。判断基準の正本は[Review Policy](../reference/review-policy.md)です。

AIが未使用コードや依存関係、古いFeature Flag、CI最適化、Flaky Testの改善候補を見つけても、候補の発見と変更の安全性、最終承認は別です。既存のreview skillやfixtureを先に使い、不足が再現されたときだけ新規Skillを検討します。

## 候補別の反証と停止条件

- **Unused code / dependency**: 呼び出し元、動的参照、公開API、build/runtimeでの利用、lockfile整合を確認します。静的grepで参照が0件でも、動的importや外部consumerから利用される場合があります。
- **Stale feature flag**: 設定の現在値、有効範囲、運用Kill Switch、ロールバック、ownerを確認します。恒久設定でも運用上の切替が必要な場合があります。
- **CI optimization**: 変更前後の実CI job、実行時間、検証範囲、exit codeを確認します。テストをskipして速くなっただけなら効果として認めません。
- **Flaky test**: 元の失敗ログ、再現条件、retryや隔離の作用、修正後の実走を確認します。greenになっても、retry増加で失敗が隠れた可能性があります。
- **Test or snapshot removal**: 削除するassertやvariantの意図と、残る回帰検知を確認します。テスト件数の削減自体を改善とは扱いません。

## Report-only review protocol

1. **Source**: 対象repoと正確なbase/head SHA、PR/Issue、該当箇所、観測日の出典を列挙します。外部記事の成功談は、このrepoの実測とは区別します。
2. **Hypothesis**: 未使用、遅延、不安定と推定する理由を観測と分けます。動的参照や運用用途、CIのカバレッジによる反証も調べます。
3. **Verification**: コマンド、実行環境、exit code、測定値、失敗、未実行を記録します。確認できなければUNKNOWNとして扱います。
4. **Risk**: データやAPIの互換性、安全性、間接consumer、rollback、再発検出シグナルを確認します。根拠がない「安全に削除できる」は承認しません。
5. **Disposition**: 既存のreview出力契約でfindingを報告します。誤検知の扱いと、人間またはHostの承認を別の記録で管理します。AI review verdictはGitHub approvalではありません。
6. **Outcome**: 修正が別の承認済みworkflowで実施された場合のみ、CI実走と回帰、レビュー人時、改善効果を記録します。未計測値は0にしません。

## 最小dogfood（新しい判定エンジンは作りません）

- 既存PRの一例は、[PR #2707](https://github.com/s977043/river-review/pull/2707)（未使用の依存関係の整理）です。依存ファイルのdiffだけでは不要と判断しません。Node APIのimportsやdirect/transitive依存、lockfile、Node 22でのbuild/test、CIを照合します。このガイドはPR #2707の承認ではありません。
- 正例（除去可能）と負例（間接参照、運用Kill Switch、テストの検証不足）を用意します。既存Skillでの検出、見逃し、誤検知を評価し、期待結果は独立して確認します。
- [Incident/revert-grounded eval #2701](https://github.com/s977043/river-review/issues/2701) と既存のpaired evalやReview Resolutionを参照します。専用corpus、別の学習エンジン、自動mergeフローは追加しません。
- 既存の[簡素化観点 #1452](https://github.com/s977043/river-review/issues/1452)と重複する部分を探します。最初は3候補を確認し、重大なfalse acceptが0件か観測します。ただし少数件で安全性を保証するものではありません。

## 拒否・保留条件

必要なprovenanceがない場合や、権限と利用状況を確認できない場合は保留します。CIの検証範囲が削られたり実行環境が一致しなかったりする場合も同様です。機密情報の混入やHuman-owned承認の欠落もエスカレーション対象です。データが欠けていることは、問題がない証拠ではありません。

## 境界

本ガイドでは新しいスキル、フック、必須Gate、プロダクションの修正手順、権限緩和、API依存を追加しません。既存の[実践進化方針](../guides/governance/practice-evolution.md)を踏襲します。導入するかどうかは実PRでの再現検証後に独立して判断します。
