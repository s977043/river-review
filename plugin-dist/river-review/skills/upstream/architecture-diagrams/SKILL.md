---
id: 'architecture-diagrams'
name: 'Architecture Diagrams Readiness'
description: 'Ensure architecture diagrams are readable, consistent with text, and clear on scope, boundaries, and data flow.'
version: 0.1.0
category: upstream
phase: upstream
applyTo:
  - 'docs/architecture/**/*'
  - 'docs/adr/**/*'
  - 'docs/**/*diagram*.md'
  - 'docs/**/*c4*.md'
  - 'docs/**/*sequence*.md'
  - 'docs/**/*flow*.md'
  - 'pages/**/*diagram*.md'
  - 'pages/**/*c4*.md'
  - 'pages/**/*sequence*.md'
  - 'pages/**/*flow*.md'
  - '**/*diagram*.{md,png,svg}'
  - '**/*c4*.{md,png,svg}'
  - '**/*sequence*.{md,png,svg}'
  - '**/*flow*.{md,png,svg}'
tags: [architecture, diagrams, c4, sequence, upstream]
severity: major
inputContext: [diff, adr]
outputKind: [summary, findings, actions, questions]
modelHint: balanced
dependencies: [repo_metadata]
---

## Pattern declaration

Primary pattern: Reviewer
Secondary patterns: Inversion
Why: アーキテクチャ図の差分から読み手の誤解を招く要因（スコープ不明・矛盾・ラベル不足）を検出する。

## Goal / 目的

- 図（C4/シーケンス/データフロー等）の差分から、読み手が迷う要因（スコープ不明、境界不明、矛盾、ラベル不足）を減らし、実装・運用に落ちる状態にする。

## Non-goals / 扱わないこと

- 図の美的センスやツール選定の議論。
- 実装詳細（クラス設計、コード構造）のレビュー。

## Pre-execution Gate / 実行前ゲート

このスキルは以下の条件がすべて満たされない限り`NO_REVIEW`を返す。

- [ ] 差分に図関連ファイル（`*diagram*`, `*c4*`, `*sequence*`, `*flow*`, `*.png`, `*.svg`）またはアーキテクチャドキュメントが含まれている
- [ ] 差分に図の構成要素（コンポーネント・矢印・境界・ラベル・フロー）の追加・変更が含まれている
- [ ] inputContextに`diff`が含まれている

ゲート不成立時の出力: `NO_REVIEW: architecture-diagrams — 図関連ファイルの変更なし`

## False-positive guards / 抑制条件

- 図が “参考図” と明記され、本文が契約の真実の源泉になっている場合は、図への要求強度を下げる。

## Rule / ルール

- 先頭に要約を 1 行出す（追加/変更された図と伝えたい決定事項の要点）。
- 指摘は最大 8 件まで。誤解につながる点（矛盾、スコープ不明、境界不明、責任不明）を優先。
- 可能なら “追記案” を付ける（図のキャプション/凡例/本文追記など）。

## Checklist / 観点チェックリスト

- スコープと前提
  - 図の対象範囲（どのサービス/境界まで含むか）が明確か。
  - 前提（運用対象/PoC、同期/非同期、テナント/リージョン等）が明示されているか。
- 境界と責務
  - 境界（サービス/モジュール/チーム）と責務のラベルがあるか。
  - 外部システム/第三者依存が明示されているか。
- データフロー/制御フロー
  - 矢印の向きと意味（request/response、publish/subscribe、read/write）が曖昧でないか。
  - 重要データ（PII 等）を扱う場合、データの流れと保存先が読み取れるか。
- 失敗時の扱い（最低限）
  - タイムアウト/リトライ/冪等性など、境界を跨ぐ前提が必要な箇所が読み取れるか。
- 本文/ADR との整合
  - 本文の説明や ADR の決定事項と矛盾していないか（命名、責務、依存、契約）。

## Output / 出力フォーマット

すべて日本語。`<file>:<line>: <message>` 形式で出力する。

- 先頭に要約を 1 行: `(summary):1: <図の要点と未決>`
- 以降は指摘（最大 8 件）:
  - `<message>` に `[severity=critical|major|minor|info]` を含める。
  - 可能なら “追記案” を 1 行付ける（例: `図キャプションにスコープと凡例を追加`）。

## 評価指標（Evaluation）

- 合格基準: 差分に紐づく図の曖昧さ/矛盾を優先度付きで指摘し、追記案がある。
- 不合格基準: 図の内容と無関係な一般論、根拠のない断定、指摘過多。

## 人間に返す条件（Human Handoff）

- 図が示す設計判断そのものが未合意（複数案が併存）な場合は人間の設計レビューへ返す。
