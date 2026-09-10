# Bot-Pushed Head Kick Runbook

> Procedure form of the `CLAUDE.md` guard
> "`N of N required checks are expected` = bot/GITHUB_TOKEN push". That guard
> stays the SSoT for the cause and the decision rules; this file is how to carry
> them out. Fix this file when the two disagree.

## When to use

A pull request is BLOCKED on `N of N required status checks are expected` even
though nothing is red, because a **bot pushed its current head**. GitHub's
no-recursion safety leaves that head's workflows `action_required` forever, so
the required contexts never report.

This is not release-please-specific. What stalls a head is which account pushed
it, not which bot opened the PR. Two pushers do it on this repository:

- `release-please`, on the release PR it opens itself.
- `Auto Rebuild Action Dist`, which rebuilds `runners/github-action/dist/**` and
  pushes onto **any** PR that touches the action source, including ordinary
  feature PRs and dependabot PRs.

If the PR is an ordinary feature PR, this runbook still applies. Measured on
2026-09-03, PR #2021 was a feature PR
(`feat(critic): #1978 ...`), and `gh api repos/:owner/:repo/pulls/2021/commits`
shows two `github-actions[bot]` commits titled `chore(action): rebuild
github-action dist` (`619879cc`, `5da59df3`), each immediately followed by a
`chore: trigger CI on release-please branch` commit authored by `mine_take` --
that is the kick below, applied twice on one PR.

Sections below that name `release-please` explicitly apply to the release PR
only; everything else applies to any bot-pushed head.

## Before you start: confirm the procedure is current

This runbook and `.claude/commands/release-kick.md` are revised often. A local
`main` that trails `origin` silently hands you a pre-revision copy. Check the
freshness of the procedure itself before any diagnosis below. Fetch `origin`,
diff both files against `origin/main`, and re-read them if either differs.
Step 0 of `.claude/commands/release-kick.md` holds the executable form.

Observed in the v1.67.1 run: the local checkout was 24 commits behind. The
pre-#1702 revision of the procedure was therefore the one actually read, even
though #1702 had merged 16 minutes before the kick.

## Step 1: confirm the symptom

Read the workflow runs of the head SHA. Do not decide from `gh pr view` alone:
its `statusCheckRollup` reports only the checks that actually produced check
runs, which for a stalled head is close to nothing.

```bash
gh pr view <N> --json headRefOid --jq .headRefOid
gh api "repos/:owner/:repo/actions/runs?head_sha=<full-40-char-sha>&per_page=100" \
  --jq '.total_count, (.workflow_runs[] | "\(.name)\t\(.status)\t\(.conclusion)")'
```

Measured on 2026-09-03 against open PR #2023 (head
`c3651b859bd77d9ed500ffaced45a174713fab5f`), the runs endpoint returned
`total_count: 13` with every run `completed` / `action_required`: HOL Plugin
Scanner, Validate Agent Specs, CodeQL, Link Check, CI, PlanGate Review (PR),
River Review, Blocked Label Guard, Doc Quality, Auto Rebuild Action Dist,
Diátaxis Docs Check, Build Docusaurus Site, Prose Lint. The same head read
through `gh pr view 2023 --json statusCheckRollup` listed two entries only,
`Vercel` and `Vercel Preview Comments`, both green -- which is why the rollout
view alone cannot diagnose this. `mergeStateStatus` was `BLOCKED`.

`scripts/wait-pr-ready.sh <N>` performs both reads for one or more PRs and
prints a `stalled_runs` column, so it can stand in for this step.

## One command for Steps 1 to 3: `scripts/pr-unstall.sh`

`scripts/pr-unstall.sh <N>` runs Steps 1 to 3 below as one decision. It is a
mechanisation of this runbook, not a replacement: the reads, the routing rule,
and the escape are the ones written out in those steps, and the script quotes
this file when it stops. Read the steps once so that the script's output makes
sense; run the script so that the six-times-a-session judgement is not retyped.

```bash
scripts/pr-unstall.sh <N>             # dry-run: judge, print the next command
scripts/pr-unstall.sh --execute <N>   # run the escape (update-branch or kick)
```

What it does, in the order of this runbook:

| Runbook step | Script behaviour                                                                                                                                                                                                                                                                                                                 |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Step 1       | Reads the head from `repos/:owner/:repo/pulls/<N>` (full 40-char SHA) and its `actions/runs?head_sha=`. One or more `action_required` runs with nothing still `queued` / `in_progress` is `stalled`; a head whose runs are still moving is not; zero runs is `no-runs`, never a verdict.                                         |
| Step 2       | A `release-please--*` head takes the kick route; any other head takes `PUT .../pulls/<N>/update-branch`, which pushes a merge commit as your own account.                                                                                                                                                                        |
| Step 3       | `--execute` runs the account guard (`gh api user`, `gh auth switch -u s977043`), then `scripts/release-please-kick.sh <branch>` or the `update-branch` call.                                                                                                                                                                     |
| 422          | Prints the manual procedure and exits 1. A merge conflict gets the local `git merge origin/main` steps (regenerate `runners/github-action/dist/**` with `npm run build:action` when that is the only conflict); `no new commits` gets the kick command. Neither is run: both touch a working tree or need a human on the branch. |

Exit codes: `0` not stalled, already merged, or the escape ran; `1` stalled but
not resolvable from here (the procedure was printed); `2` a GitHub read failed,
so no verdict; `64` usage. Exit 2 exists so a failed read is never reported as
"not stalled".

Measured on 2026-09-05 against open PR #2038 (head `e1cb880e`, 12 runs, one of
them `Blocked Label Guard` / `failure`): the script printed
`#2038 is not stalled: no action_required run of e1cb880e6c27b8ec61127af899cccfb7fef7cf9a, or a run is still moving.` and exited 0.
Against merged PR #2086 it printed `#2086 is already merged; nothing to
unstall.` and exited 0 without reading the runs. The `--execute` paths were
exercised only against a stubbed `gh` (`tests/scripts-pr-unstall.test.mjs`);
no stalled head existed on the repository at the time of writing.

`scripts/merge-chain.sh` calls this script when `update-branch` returns a
merge-conflict 422 during a batch merge; see `docs/runbook/merge-chain.md`.

## Step 2: diagnose BEHIND vs pure BLOCKED

A PR can be behind `main` and BLOCKED at the same time, and which one it is
decides whether the kick is needed at all. `mergeable_state` holds a single
value, so it cannot tell the two apart. Compare the branches instead:

```bash
releaseBranch=$(gh pr view <N> --json headRefName --jq .headRefName)
gh api "repos/:owner/:repo/compare/main...$releaseBranch" --jq '{status, ahead_by, behind_by}'
```

| `behind_by` | State            | First action                                      | Kick still needed                     |
| ----------- | ---------------- | ------------------------------------------------- | ------------------------------------- |
| `> 0`       | BEHIND + BLOCKED | `PUT /repos/:owner/:repo/pulls/<N>/update-branch` | No, once the new head's workflows run |
| `0`         | pure BLOCKED     | kick (`scripts/release-please-kick.sh`)           | Yes                                   |

When `behind_by > 0`, run `update-branch` first. The merge commit it creates is
pushed with your own account's token, not the bot token. The no-recursion safety
therefore does not apply, and the workflows fire as a real user push. That makes
the empty-commit kick unnecessary, saving one commit and one CI round.

When `behind_by == 0`, `update-branch` has nothing to merge and returns HTTP 422.
The kick is then the only way forward. Measured on 2026-09-03, PR #2023 reported
`{"status": "ahead", "ahead_by": 1, "behind_by": 0}`, so `update-branch` does not
apply to it and the empty-commit route is the one to take.

Either way, confirm the new head before moving on:

```bash
gh run list --limit 5 --json databaseId,status,conclusion,headBranch,workflowName
```

If the runs sit at `action_required`, the push did not count as a real user push.
Fall back to the kick below.

### A run count of zero is never the diagnosis

Judge a head by the `conclusion` of its runs, not by how many the query returns.
Zero is ambiguous, and it has already produced one misdiagnosis here:

- **An abbreviated SHA silently returns zero.** Both `gh run list --commit` and
  the `head_sha` filter match the full 40-character SHA only; a short SHA
  returns no rows and no error. This is the demonstrated cause of the v1.89.1
  incident: the first measurement on #1986 used a short SHA and returned 0,
  which was reported as "no workflow fired", while the later measurement that
  found 13 runs happened to use the full SHA. Re-measured on 2026-08-28, long
  after those runs were registered, the short form still returns 0:

  ```bash
  gh run list --commit fc3d6f7f                                  # -> 0 rows
  gh run list --commit fc3d6f7f4ccbee2651437835ca54bc2a63ae7f2d  # -> 13 rows
  gh api '.../actions/runs?head_sha=fc3d6f7f'                    # -> total_count: 0
  gh api '.../actions/runs?head_sha=fc3d6f7f4ccb...ae7f2d'       # -> total_count: 13
  ```

  Expand the SHA before reading anything into a zero. Do not attribute a zero to
  the runs "not being registered yet"—that story fits a fresh PR, but nothing
  on this repository has ever demonstrated it, and reaching for it sends the
  next reader off to wait instead of lengthening the SHA.

- **After the merge**, the head is gone and the record no longer reads the same
  way. Run this diagnosis while the PR is still open, as the guard in
  `CLAUDE.md` requires.

Read the conclusions instead of the count:

```bash
gh api "repos/:owner/:repo/actions/runs?head_sha=<full-40-char-sha>&per_page=100" \
  --jq '.workflow_runs[] | "\(.name)\t\(.status)\t\(.conclusion)"'
```

A column of `action_required` means the head is stalled and the kick applies. A
column of `success` means the push counted as a real user push.

Take a positive control in the same pass: run the identical query against a SHA
whose CI is known to have executed, and confirm it returns rows. On 2026-08-28,
`26bc1c7929bc56c80684abe93383d0bb3f214736` (the `main` tip before the v1.89.1
release PR) returned 7 runs, all `success`. When the control also returns zero,
the query is wrong rather than the head.

### Evidence

- **v1.66.1** (PR #1693): BEHIND + BLOCKED. `update-branch` alone fired every
  workflow, so the empty-commit kick was skipped.
- **v1.67.0** (PR #1699): `ahead_by: 1, behind_by: 0` right after release-please
  opened the PR. `update-branch` did not apply, and the kick was the correct move.
- **v1.89.1** (PR #1986): `ahead_by: 1, behind_by: 0`, so pure BLOCKED and the
  same shape as v1.67.0—`update-branch` returns 422 and the kick is the only
  route. `scripts/release-please-kick.sh` moved the head from `fc3d6f7f` to
  `72227d02`. That new head carries 13 runs that actually executed (11
  `success`, 2 `skipped`), all 7 required contexts reported, and the PR merged
  as `b09af847`. The stalled runs on the old head do not stay readable after the
  branch is deleted: re-measured post-merge, `fc3d6f7f` reports `completed` /
  `failure` (updated `2026-08-28T03:55:47Z`) rather than `action_required`,
  which is one more reason to diagnose while the PR is open.
- **v1.89.2** (PR #2004) and **v1.89.3** (PR #2009): the same shape twice more.
  In each, the `github-actions[bot]` release commit was followed by one
  `chore: trigger CI on release-please branch` commit, and the resulting merge
  head carried 13 runs (11 `success`, 2 `skipped`).
- **PR #2021**: a feature PR, not a release PR, and the stall recurred **within
  the same PR**. `Auto Rebuild Action Dist` pushed a dist rebuild twice
  (`619879cc`, `5da59df3`), and each needed its own kick. Expect a repeat while
  the PR still touches the action source: one kick does not immunise the PR.
  Both bot heads report 9 runs today, all `completed` / `failure` -- the
  post-merge rewrite described above, not the state they were in while open.

## Step 3: the kick: local script

Run the script **from your own account**, so the new head counts as a real user
push. Do not reach for `git push --force` -- the fix is to add a commit, never to
rewrite the bot's.

Confirm which account `gh` is about to write as. The account that has to be
active is **your own write-capable account on the repository you are kicking**;
on this repository that is `s977043`, which the `CLAUDE.md` guard "Verify gh
active account before write ops" names explicitly. Substitute your own login
elsewhere.

```bash
gh api user --jq .login   # must print your write account (here: s977043)
scripts/release-please-kick.sh <branch>
```

The branch argument is required for anything other than a release PR. Omitting
it makes the script auto-detect the open **release-please** PR, which is wrong
for a feature PR:

```bash
# release PR only -- auto-detects the release-please branch
scripts/release-please-kick.sh
# any PR -- pass the branch explicitly
scripts/release-please-kick.sh feat/1978-critic-runner
```

The script uses `gh api` to create an empty commit via the REST API
(`POST git/commits` + `PATCH git/refs/heads/...`). It authenticates with your own
`gh` credentials, so the new head counts as a real user push and re-fires
`pull_request` workflows. It also works without a clean local checkout, which is
useful during `fs-loss` incidents.

## Step 4: expect a recurrence on the same PR

A kick fixes one head, not the PR. Any later push by the same bot stalls the new
head the same way, so re-run Step 1 after every subsequent bot commit. PR #2021
is the measured case: two bot pushes, two kicks.

## The `Release Please Kick` workflow is not an equivalent alternative

`.github/workflows/release-please-kick.yml` performs the same empty-commit kick
from the Actions tab. It works only where the `RELEASE_KICK_PAT` secret is
registered. GitHub blocks `GITHUB_TOKEN`-authored pushes from triggering
`pull_request: synchronize` workflows (no-recursion safety). Without the secret,
the workflow's own push therefore unblocks nothing, and the run fails with an
error pointing back to this runbook (#906).

Check whether the secret exists before choosing this route:

```bash
gh api repos/:owner/:repo/actions/secrets --jq '.secrets[].name'
```

On this repository the call currently returns nothing: no Actions secret is
registered. The workflow route is therefore unavailable, and the script above is
the procedure to use. The workflow last succeeded on 2026-05-25. Every run since
then has failed at the `Verify downstream CI actually started` step for this
reason. The workflow is **deprecated** (refs #1800): it is in the first stage of
a "deprecate → observe → delete" plan, and its name carries a `[DEPRECATED]`
prefix. The file will be deleted after the observation period unless a
maintainer registers the secret and re-adopts the workflow.

### Setup (one-time, only to enable the workflow route)

1. Create a fine-grained PAT with **Contents: Read and write** on this repo.
   (Or use a GitHub App installation token if you prefer.)
2. Add it as repo secret `RELEASE_KICK_PAT` under **Settings → Secrets and variables → Actions**.
3. The workflow auto-detects the secret. Without it, the workflow exits 1 with a clear error
   pointing back to this runbook.

Adding the secret is a human-only operation that an agent session cannot
perform. Treat the local script as the standing procedure until a maintainer
completes this setup.

### Running it once the secret exists

1. Confirm the `RELEASE_KICK_PAT` secret is configured (above).
2. Go to **Actions → [DEPRECATED] Release Please Kick → Run workflow**.
3. Leave `branch` blank—the workflow auto-detects the open release-please PR.
4. The workflow also verifies a non-Vercel check started within 90s; if not, it fails loudly
   so the silent #906 failure mode cannot recur.

## After the merge: verify the `v1` alias, not just the tag

A release is not verified by the version tag alone. Action consumers pin `@v1`,
so `v1` is the ref that decides what they actually run.

Measured immediately after the #1986 merge, `v1` still pointed at `23302f06`,
the v1.89.0 commit. The alias is moved by the **"Update major alias tag"** step
of the `Release Please` workflow on `main`, and that run has to finish before
the alias means anything. Wait for it, then re-measure:

```bash
git fetch origin --tags --force --prune
git rev-parse v1^{commit}
git rev-parse v1.89.1^{commit}
```

Once the workflow completed, both returned
`b09af8479c4140fe0d9f584794322548bc059c25`. Treat a mismatch as an unfinished
release rather than a tagging quirk.

## Background

See `docs/development/retrospectives/2026-05-21-25.md` (W1+W5). The empty-commit
pattern is recorded in `AGENT_LEARNINGS.md` (2026-05-24 entry).

## Related

`.claude/commands/release-kick.md` turns this runbook into an end-to-end
procedure for the release PR (unblock, merge, verify the release). This runbook
stays the procedure SSoT for the BEHIND decision, which kick route to use, and
`RELEASE_KICK_PAT` setup; `CLAUDE.md` stays the SSoT for the underlying cause.
Fix the command when the two disagree.

`scripts/wait-pr-ready.sh` waits for one or more PRs to settle and surfaces the
stalled `action_required` runs that send you here. `scripts/pr-unstall.sh`
judges one PR and runs the escape (section above); `scripts/merge-chain.sh`
(`docs/runbook/merge-chain.md`) drives a strict-mode batch merge on top of
both.
