---
id: 'test-plan-review'
name: テスト観点レビュー（差分ドリブン）
description: 変更差分から重要なテスト観点と欠落を洗い出し、優先度付きでテストケース案を提示する
version: 0.1.0
category: downstream
phase: downstream
applyTo:
  - 'src/**/*'
  - 'lib/**/*'
  - 'tests/**/*'
  - '**/*.test.*'
  - '**/*.spec.*'
tags:
  - tests
  - coverage
  - downstream
severity: major
inputContext:
  - diff
  - tests
outputKind:
  - tests
  - findings
  - questions
  - actions
modelHint: balanced
dependencies:
  - test_runner
  - code_search
---

## Pattern declaration

Primary pattern: Reviewer
Secondary patterns: Inversion
Why: テスト観点レビューはチェックリスト型評価が主だが、実行パスへ影響するコード変更が差分にない場合は実行を止める必要がある。

## Goal / 目的

- 差分で増えた挙動に対して、抜けやすいテスト観点を洗い出し、最小限のテストケース案を優先度付きで提示する。

## Non-goals / 扱わないこと

- 完成したテストコードを書くこと。フレームワークの宗教論争（Jest/Vitest 等）は避ける。
- 既存テストが差分を十分にカバーしている場合に、無用な追加を要求しない。

## Pre-execution Gate / 実行前ゲート

このスキルは以下の条件がすべて満たされない限り`NO_REVIEW`を返す。

- [ ] 差分にソースコード（`src/**/*`, `lib/**/*`）またはテストファイル（`*.test.*`, `*.spec.*`, `tests/**/*`）の変更が含まれている
- [ ] 実行パスへ影響する変更が差分に含まれている（ドキュメントや設定値のみの変更ではない）
- [ ] inputContextにdiffが含まれている

ゲート不成立時の出力: `NO_REVIEW: test-plan-review — テスト観点レビューの対象となるコード変更が検出されない`

## False-positive guards / 抑制条件

- すでにテスト差分が含まれ十分なカバレッジが見える場合は`NO_ISSUES`。

## Rule / ルール

1. 影響範囲の分解
   - 変更された機能/データ/契約/権限/失敗パスを列挙し、どこが新規/変更/削除かを整理。
2. 観点の抽出
   - 正常系・異常系（バリデーション、認可、タイムアウト、リトライ、境界値、並行実行）・データ永続化・互換性（前方/後方）を観点ごとにまとめる。
3. テストケース案（最大 6 件）
   - 各ケースで「前提/操作/期待」を 1 行ずつ書く。クリティカルパスを優先。
   - 既存テストがあれば補強ポイントだけを示す（例: ブランチカバレッジ不足）。
4. リスクと優先度
   - 見逃すと障害・データ破壊・セキュリティインシデントにつながる箇所は `severity=critical|major` を明記。
5. 情報不足時の質問
   - 要件・仕様が不明な箇所は仮説として記し、確認質問を添える。

## Output / 出力

- すべて日本語。`<file>:<line>: <message>` 形式。場所不明は `(summary):1:` や `(test-case):1:` を使う。
- Summary 1 行の後にテストケース案を列挙: `TestCase: <前提> | <操作> | <期待> [severity=critical|major|minor]`
- 質問は `[q] <内容>` として短く書く。最大 10 行。

## 評価指標（Evaluation）

- 合格: 差分に紐づくテスト観点が整理され、優先度付きの最小ケース案と確認質問がある。
- 不合格: 差分と無関係な一般論、既存テストを無視した過剰要求、根拠のない断定。

## 人間に返す条件（Human Handoff）

- 仕様が未確定でテスト期待値を断定できない場合。
- 互換性ポリシーやリリース方針が不明で、テスト範囲の判断が分かれる場合。
