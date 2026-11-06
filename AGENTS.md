# AGENTS.md—River Review

## Scope

Canonical instructions for all AI coding agents in this repository.
Tool-specific files (`CLAUDE.md`, `GEMINI.md`, `.codex/`, `copilot-instructions.md`) contain only tool-specific policy and point here for repo-wide rules.
If a rule applies to all tools, it belongs in this file.

## Repository Map

| Directory                | Purpose                                              |
| ------------------------ | ---------------------------------------------------- |
| `skills/`                | Core review skills and registry content              |
| `skills/agent-skills/`   | Packaged agent skills (`SKILL.md` + `references/`)   |
| `src/`                   | Runtime, CLI, and runner logic                       |
| `tests/`                 | Node.js test suites                                  |
| `pages/`                 | Public docs; Japanese content is the source of truth |
| `docs/`                  | Internal notes and runbooks; see Edit Scope          |
| `runners/github-action/` | GitHub Action runner implementation                  |
| `runners/node-api/`      | Separate TypeScript package (built with `tsc`)       |
| `schemas/`               | JSON schemas for skills, output, and riverbed        |
| `scripts/`               | Validation, evaluation, and build scripts            |

## Package Manager

Use **npm**.

Node 22 is required (`.nvmrc` and `engines.node` pin 22.x). If the default `node` is another version, run Node 22 explicitly via its absolute path or a version manager.

| Task                    | Command                                                           |
| ----------------------- | ----------------------------------------------------------------- |
| Install                 | `npm install` or `npm ci`                                         |
| Lint                    | `npm run lint`                                                    |
| Test                    | `npm test`                                                        |
| Skills validation       | `npm run skills:validate`                                         |
| Agent skills validation | `npm run agent-skills:validate`                                   |
| Agent spec and examples | `npm run agents:validate` (`agents/spec/`, `agents/examples/`)    |
| Plugin manifest         | `npm run plugin:validate` (incl. `agents/*.md` registration)      |
| Local link check        | `npm run check:links:local`                                       |
| Docs dev server         | `npm run dev`                                                     |
| Docs build              | `npm run build`                                                   |
| TypeScript check        | `npm run build` in `runners/node-api/` (no root typecheck script) |

## Safety

- Do not read or commit `.env*`, `secrets/`, `*.pem`, or `*.key`.
- Do not make direct network calls (curl, wget, fetch) from scripts or code. Allowed CLI tools like `gh` are exempt.
- Do not use destructive commands. The ban covers any command **you** run that rewrites already-pushed branch history (`git push --force` / `-f`, `git push --force-with-lease`) or discards work (`rm -rf`, `git reset --hard`, `git stash drop`, etc.). `--force-with-lease` is not a safe-force exception, and no role is exempt—organizer and worker alike. Take the remote in with `git merge` / `git merge --ff-only` and push a fast-forward instead; if history still looks like it must be rewritten, stop and escalate. Out of scope: the release automation's force-update of the moving major tag (`git push --force origin "refs/tags/${MAJOR_TAG}"` in `.github/workflows/release-please.yml`), which retargets a **tag** and rewrites no branch history. That exemption belongs to the workflow and is never a licence for an agent to force-push.
- Do not hand-edit `package-lock.json`.
- Do not push directly to `main` or to already-merged PR branches. If fixes are needed after merge, create a new branch and new PR.
- Do not omit timeout and exception handling in code that calls external APIs.

## Edit Scope

Edit approval follows the risk tiers in [ADR-016](docs/adr/016-repo-operation-risk-tiers.md). Its tier table (階層表) is the SSoT; the summary below does not replace it. The Safety section above takes precedence on every tier.

- **Cliff (崖)**: human approval is required for each PR. Covers this file and other approval rules, `.claude/` settings, hooks, commands, rules, and agents, `docs/adr/`, file deletions, `package.json`, lint and release config, and the product trust-boundary code listed in the table. Paths that are easy to misread as hill or field: `agents/`, `commands/`, `.claude-plugin/`, `.github/actions/`, `.github/CODEOWNERS`, `.github/dependabot.yml`, the `blocked-label-guard.yml`, `release-please*.yml`, and `deploy.yml` workflows, merge, release, and revert scripts such as `scripts/merge-chain.sh` and `scripts/pr-unstall.sh`, `deterministicGate.command` in `skills/`, `src/lib/gate-decision.mjs`, `src/lib/deterministic-*.mjs`, `src/lib/secret-redactor.mjs`, and `runners/github-action/action.yml`.
- **Hill (丘)**: an agent may proceed through PR creation without asking; a human merges. Covers `src/`, `runners/`, `skills/`, `scripts/`, `schemas/`, `docs/`, `assets/`, `README.md`, `README.en.md`, changes to existing tests, and other workflows, except the cliff items in the table.
- **Field (原っぱ)**: allowlist only. Covers `pages/` (except the excluded reference pages), `AGENT_LEARNINGS.md`, newly added files under `tests/`, and a one-line append to `docs/development/worker-discipline-template.md`. Longer appends and edits to existing lines of that template are cliff.
- A PR takes the highest tier among its files, and anything the table does not list is cliff.
- **Never edit by hand**: `package-lock.json`, `LICENSE*`, `CITATION.cff`. All three are cliff in the table. The only lockfile change an agent may make is regenerating it with `npm install --package-lock-only`, as a cliff change. Changes to `LICENSE*` and `CITATION.cff` are made by a human.

## Verification Criteria

Run the applicable checks before handoff. All must pass.

| Changed path                          | Required validation                                                                  |
| ------------------------------------- | ------------------------------------------------------------------------------------ |
| `skills/**/*.md`                      | `npm run skills:validate`                                                            |
| `skills/agent-skills/**`              | `npm run agent-skills:validate`                                                      |
| `skills/**/*.md` (manifest freshness) | `npm run skills:manifest:check` (regenerate with `npm run skills:manifest` if stale) |
| `agents/spec/`, `agents/examples/`    | `npm run agents:validate`                                                            |
| `agents/*.md` (plugin registration)   | `npm run plugin:validate`                                                            |
| `.github/agents/`, `.claude/agents/`  | No dedicated validator; `npm run lint && npm test` only                              |
| `pages/**/*.md`                       | `npm run check:links:local`                                                          |
| `src/` changes that affect skills     | Confirm schema and skill alignment                                                   |
| Any file                              | `npm run lint && npm test`                                                           |

Completion gate: all applicable validations pass. If any fail, fix before handoff.

## Workflow

- Keep each change small and cohesive.
- If `src/` changes, confirm schema and skill alignment first.
- Run the verification criteria above before handoff.
- Prefer existing patterns over new conventions.

## Self-Review Checklist

When adding a rule or convention, or writing a workflow / script / automation, apply [`docs/development/self-review-checklist.md`](docs/development/self-review-checklist.md) before handoff.

## Commit Attribution

AI-authored commits MUST include a `Co-Authored-By:` trailer with the acting model identity.

## Project Conventions

- `README.md` is the Japanese source of truth; `README.en.md` is best effort.
- `skills/` content is the product surface; validate it after edits.
- Record only durable, reusable repo learnings in `AGENT_LEARNINGS.md`.

## Local References

- Core repository architecture: `docs/architecture.md`
- 4-layer agent architecture: `docs/agent-layers.md`
- Development runbook: `docs/runbook/dev.md`
- Skill structure: `skills/README.md`
