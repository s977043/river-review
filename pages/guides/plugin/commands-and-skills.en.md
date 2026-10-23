# Commands, agents, and skills

This page lists what the plugin distributes. The distribution manifests are `.claude-plugin/plugin.json` (Claude Code) and `.codex-plugin/plugin.json` (Codex).

| Kind           | Claude Code | Codex               |
| -------------- | ----------- | ------------------- |
| Slash commands | Distributed | Not in the manifest |
| Sub-agent      | Distributed | Not in the manifest |
| Skills         | Distributed | Distributed         |

`.codex-plugin/plugin.json` declares only `skills` and `interface`; it does not declare `commands` or `agents`.

## Commands (Claude Code)

The seven entries registered under `commands` in `.claude-plugin/plugin.json`. Descriptions summarize the frontmatter `description` of each `commands/*.md`.

| Command                      | What it does                                                                                          |
| ---------------------------- | ----------------------------------------------------------------------------------------------------- |
| `/river-review:setup-team`   | Create `.river/rules.md`, confirm the plugin install, and check the integration mode                  |
| `/river-review:review-local` | Review uncommitted changes, or the branch diff against the default branch when nothing is uncommitted |
| `/river-review:review-team`  | Parallel multi-role review merged with consensusLevel and a Tech Lead report                          |
| `/river-review:challenge`    | Pre-mortem, war-game, and logic-torturing analysis on current changes                                 |
| `/river-review:skill`        | Load the best-matching skill doc from `skills/` and apply it to the current task                      |
| `/river-review:check`        | Pre-review check: run lint/tests and summarize failures and risks                                     |
| `/river-review:pr`           | Draft a review-ready PR description from a template                                                   |

## Agent (Claude Code)

| Agent          | Definition               | What it does                                                                                                    |
| -------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `river-review` | `agents/river-review.md` | Follows the `river-review` skill, runs perspective-based reviewer roles, and verifies findings against the diff |

## Skills (Claude Code / Codex)

The 12 skills under `skills/agent-skills/`. Descriptions summarize each `SKILL.md` `description`.

| Skill                         | What it does                                                                                             |
| ----------------------------- | -------------------------------------------------------------------------------------------------------- |
| `river-review`                | Main entry point: intent classification, specialist skill selection, execution, and finding verification |
| `river-review-code`           | General code quality; the default fallback                                                               |
| `river-review-security`       | Regular security review (authn/authz, privacy design, and more)                                          |
| `river-review-security-audit` | Explicit security audit of a repository or subsystem                                                     |
| `river-review-performance`    | N+1 queries, memory efficiency, caching strategy, observability                                          |
| `river-review-architecture`   | Dependencies, boundary design, data models, API design                                                   |
| `river-review-testing`        | Test coverage, naming, flaky tests, coverage gaps                                                        |
| `river-review-frontend`       | Accessibility, design-system conformance, UI state design, and more                                      |
| `river-review-docs`           | Consistency between README / docs / AGENTS.md and the implementation                                     |
| `adversarial-review`          | Adversarial review with Pre-mortem / War Game / Logic Torturing                                          |
| `review-team`                 | Runs six specialist reviewer roles in parallel and merges the results                                    |
| `unknown-coverage-review`     | Synthesizes unverified items (Unknowns) left in a diff and its verification evidence                     |

In Claude Code, skills can also be invoked as `/river-review:<skill-name>`.

## Related pages

- [Install the plugin](./install.en.md)
- [Using River Review from AI Agents](../agent-workflow.en.md)
