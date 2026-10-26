---
id: 'agent-skill-bridge'
name: Agent Skill Bridge Review
description: Review changes to the Agent Skills import/export bridge for path safety, round-trip fidelity, and validation correctness.
version: 0.1.0
category: midstream
phase: midstream
applyTo:
  - 'src/lib/agent-skill-bridge.mjs'
  - 'tests/agent-skill-bridge.test.mjs'
  - 'schemas/agent-skill-loose.schema.json'
  - 'scripts/validate-agent-skills.mjs'
tags:
  - bridge
  - skills
  - midstream
severity: major
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
Why: ブリッジモジュールのパス安全性・往復忠実性・バリデーション正当性をチェックリスト型で評価するが、対象ファイル外の変更では実行不要

## Guidance

- **Path traversal**: `assertSafePath` must reject ids containing `..`, `/`, or NUL bytes. Any new file-write path must route through this function or `sanitizeSkillId`.
- **Round-trip fidelity**: export followed by re-import must preserve `name`, `description`, and body content. Verify that new fields added to conversion logic do not break this property.
- **Auto-fill correctness**: `convertAgentSkillToRR` must not overwrite explicitly provided values (id, category, phase, applyTo). Defaults apply only when the field is absent.
- **Validation gate**: both strict and loose validation paths must be exercised. The `errors` array must capture invalid skills without aborting the entire import batch.
- **Test coverage**: every newly exported function from the module must have at least one `node:test` case.

## Non-goals

- Do not critique the RR skill schema itself; focus on bridge logic only.
- Do not flag auto-fill behaviour as missing validation when the converted metadata passes the strict RR schema.

## Pre-execution Gate / 実行前ゲート

このスキルは以下の条件がすべて満たされない限り`NO_REVIEW`を返す。

- [ ] 差分にAgent Skillブリッジ関連ファイル（`agent-skill-bridge.mjs`, `validate-agent-skills.mjs`, `agent-skill-loose.schema.json`等）の変更が含まれている
- [ ] 差分がコメント・JSDoc・空白のみの変更ではない
- [ ] inputContextにdiffが含まれている

ゲート不成立時の出力: `NO_REVIEW: agent-skill-bridge — Agent Skillブリッジ関連の実質的なコード変更が検出されない`

## False-positive guards

- If test fixtures are added without corresponding logic changes, that is expected (test-only commits).
