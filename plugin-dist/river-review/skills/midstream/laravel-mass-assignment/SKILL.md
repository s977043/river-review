---
id: 'laravel-mass-assignment'
name: 'Laravel Mass Assignment and Authorization Review'
description: 'Detects mass assignment via create/update($request->all()), unguarded models, and missing authorization on mutating controller actions in Laravel.'
version: 0.1.0
category: midstream
phase: midstream
applyTo:
  - 'app/**/*.php'
  - 'src/**/*.php'
tags: [laravel, security, mass-assignment, authorization, php, midstream]
severity: major
inputContext: [diff]
outputKind: [findings, questions]
modelHint: balanced
---

## Pattern declaration

Primary pattern: Reviewer
Secondary patterns: Inversion
Why: mass assignment 脆弱性と認可漏れをチェックリスト型で検査する

## Goal / 目的

- `create($request->all())` 等による mass assignment 脆弱性（公式が `is_admin` 注入による権限昇格を例示）を検出する。
- 更新・削除系コントローラアクションの認可チェック漏れを検出する。

## Non-goals / 扱わないこと

- クエリ効率（`laravel-eloquent-nplus1` のスコープ）。
- バリデーションルールの網羅性（要件依存のため一律指摘しない）。
- Gate と Policy の使い分けの強制（公式が混在を許容）。

## Pre-execution Gate / 実行前ゲート

このスキルは以下の条件が**すべて**満たされない限り`NO_REVIEW`を返す。

- [ ] 差分にモデルの create / update / fill、またはコントローラの mutating アクションの追加変更が含まれている
- [ ] diff コンテキストが利用可能である

ゲート不成立時の出力: `NO_REVIEW: laravel-mass-assignment — 対象操作の変更なし`

## False-positive guards / 抑制条件

- `$request->all()` でも直後に手動フィルタ / 明示カラム指定があれば安全。
- CLI / seeder / 内部処理での `forceFill` / `unguard` は、ユーザー入力でなければ脆弱性ではない。
- `authorize(): true` は認可を controller / middleware 側で実施していれば正当。
- `before()` filter（admin 一括許可）がある場合、個別 policy メソッドに admin 分岐がないことを指摘しない。
- Gate を使っていること自体は指摘しない（公式が Gate / Policy 混在を許容）。

## Rule / ルール

- ユーザー入力からのモデル作成・更新は `$request->validated()` / `$request->safe()->only([...])` を使う（`$request->all()` 直渡しを避ける）。
- `$guarded = []`（全 unguarded）でユーザー入力を直接渡していないか確認する。
- 更新・削除系アクションに認可（`Gate::authorize` / `$user->can` / `can` middleware / FormRequest `authorize()` のいずれか）があるか確認する。
- 複雑・再利用される validation は FormRequest 化を推奨する。

## Evidence / 根拠の取り方

- 指摘は `<file>:<line>` で差分に紐づけ、公式規約（laravel.com/docs/12.x/eloquent#mass-assignment / authorization）を 1 行で添える。
- 認可が diff 外の middleware にある可能性がある場合は断定せず `questions` で返す。

## Output / 出力（短文版の推奨）

コメントは日本語で返す。

- Finding: mass assignment / 認可漏れのどちらか（1文）
- Impact: 権限昇格 / 不正データ更新
- Fix: `validated()` / `safe()->only()` / 認可追加の最小案

## Sources / 出典

- Laravel 12.x — Eloquent (Mass Assignment): <https://laravel.com/docs/12.x/eloquent#mass-assignment>
- Laravel 12.x — Validation (Form Request): <https://laravel.com/docs/12.x/validation#form-request-validation>
- Laravel 12.x — Authorization: <https://laravel.com/docs/12.x/authorization>
