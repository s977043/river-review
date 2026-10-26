---
id: 'security-privacy-design'
name: Security & Privacy Design Review
description: Review data retention, deletion, backup residency, and cross-border data transfer.
version: 0.1.0
category: upstream
phase: upstream
applyTo:
  - 'docs/**/*.md'
  - '**/design/**/*'
  - '**/rfc/**/*'
  - 'docs/architecture/**/*'
tags:
  - security
  - privacy
  - upstream
  - design
  - gdpr
  - pii
severity: minor
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
Why: プライバシー設計レビューはチェックリスト型評価が主だが、データ関連の設計変更がない差分では実行を止めるゲートが必要

## Guidance

- Check retention/deletion policies, including backups, residency, and cross-border handling.
- Ensure privacy rights flows (erasure/export) and audit logging are defined with access controls.
- Verify encryption and access control strategy for data at rest/in transit.
- Call out missing threat/abuse considerations for sensitive data paths.

## Non-goals

- 実装詳細や規約の推測だけで断定しない。

## Pre-execution Gate / 実行前ゲート

このスキルは以下の条件がすべて満たされない限り`NO_REVIEW`を返す。

- [ ] 差分にデータ保持・削除・暗号化・プライバシーに関連する設計ドキュメント変更が含まれている
- [ ] 差分が非データ領域のみの変更ではない
- [ ] inputContextにfullFileが含まれている

ゲート不成立時の出力: `NO_REVIEW: security-privacy-design — プライバシー・データ設計に関連する変更が検出されない`

## False-positive guards

- 別文書で保持/削除/暗号化ポリシーがすでに明示されている場合は黙る。
