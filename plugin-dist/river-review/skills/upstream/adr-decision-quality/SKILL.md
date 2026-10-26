---
id: 'adr-decision-quality'
name: ADR Decision Quality
description: Ensure ADRs capture context, decision, alternatives, tradeoffs, and follow-ups in a way that prevents future drift.
version: 0.1.0
category: upstream
phase: upstream
applyTo:
  - 'docs/adr/**/*'
  - 'adr/**/*'
  - '**/*.adr'
  - '**/*adr*.md'
tags: [architecture, adr, decision, upstream]
severity: major
inputContext: [diff]
outputKind: [summary, findings, actions, questions]
modelHint: balanced
dependencies: [adr_lookup, repo_metadata]
---

## Pattern declaration

Primary pattern: Reviewer
Secondary patterns: Inversion
Why: ADRの記録品質を多面的チェックリストで検証し、不足を指摘して将来の設計ドリフトを防ぐ。

## Goal / 目的

- ADR（設計意思決定記録）の差分から、将来の設計ドリフト/再議論/運用事故につながる “記録不足” を減らす。

## Non-goals / 扱わないこと

- 技術選定の正解を断定しない（代替案とトレードオフの “記録の質” を見て指摘する）。
- ADR の書式統一や文章校正を主目的にしない（重要論点の不足を優先）。

## Pre-execution Gate / 実行前ゲート

このスキルは以下の条件がすべて満たされない限り`NO_REVIEW`を返す。

- [ ] 差分にADR関連ファイル（`docs/adr/`, `adr/`, `*.adr`, `*adr*.md`）が含まれている
- [ ] 差分がADRの意思決定内容（Context / Decision / Alternatives / Follow-ups）に実質的な変更を含んでいる
- [ ] inputContextにdiffが含まれている

ゲート不成立時の出力: `NO_REVIEW: adr-decision-quality — ADR関連ファイルの実質的変更なし`

## False-positive guards / 抑制条件

- 既に別 ADR で合意済みの内容を単に参照しているだけなら、重複指摘しない（参照先が明確な場合）。

## Rule / ルール

- まず「何を決めた ADR か / 何が未決か」を 1 行で要約する。
- 指摘は最大 8 件まで。将来の混乱コストが大きいもの（互換性・移行・運用・セキュリティ）を優先。
- 不明点は “質問” で出すが、可能なら “追記テンプレ” を添える。

## Checklist / 観点チェックリスト

- Context
  - なぜ今この意思決定が必要か（背景/課題/制約）があるか。
  - 影響範囲（利用者/システム/データ/運用）が明示されているか。
- Decision
  - 決定事項が 1〜3 行で明確か（何を採用し、何をしないか）。
  - 成功条件/受け入れ条件（どの状態なら “成功” か）があるか。
- Alternatives & Tradeoffs
  - 代替案が最低 1 つ、却下理由とトレードオフがあるか。
  - 既存との互換性（API/データ/運用）の扱いがあるか。
- Follow-ups
  - 未決事項/TODO/期限/決める人が書かれているか。
  - 関連ドキュメント/実装/運用手順へのリンクがあるか。

## Output / 出力フォーマット

すべて日本語。`<file>:<line>: <message>` 形式で出力する。

- 先頭に要約を 1 行: `(summary):1: <ADRの決定事項/未決の要点>`
- 以降は指摘（最大 8 件）:
  - `<message>` に `[severity=critical|major|minor|info]` を含める。
  - 可能なら “追記テンプレ” を付ける（短文で貼れる形）。

追記テンプレ例:

- `背景/制約: <何が課題で何が制約か>`
- `代替案: A=<案>, B=<案> / 却下理由=<理由> / トレードオフ=<何を犠牲に何を得るか>`
- `成功条件: <可観測な条件（メトリクス/ログ/運用上の状態）>`

## 評価指標（Evaluation）

- 合格基準: 記録不足による将来の混乱を防ぐ指摘が、差分に紐づき、追記案（テンプレ）付きで出ている。
- 不合格基準: 技術的主張の押し付け、差分と無関係な理想論、指摘過多。

## 人間に返す条件（Human Handoff）

- トレードオフが組織/予算/法務に跨る場合、または意思決定者の明確化が必要な場合は人間レビューへ返す。
