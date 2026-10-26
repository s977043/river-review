---
id: 'openapi-contract'
name: 'OpenAPI Contract Completeness'
description: 'Ensure OpenAPI specs define consistent request/response schemas, error model, auth, pagination, and backward compatibility.'
version: 0.1.0
category: upstream
phase: upstream
applyTo:
  - '**/openapi/**/*.{yml,yaml,json}'
  - '**/*openapi*.{yml,yaml,json}'
  - '**/*swagger*.{yml,yaml,json}'
  - '**/*api*.{yml,yaml,json}'
  - 'docs/**/*api*.md'
tags: [api, openapi, contract, upstream]
severity: major
inputContext: [diff, fullFile]
outputKind: [summary, findings, actions, questions]
modelHint: balanced
dependencies: [repo_metadata]
---

## Pattern declaration

Primary pattern: Reviewer
Secondary patterns: Inversion
Why: OpenAPI仕様の差分から契約不備・互換性事故・型の曖昧さをレビューし、クライアント側の破綻シナリオを逆照射する。

## Goal / 目的

- OpenAPI（または同等の API 仕様）の差分から、契約不備による実装ブレ/互換性事故/運用不全を減らす。

## Non-goals / 扱わないこと

- API の “正解設計” を断定しない（契約の一貫性・明確さ・互換性・運用可能性に限定）。
- 実装コードの最適化やライブラリ選定。

## Pre-execution Gate / 実行前ゲート

このスキルは以下の条件がすべて満たされない限り`NO_REVIEW`を返す。

- [ ] 差分にOpenAPI/Swagger仕様ファイルまたはAPI設計ドキュメントが含まれている
- [ ] inputContextにdiffが含まれている

ゲート不成立時の出力: `NO_REVIEW: openapi-contract — OpenAPI/API仕様に関する差分がない`

## False-positive guards / 抑制条件

- 仕様の不足が差分外で既に合意済み（別ドキュメント参照）で、参照が明確な場合は重複指摘しない。

## Rule / ルール

- 先頭に要約を 1 行出す（追加/変更された endpoint と互換性の要点）。
- 指摘は最大 8 件まで。互換性破壊/曖昧な型/エラーモデル不統一/認可抜けを優先。
- 可能な限り “追記案（仕様に貼れる形）” を付ける。

## Checklist / 観点チェックリスト

- 型とバリデーション
  - `required`/`nullable`/`oneOf`/`anyOf`/`format` が曖昧でないか。
  - request/response の例（example）が現実的で、破綻していないか。
- エラー契約
  - 4xx/5xx の使い分け、エラー構造（code/message/detail/requestId 等）が一貫しているか。
  - 再試行可能性（retryable）や rate limit の扱いが読み取れるか。
- 認証/認可
  - `securitySchemes` と各 operation の `security` が整合しているか。
  - 権限境界（誰が何をできるか）が仕様に落ちているか（役割/スコープ）。
- 互換性
  - 破壊的変更（削除/rename/型変更）がある場合、バージョニングや移行方針があるか。
  - pagination / sorting / filtering の契約が曖昧でないか。
- 運用性
  - `requestId`/相関ID 等、障害調査に必要な情報が契約に反映されているか。

## Output / 出力フォーマット

すべて日本語。`<file>:<line>: <message>` 形式で出力する。

- 先頭に要約を 1 行: `(summary):1: <追加/変更endpointと互換性の要点>`
- 以降は指摘（最大 8 件）:
  - `<message>` に `[severity=critical|major|minor|info]` を含める。
  - “追記案” を 1 行付ける（例: `エラーレスポンスは { code, message, requestId } を共通化`）。

## 評価指標（Evaluation）

- 合格基準: 差分に紐づく契約不備が優先度付きで指摘され、仕様に貼れる追記案がある。
- 不合格基準: 仕様と無関係な一般論、根拠のない断定、指摘の洪水。

## 人間に返す条件（Human Handoff）

- 互換性破壊の判断やバージョニング方針が未合意の場合は人間レビューへ返す。
