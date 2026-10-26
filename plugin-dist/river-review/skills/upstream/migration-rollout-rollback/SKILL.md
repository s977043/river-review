---
id: 'migration-rollout-rollback'
name: Migration, Rollout & Rollback Plan
description: Ensure design/ADR changes include a concrete migration plan, rollout strategy, rollback conditions, and compatibility considerations.
version: 0.1.0
category: upstream
phase: upstream
applyTo:
  - 'docs/**/*'
  - 'pages/**/*'
  - '**/*migration*.md'
  - '**/*rollout*.md'
  - '**/*rollback*.md'
  - '**/*release*.md'
  - '**/*deploy*.md'
tags: [migration, rollout, rollback, release, upstream]
severity: major
inputContext: [diff]
outputKind: [summary, findings, actions, questions]
modelHint: balanced
dependencies: [repo_metadata]
---

## Pattern declaration

Primary pattern: Reviewer
Secondary patterns: Inversion
Why: 設計変更の差分から移行計画・段階リリース・ロールバックの曖昧さをレビューし、ロールバック不能シナリオを逆照射する。

## Goal / 目的

- 仕様/設計変更の差分から、移行計画・段階リリース・ロールバックが曖昧なまま実装に入るリスクを減らす。

## Non-goals / 扱わないこと

- CI/CD や運用基盤の詳細設計そのもの（ただし “必要な前提” が抜けていれば指摘する）。
- 実装レベルの最適化や手順の細部（設計として必要な骨子に絞る）。

## Pre-execution Gate / 実行前ゲート

このスキルは以下の条件がすべて満たされない限り`NO_REVIEW`を返す。

- [ ] 差分に設計ドキュメント・移行計画・ロールアウト/ロールバック・リリース・デプロイに関するファイルが含まれている
- [ ] inputContextにdiffが含まれている

ゲート不成立時の出力: `NO_REVIEW: migration-rollout-rollback — 移行/ロールアウト/ロールバックに関する差分がない`

## False-positive guards / 抑制条件

- 影響範囲が明確に “実験/検証のみ・本番影響なし” と書かれている場合は、過度に厳しくしない。

## Rule / ルール

- まず「何が変わるか（互換性/データ/動作）と、移行の要否」を 1 行で要約する。
- 指摘は最大 8 件まで。ロールバック不能・データ損失・互換性破壊につながるものを優先。
- “追記案（手順テンプレ）” を最短で貼れる形で付ける。

## Checklist / 観点チェックリスト

- 互換性
  - 旧/新クライアント（API/スキーマ/設定）の両対応期間が必要か。
  - 破壊的変更なら、バージョニングや移行ガイドがあるか。
- 段階移行
  - ステップ（準備→並行稼働→切替→清掃）が明示されているか。
  - Feature flag / 段階リリースの単位と切替条件があるか。
- ロールバック
  - ロールバック条件（どのメトリクス/症状で戻すか）が明示されているか。
  - 戻したときの整合性（データ/互換性/二重書き込み）が説明されているか。
- 観測性
  - リリース中に見るべきメトリクス、ログ、ダッシュボード、アラートがあるか。
  - 失敗時の切り分けに必要な相関IDなどが設計に含まれるか。

## Output / 出力フォーマット

すべて日本語。`<file>:<line>: <message>` 形式で出力する。

- 先頭に要約を 1 行: `(summary):1: <変更点と移行の要点>`
- 以降は指摘（最大 8 件）:
  - `<message>` に `[severity=critical|major|minor|info]` を含める。
  - 可能なら “追記案（テンプレ）” を付ける。

追記テンプレ例:

- `移行ステップ: 1) 準備, 2) 並行稼働, 3) 切替, 4) 清掃（各ステップの完了条件も）`
- `ロールバック条件: <監視指標/閾値/期間> / 手順: <戻す操作> / 注意: <データ整合性>`

## 評価指標（Evaluation）

- 合格基準: 差分に紐づく移行/ロールバックの不足が、優先度付きで短く指摘され、貼れる追記案がある。
- 不合格基準: 実装前提の断定、差分と無関係な運用一般論、指摘過多。

## 人間に返す条件（Human Handoff）

- ロールバック不能（不可逆）やデータ削除を伴う場合、判断が組織/法務/顧客影響に跨るため人間レビューへ返す。
