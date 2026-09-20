# Claude Hooks

## no-force-push.sh

PreToolUse hook (matcher: `Bash`) that blocks destructive git commands.

### Purpose

AGENTS.md § Safety bans commands that rewrite already-pushed branch history
(`git push --force` / `-f` / `--force-with-lease`) or discard work
(`git reset --hard`, `git stash drop`). That ban is prose in four places
(AGENTS.md Safety, CLAUDE.md, `docs/development/worker-discipline-template.md`,
and the commands) and still slipped through once each in #1656 and #1720.
This hook makes it deterministic.

`permissions.deny` was not used: its prefix matching lets
`git push origin branch --force` through, while a hook sees the whole command
string and is argument-order independent.

### What it blocks

| Blocked                                                         | Not blocked                                                                                 |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `git push` with `--force` / `-f` / `--force-with-lease[=<ref>]` | `git fetch --tags --force`, `git fetch -f` (used by `.github/workflows/release-please.yml`) |
| `git reset --hard`                                              | `git tag -f` (tag retarget; out of the AGENTS.md scope)                                     |
| `git stash drop`, `git stash clear`                             | `git clean`, `git checkout -- <path>`, `git restore` (prose discipline only, per #1730)     |

Argument order does not matter: `git push --force origin x` and
`git push origin x --force` are both blocked, as are `git -C /repo push --force`
and compound commands (`… && git push --force …`).

### Scope

This hook only sees an agent's `Bash` tool calls. It never runs on GitHub
Actions, so it does not touch `.github/workflows/release-please.yml`'s
force-update of the moving major tag — AGENTS.md § Safety scopes that
exemption to the workflow, and the same command typed by an agent stays
blocked. That is the SSoT's intent, not a gap.

`--force-if-includes` is not blocked. Per `git help push`, "If the option is
passed without specifying `--force-with-lease` … it is a 'no-op'." It tightens
`--force-with-lease` rather than forcing on its own, and the combination that
does force is caught by the `--force-with-lease` rule.

### How it works

1. Reads the PreToolUse stdin JSON and extracts `.tool_input.command`.
2. Fast-path exit 0 for anything that cannot be a destructive git command.
3. Sanitizes the command string before matching: heredoc bodies are dropped,
   line continuations are joined, and quoted segments are replaced by a space.
   So `grep -rn -- "--force-with-lease" .` and
   `echo "do not use git push --force"` stay allowed — a false positive would
   stall documentation work on this repo. A quoted segment that is itself only
   a force flag (`git push "--force"`) is kept.
4. Matches POSIX ERE patterns scoped to a single command segment
   (`[^;&|]*`), so `git push origin x && git fetch --tags --force` passes.
5. On a match, exits 2 with a stderr message naming the blocked command, the
   non-destructive alternative (`git merge` / `git merge --ff-only` then a
   fast-forward push), the source (AGENTS.md Safety), and the instruction to
   escalate rather than work around the hook.

Ambiguous input is allowed: a false positive stalls all development, a miss
costs one incident.

### Known limitation

Quoted text is treated as data, so an interpreter form such as
`bash -c "git push --force"` is not detected. The hook is defense-in-depth;
AGENTS.md § Safety remains the SSoT for the ban.

### Setup

```bash
chmod +x .claude/hooks/no-force-push.sh
```

### Tests

`tests/no-force-push-hook.test.mjs` spawns the script with real PreToolUse JSON
payloads on stdin and asserts the exit code for every blocked and allowed
command: `npm test -- tests/no-force-push-hook.test.mjs`

## gh-account-guard.sh

PreToolUse hook (matcher: `Bash`) that verifies the active `gh` CLI account
before gh **write** operations.

### Purpose

The local gh keyring holds two accounts (`s977043` for this repo,
`kominem-unilabo` for work) and the active account silently switches
mid-session, causing 404 / permission errors on `gh pr create` / `gh pr merge`
/ `gh api` write calls. This hook makes the prose guard in CLAUDE.md ("Verify
gh active account before write ops") deterministic.

### How it works

1. Reads the PreToolUse stdin JSON and extracts `.tool_input.command`.
2. Non-gh commands and gh read ops exit 0 immediately (no gh call, minimal
   overhead).
3. gh write ops (`gh pr create|merge|edit|close|comment|ready|reopen|review|update-branch`,
   `gh issue <write subcommands>`, `gh api` with `-X`/`--method`
   POST/PATCH/PUT/DELETE or body fields (`-f`/`-F`/`--field`/`--raw-field`/`--input`,
   which default `gh api` to POST), `gh release <write subcommands>`,
   `gh workflow run|enable|disable`, `gh run rerun|cancel|delete`,
   `gh repo <write subcommands>`, `gh label <write subcommands>`,
   `gh secret|variable set|delete`) trigger an account check via
   `gh api user --jq .login`.
4. If the active account is not the expected one, runs
   `gh auth switch -u <expected>` and notifies via stderr, then allows the
   command to proceed (exit 0). If the switch itself fails, exits 2 to block
   the tool call — stderr is fed back to Claude.

Expected account defaults to `s977043`; override with
`GH_ACCOUNT_GUARD_EXPECTED` (used by tests to stay hermetic).

### Setup

```bash
chmod +x .claude/hooks/gh-account-guard.sh
```

### Tests

`tests/gh-account-guard-hook.test.mjs` runs the script with a stubbed `gh` on
PATH (never touches the real keyring): `npm test -- tests/gh-account-guard-hook.test.mjs`

### Hook input contract

PreToolUse passes its input as a stdin JSON payload; the Bash command is
`.tool_input.command`. Exit 0 allows the tool call, exit 2 blocks it and
feeds stderr back to Claude. The hook is defense-in-depth: the session-start
account sanity check in CLAUDE.md remains in place.

## after-change-observe.sh

PostToolUse hook (matcher: `Write|Edit|MultiEdit`) that converts an edit into
the neutral `after-change` event and runs the fast-verification checkpoint in
observe mode (#2275 PR-3C, Epic #2054 Phase 3).

**Off by default.** Without `RIVER_AFTER_CHANGE_OBSERVE=1` the script returns at
its first line: it reads no payload, runs no command and writes no file. A host
that has not opted in — including every host without the plugin — behaves
exactly as it did before this hook existed.

### Why it is separate from format.sh

`format.sh` / `scripts/plugin-format-hook.sh` mutate the working tree and
swallow prettier's exit status, so "the formatter ran" is not a statement about
correctness. This hook is non-mutating and produces evidence. Merging the two
would let a formatter that quietly succeeded read as a check that passed, which
is the false green the checkpoint exists to prevent.

### Host boundary

`PostToolUse`, the tool name and the payload shape appear in the `.sh` and
nowhere else. What it hands to Node is a neutral request (project root, subject
revision, `git diff --name-status` text); `src/lib/after-change-adapter.mjs` and
`src/lib/fast-verification.mjs` are pinned by tests to be free of that
vocabulary.

### Deletions are declared, never inferred

The checkpoint stages the changed files into a clean sandbox and refuses to read
a `pass` whose subject files did not all arrive (#2311). A deleted file cannot
arrive, so the adapter reads the status letters of `git diff --name-status`
(`D`, and the old path of an `R` rename) and declares them as `deletedFiles`.
Without that declaration every change that removes a file would be permanently
`unrunnable` — pinned by `MUTATION (a)` in `tests/after-change-adapter.test.mjs`.

### No authority, no silent success

The hook always exits 0 and never blocks the session; it holds no gate, decision
or merge authority. Every missing prerequisite (node, git, jq, an unreadable
revision) prints a `not run (...)` line instead of exiting quietly, and a run
with no selected check or no trusted allowlist is recorded as `skipped` /
`bypassed` with a reason rather than as a pass.

### Environment

| Variable                      | Meaning                                                                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `RIVER_AFTER_CHANGE_OBSERVE`  | Opt-in. Exactly `1` enables the hook; anything else leaves it off.                                           |
| `RIVER_TRUSTED_TREE`          | Host-trusted base checkout the deterministic allowlist is read from. Absent means every check is `bypassed`. |
| `RIVER_AFTER_CHANGE_SELECTED` | Path to a JSON array of selected skills (`metadata.deterministicGate`). Absent means `skipped`.              |

Evidence is written under `${TMPDIR}/river-review-after-change/`, never into the
project tree.

### Wiring

The hook is not registered in `.claude/settings.json` by this PR. To run it in
this repo, add a `PostToolUse` entry with matcher `Write|Edit|MultiEdit` and
command `bash "$CLAUDE_PROJECT_DIR/.claude/hooks/after-change-observe.sh"`, and
set the opt-in variable.

### Tests

`tests/after-change-adapter.test.mjs` (module, production wiring, mutations) and
`tests/after-change-observe-hook.test.mjs` (the script against a real git repo):
`npm test -- tests/after-change-adapter.test.mjs tests/after-change-observe-hook.test.mjs`

## format.sh

Post-edit hook that runs after Claude writes or edits files.

### Purpose

- Auto-format changed files to reduce diff noise
- Keep formatting consistent without manual intervention

### Setup

```bash
chmod +x .claude/hooks/format.sh
```

### How it works

1. If the PostToolUse stdin JSON provides `.tool_input.file_path` (the single
   file just edited) and `jq` is available, formats only that file.
2. Otherwise falls back to detecting changed files via `git diff`.
3. Filters for supported extensions (js, jsx, ts, tsx, json, md, yml, yaml, mjs)
4. Runs `prettier --write` on the selected file(s)

### Hook input contract

> **PostToolUse passes its input as a stdin JSON payload, not as environment
> variables.** The edited file path is `.tool_input.file_path` in that JSON.
> If you fork or reimplement this hook, read it from stdin (e.g.
> `jq -r '.tool_input.file_path'`) — assuming an env var such as
> `CLAUDE_TOOL_INPUT_FILE_PATH` silently turns the hook into a no-op.

The stdin path is read only when stdin is not a TTY, so running the script
manually in a terminal still works (it skips straight to the `git diff` path).

### Customization

Edit the grep pattern to include/exclude file types as needed.
