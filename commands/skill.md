---
description: Load the best-matching skill doc from skills/ and apply it to the current task
argument-hint: '[keyword-or-skill-id]'
allowed-tools: Bash(node:*), Bash(rg:*), Read
---

Find the best matching review skill for: $ARGUMENTS

The portable dependency key is a **skill ID**, not a physical path. The bundled
skill collection lives under `<plugin root>/skills/` in the full plugin or
repository checkout.

Steps:

1. When loaded as a plugin, every `${CLAUDE_PLUGIN_ROOT}` in this command body
   has already been replaced with the plugin root's absolute path before you
   read it. The `$CLAUDE_PLUGIN_ROOT` environment variable is empty in Bash, so
   use the substituted path as written in the commands below. If those paths
   are not absolute and still contain a variable reference starting with `$`
   and `{`, use the repository root in its place only inside the river-review
   repository:
   the repository root from `git rev-parse --show-toplevel` must contain both
   `skills/agent-skills/river-review/SKILL.md` and `agents/river-review.md`,
   and its `package.json` `name` must be `river-review` (for example,
   `root="$(git rev-parse --show-toplevel)" && test -f "$root/skills/agent-skills/river-review/SKILL.md" && test -f "$root/agents/river-review.md" && grep -q '"name": "river-review"' "$root/package.json" && echo "$root"`;
   use the printed root). If that command fails, stop and report the paths tried, that the plugin
   root can be added with `--add-dir <plugin root>` if reads outside the
   working directory are blocked, and that the skill's absolute path can be
   given in the request instead.
2. If `$ARGUMENTS` matches the safe skill-ID grammar
   `^[a-z0-9][a-z0-9._-]*$`, try exact resolution first:
   `node "${CLAUDE_PLUGIN_ROOT}/scripts/resolve-skill-id.mjs" "${CLAUDE_PLUGIN_ROOT}" "$ARGUMENTS"`.
3. On exit 0, use `Read` on the returned `SKILL.md`. The resolver verifies the
   declared ID and rejects ambiguous packages.
4. If this invocation came from another skill's owner-skill delegation and exact
   resolution fails, record the owner as unresolved / `skippedSkills`. Do not
   keyword-fallback or reconstruct the missing specialist knowledge by guess.
5. For an ad-hoc user keyword (not an owner-skill delegation), an unresolved exact
   lookup may fall back to a case-insensitive search across the whole collection:
   `rg -i -l -F -g 'SKILL.md' -- "$ARGUMENTS" "${CLAUDE_PLUGIN_ROOT}/skills"`.
6. Inputs containing slash, backslash, `..`, whitespace, or other characters
   outside the ID grammar are never sanitized into another ID. Path-like input
   must not be treated as an owner skill ID.
7. Summarize the selected skill's workflow rules and apply them to the current task.

For `river skills export`, the same resolver contract applies to the export root:
`<export-root>/<skill-id>/SKILL.md`. Exported files carry the canonical ID under
`metadata.rr.id`; the resolver verifies that value before returning a package.

See `docs/development/skill-id-resolution-contract.md` for the full ownership,
resolution, and degradation contract.
