---
id: 'migration-safety'
name: 'Migration Safety Review (framework-agnostic)'
description: 'スキーマ/データ移行の安全性を framework 非依存で審査する。破壊的スキーマ変更・ロック誘発・backfill・ロールバック可逆性・expand-contract の段階適用を、prisma / typeorm / Rails / Django / Alembic / 生 SQL などに横断適用する。'
version: 0.1.0
category: upstream
phase: [upstream, midstream]
applyTo:
  - '**/migrations/**/*'
  - '**/migrate/**/*'
  - 'prisma/schema.prisma'
  - 'db/**/*.sql'
tags: [migration, database, schema, safety, rollback, upstream]
severity: major
inputContext: [diff]
outputKind: [findings, questions]
modelHint: balanced
dependencies: [code_search]
---

## Pattern declaration

Primary pattern: Reviewer
Secondary patterns: Inversion
Why: 移行の破壊的・ロック誘発・不可逆操作をチェックリスト型で検査するが、移行を含まない差分では実行を止めるゲートが必要。

## Goal / 目的

- ORM やフレームワークに依存せず、スキーマ/データ移行に共通する**運用事故**（データ損失・本番ロック・ロールバック不能・反復不能）を検出する。
- 特定フレームワーク固有の深い規約（例: Laravel `change()` の修飾子消失）は専用 skill に委ね、本 skill は**横断的な安全性**に集中する。

## Non-goals / 扱わないこと

- データモデル設計の妥当性（正規化・関連設計）は `data-model-db-design` のスコープ。
- フレームワーク固有の細則（Laravel 固有は `laravel-migration-safety`）。
- アプリ側のクエリ効率（N+1 等）。

## Pre-execution Gate / 実行前ゲート

このスキルは以下の条件がすべて満たされない限り `NO_REVIEW` を返す。

- [ ] 差分にスキーマ/データ移行（migrations ディレクトリ・`schema.prisma`・`*.sql`・`ALTER`/`CREATE`/`DROP` を含む変更）が含まれている
- [ ] diff コンテキストが利用可能である

ゲート不成立時の出力: `NO_REVIEW: migration-safety — 移行の変更なし`

## False-positive guards / 抑制条件

- 新規テーブル作成内の index/制約追加は既存行へのロックが無いため指摘しない。
- 不可逆な down/rollback は、データ変換系移行で完全な逆操作が原理的に不可能なケースが正当（コメントで明示があれば許容）。
- 破壊的操作が「別 PR で deprecate 済み／expand-contract の contract フェーズ」と明示されている場合は指摘しない。
- 小規模テーブルが diff／文脈から確実な場合はロック懸念を断定しない（`questions` で確認）。

## Rule / ルール

横断的に以下を確認する（該当するもののみ）:

1. **破壊的スキーマ変更**: カラム/テーブル/制約の DROP、型の縮小変換（例: `text`→`varchar(n)`）、リネームは、データ損失と後方互換を確認する。
2. **ロック誘発**: 大規模テーブルへの index 追加・`ALTER TABLE`・`NOT NULL` 追加は本番でロック/長時間化し得る。PostgreSQL なら `CREATE INDEX CONCURRENTLY`、MySQL なら online DDL / pt-osc 等の非ロック手段を検討する。
3. **NOT NULL + default 無し**: 既存行があるテーブルへ default 無しの NOT NULL カラム追加は失敗/全行書込みになる。default 付与または backfill 後に制約化（expand-contract）を推奨。
4. **backfill 安全性**: 大量 UPDATE/INSERT はバッチ分割・タイムアウト・レプリケーション遅延を考慮する。1 トランザクションでの巨大更新を避ける。
5. **ロールバック可逆性**: down/rollback が up の逆操作として整合し、データを失わず戻せるか。不可逆なら明示する。
6. **段階適用（expand-contract）**: 破壊的変更はコードのデプロイと移行の順序（expand→migrate→contract）で無停止化できないか。

## Evidence / 根拠の取り方

- 指摘は `<file>:<line>` で差分に紐づけ、検出した操作（DROP / ALTER / NOT NULL / 大量 backfill 等）を引用する。
- テーブル規模が diff から不明な場合は断定せず `questions` で確認する。
- フレームワーク固有 API には触れず、移行操作の意味（ロック/損失/不可逆）で説明する。

## Output / 出力（短文版の推奨）

コメントは日本語で返す。

```text
(migration-safety):1: [要約] 最も危険な移行操作は〈1文〉

<file>:<line>: [移行リスク] <タイトル>
  操作: <DROP / ALTER / NOT NULL 追加 / 大量 backfill / 不可逆 down>
  影響: <データ損失 / 本番ロック / ロールバック不能 / 反復不能>
  Fix: <CONCURRENTLY / default 付与 + backfill / expand-contract / down 整合 の最小案>
```

## 評価指標（Evaluation）

- 合格基準: 検出操作が差分に紐づき、影響（損失/ロック/不可逆）と最小の安全策が示されている。
- 不合格基準: 移行と無関係な一般論、規模不明なのにロックを断定、フレームワーク固有細則への越境。

## 人間に返す条件（Human Handoff）

- 本番データ規模・停止可否・移行ウィンドウの判断が必要な場合。
- 破壊的変更の影響が他サービス／外部利用者に及ぶ場合。
