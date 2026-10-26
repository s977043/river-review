---
id: 'laravel-eloquent-nplus1'
name: 'Laravel Eloquent N+1 and Query Efficiency Review'
description: 'Detects N+1 query patterns (relation access inside loops without eager loading), full-table get()/all() loads, and unsafe chunk()/cursor() usage in Laravel Eloquent code.'
version: 0.1.0
category: midstream
phase: midstream
applyTo:
  - 'app/**/*.php'
  - 'src/**/*.php'
tags: [laravel, eloquent, performance, n-plus-1, php, midstream]
severity: major
inputContext: [diff]
outputKind: [findings, questions]
modelHint: balanced
---

## Pattern declaration

Primary pattern: Reviewer
Secondary patterns: Inversion
Why: Eloquent のクエリ効率規約への適合をチェックリスト型で検査する

## Goal / 目的

- ループ内 relation アクセスによる N+1 クエリ（公式例: 25 件で 26 クエリ）を検出する。
- 巨大テーブルの全件ロード（`all()` / `get()`）と、`chunk()` / `cursor()` の誤用を検出する。

## Non-goals / 扱わないこと

- mass assignment / 認可（`laravel-mass-assignment` のスコープ）。
- migration の安全性（`laravel-migration-safety` のスコープ）。
- SQL チューニング一般・index 設計。

## Pre-execution Gate / 実行前ゲート

このスキルは以下の条件が**すべて**満たされない限り`NO_REVIEW`を返す。

- [ ] 差分に Eloquent モデルのクエリ・relation アクセスの追加変更が含まれている
- [ ] diff コンテキストが利用可能である

ゲート不成立時の出力: `NO_REVIEW: laravel-eloquent-nplus1 — Eloquent クエリの変更なし`

## False-positive guards / 抑制条件

- ループ前に `with()` / `load()` 済みの relation へのアクセスは指摘しない（diff 外で eager load されている可能性があるため、確証がなければ質問に留める）。
- ループ対象が少数固定（config 由来等）の場合の relation アクセスは指摘しない。
- `chaperone()` を使った親逆参照は正当。
- `preventLazyLoading` が有効なプロジェクトでは N+1 がテストで落ちるため、重複指摘を避ける。

## Rule / ルール

- ループ内で relation を参照する場合は `with('relation')`（取得後なら `load()` / `loadCount()`）で eager load する。
- 巨大テーブルの反復は `chunkById` / `lazyById` / `cursor` を使う。
- `chunk()` でフィルタ対象カラムを更新しない（公式: inconsistent results。`chunkById` を使う）。
- `cursor()` と eager loading を併用しない（cursor は relation を eager load できない。`lazy` を使う）。
- `chunkById` / `lazyById` で `orWhere` を含む条件は closure で論理グループ化する。

## Evidence / 根拠の取り方

- 指摘は `<file>:<line>` で差分に紐づけ、公式規約（laravel.com/docs/12.x/eloquent-relationships#eager-loading 等）を 1 行で添える。
- eager load の有無が diff から確定できない場合は断定せず `questions` で返す。

## Output / 出力（短文版の推奨）

コメントは日本語で返す。

- Finding: N+1 / 全件ロード / chunk 誤用のどれか（1文）
- Impact: クエリ数 / メモリ / 一貫性への影響
- Fix: `with()` / `chunkById` / `lazy` 等の最小修正案

## Sources / 出典

- Laravel 12.x — Eloquent Relationships (Eager Loading): <https://laravel.com/docs/12.x/eloquent-relationships#eager-loading>
- Laravel 12.x — Eloquent (chunk / cursor / strictness): <https://laravel.com/docs/12.x/eloquent>
