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
| `docs/`                  | Internal notes and runbooks; ask before editing      |
| `runners/github-action/` | GitHub Action runner implementation                  |
| `runners/node-api/`      | Separate TypeScript package (built with `tsc`)       |
| `schemas/`               | JSON schemas for skills, output, and riverbed        |
| `scripts/`               | Validation, evaluation, and build scripts            |

## Package Manager

Use **npm**.

| Task                    | Command                                                           |
| ----------------------- | ----------------------------------------------------------------- |
| Install                 | `npm install` or `npm ci`                                         |
| Lint                    | `npm run lint`                                                    |
| Test                    | `npm test`                                                        |
| Skills validation       | `npm run skills:validate`                                         |
| Agent skills validation | `npm run agent-skills:validate`                                   |
| Agent definitions       | `npm run agents:validate`                                         |
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

- **Editable**: `pages/`, `skills/`, `schemas/`, `scripts/`, `tests/`, `.github/`, `.claude/`, `AGENT_LEARNINGS.md`
- **Ask before editing**: `docs/`, `assets/`, `src/`, `runners/`, `README.md`, `README.en.md`, `AGENTS.md`
  - 例外: `docs/development/worker-discipline-template.md` への**規律 1 行の追記**は事前確認を要しない。`/orchestrate` の Step 4 が「観測した失敗をその場で定型側へ移す」ことを求めており、確認を挟むと還流が次セッションへ持ち越されて失敗が繰り返される。**追記のみが対象で、既存行の書き換え・削除・節の再構成は従来どおり事前確認が要る。**
- **Never edit**: `package-lock.json`, `LICENSE*`, `CITATION.cff`

## Verification Criteria

Run the applicable checks before handoff. All must pass.

| Changed path                           | Required validation                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------------------ |
| `skills/**/*.md`                       | `npm run skills:validate`                                                            |
| `skills/agent-skills/**`               | `npm run agent-skills:validate`                                                      |
| `skills/**/*.md` (manifest freshness)  | `npm run skills:manifest:check` (regenerate with `npm run skills:manifest` if stale) |
| `.github/agents/` or `.claude/agents/` | `npm run agents:validate`                                                            |
| `pages/**/*.md`                        | `npm run check:links:local`                                                          |
| `src/` changes that affect skills      | Confirm schema and skill alignment                                                   |
| Any file                               | `npm run lint && npm test`                                                           |

Completion gate: all applicable validations pass. If any fail, fix before handoff.

## Workflow

- Keep each change small and cohesive.
- If `src/` changes, confirm schema and skill alignment first.
- Run the verification criteria above before handoff.
- Prefer existing patterns over new conventions.

## Self-Review Checklist

Apply before handoff. Derived from retrospectives where defects shipped and were caught only by multi-perspective review (see `docs/development/retrospectives/2026-05-21-25.md`).

### Codify-then-validate (when adding a rule or convention)

Before merging a new rule (Stop conditions, severity policy, naming convention, etc.), answer:

1. What 3 concrete scenarios would make this rule fail or be misapplied?
2. What is the reopen / exception condition? (e.g. for a Stop rule: how does it lift?)
3. What is the soft-violation gray zone? (e.g. "status report during Stop"—is it allowed?)

If any answer is "I don't know," defer the rule until the gap is filled. Codify-without-validate produced a same-session defect in #898 → #902.

### Code-gen review (when writing a workflow / script / automation)

Before merging GitHub Actions workflows, shell scripts, or any CI automation, verify:

1. Concurrency: can two simultaneous invocations race on shared state (refs, locks, deploys)? Add a `concurrency:` group if yes.
2. Default coupling: do hard-coded defaults (branch names, package names, paths) silently break when an upstream config changes? Prefer auto-detection or fail-loud over silent fallback.
3. Failure mode: what happens on partial failure (network error mid-PATCH, exit code 0 but nothing changed)? Is the error surfaced or swallowed?

These were the convergent gaps in `.github/workflows/release-please-kick.yml` and `scripts/release-please-kick.sh` at first delivery, fixed in #902.

## Commit Attribution

AI-authored commits MUST include a `Co-Authored-By:` trailer with the acting model identity.

## Project Conventions

- `README.md` is the Japanese source of truth; `README.en.md` is best effort.
- `skills/` content is the product surface; validate it after edits.
- Record only durable, reusable repo learnings in `AGENT_LEARNINGS.md`.
- Use English or Japanese skill searches when locating repo conventions.

## Local References

- Core repository architecture: `docs/architecture.md`
- 4-layer agent architecture: `docs/agent-layers.md`
- Development runbook: `docs/runbook/dev.md`
- Skill structure: `skills/README.md`
