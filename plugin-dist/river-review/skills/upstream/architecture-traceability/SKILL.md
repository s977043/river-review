---
id: 'architecture-traceability'
name: 'Architecture Traceability & Consistency'
description: 'Ensure design changes stay consistent across ADRs, diagrams, and specs; decisions are traceable; and drift is explicitly managed.'
version: 0.1.0
category: upstream
phase: upstream
applyTo:
  - 'docs/architecture/**/*'
  - 'docs/adr/**/*'
  - 'docs/**/*design*.md'
  - 'docs/**/*architecture*.md'
  - 'pages/**/*design*.md'
  - 'pages/**/*architecture*.md'
  - '**/*.adr'
  - '**/*c4*.{md,png,svg}'
  - '**/*diagram*.{md,png,svg}'
tags: [architecture, adr, traceability, upstream]
severity: major
inputContext: [diff]
outputKind: [summary, findings, actions, questions]
modelHint: balanced
dependencies: [adr_lookup, repo_metadata]
---

## Pattern declaration

Primary pattern: Reviewer
Secondary patterns: Inversion
Why: ADR・図・仕様間の食い違いを検出し、設計ドリフトの早期発見とトレーサビリティ確保を行う。

## Goal / 目的

- 設計変更の差分から、ADR・図・仕様の “食い違い” を早期に発見し、設計ドリフトを抑える。

## Non-goals / 扱わないこと

- 設計の正解を断定しない（整合性とトレーサビリティの不足を指摘する）。
- 実装の詳細レビュー（コード品質やテスト実装の指摘）。

## Pre-execution Gate / 実行前ゲート

このスキルは以下の条件がすべて満たされない限り`NO_REVIEW`を返す。

- [ ] 差分にアーキテクチャ/設計関連ファイル（`docs/architecture/`, `docs/adr/`, `*design*.md`, `*architecture*.md`, `*.adr`, `*c4*`, `*diagram*`）が含まれている
- [ ] 差分に意思決定・構成要素・契約に関する記述の追加・変更が含まれている
- [ ] inputContextに`diff`が含まれている

ゲート不成立時の出力: `NO_REVIEW: architecture-traceability — 設計トレーサビリティに関連するドキュメントの変更なし`

## False-positive guards / 抑制条件

- 明確に “既存 ADR への参照追加のみ” で、整合性が保たれている場合は重複指摘しない。

## Rule / ルール

- 先頭に要約を 1 行出す（変更された決定/構成要素/契約の要点）。
- 指摘は最大 8 件まで。矛盾・参照切れ・未更新の決定事項を優先。
- 可能なら “追記案（貼れる形）” を付ける。

## Checklist / 観点チェックリスト

- ADR との整合
  - 設計変更が ADR の決定事項と矛盾していないか（または “ADR を更新する” と明記されているか）。
  - 代替案/却下理由/トレードオフが変わったのに ADR が更新されていない箇所がないか。
- 図（C4/シーケンス等）との整合
  - 図に現れるコンポーネント/依存/データフローが本文と一致しているか。
  - 重要な変更（境界/依存/責務）に対して図の更新が漏れていないか。
- 仕様との整合
  - API/イベント/データ契約の変更が、仕様書や参照リンクに反映されているか。
  - 用語・命名（コンポーネント名/責務名）が文書間で揺れていないか。
- ドリフトの扱い
  - 未更新や未決事項がある場合、リスクとして明示され、フォローアップ（TODO/期限/担当）があるか。

## Output / 出力フォーマット

すべて日本語。`<file>:<line>: <message>` 形式で出力する。

- 先頭に要約を 1 行: `(summary):1: <整合性/トレーサビリティの要点>`
- 以降は指摘（最大 8 件）:
  - `<message>` に `[severity=critical|major|minor|info]` を含める。
  - 可能なら “追記案” を 1 行付ける（例: `この変更に対応する ADR=... を更新/追加`）。

## 評価指標（Evaluation）

- 合格基準: 差分に紐づく矛盾/参照切れ/未更新を優先度付きで指摘し、追記案がある。
- 不合格基準: 差分と無関係な一般論、根拠のない断定、指摘過多。

## 人間に返す条件（Human Handoff）

- 決定の変更（トレードオフ再評価）が必要な場合は人間の設計レビューへ返す。
