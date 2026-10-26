---
id: 'architecture-validation-plan'
name: Architecture Validation Plan Guard
description: Detect missing validation plans (how to verify the design is correct) in design documents and ADRs.
version: 0.1.0
category: upstream
phase: upstream
applyTo:
  - 'docs/**/*design*.md'
  - 'docs/**/*architecture*.md'
  - 'docs/adr/**/*'
  - 'docs/architecture/**/*'
  - 'pages/**/*design*.md'
  - 'pages/**/*architecture*.md'
  - '**/*.adr'
tags:
  - architecture
  - validation
  - verification
  - slo
  - upstream
severity: minor
inputContext:
  - diff
outputKind:
  - findings
  - actions
  - questions
modelHint: balanced
dependencies:
  - adr_lookup
  - repo_metadata
---

## Pattern declaration

Primary pattern: Reviewer
Secondary patterns: Inversion
Why: 設計ドキュメントに検証計画（SLO/テスト/ロールバック/可観測性）が欠けていないかを検出する。

## Guidance

- Ensure design docs include how success is proven: SLO/SLI targets and validation/test plans.
- Check rollout/rollback/canary/DR strategies have criteria, owners, and fallback steps.
- Confirm observability plans (logs/metrics/alerts) cover new risks and failure paths.
- Flag missing validation for new dependencies or contracts introduced in the diff.

## Non-goals

- ツール選定や好みのアプローチを推測で断定しない。

## Pre-execution Gate / 実行前ゲート

このスキルは以下の条件がすべて満たされない限り`NO_REVIEW`を返す。

- [ ] 差分に設計/アーキテクチャドキュメント（`docs/*design*.md`, `docs/*architecture*.md`, `docs/adr/`, `*.adr`）が含まれている
- [ ] 差分に設計上の意思決定・新規コンポーネント・依存関係の追加など検証計画が必要な変更が含まれている
- [ ] inputContextに`diff`が含まれている

ゲート不成立時の出力: `NO_REVIEW: architecture-validation-plan — 検証計画が必要な設計ドキュメントの変更なし`

## False-positive guards

- 差分外で検証計画が明示されている場合は指摘しない。
