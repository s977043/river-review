---
description: Load the best-matching skill doc from skills/ and apply it to the current task
argument-hint: '[keyword-or-skill-id]'
allowed-tools: Bash(rg:*)
---

Find the best matching review skill for: $ARGUMENTS

The skill collection lives under `${CLAUDE_PLUGIN_ROOT:-.}/skills/` when this is
installed as a plugin, or under `./skills/` when working inside the river-review
repo itself. Agent Skills and native Review Skills share the same logical skill-ID
namespace even though their physical layouts differ.

Steps:

1. Set `SKILL_ROOT="${CLAUDE_PLUGIN_ROOT:-.}/skills"`.
2. If `$ARGUMENTS` matches the safe skill-ID grammar
   `^[a-z0-9][a-z0-9._-]*$`, search every `SKILL.md` below `$SKILL_ROOT` for
   an exact frontmatter ID first, for example:
   `rg -l -F "id: $ARGUMENTS" "$SKILL_ROOT" -g 'SKILL.md'`.
3. Verify the selected file's frontmatter `id` is exactly `$ARGUMENTS`.
   Do not sanitize slash / backslash / `..` / whitespace-bearing input into a
   different ID.
4. If no exact ID resolves, treat the input as a keyword and search `SKILL.md`
   files across the whole collection, for example:
   `rg -i -l "$ARGUMENTS" "$SKILL_ROOT" -g 'SKILL.md'`.
5. Prefer the most specific relevant skill. If multiple exact-ID candidates are
   ambiguous, do not pick one arbitrarily.
6. Summarize the workflow rules from that skill and apply them to the current task.
7. If a routed owner skill cannot be resolved, report it as unresolved /
   `skippedSkills`; do not reconstruct the missing specialist knowledge by guess.

For exported skill packs, resolve the same skill ID from sibling Agent Skill
packages in the export root.

See `skill-id-resolver` for the portable resolution and degradation contract.
