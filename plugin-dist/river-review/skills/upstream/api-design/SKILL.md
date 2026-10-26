---
id: 'api-design'
name: API Design Consistency
description: Ensure API design follows RESTful naming and consistent conventions.
version: 0.1.0
category: upstream
phase: upstream
applyTo:
  - '**/api/**'
  - '**/routes/**'
tags: [api, design, upstream]
severity: major
inputContext: [diff]
outputKind: [findings, summary, actions]
modelHint: balanced
dependencies: [repo_metadata]
---

## Pattern declaration

Primary pattern: Reviewer
Secondary patterns: Inversion
Why: APIエンドポイントの命名・エラー応答・認可の一貫性をRESTful基準で検証する。

## Rule / ルール

- エンドポイントはリソース指向の RESTful 命名に従う（動詞を避ける）
- ステータスコードとエラーレスポンスを一貫させる
- バージョニングや認可要件を明示する

## Heuristics

- `/getUser`, `/doAction` のような動詞ベースのパス
- 4xx/5xx のステータスやエラー構造がエンドポイントごとに不揃い
- 認可・バージョンの記載が ADR/設計と乖離

## Good / Bad Examples

- Good: `/users/{id}`, `/projects/{id}/members`
- Bad: `/fetchUser`, `/doLoginNow`
- Good: エラーボディに code/message/detail を含めて統一

## Actions / 改善案

- パスをリソース指向にリネームし、コレクション/単体の区別を明確にする
- エラー応答を共通スキーマに合わせる
- ADR/設計で定義した認可・バージョン要件をエンドポイント仕様に反映する

## Non-goals / 扱わないこと

- API ゲートウェイやルーティング基盤の再設計。
- 既存クライアントの破壊的変更に関する移行計画。
- 実装レベルのパフォーマンス最適化。

## Pre-execution Gate / 実行前ゲート

このスキルは以下の条件がすべて満たされない限り`NO_REVIEW`を返す。

- [ ] 差分にAPI定義またはルーティング関連ファイル（`**/api/**`, `**/routes/**`）が含まれている
- [ ] 差分にエンドポイントの追加・変更・削除が含まれている
- [ ] inputContextに`diff`が含まれている

ゲート不成立時の出力: `NO_REVIEW: api-design — API定義/ルーティングの変更なし`

## False-positive guards / 抑制条件

- 既存の API ガイドラインに完全準拠している差分。
- 自動生成された API 定義の更新のみで、設計意図に変化がない。

## 評価指標（Evaluation）

- 合格基準: 指摘が差分に紐づき、根拠と次アクションが説明されている。
- 不合格基準: 差分と無関係な指摘、根拠のない断定、抑制条件の無視。

## 人間に返す条件（Human Handoff）

- 仕様や意図が不明確で解釈が分かれる場合は質問として返す。
- 影響範囲が広い設計判断やトレードオフは人間レビューへ返す。
