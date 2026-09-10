# Merge Chain Runbook

> Procedure form of the `CLAUDE.md` guard "Strict-mode batch merge" and of
> `docs/governance.md` § "マージ前チェックリスト". Those two stay the SSoT for
> the rule and for how a disposition is judged; this file is how
> `scripts/merge-chain.sh` carries them out. Fix this file when the three
> disagree.

## When to use

You hold N independent PRs, `main` is protected with `strict: true`, and every
merge invalidates the other PRs' "up to date with base" status. Done by hand, the loop has five moves. Update every remaining branch to the
same `origin/main`. Wait for CI. Run the merge-time checklist on the first PR.
Merge it. Start over. Measured on 2026-09-05, that loop was run five times in
one session. The same four reads were retyped each round.

`scripts/merge-chain.sh` runs that loop. It does not decide anything the
checklist does not already decide. A PR merges only when every item is clear.
Any item that is not clear stops the chain for a human.

## Usage

```bash
scripts/merge-chain.sh <N> [N ...]             # dry-run: judge, print commands, table
scripts/merge-chain.sh --execute <N> [N ...]   # merge in the given order
REPO=owner/repo scripts/merge-chain.sh 123 124
```

The order of the arguments is the merge order. Plan it first with
`/plan-merge-order` when the PRs touch overlapping files.

## What each step runs

| Step | Command                                                                 | Notes                                                                                                                                                                                                                                                                                         |
| ---- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `gh api --method PUT repos/:owner/:repo/pulls/<N>/update-branch` per PR | All remaining PRs at once, so that every branch lands on the same `origin/main` before any CI round. `422: no new commits` means the head is current and is not an error. A merge-conflict 422 is handed to `scripts/pr-unstall.sh`, which prints the local procedure, and the chain exits 1. |
| 2    | `scripts/wait-pr-ready.sh <all remaining>`                              | Exit 1 (failing check or stalled run) ends the chain with exit 1; exit 2 (timeout) ends it with exit 4; exit 65 (read failed) ends it with exit 2.                                                                                                                                            |
| 3    | disposition of the first PR (below)                                     | Judged against the head that CI just verified.                                                                                                                                                                                                                                                |
| 4    | `gh pr merge <N> --squash --delete-branch --subject "<title> (#N)"`     | The PR title as-is, with the `(#N)` suffix GitHub would add by default. The PR body is not read or altered.                                                                                                                                                                                   |
| 5    | back to step 1 with the remaining PRs                                   |                                                                                                                                                                                                                                                                                               |

`update-branch` answers 202 and pushes its merge commit asynchronously. After
an accepted call the script polls `repos/:owner/:repo/pulls/<N>` until the
head SHA moves. The limit is `UPDATE_BRANCH_WAIT_SECONDS` (default 120; `0`
skips the wait). Without that wait, `wait-pr-ready.sh` would read the old head as
`behind` and treat it as settled. The later `gh pr merge` would then be
refused by strict mode. A head that never moves ends the chain with exit 1.

## Mixed heads: `action_required` beside runs that are still moving

A head can carry `action_required` runs from a bot push together with
`queued` / `in_progress` runs. The moving runs come from a kick or an
`update-branch` that already landed. The two scripts read that head differently on purpose.
`wait-pr-ready.sh` reports any `action_required` run and exits 1: something
on this head is stalled. `pr-unstall.sh` calls a head stalled only when
`action_required` runs exist **and** nothing is still moving. Such a head
cannot advance on its own. While runs are still moving, wait; re-run the chain once
they finish. If only `action_required` remains at that point, run
`scripts/pr-unstall.sh <N>`. Measured on 2026-09-05 against PR #2089 right
after a kick, the head showed both kinds of run. The correct reading was
"not stalled, still moving".

Every `gh` write is preceded by the account guard from `CLAUDE.md`:
`gh api user --jq .login | grep -q s977043 || gh auth switch -u s977043`.

## Disposition items

| Item | Read                                                                         | Clear when                                                |
| ---- | ---------------------------------------------------------------------------- | --------------------------------------------------------- |
| (a)  | `gh api --paginate 'repos/:owner/:repo/pulls/<N>/comments?per_page=100'`     | 0 line comments                                           |
| (b)  | `gh api --paginate 'repos/:owner/:repo/issues/<N>/comments?per_page=100'`    | 0 comments whose author is neither `*[bot]` nor `vercel*` |
| (c)  | `labels` of `repos/:owner/:repo/pulls/<N>`                                   | no `blocked` label                                        |
| (d)  | `gh pr checks <N> --json name,bucket,startedAt` through the governance.md jq | every surviving check in the `pass` bucket                |

Item (d) uses the `group_by(.name) | map(if any(.[]; .bucket == "pending") ...)`
filter copied verbatim from `docs/governance.md` § "1. CI green の確認". An
older `cancel` beside a newer `pass` of the same name is therefore green. A
queued run whose `startedAt` is `0001-01-01T00:00:00Z` is reported as
`pending` rather than hidden. When governance.md changes that filter, change
`failing_required_checks` in the script in the same PR.

Items (a) and (b) are counts, not judgements. One human comment is enough to
stop the chain. The disposition of that comment is recorded by a person per
governance.md (addressed / deferred with an issue / rejected with evidence).
The chain is re-run afterwards.

## Exit codes

| Code | Meaning                                                                                                             |
| ---- | ------------------------------------------------------------------------------------------------------------------- |
| 0    | every PR merged (dry-run: every PR would merge)                                                                     |
| 1    | CI failed, a head is stalled, update-branch hit a merge conflict, or an accepted update-branch never moved the head |
| 2    | a GitHub read failed; nothing was judged, nothing merged (also `gh pr checks` output that is not a JSON array)      |
| 3    | a disposition item stopped the chain; the table names the PR and the item                                           |
| 4    | `wait-pr-ready.sh` timed out (`TIMEOUT_SECONDS`) before CI settled; nothing merged                                  |
| 64   | usage                                                                                                               |

Exit 3 is not a failure. It is the point where the guard says a human decides.

Exit 2 stops the chain before `gh pr merge`, in dry-run and in `--execute`
alike. `judge_pr` runs with `set -e` suspended, because its return value is
captured. Each read inside it therefore propagates its failure with an
explicit `return 2`. Without that, a failed read fell through as an empty
result and the verdict read `merge` (#2102). That was reproduced with a
`--json` field typo through the stub. `tests/scripts-merge-chain.test.mjs`
pins exit 2 and the absence of a `pr merge` call for three cases. They are a
`--json` typo, a non-array `gh pr checks` output, and a failed `gh api` read.

## Dry-run

The default mode reads everything and writes nothing. It judges the disposition
of every PR in one pass, not only the first, since no merge changes the others
yet. It prints the command each step would run. It ends with a table:

```text
pr      state   line_comments   human_comments  blocked non_pass_checks         verdict                                                                         title
#2038   open    2               1               yes     Blocked label guard=fail STOP:line-comments=2 human-comments=1 label=blocked checks=Blocked label guard=fail   fix(security): #2033 redact URL userinfo and password assignments
```

That row was measured on 2026-09-05 against open PR #2038 (`scripts/merge-chain.sh 2038 2086`,
exit 3). PR #2086, already merged, was reported as
`#2086 is already merged; skipped.` first. A dry-run exits 3 when any PR would
stop, so it can gate an `--execute` in a shell chain.

## What has and has not been exercised

The `--execute` write path (`update-branch`, `gh pr merge`) has been run only
against a stubbed `gh` (`tests/scripts-merge-chain.test.mjs`). The stub covers
the accepted / 422-current / 422-conflict answers of `update-branch`. It also
covers a stalled head surfaced by `wait-pr-ready.sh`, a disposition stop, and a
clean merge with the title-derived squash subject. The first real `--execute`
should be a chain of one PR, watched.

## Related

- `scripts/pr-unstall.sh` and `docs/runbook/bot-pushed-head-kick.md` -- the
  stalled-head escape this script defers to.
- `scripts/wait-pr-ready.sh` -- the wait it reuses.
- `.claude/commands/merge-check.md` -- the same checklist for one PR, by hand.
