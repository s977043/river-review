# Troubleshooting

Common symptoms and checkpoints for isolation.

Related: `pages/guides/faq.en.md` (List of common failures)

## Plugin {#plugin}

### Commands or skills do not appear

1. Right after installing, run `/reload-plugins`.
2. Commands are namespaced. Type `/river-review:review-local`, not `/review-local`.
3. Run `claude plugin list` to confirm `river-review` is installed. If it is disabled, enable it with `claude plugin enable river-review@river-review-marketplace`.
4. The Codex distribution manifest (`.codex-plugin/plugin.json`) declares `skills` and does not declare `commands`, so slash commands are not part of what is distributed to Codex. See [Commands, agents, and skills](./plugin/commands-and-skills.en.md).

### The installed version is old

Update the marketplace with `claude plugin marketplace update river-review-marketplace`, then run `claude plugin update river-review@river-review-marketplace`. A restart is required for the update to take effect. Check the latest version on [GitHub Releases](https://github.com/s977043/river-review/releases/latest).

### Edited files get reformatted

The PostToolUse hook formats changed files with the project's prettier. For the behavior and how to stop it, see [Update, disable, and uninstall](./plugin/update-and-uninstall.en.md).

## CLI (`river run`)

### First Step (Pre-diagnosis)

If isolation is difficult, run `river doctor .` first to check for "missing config" or "diff failure".

### OpenAI API key not found

- Symptom (Example):
  - `LLM: OPENAI_API_KEY (or RIVER_OPENAI_API_KEY) not set`
  - `River Review doctor` shows `OpenAI (review): not set`
- Action:
  - Set `OPENAI_API_KEY` or `RIVER_OPENAI_API_KEY` in environment variables.
  - Use `--dry-run` to avoid external requests.

### Not recognized as Git repository

- Symptom: `Not a git repository: ...`
- Action:
  - Run in a directory under Git control.
  - `git init` / `git clone ...` if needed.

### Skill definition load/validate failed

- Symptom: `Skill configuration error: ...`
- Action:
  - Run `npm run skills:validate` to check error details.
  - Refer to `pages/reference/skill-schema-reference.en.md` for schema details.

### Cannot read rules (`.river/rules.md`)

- Symptom: Rules file read error.
- Action:
  - Check existence and read permissions of `.river/rules.md` (delete if unneeded).

### Don't know what was skipped

- Action:
  - Run `river run . --debug` and check output for selected skills and skip reasons.

### File not detected in local run

- Action:
  - Check diff with `git status` or `git diff`.
  - Check target file/hunk preview with `river run . --debug`.

### Rate Limit Error

- Action:
  - Check if OpenAI rate limit is reached.
  - Wait a while and retry.
  - Use `--dry-run` to check prompt/skill selection only if needed.

## GitHub Actions

### Review not running / Permission error

- `permissions` might be insufficient (e.g., `pull-requests: write`).
- Check if Secrets like `OPENAI_API_KEY` are correctly set.

### Diff not detected

- Recommend `fetch-depth: 0` in `actions/checkout` (to stably retrieve merge-base).
