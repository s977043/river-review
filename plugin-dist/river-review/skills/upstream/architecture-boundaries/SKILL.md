---
id: 'architecture-boundaries'
name: 'Architecture Boundaries & Dependencies'
description: 'Ensure architecture/design docs define clear boundaries, ownership, dependency direction, and change impact to avoid tight coupling.'
version: 0.1.0
category: upstream
phase: upstream
applyTo:
  - 'docs/architecture/**/*'
  - 'docs/adr/**/*'
  - 'docs/**/*architecture*.md'
  - 'docs/**/*design*.md'
  - 'pages/**/*architecture*.md'
  - '**/*.adr'
  - '**/*c4*.{md,png,svg}'
  - '**/*diagram*.{md,png,svg}'
tags: [architecture, boundaries, dependencies, upstream]
severity: major
inputContext: [diff]
outputKind: [summary, findings, actions, questions]
modelHint: balanced
dependencies: [repo_metadata]
---

## Pattern declaration

Primary pattern: Reviewer
Secondary patterns: Inversion
Why: 設計ドキュメントの責務境界・依存方向・変更影響の記載品質を検証し、密結合を防ぐ。

## Goal / 目的

- 設計/アーキドキュメントの差分から、責務境界の曖昧さ・依存方向の崩れ・変更影響の見落としを減らす。

## Non-goals / 扱わないこと

- アーキの正解を断定しない（境界/責務/依存関係の “記述の質” に限定）。
- 実装レベルの設計（クラス設計や関数分割）への立ち入り。

## Pre-execution Gate / 実行前ゲート

このスキルは以下の条件がすべて満たされない限り`NO_REVIEW`を返す。

- [ ] 差分にアーキテクチャ/設計ドキュメント（`docs/architecture/`, `docs/adr/`, `*architecture*.md`, `*design*.md`, `*.adr`, `*c4*`, `*diagram*`）が含まれている
- [ ] 差分にコンポーネントの境界・責務・依存関係に関する記述の追加・変更が含まれている
- [ ] inputContextに`diff`が含まれている

ゲート不成立時の出力: `NO_REVIEW: architecture-boundaries — 境界/依存に関する設計ドキュメントの変更なし`

## False-positive guards / 抑制条件

- 既に参照先（ADR/図/既存ルール）で明確な場合は、重複指摘しない。

## Rule / ルール

- 先頭に要約を 1 行出す（追加/変更されたコンポーネントと依存の要点）。
- 指摘は最大 8 件まで。境界の曖昧さ、依存方向の逆流、責務の過密、影響範囲の未整理を優先。
- 可能な限り “追記案（貼れる形）” を付ける。

## Checklist / 観点チェックリスト

- 境界と責務
  - コンポーネント/モジュールの責務が 1〜3 行で説明されているか。
  - “どこまでが担当範囲か（Non-goals）” が明記されているか。
  - Owner（チーム/担当）や運用責任が曖昧でないか。
- 依存方向
  - 依存の向きが一貫しているか（例: 上位→下位、Domain→Infrastructure など）。
  - 依存の理由（なぜ必要か）が書かれているか。
  - 双方向依存や循環依存を生む構造になっていないか。
- 変更影響
  - 変更で影響を受ける利用者/サービス/データ/運用が列挙されているか。
  - 互換性（API/イベント/データ）と移行の前提が明記されているか。
- 境界を跨ぐ契約
  - インターフェース（API/イベント/バッチ入出力）の契約がドキュメント化されているか。
  - エラーモデル/リトライ/冪等性など、跨ぎ方のルールがあるか。

## Output / 出力フォーマット

すべて日本語。`<file>:<line>: <message>` 形式で出力する。

- 先頭に要約を 1 行: `(summary):1: <境界/依存/影響の要点>`
- 以降は指摘（最大 8 件）:
  - `<message>` に `[severity=critical|major|minor|info]` を含める。
  - 可能なら “追記案” を 1 行付ける（例: `責務: ... / Non-goals: ... / 依存理由: ...`）。

## 評価指標（Evaluation）

- 合格基準: 差分に紐づく境界/依存/影響の抜けが、優先度付きで指摘され、追記案がある。
- 不合格基準: 差分と無関係な一般論、根拠のない断定、指摘の洪水。

## 人間に返す条件（Human Handoff）

- トレードオフが組織/ロードマップに影響する場合は人間の設計レビューへ返す。
