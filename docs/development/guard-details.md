# AI Misoperation Guards: details and case history

This file holds the background, incidents, and rationale that used to live inline in the `CLAUDE.md` "AI Misoperation Guards" bullets.
The rule itself stays in `CLAUDE.md`. Each section below is keyed by the exact bullet title.
The guard list and mechanization level are tracked in `docs/development/guard-ledger.yaml`.

## Origin of the guards

The codification process in `docs/development/improvement-flow.md` produced these assets:

- the `/propose-issue`, `/plan-merge-order`, and `/preflight` commands
- `pipeline-params-checklist.md`, `dist-check-rebuild-guide.md`, and `heuristic-detector-checklist.md`
- the guards "Research before proposing", "Propagate signatures", and "Plan merge order"
- the guards "Commit before branch switches", "Verify git output before chaining", and "Verify agent completion reports"
- the guards "`N of N required checks are expected` = bot/GITHUB_TOKEN push" and "Prefix skill invocations"
- the guards "Import the SSoT, never re-derive it" and "Fact-check what you author"
- the guards "Execute what you document" and "Check what the previous change pinned"
- the guard "An input shape is not a safety argument"
- the pre-merge checklist in `docs/governance.md`, which absorbed four former guards
  - "Verify CI green", "Verify reviewer comments", "Preflight", and "Match CI Node version"

## Verify gh active account before write ops

The local `gh` keyring holds two accounts: `s977043` for this repo and `kominem-unilabo` for work.
The active account silently switched to `kominem-unilabo` mid-session 5+ times in the 2026-06-10..11 session.
That caused `404 Not Found`, `must be a collaborator`, and `does not have the correct permissions` errors.
The affected calls were `gh pr create`, `gh pr merge`, `gh api .../update-branch`, and `gh issue create`.

The switch breaks reads the same way it breaks writes.
While the wrong account is active, `gh pr checks`, `gh pr view`, and `gh api repos/:owner/:repo/...` answer `404` / `Could not resolve to a Repository`.
Reading that as "the repo/PR does not exist", or recording it as "could not fetch", sends the diagnosis down the wrong path.

The PreToolUse hook `.claude/hooks/gh-account-guard.sh` automates the write side.
It intentionally matches write ops only (`WRITE_RE`) and lets reads through with no account check, because a failed read breaks nothing.
The read-side remedy is therefore diagnostic, not mechanical.
The hook is defense-in-depth either way.

## Merge-time checks

The SSoT is the pre-merge checklist in `docs/governance.md` (`PR レビューとマージ` > `マージ前チェックリスト`).
It covers pagination pitfalls, bot-vs-human triage, disposition rules, and the incident behind the two-endpoint rule.

## Strict-mode batch merge

Updating one branch at a time after each individual merge re-triggers full CI for every remaining PR.
That multiplies the total wait time by N.

`update-branch` merges the base branch into the head branch itself.
The local merge for a lock-file-only 422 only finishes what the API could not auto-resolve, so the push is a fast-forward.
Rebasing is what would demand a force-push.
A replacement PR discards CI history and review metadata.

## Verify agent completion reports

Background implementation agents fabricated their entire completion report 4 times in the 2026-07-02 session.
The fabrications included plausible PR numbers, test counts, commit hashes, and fake "real command output" blocks.

Plain `git ls-remote` exits 0 with empty output when the ref is missing, so it does not fail; use `--exit-code`.

Read-only review and research agents have not been observed fabricating execution.
They do return wrong conclusions, and aggregate figures whose measurement steps were never recorded.

## `N of N required checks are expected` = bot/GITHUB_TOKEN push

`docs/runbook/bot-pushed-head-kick.md` is the SSoT.
It holds the diagnosis commands, the escape procedure, past measurements, and the `Release Please Kick` workflow and `RELEASE_KICK_PAT` requirements.
It also explains why the evidence changes shape after merge.

## Import the SSoT, never re-derive it

Delegated workers do read the neighbouring module and register "there is a similar function", and still implement their own.
Two consecutive waves showed this.

- PR #1650 derived candidate IDs independently with a different prefix, hash input, and policyVersion. Identical evidence minted a different ID.
- PR #1656 added a `runIdOf` byte-identical to `deriveReviewRunId` and a second `nonEmptyString` that trimmed without NFC.
- PR #1656 also hashed a raw, un-normalized clusterKey. That split the `promote propose` and `evolve replay` IDs whenever the key contained whitespace (corrected in #1658).

Per-PR tests do not catch this because they become self-consistent.
PR #1656 compared its output against `computeCandidateId`, the same code path, and passed.

## Fact-check what you author

This guard extends "Verify agent completion reports" from inbound reports to outbound text.
It also extends "Run before claiming" from asserted results to the numbers you publish.
The issue-body version of the check lives in `/propose-issue`.

## Execute what you document

This guard extends "Run before claiming" from the results you assert to the procedures you publish.
A workaround whose failure only moves to another required check is not a workaround.

## Check what the previous change pinned

The `git log` dates are what tell you the edits are consecutive, and `-8` always returns 8 lines.

`src/cli.mjs` took 7 consecutive changes (#1735 → #1777) and shipped 2 released regressions.
v1.72.0 rejected the flag-first form, and v1.72.1 rejected `--phase Upstream`.
Neither form had a `VALID_CASES` row.

CI showed the same shape: `.github/workflows/test.yml` went #1773 → #1774, and the gap #1773 left surfaced only after merge.

## An input shape is not a safety argument

Both failure modes hit this repo three times on 2026-09-17.

- `git diff --unified=0` from real git emits the same hunk-body-plus-next-`@@` shape a hand-written patch does. `parseUnifiedDiff` minted a ghost file and emptied the real file's `addedLines` (#2280).
- The "65 fixtures + 400 real commit diffs, zero differences" measurement never contained a U0 diff.
- Real git also emits `diff --cc` / `@@@` for merge commits. The parser registered the files and silently discarded every hunk (#2294). The 658-diff sweep contained no `--cc` output either.
- A third measurement (21 real files, U0 vs U3, `addedLines` identical) concluded "U0 does not break the parser". The ghost still reproduced, because no line in that population read `-- x` / `++ y`.

The reachability claim for U0 died to one path: `doctorLocalReview` in `src/lib/local-runner.mjs` uses `contextLines: 0` when not debugging.
Two of the five known diff-parsing bands were found on that single day, so the band list records what has been seen, not a complete set.

`docs/development/retrospectives/2026-09-15-16-wave-y.md` and #2261 carry the full case history.
The contract now enumerates all 8 diff entry points (#2295, closed by #2299).
It also records which entry points leave context width and combined-diff handling unspecified.
