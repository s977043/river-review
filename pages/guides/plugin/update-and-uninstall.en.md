# Update, disable, and uninstall

The command forms on this page were checked against the `--help` output of Claude Code 2.1.309 and codex-cli 0.160.1.

## Claude Code

| Action                 | Command                                                         |
| ---------------------- | --------------------------------------------------------------- |
| Update the marketplace | `claude plugin marketplace update river-review-marketplace`     |
| Update the plugin      | `claude plugin update river-review@river-review-marketplace`    |
| Disable                | `claude plugin disable river-review@river-review-marketplace`   |
| Re-enable              | `claude plugin enable river-review@river-review-marketplace`    |
| Uninstall              | `claude plugin uninstall river-review@river-review-marketplace` |
| List installed plugins | `claude plugin list`                                            |

- `claude plugin update` requires a restart to apply (per its `--help` text).
- The default scope of `uninstall` is `user`. If you installed into another scope, pass `-s, --scope`. `--keep-data` keeps `~/.claude/plugins/data/{id}/`.
- Inside a session you can also disable it with `/plugin disable river-review@river-review-marketplace` ([Stable interfaces](../../reference/stable-interfaces.en.md)).

## Codex

| Action                 | Command                                               |
| ---------------------- | ----------------------------------------------------- |
| Update the marketplace | `codex plugin marketplace upgrade [MARKETPLACE_NAME]` |
| Uninstall              | `codex plugin remove river-review@<marketplace-name>` |
| Remove the marketplace | `codex plugin marketplace remove <name>`              |

Omitting `MARKETPLACE_NAME` from `codex plugin marketplace upgrade` upgrades all configured Git marketplaces (per its `--help` text).

`codex plugin --help` has no disable subcommand.

## Hooks rewrite the working tree

The Claude Code plugin distributes two hooks in `hooks/hooks.json`.

### PostToolUse (auto-format)

After Write / Edit / MultiEdit, `scripts/plugin-format-hook.sh` runs and **formats changed files in place (`--write`) with the adopting project's prettier**. Files in your working tree are rewritten.

- Target extensions: `js` `jsx` `ts` `tsx` `cjs` `mjs` `json` `md` `yml` `yaml`.
- If the edited file's path is available from the hook input, only that file is formatted. Otherwise, all changed files from `git diff --name-only HEAD` are formatted.
- It uses only the prettier already in the project (`npx --no-install`) and installs nothing. If prettier, npx, or git is missing, it exits without doing anything.
- If the project has `.claude/hooks/format.sh`, it defers to that and does nothing.
- prettier's exit status is ignored. The hook having run is not evidence that any check passed.

### Stop (task checkpoint)

`scripts/plugin-task-checkpoint-hook.sh` writes a Review Artifact to `$TMPDIR/river-review-task-checkpoint/`. It does not write to the working tree. Set `RIVER_TASK_CHECKPOINT_HOOK=0` to stop it.

See [Stable interfaces](../../reference/stable-interfaces.en.md) for details.

### Stopping the hooks

The distribution has no setting that stops only the PostToolUse hook. To avoid formatting, disable the plugin.

## Related pages

- [Install the plugin](./install.en.md)
- [Troubleshooting](../troubleshooting.en.md#plugin)
