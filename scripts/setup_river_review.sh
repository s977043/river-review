#!/usr/bin/env bash
#
# DEPRECATED (2026-08-12) — do not run this script.
#
# Why deprecated:
#   - Zero references. `git grep -F 'setup_river_review.sh'` over the whole repo
#     (excluding this file) returns no hits: no npm script, no workflow, no doc.
#   - It is a one-shot bootstrap generator for an empty repository. Running it in
#     the repository as it stands today is destructive rather than useful.
#
# DANGER — this script OVERWRITES tracked files with template stubs:
#   - README.md                          (via write_readme)
#   - docs/glossary.md
#   - docs/skill-schema.md
#   - schemas/skill.schema.json
#   - .github/workflows/river-review.yml
#   Each is written with `cat > ...`, so the current content is lost. The
#   `--force` flag only widens what gets overwritten; omitting it does NOT make
#   the README write safe.
#
# Retirement plan:
#   Stage 1 (this change) — deprecate and keep the logic unchanged, so any
#   unknown caller surfaces as a visible warning instead of a silent break.
#   Stage 2 — delete the file on or after 2026-11-12 (90 days) if no caller
#   appears. Deletion is intentionally NOT part of this change.
#
set -euo pipefail

# 以下は #1950 まで heredoc だった。bash 5.3.15（homebrew）は本体が 512 バイトを
# 超える heredoc で決定論的に deadlock するため、この script は手で実行すると
# 固まっていた。単一引用符の複数行文字列を printf へ渡すと quoted heredoc と
# 同じ「一切展開しない」意味論のままバイト単位で同一の出力になり、サイズ上限も
# 無い。heredoc へ戻さないこと（#1950）。
printf '%s\n' '================================================================================
  DEPRECATED: scripts/setup_river_review.sh

  This script REWRITES README.md, docs/glossary.md, docs/skill-schema.md,
  schemas/skill.schema.json and .github/workflows/river-review.yml with
  bootstrap template stubs. Running it in this repository DESTROYS the
  current content of those files.

  It has no callers and is scheduled for deletion on or after 2026-11-12.
  Press Ctrl-C now if you did not mean to run it.
================================================================================' >&2
sleep 10

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FORCE=0
if [[ "${1:-}" == "--force" ]]; then
  FORCE=1
fi

mkdir -p "$ROOT/scripts" "$ROOT/docs" "$ROOT/docs/tutorials" "$ROOT/docs/how-to" "$ROOT/docs/reference" "$ROOT/docs/explanation" \
  "$ROOT/skills/upstream" "$ROOT/skills/midstream" "$ROOT/skills/downstream" \
  "$ROOT/assets/logo" "$ROOT/assets/icons" "$ROOT/assets/banners" \
  "$ROOT/.github/workflows"

write_readme() {
  # heredoc へ戻さないこと。理由は上の #1950 の注記を参照。
  printf '%s\n' '# River Review

![River Review logo](assets/logo/river-review-logo.svg)

RR (River Review) is a flow-aware review assistant that moves with your delivery stream.

## Flow at a glance

- **Upstream → Midstream → Downstream**: design, implementation, and test/QA phases stay connected.
- **Upstream-first**: catch design drift early with ADR-aware skills.
- **Stream router**: picks skills per requested phase or change set.
- **(Future) Riverbed Memory**: retains past findings, ADR links, and WontFix decisions for consistent follow-up.

## Repository layout

```
README.md
assets/           # official RR logos/icons
schemas/          # JSON Schema for skills and outputs
skills/           # upstream/midstream/downstream skills (Markdown + frontmatter)
scripts/          # setup and skill refactor utilities
docs/             # tutorials, how-to, reference, explanation
.github/river-review/ # River Review checklists shared with CI/agents
```

## Quick start (GitHub Actions)

Minimal workflow to run River Review in the midstream phase:

```yaml
name: River Review
on:
  pull_request:
    branches: [main]
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - name: Run River Review (midstream)
        uses: s977043/river-review@v1
        with:
          phase: midstream
```

## Skill definition

Skills use YAML frontmatter for metadata and Markdown for guidance. Required fields: `id`, `name`, `description`, `phase`, `applyTo`.

```markdown
---
id: rr-midstream-performance-001
name: Midstream Performance Guardrails
description: Ensure midstream changes avoid common performance pitfalls.
phase: midstream
applyTo:
  - "src/**/*.ts"
tags: [performance, efficiency]
severity: major
---

- Check for accidental O(n^2) loops over large collections.
- Prefer streaming/iterators when handling large payloads.
- Flag synchronous I/O in request paths.
- Suggest benchmarks when risky changes are detected.
```

## Schemas & loader

- JSON Schema lives in `schemas/skill.schema.json` and `schemas/output.schema.json`.
- `scripts/rr_validate_skills.py` loads and validates skills recursively with `--phase upstream|midstream|downstream|all`.
- `scripts/setup_river_reviewer.sh` bootstraps the directory layout and placeholder files.

## Contributing

See the upstream contribution guide at https://github.com/s977043/river-review for guidance. Issues and PRs are welcome as we expand River Review.

## License

Refer to the upstream River Review repository for applicable license files. Code is described in `LICENSE-CODE` (MIT) and docs/media in `LICENSE-CONTENT` (CC BY 4.0). The root `LICENSE` text is MIT; the scaffolding scope is under review in issue #2721 (https://github.com/s977043/river-review/issues/2721).' > "$ROOT/README.md"
}

if [[ ! -f "$ROOT/README.md" ]]; then
  write_readme
  echo "README.md created with River Review content."
elif [[ "$FORCE" -eq 1 ]]; then
  write_readme
  echo "README.md refreshed with River Review content (force mode)."
else
  echo "README.md exists; use --force to overwrite. Skipping README update."
fi

# heredoc へ戻さないこと。理由は上の #1950 の注記を参照。
printf '%s\n' '# River Review Glossary

- **Upstream**: requirements, design, and architecture phase (including ADRs) where early review prevents costly rework.
- **Midstream**: implementation and pull request phase focused on code quality, security, and developer experience.
- **Downstream**: test, QA, and release-prep phase to verify coverage, resilience, and regression protection.
- **Skill**: a YAML frontmatter + Markdown unit of review guidance executed by River Review.
- **Stream Router**: logic that selects and runs skills based on the requested phase and change context.
- **Riverbed Memory (Future)**: persistent context layer for previous findings, ADR references, and WontFix decisions to keep reviews consistent over time.' > "$ROOT/docs/glossary.md"

# heredoc へ戻さないこと。理由は上の #1950 の注記を参照。
printf '%s\n' '# Skill Schema

River Review skills use YAML frontmatter for metadata and Markdown for guidance. The metadata fields are validated by `schemas/skill.schema.json`.

## Fields

- `id` (string, required): unique identifier (e.g., `rr-upstream-design-architecture-001`); stable across moves/renames.
- `name` (string, required): human-readable skill name.
- `phase` (string, required): one of `upstream`, `midstream`, or `downstream`.
- `tags` (string[], optional): keywords that group related skills.
- `severity` (string, optional): `info`, `minor`, `major`, or `critical` to indicate impact.
- `applyTo` (string[], required): glob patterns for files the skill should evaluate.
- `description` (string, required): concise explanation of what the skill checks.

## YAML Example (midstream performance)

```yaml
---
id: rr-midstream-performance-002
name: Midstream Performance Budget Check
phase: midstream
tags:
  - performance
  - latency
severity: major
applyTo:
  - "src/**/*.ts"
  - "packages/**/src/**/*.{ts,js}"
description: Flag midstream changes that risk latency regressions or heavy resource use.
---

Ensure changed code paths avoid unnecessary synchronous I/O, unbounded concurrency, and repeated heavy computations. Recommend benchmarks when touching hot paths.
```' > "$ROOT/docs/skill-schema.md"

# heredoc へ戻さないこと。理由は上の #1950 の注記を参照。
printf '%s\n' '{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "River Review Skill Metadata Schema",
  "type": "object",
  "required": ["id", "name", "phase", "applyTo", "description"],
  "additionalProperties": false,
  "properties": {
    "id": {
      "type": "string",
      "minLength": 3
    },
    "name": {
      "type": "string",
      "minLength": 1
    },
    "phase": {
      "type": "string",
      "enum": ["upstream", "midstream", "downstream"]
    },
    "tags": {
      "type": "array",
      "items": {
        "type": "string"
      },
      "uniqueItems": true
    },
    "severity": {
      "type": "string",
      "enum": ["info", "minor", "major", "critical"]
    },
    "applyTo": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "string"
      }
    },
    "description": {
      "type": "string",
      "minLength": 1
    }
  }
}' > "$ROOT/schemas/skill.schema.json"

# このファイルで唯一残した heredoc。本体が 364 バイトで #1950 の 512 バイト閾値を
# 下回るため、そのままにしてある。行を足すときはバイト数を確認し、512 を超えるなら
# 上の printf 形式へ寄せること（512 を超えた heredoc は bash 5.3.15 で固まる）。
cat <<'EOW' > "$ROOT/.github/workflows/river-review.yml"
name: River Review (placeholder)

on:
  workflow_dispatch:
  pull_request:
    branches: [ main ]

jobs:
  river-review:
    runs-on: ubuntu-latest
    env:
      RR_PHASE: midstream
    steps:
      - name: Checkout
        uses: actions/checkout@v4
      - name: Run River Review
        run: echo "River Review placeholder run for phase=${RR_PHASE:-midstream}"
EOW

# Ensure placeholder markers so empty directories are tracked when needed
for dir in "$ROOT/skills" "$ROOT/skills/upstream" "$ROOT/skills/midstream" "$ROOT/skills/downstream" \
           "$ROOT/assets/logo" "$ROOT/assets/icons" "$ROOT/assets/banners"; do
  touch "$dir/.gitkeep"
done

echo "[DONE] River Review bootstrap completed."
