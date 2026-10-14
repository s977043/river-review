# Using River Review from AI Agents

> **Which entry point should I use?**
> The primary, no-install entry point is the bundled **skill-routed review** — install the plugin and ask the `river-review` agent (or load the skills) to review your diff. Use `/review-local` when you want River Review orchestrated by Claude Code with automatic context passing from the current session; use the sub-agent (`agents/river-review.md`) for delegated, headless review tasks. The `river` CLI (`river run .`) is an **optional accelerator**, distributed separately and not yet published to npm.

## Overview

River Review turns tacit knowledge into versioned, repo-owned Skills (a Skill Registry) shared as a team asset, organized around three axes: (1) a **capability pack** that strengthens an AI agent's review ability (usually no LLM key needed), (2) review skills (the **Skill Registry**), and (3) a **review team** of a reviewer agent plus perspective-based reviewers (parallel execution via `reviewer-orchestrator.mjs` with connected-components merging and `--reviewers auto`), paired with a verdict-bearing critic. This page covers how to call those three axes from each AI agent.

River Review ships as a **Claude Code / Codex plugin**. The primary entry point is the bundled **skill-routed review** — the `river-review` orchestrator agent plus the specialist skills under `skills/agent-skills/` — which needs no external tooling. It works with any AI agent that can read the skills (Claude Code, Cursor, Codex CLI, GitHub Copilot, and others).

The `river` CLI is an **optional accelerator** for producing structured findings. It is distributed separately from the plugin and is **not yet published to npm**, so it is not a required step.

---

## Optional: the `river` CLI

If the `river` CLI is available on your `PATH`, these commands accelerate a review. They are optional — the skill-routed review above does not require them.

```bash
# Review the local diff
river run .

# Auto team selection (roles chosen automatically based on diff content)
river run . --reviewers auto

# Dry-run (no API key required)
river run . --dry-run

# Output in JSON format
river run . --output json
```

### Preview review depth before running

With the optional CLI installed, you can inspect the recommended depth.
This command is advisory only and does not execute a review.

```bash
river review route . --format markdown
river review route . --format json
```

The result is `light`, `standard`, `team`, or `human-required`.
`recommendedReviewers` does not prove which roles actually executed.
`nextCommand` is a suggestion, not permission to execute it.

For `human-required`, assign a human reviewer.
Without the CLI, continue to use the bundled plugin Skills directly.
The CLI must not become a mandatory plugin dependency.

### How `--reviewers auto` works

When `auto` is specified, River Review analyzes the diff content and selects reviewer roles automatically. `bug-hunter` is always included; additional roles are added based on the following signals:

Typical signals that add specialist roles include:

- Configuration, schema, migration, or infrastructure changes: `security-scanner`
- Test changes or three or more application files: `test-gap`
- `package.json` and supported lockfile changes: `dependency-reviewer`
- Frontend component or style changes: `frontend-reviewer`
- `.github/workflows/**` changes: `ci-cd-reviewer`

Optional stage and risk signals can add further roles.
`river review route` recommends depth only.
Use the actual review result to confirm which reviewers ran.

To see which roles were selected, check the `autoSelectedRoles` field in the JSON output:

```json
{
  "autoSelectedRoles": ["bug-hunter", "security-scanner", "test-gap"]
}
```

### Chunk splitting and deduplication

When reviewing with multiple roles (including `auto`), a large diff is automatically split into chunks and run in parallel across role × chunk. The findings from each run are deduplicated across chunks and roles before final IDs are assigned, so duplicate findings at the same location are merged into one (implementation: `splitDiffIntoChunks` / `deduplicateFindings` in `src/lib/reviewer-orchestrator.mjs`).

---

## How to Invoke by Agent

| Agent          | How to Invoke                           | Dedicated Definition File                  |
| -------------- | --------------------------------------- | ------------------------------------------ |
| Claude Code    | Bash tool / `/review-local` / sub-agent | `agents/river-review.md`                   |
| Cursor         | Terminal tab / `@terminal`              | —                                          |
| Codex CLI      | `codex exec "river run ."`              | `templates/agent-workflow/codex/AGENTS.md` |
| GitHub Copilot | Run directly in terminal                | `.github/agents/river-review.agent.md`     |
| Others         | `river run .` in any shell              | `agents/examples/river-review.agent.yaml`  |

### Claude Code

Run via the Bash tool:

```bash
river run . --reviewers auto
```

Slash commands and the sub-agent are also available:

```text
/review-local
```

```text
Please ask river-review to review the current diff
```

Dedicated definition: `agents/river-review.md`

### Cursor

Call it as a terminal command from Cursor's Agent mode:

```bash
river run . --reviewers auto
```

See `templates/agent-workflow/` for ready-to-use config templates.

### Codex CLI

```bash
codex exec "river run . --reviewers auto"
```

Codex supports the same plugin marketplace as Claude Code (both share the same `.claude-plugin/marketplace.json`). The recommended installation method is to add the marketplace:

```bash
codex plugin marketplace add s977043/river-review
```

Codex reads its skills and interface metadata from the repo's `.codex-plugin/plugin.json` (the Codex-native manifest), so adding the marketplace natively registers the specialist review skills with no extra setup.

As a fallback when the marketplace is not used, run `scripts/setup-codex.sh` (it vendors the `AGENTS.md` guidance and the full `skills/agent-skills/` tree, including references/, idempotently) or take the dedicated definition `templates/agent-workflow/codex/AGENTS.md` and merge or append its contents into your project's `AGENTS.md`. This enables River Review to run automatically before commits.

### GitHub Copilot

`.github/agents/river-review.agent.md` is already defined. Run `river run .` in the terminal, or instruct Copilot to "run `river run .` and report the review results."

### Other Agents

Any environment that can execute shell commands can call `river run .` directly.

---

## Agent Skills (Cross-Agent Skill Definitions)

`skills/agent-skills/` contains **agent-independent skill definitions** that can be passed to any agent.

| Skill                       | Purpose                                                            |
| --------------------------- | ------------------------------------------------------------------ |
| `river-review`              | Main review (intent classification → routing to specialist skills) |
| `river-review-code`         | Code quality review                                                |
| `river-review-security`     | Security-focused review                                            |
| `river-review-performance`  | Performance review (N+1 / optimization)                            |
| `river-review-testing`      | Test coverage review                                               |
| `river-review-architecture` | Architecture review                                                |
| `adversarial-review`        | Adversarial review (challenge assumptions)                         |
| `river-review-docs`         | Documentation consistency review (README / i18n / terminology)     |

To use a skill with an agent, load `skills/agent-skills/<skill-name>/SKILL.md` into the agent's context.

---

## W-Check (Combining Multiple AI Results)

To combine review results from multiple agents, use the W-Check feature. See the [W-Check Practical Guide](./w-check.md) for details.

---

## Related Pages

- [Quickstart](./quickstart.md)
- [GitHub Actions Setup](./github-actions.md)
- [W-Check Practical Guide](./w-check.md)
