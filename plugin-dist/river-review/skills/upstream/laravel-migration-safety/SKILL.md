---
id: 'laravel-migration-safety'
name: 'Laravel Migration Safety Review'
description: 'Reviews Laravel migrations for destructive operations, change() dropping modifiers, locking index creation on large tables (PostgreSQL), and asymmetric down().'
version: 0.1.0
category: upstream
phase: [upstream, midstream]
applyTo:
  - 'database/migrations/**/*.php'
tags: [laravel, migration, database, postgresql, safety, upstream]
severity: major
inputContext: [diff]
outputKind: [findings, questions]
modelHint: balanced
---

## Pattern declaration

Primary pattern: Reviewer
Secondary patterns: Inversion
Why: migration の破壊的・ロック誘発操作をチェックリスト型で検査する

## Goal / 目的

- `change()` による修飾子の意図しない消失（公式: 保持したい修飾子をすべて再指定しないと消える）を検出する。
- 破壊的操作（dropColumn 等）と、大規模テーブルでのロック誘発 index 追加を検出する。

## Non-goals / 扱わないこと

- データモデル設計の妥当性（`data-model-db-design` のスコープ）。
- アプリ側クエリ効率（`laravel-eloquent-nplus1` のスコープ）。

## Pre-execution Gate / 実行前ゲート

このスキルは以下の条件が**すべて**満たされない限り`NO_REVIEW`を返す。

- [ ] 差分に `database/migrations/` 配下の追加変更が含まれている
- [ ] diff コンテキストが利用可能である

ゲート不成立時の出力: `NO_REVIEW: laravel-migration-safety — migration の変更なし`

## False-positive guards / 抑制条件

- 新規テーブル作成（`Schema::create`）内の index 追加はロック問題がないため指摘しない。
- `down()` の非対称は、データ変換系 migration で完全な逆操作が不可能なケースが正当（コメントで明示があれば許容）。
- `dropColumn` が「別 PR で deprecate 済みカラムの計画的削除」と明示されている場合は指摘しない。

## Rule / ルール

- `change()` 時は保持したい修飾子（`unsigned` / `default` / `comment` / `nullable` 等）をすべて再指定する。
- `dropColumn` / `Schema::drop` 等の破壊的操作は影響とロールバック不能性を確認する（本番 `--force` 実行に注意）。
- PostgreSQL の大規模テーブルへの index 追加は `->online()`（`CREATE INDEX CONCURRENTLY`）を検討する。併せてトランザクション外実行が必要な副作用も指摘する。
- `down()` は `up()` の逆操作として整合させる。

## Evidence / 根拠の取り方

- 指摘は `<file>:<line>` で差分に紐づけ、公式規約（laravel.com/docs/12.x/migrations#modifying-columns 等）を 1 行で添える。
- テーブル規模が diff から不明な場合は `online()` 提案を断定せず `questions` で返す。

## Output / 出力（短文版の推奨）

コメントは日本語で返す。

- Finding: 修飾子消失 / 破壊的操作 / ロック誘発のどれか（1文）
- Impact: データ損失 / 本番ロック / ロールバック不能
- Fix: 修飾子の再指定 / `online()` / `down()` 整合の最小案

## Sources / 出典

- Laravel 12.x — Migrations (modifying columns / dropping / online index): <https://laravel.com/docs/12.x/migrations#modifying-columns>
