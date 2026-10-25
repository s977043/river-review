---
id: 'data-flow-state-ownership'
name: 'Data Flow & State Ownership'
description: 'Ensure designs define data flow, state ownership, consistency boundaries, and cross-boundary writes to prevent drift and incidents.'
version: 0.1.0
category: upstream
phase: upstream
applyTo:
  - 'docs/**/*flow*.md'
  - 'docs/**/*sequence*.md'
  - 'docs/**/*data-flow*.md'
  - 'docs/**/*state*.md'
  - 'docs/**/*design*.md'
  - 'pages/**/*flow*.md'
  - 'pages/**/*sequence*.md'
  - '**/*sequence*.{md,png,svg}'
  - '**/*flow*.{md,png,svg}'
  - '**/*dfd*.{md,png,svg}'
  - '**/*diagram*.{md,png,svg}'
tags: [architecture, dataflow, state, ownership, upstream]
severity: major
inputContext: [diff]
outputKind: [summary, findings, actions, questions]
modelHint: balanced
dependencies: [repo_metadata]
---

## Pattern declaration

Primary pattern: Reviewer
Secondary patterns: Inversion
Why: データフローと状態所有の曖昧さをチェックリスト型で評価し、整合性崩れや二重書き込みを事前に検出する

## Goal / 目的

- 設計の差分から、データフロー/状態所有の曖昧さによる整合性崩れ・二重書き込み・障害時の復旧困難を減らす。

## Non-goals / 扱わないこと

- 分散システムの一般論を長々と語らない（差分に紐づく具体的な曖昧さに限定）。
- 実装レベルの最適化（キュー設定や DB チューニングなど）。

## Pre-execution Gate / 実行前ゲート

このスキルは以下の条件がすべて満たされない限り`NO_REVIEW`を返す。

- [ ] 差分に設計ドキュメント（フロー図/シーケンス図/データフロー設計書）の変更がある
- [ ] 差分にデータフロー・状態所有・境界横断の書き込みに関わる記述の追加または変更がある
- [ ] inputContextにdiffが含まれている

ゲート不成立時の出力: `NO_REVIEW: data-flow-state-ownership — データフロー・状態所有に関わる変更が検出されない`

## False-positive guards / 抑制条件

- PoC/運用対象外と明記されている場合は、強度を落として “確認事項” に倒す。

## Rule / ルール

- 先頭に要約を 1 行出す（追加/変更されたデータフローと所有の要点）。
- 指摘は最大 8 件まで。整合性・二重書き込み・競合・障害復旧に直結するものを優先。
- 可能なら “追記テンプレ” を付ける（文書に貼れる形）。

## Checklist / 観点チェックリスト

- 状態所有（Source of Truth）
  - 主要エンティティ/状態の SoT（誰が唯一の真実か）が明示されているか。
  - 同じ状態を複数の境界で更新しない設計になっているか（必要なら理由とガードがあるか）。
- 境界横断の書き込み
  - どの境界からどの境界へ “書く” のか、同期/非同期、順序保証の前提があるか。
  - 二重実行/重複配信への対策（冪等性キー、upsert、dedupe）が設計にあるか。
- 整合性と競合
  - 強整合/最終整合の選択と、ユーザー体験への影響が説明されているか。
  - 競合（同時更新）の扱い（楽観ロック、解決戦略、再試行方針）があるか。
- 監査と追跡
  - 重要イベントの監査ログ、相関ID など、追跡可能性の前提があるか。
- リカバリ
  - 再処理/リプレイ、DLQ、補償処理などの前提があるか（必要な場合）。

## Output / 出力フォーマット

すべて日本語。`<file>:<line>: <message>` 形式で出力する。

- 先頭に要約を 1 行: `(summary):1: <データフロー/所有/整合性の要点>`
- 以降は指摘（最大 8 件）:
  - `<message>` に `[severity=critical|major|minor|info]` を含める。
  - 可能なら “追記テンプレ” を 1 行付ける。

追記テンプレ例:

- `SoT: <エンティティ>=<所有者境界> / 更新元: <境界> / 反映: <同期/非同期> / 冪等性: <キー>`
- `整合性: <強/最終> / 競合: <方針> / 失敗時: <再試行/補償/再処理>`

## 評価指標（Evaluation）

- 合格基準: 差分に紐づく所有/整合性の抜けを優先度付きで指摘し、追記案がある。
- 不合格基準: 根拠のない断定、差分と無関係な一般論、指摘過多。

## 人間に返す条件（Human Handoff）

- 整合性モデルの選択がプロダクト要件に直結する場合は人間（設計/PM）へ返す。
