---
id: 'test-naming'
name: Test Naming and Structure
description: Ensure tests use clear naming and cover edge cases with proper describe/it structure.
version: 0.1.0
category: downstream
phase: downstream
applyTo:
  - '**/*.test.ts'
  - '**/*.spec.ts'
tags: [tests, naming, downstream]
severity: minor
inputContext: [tests, diff]
outputKind: [tests, findings, summary]
modelHint: balanced
---

## Pattern declaration

Primary pattern: Reviewer
Secondary patterns: Inversion
Why: テスト命名・構造チェックはチェックリスト型評価が主だが、テストファイルが差分に含まれない場合は実行を止める必要がある。

## Rule / ルール

- describe/it/test の命名を一貫させ、期待される振る舞いを明示する
- 正常系だけでなく境界・異常系もテストする
- テストデータの重複を避け、セットアップは共通化する

## Heuristics

- `it('works')` のような曖昧な名前
- 異常系テストや境界値が欠落
- 重複したモックデータやセットアップコード

## Good / Bad Examples

- Good: `it('returns 422 when payload is invalid')`
- Bad: `it('should work')`
- Good: 境界値・例外ケースを含む複数の it ブロック

## Actions / 改善案

- 期待されるステータスや値を含む名前に変更する
- エラーケース・境界値のテストを追加する
- beforeEach/ヘルパーでセットアップを共通化する

## Non-goals / 扱わないこと

- テストフレームワークの選定や移行。
- テストケース自体の追加・削除の大規模再設計。
- 実装コードの命名改善。

## Pre-execution Gate / 実行前ゲート

このスキルは以下の条件がすべて満たされない限り`NO_REVIEW`を返す。

- [ ] 差分にテストファイル（`*.test.*`, `*.spec.*`）の変更が含まれている
- [ ] 差分にテストの命名・構造に影響する変更がある（コメントやフォーマットのみの変更ではない）
- [ ] inputContextにdiffが含まれている

ゲート不成立時の出力: `NO_REVIEW: test-naming — テスト命名・構造チェックの対象となるテスト変更が検出されない`

## False-positive guards / 抑制条件

- 既存の命名規約に沿った変更であり、差分で逸脱がない。
- テストが自動生成され、命名規約が別途管理されている。

## 評価指標（Evaluation）

- 合格基準: 指摘が差分に紐づき、根拠と次アクションが説明されている。
- 不合格基準: 差分と無関係な指摘、根拠のない断定、抑制条件の無視。

## 人間に返す条件（Human Handoff）

- 仕様や意図が不明確で解釈が分かれる場合は質問として返す。
- 影響範囲が広い設計判断やトレードオフは人間レビューへ返す。
