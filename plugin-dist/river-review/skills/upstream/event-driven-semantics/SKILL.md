---
id: 'event-driven-semantics'
name: 'Event-Driven Semantics & Delivery Guarantees'
description: 'Ensure event-driven designs specify delivery guarantees, ordering, idempotency, schema evolution, and replay/backfill strategy.'
version: 0.1.0
category: upstream
phase: upstream
applyTo:
  - 'docs/**/*event*.md'
  - 'docs/**/*message*.md'
  - 'docs/**/*queue*.md'
  - 'docs/**/*stream*.md'
  - 'docs/**/*kafka*.md'
  - 'docs/**/*pubsub*.md'
  - 'pages/**/*event*.md'
  - 'pages/**/*message*.md'
  - '**/*asyncapi*.{yml,yaml,json}'
  - '**/*schema*.{avsc,json}'
  - '**/*.proto'
tags: [architecture, events, messaging, reliability, upstream]
severity: major
inputContext: [diff]
outputKind: [summary, findings, actions, questions]
modelHint: balanced
dependencies: [repo_metadata]
---

## Pattern declaration

Primary pattern: Reviewer
Secondary patterns: Inversion
Why: イベント駆動設計の差分から配信保証・冪等性・スキーマ進化の抜けをレビューし、障害シナリオを逆照射して設計の堅牢性を検証する。

## Goal / 目的

- イベント駆動設計の差分から、配信保証・順序・冪等性・再処理/リプレイの未定義による事故を減らす。

## Non-goals / 扱わないこと

- メッセージ基盤の選定（Kafka/SQS 等）の是非の断定。
- 実装レベルの consumer コードやライブラリ選定。

## Pre-execution Gate / 実行前ゲート

このスキルは以下の条件がすべて満たされない限り`NO_REVIEW`を返す。

- [ ] 差分にイベント駆動・メッセージング・キュー・ストリーム関連のドキュメントまたはスキーマが含まれている
- [ ] inputContextにdiffが含まれている

ゲート不成立時の出力: `NO_REVIEW: event-driven-semantics — イベント駆動設計関連の差分がない`

## False-positive guards / 抑制条件

- 契約が別ドキュメントで管理され、参照が明確な場合は重複指摘しない。

## Rule / ルール

- 先頭に要約を 1 行出す（新規/変更イベントと consumer 影響の要点）。
- 指摘は最大 8 件まで。順序/重複/再処理で壊れる設計を優先。
- 可能なら “追記テンプレ” を付ける（文書に貼れる形）。

## Checklist / 観点チェックリスト

- 配信保証と重複
  - 配信保証（at-least-once/at-most-once/exactly-once の前提）が明記されているか。
  - 重複配信を前提にした冪等性（idempotency key、dedupe）の設計があるか。
- 順序とキー
  - 順序保証の前提（partition key、同一キー内のみ順序等）が明示されているか。
  - 乱順/遅延到着の扱い（reorder window、最終状態の決め方）があるか。
- スキーマ進化
  - 互換性ルール（追加は後方互換、削除は破壊的等）と versioning があるか。
  - deprecated 期間と移行手順（producer/consumer の段階更新）があるか。
- 再処理/リプレイ
  - リプレイ/backfill の方針（いつ、どこから、どれくらい）があるか。
  - DLQ/poison message の扱いと再処理手順があるか。
- 観測性
  - eventId/correlationId、consumer lag、失敗率などの監視前提があるか。

## Output / 出力フォーマット

すべて日本語。`<file>:<line>: <message>` 形式で出力する。

- 先頭に要約を 1 行: `(summary):1: <イベント契約/保証/移行の要点>`
- 以降は指摘（最大 8 件）:
  - `<message>` に `[severity=critical|major|minor|info]` を含める。
  - 可能なら “追記テンプレ” を 1 行付ける。

追記テンプレ例:

- `保証: at-least-once / 冪等性: key=<>, dedupe=<>, 重複時: <扱い>`
- `順序: key=<>, 保証範囲=<同一キー内のみ> / 乱順: <扱い>`
- `互換性: <後方互換/破壊的> / version=<>, 移行: <両対応期間>`

## 評価指標（Evaluation）

- 合格基準: 差分に紐づく保証/冪等性/再処理の抜けが指摘され、追記案がある。
- 不合格基準: 差分と無関係な一般論、根拠のない断定、指摘過多。

## 人間に返す条件（Human Handoff）

- 互換性破壊やリプレイ方針が合意できていない場合は人間レビューへ返す。
