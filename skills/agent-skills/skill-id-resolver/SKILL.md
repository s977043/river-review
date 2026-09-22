---
id: skill-id-resolver
name: skill-id-resolver
description: |
  River Review の skill ID を host 固有の物理パスへ安全に解決する utility Agent Skill。
  Agent Skill / native Review Skill / export 後の sibling package を同じ ID で参照する。
phase: [upstream, midstream, downstream]
severity: info
applyTo: ['**/*']
tags: [agent, routing, resolver, infrastructure]
version: 0.1.0
license: MIT
---

# Skill ID Resolver

River Review の entry skill が specialist skill へ委譲するときに使う。
**portable contract は skill ID であり、物理パスではない。**

## Input

1つの skill ID。

許可する ID は次の形式だけです。

```text
^[a-z0-9][a-z0-9._-]*$
```

slash、backslash、`..`、空白、制御文字を含む値は ID として扱わない。
unsafe な値を sanitize して別 ID に変換してはいけない。

## Resolution

### Source repository / full plugin root

plugin/repository root の `skills/` を skill root とし、次を順に確認する。

1. `agent-skills/<skill-id>/SKILL.md`
2. `core/**/<skill-id>/SKILL.md`
3. `upstream/**/<skill-id>/SKILL.md`
4. `midstream/**/<skill-id>/SKILL.md`
5. `downstream/**/<skill-id>/SKILL.md`

候補を見つけたら frontmatter の `id` が要求 ID と完全一致することを確認する。
複数の canonical candidate が残る場合は曖昧として扱い、任意に1つを選ばない。

### Exported Agent Skills

`river skills export` 後の pack では sibling package の

```text
<export-root>/<skill-id>/SKILL.md
```

を確認する。

export root が host から取得できない場合は、現在の skill package と同じ skill collection 内から exact ID で解決する。

## Output

解決できた場合:

- requested skill ID
- resolved `SKILL.md`
- source kind: `agent` / `review` / `exported`

解決できない場合:

- unresolved skill ID
- `skippedSkills` または同等の trace
- degrade / human handoff の必要性

## Missing Owner Guard

owner skill を見つけられない場合、その本文を推測で再構築しない。

- generic entry checklist だけで安全に継続できる場合は degrade
- critical / security / compliance の必須判断なら既存 gate または人間へ handoff
- 「owner skill を読んだ」ことにしない

## Knowledge Ownership

specialist の Experience Knowledge / false-positive guard / fixture は owner Review Skill が正本です。
Agent entry skill の `references/` へ同じ内容を手書きコピーしない。

generated bridge が必要な host では、source skill ID / source hash / generator version / freshness check を必須にする。

## Related

- `docs/development/skill-id-resolution-contract.md`
- `docs/development/experience-knowledge-authoring.md`
