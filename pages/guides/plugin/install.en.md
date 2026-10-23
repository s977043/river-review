# Install the plugin

River Review is distributed as a plugin for Claude Code and Codex. This page is the canonical source for installation. Other pages show only the shortest commands and link here.

For normal plugin use, **no River Review-specific LLM API key is required**. The agent's own model applies the skills.

## Claude Code

### 1. Add the marketplace

```text
/plugin marketplace add s977043/river-review
```

The marketplace name is `river-review-marketplace` (the `name` in `.claude-plugin/marketplace.json`).

### 2. Install the plugin

```text
/plugin install river-review@river-review-marketplace
/reload-plugins
```

To install from a terminal, use the `claude plugin` subcommands.

```bash
claude plugin marketplace add s977043/river-review
claude plugin install river-review@river-review-marketplace
```

The default scope of `claude plugin install` is `user`. To install into another scope, check `claude plugin install --help`.

### 3. Check that it works

```text
/river-review:review-local
```

Commands are namespaced as `/river-review:<name>`. For the full list, see [Commands, agents, and skills](/guides/plugin/commands-and-skills.en).

## Codex

### 1. Add the marketplace

```bash
codex plugin marketplace add s977043/river-review
```

### 2. Add the plugin

`codex plugin add` takes a `PLUGIN@MARKETPLACE` argument (`codex plugin add --help`). Check the marketplace name with `codex plugin marketplace list`.

```bash
codex plugin marketplace list
codex plugin add river-review@<marketplace-name>
```

### What Codex can use

`.codex-plugin/plugin.json` declares only `skills` (`./skills/agent-skills/`) and `interface` metadata. It does not declare `commands` or `agents`. What Codex can use is the bundled skills; slash commands such as `/river-review:review-local` and the `river-review` sub-agent are not part of its distribution manifest.

For the manual fallback without the marketplace (such as `scripts/setup-codex.sh`), see [Agent workflow](/guides/agent-workflow.en#codex-cli).

## Pin a version

For a reproducible installation, pin the release tag available at the time. Releases are listed on [GitHub Releases](https://github.com/s977043/river-review/releases).

## Next

- [First review](/guides/quickstart.en)
- [Prepare for team use](/guides/plugin/team-setup.en)
- [Update, disable, and uninstall](/guides/plugin/update-and-uninstall.en)
- [Troubleshooting](/guides/troubleshooting.en#plugin)
