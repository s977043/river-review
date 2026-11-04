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

## Stops when required files cannot be read

The agent, the skills, and some commands resolve the plugin root (`$CLAUDE_PLUGIN_ROOT`) in Bash and read bundled files from it. When the root cannot be resolved or a file cannot be read, they stop instead of continuing with guesses or substitute criteria. Cases that used to fall back silently now stop and report the reason.

| Target                                      | Stop condition                                                 | What is reported                                                     |
| ------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------- |
| `river-review` agent / `river-review` skill | The `river-review` `SKILL.md` cannot be read                   | The review cannot run because the Skill Registry is unresolved       |
| `/river-review:setup-team`                  | `.river/rules.template.md` cannot be read                      | The template was not found (`.river/rules.md` is not created)        |
| `/river-review:review-team`                 | The `review-team` `SKILL.md` cannot be read                    | The skill definition was not found, with the paths tried and reason  |
| `/river-review:skill`                       | A skill ID delegated from another skill cannot be resolved     | Recorded as unresolved; not filled in by keyword search or guesswork |
| Reviews that target a PR                    | `gh` is unavailable and `git fetch` cannot get the diff either | Asks you to provide the PR diff                                      |

### What to check when it stops

1. In the session, run `echo "$CLAUDE_PLUGIN_ROOT"` in Bash and confirm it prints an absolute path. If it is empty, the plugin is not loaded as a plugin.
2. Run `claude plugin list` and confirm `river-review@river-review-marketplace` is installed and enabled. If it is disabled, run `claude plugin enable`; if it is outdated, run `claude plugin update`. Then restart Claude Code ([Update, disable, and uninstall](./update-and-uninstall.en.md)).
3. If that does not help, uninstall it, reinstall it by following [Install the plugin](./install.en.md), restart, and check step 1 again.
4. If a PR-targeted review stopped, make `gh` available or provide the output of `git diff <base>...<head>`.

The repository root is used in place of an empty `$CLAUDE_PLUGIN_ROOT` only when running inside the river-review repository itself.

## Record evidence from actual use

In this workflow, downstream projects use the Plugin, while the River Review CLI is used for development and verification of River Review itself. Record manual application of skill text separately from an actual Plugin runtime invocation.

Use this short record when comparing a change before and after an improvement. It is an optional usage note, not a new [Review Artifact](../../reference/review-artifact.en.md) schema or an approval record. Reference existing output when available.

### Separate installation from review

- **Registration**: A name appears in configuration or a marketplace. This does not prove it loaded in the session.
- **Loading**: The target session could read the bundled skill. Application to the input and completion require separate evidence.
- **Execution**: The input revision, applied skill, and actual output can be traced. Distinguish self-review, another session, manual delegation, and automatic dispatch.
- **Effectiveness**: Assess only what has ground-truth labels or human evaluation. Zero findings or an iteration count alone does not guarantee quality.

Static manifest inspection and mocks do not count as Plugin runtime execution. Record stops, skips, unsupported capabilities, and unexecuted model calls with their reasons; do not reinterpret them as success. Mark unobserved states as unknown. Normal Plugin use applies skills through the host model, so the absence of a River Review API key alone does not establish that the model did not run.

### Record template

```text
Case ID / timestamp:
Product version / commit SHA / entry path / host version:
Model / effort / execution conditions: unknown if unavailable
Task type / safe input ID / subject revision:
Expected behavior:
Observed behavior / evidence references:
Registration / loading / execution / effectiveness: observed and unknown per step
Lifecycle coverage: upstream definition / requirements / plan / design / code / QA
  Each stage: distinguish out of scope, not executed, and executed; reference input/output
Finding disposition: accepted / rejected / deferred; decision owner and reason:
False positives / misses / usefulness / human time: measured or not measured
Public minimal reproduction / before-and-after revisions and results:
Remaining limitations / next check:
```

Lifecycle names are usage-note labels, not Flow entry names or evidence of execution. Completing a code review does not complete requirements or QA review. If a skill was applied manually from its text, record that fact without claiming Plugin loading or automatic delegation was verified.

### Examples and feedback

Independent illustrative examples (not execution logs):

- `example-load-only`: Registration and skill-loading evidence exist, but the skill was not applied to the target input. Execution is not performed; effectiveness is not measured.
- `example-zero-findings`: The subject revision and review output are available, with zero findings. Execution is observed, but effectiveness remains unmeasured without ground-truth labels or human evaluation.
- `example-unsupported`: The host does not support the requested subagent. Record the limitation as not executed, separately from any manually supplied result.

Search existing issues and PRs before reporting feedback; append evidence to the same problem when found. Publish independent minimal inputs and reproduced product behavior, without private repository links, internal paths, source, conversations, or credentials. Ask the owner before publishing private evidence. Compare the same input and conditions on recheck, recording changed conditions and unmeasured outcomes. Usage notes and review evidence do not create Human / Host approval or merge authority.

## Related pages

- [Install the plugin](./install.en.md)
- [Using River Review from AI Agents](../agent-workflow.en.md)
