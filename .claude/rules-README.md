# .claude/rules/

Auto-applied rules for Claude Code sessions. Claude Code scopes a rule only by the `paths` field in its frontmatter. A rule without `paths` loads in every session. `review-core` declares `globs`, not `paths`, so it loads in every session. That is the intended scope (see below).

This README lives outside `.claude/rules/` on purpose. Every `.md` under that directory is loaded as a rule. A README there would be injected into every session.

| Rule        | Glob   | Purpose                                         |
| ----------- | ------ | ----------------------------------------------- |
| review-core | `**/*` | Review severity mapping and prohibited patterns |

References:

- `docs/review/output-format.md` (severity labels and output structure)
- `docs/review/viewpoints.md` (review observation checklist)
- `pages/reference/review-policy.md` (full review policy)

## Why `globs: **/*` instead of a narrower path scope

`review-core` intentionally uses a catch-all `**/*` glob rather than scoping to specific paths. Claude Code's built-in `/code-review` slash command has been observed to evaluate a rule file's `paths:`/`globs:` frontmatter against the git ref-range string passed to the command (e.g. `{upstream}...HEAD`) rather than against the individual changed file paths, so a narrower glob can silently fail to load (inspired by [tyabu12's `/code-review` path-scoped rules investigation](https://zenn.dev/tyabu12/articles/0010-code-review-path-scoped-rules)). A `**/*` catch-all matches regardless of what string it is tested against, which is why this rule is kept unscoped rather than narrowed to a specific path prefix.
