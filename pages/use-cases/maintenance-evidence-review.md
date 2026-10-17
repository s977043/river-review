---
id: maintenance-evidence-review
sidebar_label: 保守変更のEvidenceレビュー
---

# AI保守変更をEvidenceでレビューする（検証用ガイド）

> Status: **proposed / report-only**（2026-10-17）  
> External reference: [OpenAI — Maintaining software with the GPT-6 family](https://developers.openai.com/blog/maintaining-software-with-the-gpt-6-family)  
> 本書は必須GateやReview Policyの変更ではありません。判断基準の正本は[Review Policy](../reference/review-policy.md)です。

AIが改善候補を見つけても、候補の発見と変更の安全性、最終承認は別です。既存のreview skillやfixtureを先に使います。不足が再現されたときだけ新規Skillを検討します。

## 候補別の反証と停止条件

### Unused code / dependency

呼び出し元と動的参照を調べます。公開API、build/runtimeでの利用、lockfileとの整合も確認します。静的grepで参照が0件でも、動的importや外部consumerから利用される場合があります。

### Stale feature flag

現在の設定値と適用範囲を調べます。運用Kill Switch、ロールバック、ownerも確認します。恒久設定でも、運用上の切替を必要とするケースがあります。

### CI optimization

変更前後のCI jobと実行時間を比較します。検証範囲とexit codeの一致も確認します。テストをskipして速くなっただけなら効果として認めません。

### Flaky test

元の失敗ログと再現条件を記録します。retryや隔離の作用を調査し、修正後に実走します。greenでもretry増加が失敗を隠した可能性があります。

### Test or snapshot removal

削除するassertやvariantの意図を確認します。残るテストで回帰を検知できるか調べます。テスト件数の削減自体を改善とは扱いません。

## Report-only review protocol

### Source

対象repoと正確なbase/head SHAを記録します。PR/Issueと該当箇所、観測日の出典も示します。外部記事で報告された成果は、このrepoの実測と区別します。

### Hypothesis

未使用や遅延、不安定と推定する理由を観測と分けます。動的参照や運用用途による反証を探します。CIのカバレッジも調べます。

### Verification

コマンドと実行環境、exit codeを記録します。測定値、失敗、未実行も残します。確認できない場合はUNKNOWNとして扱います。

### Risk

互換性と安全性、間接consumerを確認します。rollbackと再発検出シグナルも調べます。根拠がない「安全に削除できる」は承認しません。

### Disposition

既存のreview出力契約でfindingを報告します。誤検知と採否の扱いは分けます。AIのreview verdictはGitHubの承認ではありません。

### Outcome

修正を承認済みworkflowが実施した場合のみ、結果を記録します。対象はCI実走と回帰、レビュー人時、改善効果です。未計測値は0にしません。

## 最小dogfood

既存PRの一例は[PR #2707](https://github.com/s977043/river-review/pull/2707)（未使用の依存関係の整理）です。依存ファイルのdiffだけで不要と判断しません。Node APIのimportsや依存関係、lockfileを調べます。Node 22でのbuild/testとCIも確認します。このガイドはPR #2707の承認ではありません。

正例（除去可能）と負例（間接参照やKill Switch、テストの検証不足）を用意します。既存Skillでの検出や見逃し、誤検知を評価します。期待結果は独立して確認します。

[Incident/revert-grounded eval #2701](https://github.com/s977043/river-review/issues/2701) と既存のpaired evalやReview Resolutionを参照します。専用corpusや別の学習エンジン、自動mergeフローは追加しません。

既存の[簡素化観点 #1452](https://github.com/s977043/river-review/issues/1452)との重複を確認します。最初は3候補を観測します。重大なfalse acceptが0件でも、少数件では安全性を保証できません。

## 拒否・保留条件

必要なprovenanceがない場合は保留します。権限や利用状況を確認できない場合も同様です。CIの検証範囲が削られる場合や、実行環境が一致しない場合はエスカレーションします。機密情報やHuman-owned承認の欠落も停止条件です。

## 境界

新しいスキルやフック、必須Gateは追加しません。本番コードの変更や権限緩和、API依存も含めません。既存の[実践進化方針](../guides/governance/practice-evolution.md)を踏襲します。導入可否は実PRでの再現検証後に独立して判断します。
