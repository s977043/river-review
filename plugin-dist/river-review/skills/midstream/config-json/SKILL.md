---
id: 'config-json'
name: Configuration File Review
description: Review JSON/YAML configuration files for common issues and best practices.
version: 0.1.0
category: midstream
phase: midstream
applyTo:
  - '**/*.json'
  - '**/*.yml'
  - '**/*.yaml'
tags:
  - config
  - json
  - yaml
  - midstream
severity: minor
inputContext:
  - diff
outputKind:
  - findings
modelHint: cheap
---

## Pattern declaration

Primary pattern: Reviewer
Secondary patterns: Inversion
Why: 設定ファイルの構文・セキュリティ・妥当性をチェックリスト型で評価するが、JSON/YAML以外の変更では実行不要

## Goal

設定ファイル（JSON/YAML）の変更をレビューし、一般的な問題やベストプラクティス違反を検出する。

## Guidance

- スキーマ違反や構文エラーの可能性を指摘する
- 機密情報（API キー、パスワード、トークン）の直書きを検出する
- 廃止された設定項目や非推奨オプションの使用を指摘する
- 設定値の妥当性（範囲外の数値、無効な組み合わせ）を確認する
- 環境固有の設定が誤ってコミットされていないか確認する

## Non-goals

- `package-lock.json` や自動生成ファイルはレビュー対象外（ノイズ削減のため）
- `node_modules/` 内のファイルは対象外
- テスト用フィクスチャファイルの内容は厳密にチェックしない

## Pre-execution Gate / 実行前ゲート

このスキルは以下の条件がすべて満たされない限り`NO_REVIEW`を返す。

- [ ] 差分にJSON/YAMLファイル（`.json`, `.yml`, `.yaml`）の変更が含まれている
- [ ] 対象ファイルが`package-lock.json`や自動生成ファイルではない
- [ ] inputContextにdiffが含まれている

ゲート不成立時の出力: `NO_REVIEW: config-json — レビュー対象の設定ファイル変更が検出されない`

## False-positive guards

- `.example` や `.sample` 接尾辞のファイルはダミー値を許容する
- テストディレクトリ内のファイルは緩和する
- 明示的にコメントで意図が説明されている場合は抑制する

## Rule / ルール

- 機密情報（APIキー、パスワード、トークン）の直書きは blocker として報告する
- JSON/YAML の構文エラーや不正なスキーマは major として報告する
- 非推奨オプションや廃止された設定項目は minor として報告する
- 環境固有の設定（localhost、開発用URL等）の混入は warning として報告する

## Output

標準フォーマット: `<file>:<line>: Finding: ... Evidence: ... Impact: ... Fix: ... Severity: ... Confidence: ...`
