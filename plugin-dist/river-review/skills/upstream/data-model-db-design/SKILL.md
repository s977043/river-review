---
id: 'data-model-db-design'
name: 'Data Model & DB Design Review'
description: 'Ensure data model/DB designs cover constraints, integrity, indexes, migrations, rollback, and operational impacts.'
version: 0.1.0
category: upstream
phase: [upstream, midstream]
applyTo:
  - '**/*schema*.{sql,prisma}'
  - '**/*migrate*/**/*.sql'
  - '**/*migration*/**/*.sql'
  - '**/*ddl*.sql'
  - '**/*erd*.{md,png,svg}'
  - 'docs/**/*db*.md'
  - 'docs/**/*schema*.md'
tags: [database, schema, migration, upstream]
severity: major
inputContext: [diff, fullFile]
outputKind: [summary, findings, actions, questions]
modelHint: balanced
dependencies: [repo_metadata]
---

## Pattern declaration

Primary pattern: Reviewer
Secondary patterns: Inversion
Why: データモデル・DB設計の制約・移行・運用リスクをチェックリスト型で評価し、整合性崩れや移行事故を防ぐ

## Goal / 目的

- データモデル/DB 設計の差分から、整合性崩れ・移行事故・性能劣化・運用不能につながる抜けを早期に潰す。

## Non-goals / 扱わないこと

- DB 製品や ORM の選定そのもの（ただし前提が必要なら追記を促す）。
- 実装クエリの最適化（設計の制約/インデックス方針の確認に限定）。

## Pre-execution Gate / 実行前ゲート

このスキルは以下の条件がすべて満たされない限り`NO_REVIEW`を返す。

- [ ] 差分にデータモデル/DB設計に関わるファイル（スキーマ定義/マイグレーション/ERD/設計書）の変更がある
- [ ] 差分にテーブル定義・制約・インデックス・マイグレーション手順に関わる記述の追加または変更がある
- [ ] inputContextにdiffが含まれている

ゲート不成立時の出力: `NO_REVIEW: data-model-db-design — データモデル・DB設計に関わる変更が検出されない`

## False-positive guards / 抑制条件

- 既に別 ADR/設計で合意済みの制約を参照しているだけなら、重複指摘しない（参照先が明確な場合）。

## Rule / ルール

- 先頭に要約を 1 行出す（新規/変更テーブル、互換性、移行の要点）。
- 指摘は最大 8 件まで。不可逆変更/データ損失/整合性破壊/ダウンタイムリスクを優先。
- “追記テンプレ（設計に貼れる形）” を付ける。

## Checklist / 観点チェックリスト

- 整合性と制約
  - 主キー/外部キー/ユニーク制約/NOT NULL が要件に合っているか。
  - 参照整合性（ON DELETE/UPDATE）と業務ルールの整合があるか。
  - 多重更新/競合（楽観/悲観ロック）をどう扱うかが設計にあるか。
- 性能とインデックス
  - 代表クエリのアクセスパス（検索条件/ソート）とインデックス方針があるか。
  - 高頻度更新列へのインデックス乱用や肥大化のリスクが考慮されているか。
- 移行とロールバック
  - 既存データの backfill、段階移行（両対応期間）の計画があるか。
  - ロールバック条件/手順、不可逆操作（DROP/データ削除）の扱いがあるか。
- 運用
  - 容量増加、アーカイブ、監査（更新履歴）などの要求があるか。
  - バッチ/バックグラウンド処理の負荷と実行時間帯の前提があるか。

## Output / 出力フォーマット

すべて日本語。`<file>:<line>: <message>` 形式で出力する。

- 先頭に要約を 1 行: `(summary):1: <変更テーブル/互換性/移行の要点>`
- 以降は指摘（最大 8 件）:
  - `<message>` に `[severity=critical|major|minor|info]` を含める。
  - 可能なら “追記テンプレ” を 1 行付ける。

追記テンプレ例:

- `制約: <NOT NULL/UNIQUE/FK> / 理由: <業務ルール> / 例外: <許容する欠損>`
- `移行: 1) 列追加, 2) 並行書き込み, 3) backfill, 4) 切替, 5) 旧列削除`

## 評価指標（Evaluation）

- 合格基準: 差分に紐づく制約/移行/運用の抜けが優先度付きで指摘され、追記案がある。
- 不合格基準: 実装前提の断定、差分と無関係な一般論、指摘過多。

## 人間に返す条件（Human Handoff）

- 不可逆な移行や大規模 backfill が必要な場合は人間（DB/SRE）レビューへ返す。
