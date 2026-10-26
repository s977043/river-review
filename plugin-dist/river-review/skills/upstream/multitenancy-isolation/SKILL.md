---
id: 'multitenancy-isolation'
name: Multitenancy Isolation Guard
description: マルチテナント前提の設計差分から、テナント分離（データ/権限/リソース/障害影響）の抜けや越境リスクを検出
version: 0.1.0
category: upstream
phase: upstream
applyTo:
  - 'docs/**/*'
  - 'design/**/*'
  - 'architecture/**/*'
  - 'specs/**/*'
  - 'config/**/*'
  - 'infrastructure/**/*'
tags:
  - multitenancy
  - isolation
  - security
  - architecture
  - upstream
severity: major
inputContext:
  - fullFile
outputKind:
  - findings
  - actions
modelHint: balanced
dependencies:
  - code_search
---

## Pattern declaration

Primary pattern: Reviewer
Secondary patterns: Inversion
Why: マルチテナント設計の差分からテナント分離（データ/権限/リソース/障害影響）の抜けをレビューし、テナント越境シナリオを逆照射する。

## Guidance

- Confirm tenant scoping for data paths (queries, cache keys, queues, storage).
- Check auth and authorization flows prevent cross-tenant access (IDOR, tenant headers).
- Call out noisy-neighbor risks: shared pools, rate limits, or job queues without fairness.
- Ensure failure isolation and observability are tenant-aware.

## Non-goals

- テナント以外の一般的な設計批評は避ける。

## Pre-execution Gate / 実行前ゲート

このスキルは以下の条件がすべて満たされない限り`NO_REVIEW`を返す。

- [ ] 対象ファイルにマルチテナントに関する設計・アーキテクチャドキュメントが含まれている
- [ ] 対象ファイルにテナント分離（データアクセス・権限・リソース分離）に関する記述がある
- [ ] inputContextにfullFileが含まれている

ゲート不成立時の出力: `NO_REVIEW: multitenancy-isolation — マルチテナント設計に関する差分がない`

## False-positive guards

- 既に tenant_id フィルターや RLS/名前空間化が明示されている場合、差分外の記述のみでは指摘しない。
