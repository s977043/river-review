---
id: 'api-compatibility'
name: API Compatibility and Test Gap Review
description: Detect breaking API contract changes, DTO modifications without compatibility handling, and missing tests for changed API boundaries.
version: 0.1.0
category: midstream
phase: midstream
applyTo:
  - 'src/**/*.{ts,tsx,js}'
  - 'app/**/*.{ts,tsx,js}'
  - 'lib/**/*.{ts,tsx,js}'
  - 'packages/**/*.{ts,tsx,js}'
  - 'pages/api/**/*.{ts,js}'
tags: [api, compatibility, dto, breaking-change, test-coverage, midstream]
severity: major
inputContext: [diff, fullFile]
outputKind: [findings, actions]
modelHint: high-accuracy
dependencies: [code_search]
---

## Pattern declaration

Primary pattern: Reviewer
Secondary patterns: Inversion
Why: API契約変更は下流の呼び出し元を静かに壊す。差分内のDTO・インターフェース・エンドポイント定義の変更が既存呼び出し元との互換性を壊していないか、かつテストが更新されているかを検証する。

## Rule / ルール

- APIエンドポイントのリクエスト/レスポンス型（DTO）を変更する場合、既存の呼び出し元との後方互換性を保持するか、バージョニング戦略を適用する。
- DTOへのフィールド削除・型変更・必須化は破壊的変更とみなし、影響範囲のコード修正またはマイグレーションパスを確認する。
- API変更にはテスト（ユニットテスト・インテグレーションテスト・APIテスト）の更新が必須。
- オプショナルフィールド追加は後方互換だが、受信側でのnullabilityハンドリングを確認する。

## Heuristics / 判定の手がかり

- `interface` / `type` の定義でフィールドが削除または型が変更されているが、呼び出し元（サービス・コントローラ等）の修正がない。
- RESTエンドポイントのリクエストボディやクエリパラメータの型が変更されているが、対応するAPIテストが差分に含まれていない。
- レスポンス型（DTO）にフィールドが追加されているが、呼び出し元でのデシリアライズ処理が更新されていない。
- API型定義（OpenAPI schema、Zod schema等）が変更されているが、それを参照するテストが更新されていない。
- `optional` → `required`（`?` の削除）の変更があるが、既存の呼び出し元がフィールドを省略している。

## Good / Bad Examples

- Good: DTOに新フィールドを追加し、受信側コードでのハンドリングとテストを同時に追加している。
- Bad: レスポンスDTOから`userId`フィールドを削除したが、そのフィールドを参照している呼び出し元を修正していない。
- Good: 型変更（`string` → `number`）と同時に呼び出し元の変換処理とテストを更新。
- Bad: `required: true` にしたが既存テストデータがそのフィールドを含んでいない。
- Good: バージョニング（`/v2/endpoint`）で旧バージョンと共存させ段階的移行。

## Actions / 改善案

- DTOの変更箇所に対して、影響を受けるすべての呼び出し元・デシリアライズ処理を`code_search`で特定し更新する。
- API変更に対応するテスト（happy path + error case）を追加・更新する。
- 後方互換を保てない変更の場合、APIバージョニングやフィーチャーフラグによる段階移行を検討する。
- 変更前後のスナップショットテストまたはContract Testを追加する。

## Non-goals / 扱わないこと

- APIの設計思想・RESTful原則への準拠評価（別スキルのスコープ）。
- パフォーマンスや認証・認可の問題（別スキルのスコープ）。
- 外部サードパーティAPIへの変更（コードベース外のコントロール外）。

## Pre-execution Gate / 実行前ゲート

このスキルは以下の条件がすべて満たされない限り`NO_REVIEW`を返す。

- [ ] 差分にTS/JS/TSXファイルが含まれている
- [ ] 差分にAPIエンドポイント定義、DTO/インターフェース/型定義の変更が含まれている
- [ ] inputContextにdiffが含まれている

ゲート不成立時の出力: `NO_REVIEW: api-compatibility — API契約・DTO変更の差分がない`

## False-positive guards / 抑制条件

- 新規追加エンドポイント・DTOには互換性リスクがないため指摘しない。
- テストファイル内のみの型変更（テスト用モック型）は対象外。
- 変更がオプショナルフィールドの追加のみで、かつ受信側でnullabilityがハンドルされている場合。

## 評価指標（Evaluation）

- 合格基準: 指摘が差分の具体的なDTO/型変更に紐づき、互換性リスクまたはテスト不足が説明されている。
- 不合格基準: 新規追加への誤指摘、テストファイル内変更への誤指摘、差分外コードへの指摘。

## 人間に返す条件（Human Handoff）

- 破壊的変更が意図的なメジャーバージョンアップの一環か否かの判断が必要な場合は人間レビューへ返す。
- 影響範囲が差分から特定できないほど広い場合は人間レビューへ返す。
