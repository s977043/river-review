---
id: 'api-versioning-compat'
name: 'API Versioning & Backward Compatibility'
description: 'Ensure API/contract changes specify versioning strategy, backward compatibility, deprecation plan, and migration guidance.'
version: 0.1.0
category: upstream
phase: upstream
applyTo:
  - 'docs/**/*api*.md'
  - 'docs/**/*openapi*.{yml,yaml,json}'
  - 'docs/**/*contract*.md'
  - 'docs/**/*interface*.md'
  - 'docs/adr/**/*'
  - 'pages/**/*api*.md'
  - 'pages/**/*contract*.md'
  - 'pages/**/*interface*.md'
  - '**/*openapi*.{yml,yaml,json}'
  - '**/*api*.{yml,yaml,json}'
  - '**/*.adr'
tags: [api, compatibility, versioning, upstream]
severity: major
inputContext: [diff, fullFile]
outputKind: [summary, findings, actions, questions]
modelHint: balanced
dependencies: [repo_metadata]
---

## Pattern declaration

Primary pattern: Reviewer
Secondary patterns: Inversion
Why: API/契約変更のバージョニング・後方互換性・移行計画の記載漏れを検出し、破壊的変更の混乱を防ぐ。

## Goal / 目的

- API/インターフェースの変更から、後方互換やバージョニング、非推奨/移行計画の抜けを早期に潰す。

## Non-goals / 扱わないこと

- API の正解設計を断定しない（互換性と移行方針の明確化に限定）。
- 実装コードの最適化やライブラリ選定の議論。

## Pre-execution Gate / 実行前ゲート

このスキルは以下の条件がすべて満たされない限り`NO_REVIEW`を返す。

- [ ] 差分にAPI定義・OpenAPI仕様・契約/インターフェース関連ファイルが含まれている
- [ ] 差分にAPIのフィールド・型・エンドポイント・バージョンの追加・変更・削除が含まれている
- [ ] inputContextに`diff`が含まれている

ゲート不成立時の出力: `NO_REVIEW: api-versioning-compat — API/契約の変更なし`

## False-positive guards / 抑制条件

- 自動生成ファイルのみの差分で契約の実質が変わらない場合は指摘しない（`NO_ISSUES`）。
- 既に別の互換性ガイドラインを参照し、差分が参照更新のみなら重複指摘しない。

## Rule / ルール

- 先頭に要約を 1 行出す（互換性影響/バージョン/移行の要点）。
- 指摘は最大 8 件。破壊的変更の有無、移行/非推奨の明示、エラーモデルの互換性を優先。
- 可能なら “移行ガイドの追記案” を付ける。

## Checklist / 観点チェックリスト

- 互換性とバージョン
  - 破壊的変更（型変更/フィールド削除/挙動変更）の有無と方針（後方互換 or 新バージョン発行）が明記されているか。
  - バージョンスキーム（パス/ヘッダ/メディアタイプ）とクライアント影響が説明されているか。
- 非推奨と移行
  - 非推奨期間、移行締切、旧バージョンのサポート範囲が書かれているか。
  - 移行手順（両対応期間、ロールアウト順、ロールバック条件）があるか。
- 契約の整合
  - OpenAPI/契約に追加されたフィールドが後方互換（nullable/optional）になるよう設計されているか。
  - エラーコード・エラーモデルの互換性が保たれているか。
- リリースと通知
  - リリースノート/通知チャネルと対象ステークホルダーが明記されているか。
  - テスト/サンプル/クライアントSDKの更新が追随する計画があるか。

## Output / 出力フォーマット

すべて日本語。`<file>:<line>: <message>` 形式で出力。

- 先頭に要約行: `(summary):1: <互換性/バージョン/移行の要点>`
- 指摘は最大 8 件:
  - `<message>` に `[severity=critical|major|minor|info]` を含める。
  - 可能なら “移行ガイド追記案” を 1 行付ける。

例:

- `docs/api/change.md:58: [severity=major] バージョン表記が未定。Fix: v1 を維持しつつ v2 をパス/ヘッダで明記し、両対応期間と切替条件を追記。`

## 評価指標（Evaluation）

- 合格: 差分に紐づく互換性/バージョン/移行の不足を優先度付きで指摘し、追記案がある。
- 不合格: 差分と無関係な一般論、根拠のない断定、指摘過多。

## 人間に返す条件（Human Handoff）

- 互換性破壊やサポート期間の決定が組織/顧客契約に跨る場合は人間レビューへ。
