---
id: 'cache-strategy-consistency'
name: Cache Strategy Consistency Guard
description: Detect undefined or inconsistent cache strategies (layers, consistency, invalidation, TTL, failure handling) in design documents.
version: 0.1.0
category: upstream
phase: upstream
applyTo:
  - 'docs/**/*.md'
  - 'design/**/*.md'
  - 'specs/**/*.md'
  - 'rfc/**/*.md'
  - '**/*design*.md'
  - '**/*spec*.md'
  - '**/*architecture*.md'
tags:
  - cache
  - consistency
  - architecture
  - upstream
  - design-review
severity: minor
inputContext:
  - diff
outputKind:
  - findings
  - actions
modelHint: balanced
---

## Pattern declaration

Primary pattern: Reviewer
Secondary patterns: Inversion
Why: キャッシュ戦略の整合性・無効化・障害対策をチェックリスト型で評価し、設計段階での不整合を防ぐ

## Guidance

- Confirm cache layers (CDN/app/DB) and cache keys are specified with owners.
- Check consistency and invalidation strategy per layer, including TTL and refresh triggers.
- Ask for failure/backup behaviour when cache is stale or unavailable.
- Ensure the cache plan aligns with the source of truth and expected SLA.

## Non-goals

- キャッシュ実装の好み（ライブラリ選定など）を推測で押し付けない。

## Pre-execution Gate / 実行前ゲート

このスキルは以下の条件がすべて満たされない限り`NO_REVIEW`を返す。

- [ ] 差分に設計ドキュメント（設計書/spec/RFC）の変更がある
- [ ] 差分にキャッシュ戦略・キャッシュレイヤー・TTL・無効化に関わる記述の追加または変更がある
- [ ] inputContextにdiffが含まれている

ゲート不成立時の出力: `NO_REVIEW: cache-strategy-consistency — キャッシュ戦略に関わる変更が検出されない`

## False-positive guards

- 既に整合性・無効化・TTL が別ドキュメントで明示されている場合は重複指摘しない。
