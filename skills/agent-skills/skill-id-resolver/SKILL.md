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

1つの skill ID。許可する形式は次だけ。

```text
^[a-z0-9][a-z0-9._-]*$
```

slash、backslash、`..`、空白、制御文字を含む値は owner skill ID として扱わない。
unsafe な値を sanitize して別 ID に変換してはいけない。

## Executable Resolver

full plugin / source tree では次を使う。

```bash
node "${CLAUDE_PLUGIN_ROOT:-.}/scripts/resolve-skill-id.mjs"   "${CLAUDE_PLUGIN_ROOT:-.}" "<skill-id>"
```

実装正本は `src/lib/skill-id-resolver.mjs`。wrapper は結果の path を stdout
へ返し、unresolved は exit 2、invalid / ambiguous は exit 1 で fail closed する。

## Resolution

resolver は frontmatter の宣言 ID を読み、文字列検索だけで決めない。

### Source repository / full plugin root

`skills/` 以下の Agent Skill と Review Skill を走査し、top-level `id` が
要求 ID と完全一致する package を解決する。複数 package が同じ ID を宣言した
場合は ambiguous として失敗し、順序で片方を選ばない。

### Exported Agent Skills

`river skills export` 後は次を確認する。

```text
<export-root>/<skill-id>/SKILL.md
```

exported frontmatter では canonical ID が `metadata.rr.id` に入るため、その値が
要求 ID と完全一致することを検証する。directory 名だけを信用しない。

## Output

解決できた場合は requested ID、resolved `SKILL.md`、source kind
(`agent` / `review` / `exported`) を持つ。

解決できない場合は owner skill を `skippedSkills` 等へ残し、generic entry
checklist だけで安全に継続できる場合に限って degrade する。critical / security /
compliance の必須判断では既存 gate または人間へ handoff する。

## Knowledge Ownership

specialist の Experience Knowledge / false-positive guard / fixture は owner Review
Skill が正本。Agent entry skill の `references/` へ同じ内容を手書きコピーしない。

generated bridge が必要な host では source skill ID / source hash / generator version /
freshness check を必須にする。

## Related

- `docs/development/skill-id-resolution-contract.md`
- `docs/development/experience-knowledge-authoring.md`
