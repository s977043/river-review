---
id: 'test-existence'
name: Test Presence for Changed Code
description: Check whether changed code paths have corresponding tests and suggest minimal coverage.
version: 0.1.0
category: downstream
phase: downstream
applyTo:
  - 'src/**/*'
  - 'lib/**/*'
  - '**/*.test.*'
  - '**/*.spec.*'
tags: [tests, coverage, downstream]
severity: major
inputContext: [diff, tests]
outputKind: [tests, findings, actions]
modelHint: balanced
dependencies: [test_runner, coverage_report]
---

## 既定 CI レビューでは発火しない / Not triggered on the default CI review path

このスキルは repo 全体の既存テスト木（変更されていないファイルを含む）を要するため、既定 runner の供給コンテキスト（`RUNNER_SUPPLIED_CONTEXTS = ['diff', 'prDescription', 'fullFile']`、`scripts/validate-skills.mjs`）では発火しない。`RIVER_AVAILABLE_CONTEXTS` を拡張して `tests`（repo-wide test tree）を供給する構成でのみ有効になる（`GRANDFATHERED_UNSUPPLIED_CONTEXT` に登録済み、#1606）。

## Pattern declaration

Primary pattern: Reviewer
Secondary patterns: Inversion
Why: テスト存在チェックはチェックリスト型評価が主だが、実行パスへ影響するコード変更が差分にない場合は実行を止める必要がある。

## Goal / 目的

- 差分で挙動が増えたのにテストが追従していないケースを拾い、最小のテスト観点を提案する。

## Non-goals / 扱わないこと

- テストフレームワークの宗教論争（Jest/Vitest など）。
- 網羅的なテストケース列挙（提案は最大3点までに絞る）。
- テスト差分がすでにある場合の追加要求（原則として黙る）。

## Pre-execution Gate / 実行前ゲート

このスキルは以下の条件がすべて満たされない限り`NO_REVIEW`を返す。

- [ ] 差分にソースコード（`src/**/*`, `lib/**/*`）またはテストファイル（`*.test.*`, `*.spec.*`）の変更が含まれている
- [ ] 実行パスへ影響する変更が差分に含まれている（挙動変更のシグナルが存在する）
- [ ] inputContextにdiffが含まれている

ゲート不成立時の出力: `NO_REVIEW: test-existence — テスト存在チェックの対象となるコード変更が検出されない`

## False-positive guards / 抑制条件

- 差分にテストファイル（`*.test.*` / `*.spec.*`）が含まれている場合。

## Rule / ルール

- 変更されたコード（関数/メソッド/エンドポイント）に対して対応するテストが存在するか確認する。
- クリティカルパス（認証、課金、データ保存など）にテストが無い場合は優先して補う。
- テストファイルが存在しない/未更新なら、最小の正常系・異常系を提案する。

## Heuristics / 判定の手がかり

- 変更ファイルに対する `*.test.*` / `*.spec.*` が無い、または差分がゼロ。
- 変更された公開 API/handler に対応するリクエスト/レスポンス検証が無い。
- 例外パス（throw/reject/return error）が追加されたのに失敗系テストが無い。

## Good / Bad Examples

- Good: 新規ハンドラに対して 200/4xx/5xx を分けたテストを追加。
- Bad: 大きなリファクタに対してテスト差分がゼロ。
- Good: coverage_report を確認し、変更ファイルのブランチカバレッジを補強。

## Actions / 改善案

- 変更された関数/エンドポイントごとに「正常系 + 代表的な異常系（認可/バリデーション/例外）」のテストを追加する。
- 例外/エラー戻りのメッセージやステータスを検証する。
- `coverage_report` を参照し、変更ファイルのステートメント/ブランチカバレッジが上がる具体的なテストケースを提案する。

## Output / 出力

- `Finding:` / `Evidence:` / `Impact:` / `Fix:` / `Severity:` / `Confidence:` を含む短いメッセージにする。
- `Fix` は 1〜3 件のテスト観点に絞る（例: 新分岐、例外、境界）。

## 評価指標（Evaluation）

- 合格基準: 指摘が差分に紐づき、根拠と次アクションが説明されている。
- 不合格基準: 差分と無関係な指摘、根拠のない断定、抑制条件の無視。

## 人間に返す条件（Human Handoff）

- 仕様や意図が不明確で解釈が分かれる場合は質問として返す。
- 影響範囲が広い設計判断やトレードオフは人間レビューへ返す。
