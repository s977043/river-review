---
id: 'coverage-gap'
name: Coverage and Failure Path Gaps
description: Find missing tests for critical paths, edge cases, and failure handling in changed code.
version: 0.1.0
category: downstream
phase: downstream
applyTo:
  - 'src/**/*'
  - 'lib/**/*'
  - '**/*.test.*'
  - '**/*.spec.*'
tags: [tests, coverage, reliability, downstream]
severity: major
inputContext: [diff, tests]
outputKind: [tests, findings, actions, summary]
modelHint: balanced
dependencies: [test_runner, coverage_report]
---

## 既定 CI レビューでは発火しない / Not triggered on the default CI review path

このスキルは repo 全体の既存テスト木（変更されていないファイルを含む）を要するため、既定 runner の供給コンテキスト（`RUNNER_SUPPLIED_CONTEXTS = ['diff', 'prDescription', 'fullFile']`、`scripts/validate-skills.mjs`）では発火しない。`RIVER_AVAILABLE_CONTEXTS` を拡張して `tests`（repo-wide test tree）を供給する構成でのみ有効になる（`GRANDFATHERED_UNSUPPLIED_CONTEXT` に登録済み、#1606）。

## Pattern declaration

Primary pattern: Reviewer
Secondary patterns: Inversion
Why: カバレッジギャップ検出はチェックリスト型評価が主だが、テスト対象コードが差分に含まれない場合は実行を止める必要がある。

## Rule / ルール

- 主要フローと失敗フローの両方にテストがあることを確認する。
- 例外系・タイムアウト・リトライなどのエラーハンドリングをテストする。
- 変更によって追加/変更された分岐・境界値・フォールバックをカバーする。

## Heuristics / 判定の手がかり

- 新しい条件分岐・ガードが追加されたのに対応するテストがない。
- 例外処理やエラーリターンに対するアサーションが見当たらない。
- 大きな refactor でテストの網羅対象が変わっているのに、テスト差分が少ない。
- クリティカルパス（認証/課金/データ保存など）にテストが不足。
- `coverage_report` でステートメント/ブランチ/ラインの低下が確認できるのに差分テストが増えていない。

## Good / Bad Examples

- Good: 成功・失敗・境界を分けた `describe` / `it` を追加し、エラーメッセージも検証。
- Bad: `happy path` のみのテストで、例外時や空入力時の検証がない。
- Good: `coverage_report` を確認し、差分ファイルのステートメント/ブランチカバレッジを改善。

## Actions / 改善案

- 新規/変更分岐ごとに正常系・異常系テストを追加する（例外メッセージも含めて検証）。
- タイムアウト/リトライ/フォールバックをモックし、意図した失敗動作を確認する。
- クリティカルパスのカバレッジを `coverage_report` ベースで確認し、不足を埋めるテストを提案する。
- 差分ファイルの各分岐・ガードに対して「期待される成功/失敗シナリオ + 入力例」を列挙し、テストケースとして提示する。

## Non-goals / 扱わないこと

- 既存テストの全面的な書き換えやリファクタリング。
- 実行環境や外部サービスの障害注入（カオス試験）の設計。
- プロダクション監視の網羅性評価。

## Pre-execution Gate / 実行前ゲート

このスキルは以下の条件がすべて満たされない限り`NO_REVIEW`を返す。

- [ ] 差分にソースコード（`src/**/*`, `lib/**/*`）またはテストファイル（`*.test.*`, `*.spec.*`）の変更が含まれている
- [ ] 実行パスへ影響する変更が差分に含まれている（コメントやドキュメントのみの変更ではない）
- [ ] inputContextにdiffが含まれている

ゲート不成立時の出力: `NO_REVIEW: coverage-gap — カバレッジギャップ検出の対象となるコード変更が検出されない`

## False-positive guards / 抑制条件

- 既存テストが同等の失敗経路を十分にカバーしている。
- テスト対象が外部 API の仕様変更のみで、社内コードに実行分岐が増えていない。

## 評価指標（Evaluation）

- 合格基準: 指摘が差分に紐づき、根拠と次アクションが説明されている。
- 不合格基準: 差分と無関係な指摘、根拠のない断定、抑制条件の無視。

## 人間に返す条件（Human Handoff）

- 仕様や意図が不明確で解釈が分かれる場合は質問として返す。
- 影響範囲が広い設計判断やトレードオフは人間レビューへ返す。
