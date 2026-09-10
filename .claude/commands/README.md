# .claude/commands/ (repo-dev commands)

Repo-development slash commands (NOT part of the distributed plugin surface).

| Command                  | File                       | Purpose                                                                                                 |
| ------------------------ | -------------------------- | ------------------------------------------------------------------------------------------------------- |
| `/propose-issue`         | `propose-issue.md`         | Research codebase before creating an issue, then fact-check the issue body's claims                     |
| `/plan-merge-order`      | `plan-merge-order.md`      | Plan merge order for multiple PRs to minimize rebase cost                                               |
| `/preflight`             | `preflight.md`             | Verify tasks are not obsolete or in parallel before work                                                |
| `/verify-agent-report`   | `verify-agent-report.md`   | Verify agent completion reports against real branches, PRs, and commits                                 |
| `/merge-check`           | `merge-check.md`           | Run the pre-merge checklist (docs/governance.md) against a PR number                                    |
| `/register-plugin-asset` | `register-plugin-asset.md` | Register a new distributed command/agent/agent-skill into the plugin manifests and validate             |
| `/release-kick`          | `release-kick.md`          | Drive a release-please PR from BLOCKED unblock through merge and release verification                   |
| `/range-review`          | `range-review.md`          | Review a git range with 3 parallel read-only perspectives, reproduce findings, and propose dispositions |

> **配布対象のコマンド**は #996 で top-level [`commands/`](../../commands/) へ分離し、`.claude-plugin/plugin.json` がそこを参照します。一覧は [`docs/development/distributed-commands.md`](../../docs/development/distributed-commands.md) が正で、本ディレクトリには repo-dev 専用コマンドのみが残ります。
>
> **整合性**: コマンド追加時は配布対象か repo-dev かを判断して正しい場所に置き、CLAUDE.md の `Custom Commands` 表を更新すること。配布対象コマンドの場合はさらに `.claude-plugin/plugin.json` の `commands` にも追加する必要があります。上の表と `.claude/commands/*.md` の一致は `npm run check:doc-enum`（`meta:validate` 経由で CI 必須チェック）が機械検証します。
