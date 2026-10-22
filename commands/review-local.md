---
description: Review local branch changes (committed since the default branch plus uncommitted) and suggest fixes
allowed-tools: Bash(git status:*), Bash(git diff:*), Bash(git log:*), Bash(git fetch:*), Bash(git symbolic-ref:*), Bash(gh repo view:*)
---

## Context

- Status: `git status`
- Recent commits: `git log --oneline -10`

## 対象の解決

このコマンドはローカルの checkout にある変更を対象にする。PR の diff（`gh pr diff`）は使わない。PR をレビューするときは `/review-team <PR 番号>` を使う。

`git diff <base>...HEAD` と未コミットの変更（`git diff` / `git diff --cached`）を合わせて diff とする。`<base>` は `origin/<デフォルトブランチ>` とし、デフォルトブランチ名は `gh repo view --json defaultBranchRef --jq .defaultBranchRef.name` で得る。`gh repo view` が失敗した場合（未認証など）は `git symbolic-ref --short refs/remotes/origin/HEAD` の出力から `origin/` を除いた名前を使う。それも失敗した場合は、対象を決められない旨を出力して終了する。ローカルのブランチは遅れていることがあるため、先に `git fetch origin <デフォルトブランチ>` を実行する。

diff が空の場合だけ、「差分がありません」と伝えて終了する。

出力の 1 行目に、使った対象を `対象: ローカル diff（git diff <base>...HEAD + 未コミットの変更）` の形で書く。

## Task

Review the diff for:

- correctness and edge cases
- security issues
- performance
- style consistency

Provide actionable comments and propose minimal patches.
