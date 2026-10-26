---
id: 'integration-contracts'
name: 'Service Integration & Contracts'
description: 'Ensure cross-service integration defines contracts, ownership, failure handling, versioning, and rollout/rollback expectations.'
version: 0.1.0
category: upstream
phase: upstream
applyTo:
  - 'docs/**/*integration*.md'
  - 'docs/**/*interface*.md'
  - 'docs/**/*contract*.md'
  - 'docs/**/*event*.md'
  - 'docs/**/*message*.md'
  - 'pages/**/*integration*.md'
  - '**/*openapi*.{yml,yaml,json}'
  - '**/*asyncapi*.{yml,yaml,json}'
  - '**/*schema*.{avsc,json}'
  - '**/*.proto'
tags: [integration, contract, api, events, upstream]
severity: major
inputContext: [diff, fullFile]
outputKind: [summary, findings, actions, questions]
modelHint: balanced
dependencies: [repo_metadata]
---

## Pattern declaration

Primary pattern: Reviewer
Secondary patterns: Inversion
Why: サービス間連携の差分から契約不備・責任境界・障害時の未定義をレビューし、連携の破綻シナリオを逆照射する。

## Goal / 目的

- サービス間連携（API/イベント/メッセージング）の差分から、契約不備・責任境界の曖昧さ・障害時の未定義を早期に潰す。

## Non-goals / 扱わないこと

- 連携方式の正解を断定しない（契約/運用/互換性の明確化に限定）。
- 実装レベルの細部（SDK、リトライ実装、キュー設定の調整など）。

## Pre-execution Gate / 実行前ゲート

このスキルは以下の条件がすべて満たされない限り`NO_REVIEW`を返す。

- [ ] 差分にサービス間連携・契約・インターフェイス・イベント定義に関するドキュメントまたはスキーマが含まれている
- [ ] inputContextにdiffが含まれている

ゲート不成立時の出力: `NO_REVIEW: integration-contracts — サービス間連携/契約に関する差分がない`

## False-positive guards / 抑制条件

- 参照先の契約ドキュメントが明確で、差分が参照更新のみの場合は重複指摘しない。

## Rule / ルール

- 先頭に要約を 1 行出す（producer/consumer、契約変更、互換性の要点）。
- 指摘は最大 8 件まで。互換性破壊、所有者不明、失敗時の振る舞い不明を優先。
- “追記テンプレ” を付けて、文書に落とせる形にする。

## Checklist / 観点チェックリスト

- 契約（Contract）
  - メッセージ/API のスキーマ、必須/任意、互換性ルール（追加は後方互換、削除は破壊的等）が明記されているか。
  - バージョニング、deprecated 期間、移行ガイドがあるか。
- Owner と責任境界
  - Producer/Consumer の Owner、SLA/SLO の前提、問い合わせ窓口があるか。
  - どこまでが producer の責任で、どこから consumer かが書かれているか。
- 失敗時の振る舞い
  - リトライ、冪等性、重複配信、順序、遅延、DLQ/再処理の前提があるか。
  - エラーコード/失敗イベント/補償処理の方針があるか。
- ロールアウト/ロールバック
  - 両対応期間（新旧契約）と、切替条件/ロールバック条件があるか。
  - 段階リリース（feature flag 等）の前提があるか。

## Output / 出力フォーマット

すべて日本語。`<file>:<line>: <message>` 形式で出力する。

- 先頭に要約を 1 行: `(summary):1: <producer/consumerと契約変更の要点>`
- 以降は指摘（最大 8 件）:
  - `<message>` に `[severity=critical|major|minor|info]` を含める。
  - 可能なら “追記テンプレ” を 1 行付ける。

追記テンプレ例:

- `Owner: producer=<team>, consumer=<team> / 互換性: <後方互換/破壊的> / 移行: <両対応期間>`
- `失敗時: retry=<回数/間隔>, idempotency=<キー>, DLQ=<扱い>, 補償=<方針>`

## 評価指標（Evaluation）

- 合格基準: 差分に紐づく契約/責任境界/失敗時の抜けが優先度付きで指摘され、追記案がある。
- 不合格基準: 差分と無関係な一般論、根拠のない断定、指摘過多。

## 人間に返す条件（Human Handoff）

- 互換性破壊の判断、または組織横断の責任分界が未合意の場合は人間レビューへ返す。
