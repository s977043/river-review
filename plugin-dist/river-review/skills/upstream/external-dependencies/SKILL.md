---
id: 'external-dependencies'
name: 'External Dependencies & Vendor Risks'
description: 'Ensure designs document third-party dependencies, SLAs, quotas, failure modes, and vendor lock-in mitigation.'
version: 0.1.0
category: upstream
phase: upstream
applyTo:
  - 'docs/**/*design*.md'
  - 'docs/**/*architecture*.md'
  - 'docs/**/*dependency*.md'
  - 'docs/**/*integration*.md'
  - 'pages/**/*design*.md'
  - 'pages/**/*architecture*.md'
tags: [architecture, dependencies, vendor, risk, upstream]
severity: major
inputContext: [diff]
outputKind: [summary, findings, actions, questions]
modelHint: balanced
dependencies: [repo_metadata]
---

## Pattern declaration

Primary pattern: Reviewer
Secondary patterns: Inversion
Why: 外部依存の設計差分からSLA・クォータ・障害時の扱い・ロックイン対策の抜けをレビューし、障害シナリオを逆照射する。

## Goal / 目的

- 外部依存（SaaS/API/決済/認証/地図など）の差分から、SLA/クォータ/障害時の扱い/ロックイン対策の抜けを潰す。

## Non-goals / 扱わないこと

- ベンダー選定の是非の断定（要求と前提の明確化に限定）。
- 監視基盤や運用ツールの細部設計。

## Pre-execution Gate / 実行前ゲート

このスキルは以下の条件がすべて満たされない限り`NO_REVIEW`を返す。

- [ ] 差分に設計・アーキテクチャ・依存関係・インテグレーションに関するドキュメントが含まれている
- [ ] 差分に外部サービス・SaaS・API・ベンダーに関する記述がある
- [ ] inputContextにdiffが含まれている

ゲート不成立時の出力: `NO_REVIEW: external-dependencies — 外部依存に関する設計ドキュメントの差分がない`

## False-positive guards / 抑制条件

- 外部依存の仕様が別ドキュメントで管理され、参照が明確な場合は重複指摘しない。

## Rule / ルール

- 先頭に要約を 1 行出す（追加/変更された外部依存と影響の要点）。
- 指摘は最大 8 件まで。クォータ超過、SLA不一致、障害時の未定義、データ移送/コストの見落としを優先。
- 可能なら “追記テンプレ” を付ける。

## Checklist / 観点チェックリスト

- 依存一覧と責任境界
  - 外部依存の一覧（名前/用途/環境/責任範囲）があるか。
  - 代替手段（fallback）や無効化条件があるか（必要な場合）。
- SLA/クォータ/レート制限
  - クォータ、レート制限、タイムアウト、リトライ前提があるか。
  - ピーク時の “増幅”（リトライ×並列）で破綻しない前提があるか。
- 障害時
  - 外部障害時の劣化モード（縮退/後回し/再試行/手動対応）があるか。
  - 監査/請求など、失敗が許容されない処理の扱いが明記されているか。
- ロックイン/移行
  - ベンダーロックイン要因（データ形式、SDK、機能依存）が整理されているか。
  - 移行戦略（データエクスポート、二重書き込み、切替）や “やらない” 根拠があるか。

## Output / 出力フォーマット

すべて日本語。`<file>:<line>: <message>` 形式で出力する。

- 先頭に要約を 1 行: `(summary):1: <外部依存と前提の要点>`
- 以降は指摘（最大 8 件）:
  - `<message>` に `[severity=critical|major|minor|info]` を含める。
  - 可能なら “追記テンプレ” を 1 行付ける。

追記テンプレ例:

- `外部依存: <name> / SLA: <>, quota: <>, timeout: <>, retry: <> / 障害時: <縮退方針>`
- `ロックイン: <要因> / 緩和: <抽象化/エクスポート> / 移行: <方針>`

## 評価指標（Evaluation）

- 合格基準: 差分に紐づく外部依存の前提/リスクが指摘され、追記案がある。
- 不合格基準: ベンダー批判や根拠のない断定、指摘過多。

## 人間に返す条件（Human Handoff）

- 契約/SLA/法務判断が必要な場合は人間（TL/法務/セキュリティ）へ返す。
