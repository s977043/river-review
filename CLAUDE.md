# Claude Code Project Guide (river-review)

> **Repo rules**: Follow all sections in [AGENTS.md](./AGENTS.md), imported below so Claude Code loads it even though this CLAUDE.md exists. This file adds only Claude Code-specific work policy.

@AGENTS.md

<!-- Maintenance: repo-wide rules belong in AGENTS.md.
     Only Claude Code behavior policy belongs here.
     Never restate AGENTS.md content. -->

## Decision Policy

- **Proceed autonomously**: read-only exploration, running commands listed in `.claude/settings.json` allow list, editing paths in AGENTS.md "Editable" scope.
- **Ask before acting**: editing paths in AGENTS.md "Ask before editing" scope, adding dependencies, running commands not in allow list.
- **Always ask**: architectural changes, modifying AGENTS.md or CLAUDE.md, any destructive git operation, changes touching `src/` that may break skill or schema alignment.
  - **承認済みの実行計画は個別確認を覆う。** ユーザーが計画を承認したら、その計画に含まれる `src/` の編集を 1 件ずつ確認し直さない。計画外の `src/` 編集、計画からの逸脱、計画の途中で見つかった別件は従来どおり確認する。この但し書きが無いと、承認済みの計画でも各ステップの着手前に停止してしまう（2026-09-09 の `parseArgs` 分割で 1 回発生）。

## Change Policy

- One logical change per branch. Do not bundle unrelated fixes.
- Minimal diff — do not refactor, reformat, or annotate code outside the task scope.
- Do not add features, patterns, or dependencies not explicitly requested.
- If a task seems too large for one session, propose a plan and get approval first.

## Reporting

After completing a task, state concisely:

1. What changed (files and purpose).
2. What was verified (commands run and results).
3. What needs human review (assumptions, edge cases, "ask before" paths touched).

If a check fails, show the failure output and proposed fix before applying.

## AI Misoperation Guards

> The ledger `docs/development/guard-ledger.yaml` is the SSoT for this list under its `guards:` key — it records each guard's mechanization level, `verifiedBy` paths, and `reviewAfter` date, and the required check `Meta consistency` fails when the two drift. Add, rename, or remove a guard in the ledger and here in the same PR; retire per `docs/development/improvement-flow.md` Step 9. The same file also tracks timed decisions that are not guards under `decisions:` (deprecated assets, workflows under observation, temporary exclusions) — those have no bullet here, and `Meta consistency` checks only that each `target:` path still exists (#1843).

- **Read before referencing**: Do not cite file contents, function names, or line numbers without first reading the file.
- **Run before claiming**: Do not assert that tests pass or lint succeeds without running the command and showing output.
- **No silent skips**: If a required validation fails, report it — do not silently omit it from the report.
- **Search before inventing**: When uncertain about a convention, search `skills/`, `docs/`, and existing code before creating a new pattern.
- **Diff only what exists**: In reviews, do not comment on code that is not in the diff.
- **Research before proposing**: Do not create GitHub issues without first confirming the feature is not already implemented. See `/propose-issue`. This guard decides whether the issue should exist at all; **Fact-check what you author** covers whether its body is accurate.
- **Propagate signatures**: When adding parameters to pipeline functions (`generateReview`, `verifyFinding`, `buildExecutionPlan`), consult `docs/development/pipeline-params-checklist.md` to avoid call-site gaps.
- **Plan merge order**: When creating multiple PRs that touch overlapping files, run `/plan-merge-order` before merging to minimize rebase cost.
- **Commit before branch switches**: Before `git checkout`/`git switch` with uncommitted work, create a throwaway safety commit on a new branch: `git switch -c wip/<topic> && git add -A && git commit -m "wip" --no-verify`. Stash-then-switch chains have lost work when combined with the lint-staged auto-stash. Before creating that commit in a worktree you did not open yourself, check `ListAgents` for a live parallel session: uncommitted work under `.claude/worktrees/` or `/tmp` is more often a peer session mid-edit than a dead worker's remains, and a rescue commit on someone else's in-flight branch is an unrequested write to their work (2026-09-03, `/private/tmp/wt-1978` was committed as abandoned while its owning session was still editing it). Does not authorize `git stash drop`, `git reset --hard`, or `git push --force` — those remain prohibited per AGENTS.md Safety.
- **Verify git output before chaining**: Extends **Run before claiming**. After `git commit`, `git push`, `git switch`, and `gh pr merge`, read the branch name, commit hash, and status line in the output and confirm they match the intended target before running the next command. Verify with `git status -sb` or `git rev-parse --abbrev-ref HEAD` if the output is ambiguous. The same rule applies to the ref you are about to measure: `git worktree add <path> <branch>` and `git switch <branch>` resolve a **local** branch that may lag its remote, so confirm `git rev-parse <branch>` equals `git rev-parse origin/<branch>` before you verify anything against it. Verifying a stale local ref and reporting the result as fact has produced a public claim that a merged fix "does not exist" (2026-09-03, a worker's pushed commit read as absent because the local branch was 1 commit behind origin).
- **Verify gh active account before write ops**: The active `gh` account can silently switch from `s977043` (this repo) to `kominem-unilabo` (work). Before every `gh` write op, run `gh api user --jq .login | grep -q s977043 || gh auth switch -u s977043`. Treat a 404 / `Could not resolve to a Repository` / permission error on any `gh` call — **reads included** — as an account switch first, never as "the repo/PR does not exist": re-run the guard command, then retry. `.claude/hooks/gh-account-guard.sh` checks write ops only, so keep the session-start account check. History: `docs/development/guard-details.md`.
- **Merge-time checks**: Before `gh pr merge`, work through `docs/governance.md` § "PR レビューとマージ" > "マージ前チェックリスト" (the SSoT for how to judge each item): CI green (`gh pr checks`), comment disposition from **both** the `pulls/<N>/comments` and `issues/<N>/comments` endpoints, blocking labels (`gh pr view <N> --json labels`; `blocked` stops the merge), `/preflight` for multi-PR / workflow-pin work, and `.nvmrc`-matched `npm run build:action` when touching `runners/github-action/src/**`. See also `skills/midstream/gh-address-comments/SKILL.md` and `docs/development/dist-check-rebuild-guide.md`.
- **Strict-mode batch merge**: With `strict: true` protection (`gh api repos/OWNER/REPO/branches/main/protection --jq .required_status_checks.strict`), update ALL remaining branches to the same `origin/main` SHA at once (`gh api --method PUT repos/OWNER/REPO/pulls/<N>/update-branch`) before the chain, then merge one-by-one as each CI passes. On a lock-file-only 422: check the branch out, `git merge origin/main`, `npm install --package-lock-only`, commit, and fast-forward `git push`. Never rebase, force-push, or open a replacement PR. Rationale: `docs/development/guard-details.md`.
- **Dep bump peerDeps check**: After editing `package.json` to bump a package version, run `npm install --dry-run` (or `npm ls --depth=1` post-install) to surface newly required peer deps, including transitive ones that `npm info peerDependencies` misses. Add missing peers to `package.json` in the same commit to avoid build failures on first CI run.
- **Review-doc SSoT sync**: `docs/review/viewpoints.md` and `docs/review/output-format.md` declare `pages/reference/review-policy.md` (ja+en) as their 出典/source. When changing review criteria, output sections, or severity vocabulary in the derived docs, update `review-policy.md` (both languages) in the same PR — otherwise the derived docs drift from the SSoT (#1196/#1197).
- **Verify agent completion reports**: Report quality is NOT evidence of execution — background agents have fabricated entire completion reports. Before accepting delegated work as done, verify from the parent side: `git ls-remote --exit-code --heads origin refs/heads/<branch>` (plain `ls-remote` exits 0 on a missing ref), `gh pr view <N> --json url`, `git log`/`git status` in the agent worktree, and `ls` the key new files. On a fabrication send ONE corrective re-instruction; if it recurs, take over inline or spawn a fresh agent. Re-derive a read-only agent's conclusions and aggregate figures from a primary source before acting on or quoting them. Checklist: `/verify-agent-report`; history: `docs/development/guard-details.md`.
- **`N of N required checks are expected` = bot/GITHUB_TOKEN push**: 必須チェックが全て緑なのに `gh pr merge` が `N of N required status checks are expected`（`BLOCKED`）で拒否するときは、bot が `GITHUB_TOKEN` で head を push したことを疑う（release-please と `Auto Rebuild Action Dist`。dependabot PR でも起きる）。判定は **head を押したアカウント**で行い、**PR が open のうちに診断する**。脱出は force-push ではなく**自分のアカウントから**の push で CI を発火させることで、`--admin` では迂回できない。診断コマンド・脱出手順・注意点は `docs/runbook/bot-pushed-head-kick.md` が SSoT。
- **Prefix skill invocations**: When river-review skills/commands run alongside other plugins (growth-core etc.), invoke them with the namespace prefix — `river-review:review-team`, not bare `review-team`. Bare names collide with same-named skills (growth-core's `review-team`, or a stale cached version) and have misresolved before (2026-07-09 cache cross-wiring). If a misresolution looks cache-driven (an old plugin version resolving instead of the latest), purge per `docs/runbook/plugin-cache-purge.md`.
- **Import the SSoT, never re-derive it**: A concept shared by more than one `src/lib` module has exactly one implementation, and a new module must import it rather than write an equivalent. Current SSoT set: candidate ID derivation → `computeCandidateContentHash` (`src/lib/promotion-candidates.mjs`; `computeCandidateId` in `src/lib/shadow-aggregate.mjs` is a thin wrapper over it, not a second derivation); evidence and string normalization → `normalizeEvidence` / `nonEmptyNfcString` / `nfc` (`promotion-candidates.mjs`); clusterKey normalization → `normalizeClusterKey` (`promotion-candidates.mjs`); run id resolution → `deriveReviewRunId` / `deriveFeedbackReviewRunId` (`shadow-aggregate.mjs`). Delegated workers fail this reliably, even after reading the neighbouring module. A test must cross-check the **existing production path**, not the new code path: assert the new module's ID equals the one `buildProposedCandidate` produces for the same evidence. History: `docs/development/guard-details.md`.
- **Fact-check what you author**: Extends **Verify agent completion reports** outbound: issue bodies and worker instructions you write as organizer or main agent are review targets too. Before publishing, re-derive every number, quotation, and premise from a primary source (the real file, API response, or original article — never memory or an earlier summary); quote values you just measured. For a same/different premise, read both definitions and confirm they share a namespace and a unit. When an instruction adds an exclusion or condition, name the failure case that must stay blocked and confirm it still is. Treat a worker's report of a self-contradictory instruction or disagreeing data as a signal to re-verify, not to restate. Cite the source inline (`file:line`, command, or URL). `/propose-issue` carries the issue-body version.
- **Execute what you document**: Extends **Run before claiming** to the procedures you publish. Run every procedure, command, and workaround once before it ships, from its reader's state, and confirm it reaches the promised end state; a workaround must clear every gate, not move the failure to another required check. Reproduce any repository state the procedure depends on (upstream, worktree, branch protection) first. If running it for real is destructive or irreversible, use a sandbox repo or disposable target and state which steps were and were not exercised — never run a destructive command on the live repository for this guard.
- **Check what the previous change pinned**: Run `git log --follow -8 --format='%ci %h %s' -- <path>` before editing a file or CI job. If 2 or more of those 8 commits changed how the file interprets its inputs, treat the tests as silent about every form not already pinned: confirm the form you are changing has a row on the side matching its expected exit status (`VALID_CASES` must keep succeeding, `CASES` must keep failing) and add the missing row before the change. For `src/cli.mjs` the pinned set is `tests/cli-usage-error-exit-codes.test.mjs`; its header comment (`:75-85`) is the SSoT for pin scope and requires updating `EXPECTED_CONTRACT_COUNTS` with any expectation change. History: `docs/development/guard-details.md`.

- **An input shape is not a safety argument**: Never conclude that a defect is out of scope because "real git does not emit that shape", and never treat the size of a regression sweep as evidence of coverage. Before writing that a shape is unreachable, name the code path that would produce it and grep for callers — one path is enough to refute it. Before writing that a shape is harmless, state which shapes the measured population actually contained; a count is not a band list. Known diff-parsing bands: git default / git `--unified=0` / git `--cc` / non-git (`diff -u -r`) / hand-written with declared-vs-actual mismatch — treat the list as incomplete and say which bands you covered. History: `docs/development/guard-details.md`.

## Improvement Flow

When a retrospective identifies a recurring mistake or missing guardrail, follow the codification process in `docs/development/improvement-flow.md` (retrospect → classify → draft → self-review → multi-agent review → PR → save memory). The resulting guards are tracked in `docs/development/guard-ledger.yaml`; their origins are in `docs/development/guard-details.md`.

## Tooling

| Component         | Location                                               | Behavior                                                                                                                                                                                    |
| ----------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Permissions       | `.claude/settings.json`                                | Defines allow/ask/deny command lists                                                                                                                                                        |
| Rules             | `.claude/rules/`                                       | Loaded every session unless scoped with `paths:` frontmatter (`globs:` is ignored). `review-core.md` is intentionally unscoped; see `.claude/rules-README.md`                               |
| Hooks             | `.claude/hooks/` ([README](./.claude/hooks/README.md)) | 3 hooks: `no-force-push.sh` and `gh-account-guard.sh` (PreToolUse, matcher `Bash`); `format.sh` (PostToolUse — prettier on `.tool_input.file_path`, falling back to `git diff` when absent) |
| Sub-agent         | `agents/river-review.md`                               | Distributed plugin agent (top-level per #996); Read, Grep, Glob, Bash                                                                                                                       |
| Worker discipline | `docs/development/worker-discipline-template.md`       | Copy-paste discipline block for delegated worker prompts                                                                                                                                    |

## Custom Commands

| Command                  | Purpose                                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------- |
| `/check`                 | Run quality checks (lint + test)                                                                        |
| `/pr`                    | Draft PR description                                                                                    |
| `/skill`                 | Find or create skill definition                                                                         |
| `/review-local`          | Self-review current diff                                                                                |
| `/challenge`             | Adversarial review (pre-mortem, war game)                                                               |
| `/review-team`           | Parallel multi-role review with consensusLevel and Tech Lead report                                     |
| `/setup-team`            | Set up River Review in a project (`.river/rules.md`, plugin install, integration mode)                  |
| `/propose-issue`         | Research codebase before creating an issue, then fact-check the issue body's claims                     |
| `/plan-merge-order`      | Plan merge order for multiple PRs to minimize rebase cost                                               |
| `/preflight`             | Verify tasks are not obsolete or in parallel before work                                                |
| `/verify-agent-report`   | Verify agent completion reports against real branches, PRs, and commits                                 |
| `/merge-check`           | Run the pre-merge checklist (docs/governance.md) against a PR number                                    |
| `/register-plugin-asset` | Register a new distributed command/agent/agent-skill into the plugin manifests and validate             |
| `/release-kick`          | Drive a release-please PR from BLOCKED unblock through merge and release verification                   |
| `/range-review`          | Review a git range with 3 parallel read-only perspectives, reproduce findings, and propose dispositions |

Details: distributed commands (`/check` `/pr` `/skill` `/review-local` `/challenge` `/review-team` `/setup-team`) live in top-level `commands/` (plugin surface, per #996); repo-dev commands (`/propose-issue` `/plan-merge-order` `/preflight` `/verify-agent-report` `/merge-check` `/register-plugin-asset` `/release-kick` `/range-review`) stay in `.claude/commands/`.

> Note: the distributed commands resolve only when river-review is **installed as a plugin**. When working inside this repo directly, Claude Code auto-discovers project commands from `.claude/commands/` only — so the seven distributed commands are not available as in-repo slash commands (the repo-dev commands are).
