---
description: Review uncommitted changes, or the branch diff against the default branch when nothing is uncommitted, and suggest fixes
allowed-tools: Bash(git status:*), Bash(git diff:*), Bash(git log:*), Bash(git fetch:*), Bash(git symbolic-ref:*), Bash(gh repo view:*)
---

## Context

- Status: `git status`
- Recent commits: `git log --oneline -10`

## 対象の解決

このコマンドはローカルの checkout にある変更を対象にする。PR の diff（`gh pr diff`）は使わない。PR やブランチ全体をレビューするときは `/review-team` を使う。

1. 未コミットの変更（`git diff` と `git diff --cached`）を diff とする。
2. 1 が空の場合だけ、`git diff <base>...HEAD` を diff とする。`<base>` は `origin/<デフォルトブランチ>` とし、デフォルトブランチ名は `gh repo view --json defaultBranchRef --jq .defaultBranchRef.name` で得る。`gh repo view` が失敗した場合（未認証など）は `git symbolic-ref --short refs/remotes/origin/HEAD` の出力から `origin/` を除いた名前を使う。それも失敗した場合は、対象を決められない旨を出力して終了する。ローカルのブランチは遅れていることがあるため、先に `git fetch origin <デフォルトブランチ>` を実行する。

1 と 2 がどちらも空の場合だけ、「差分がありません」と伝えて終了する。

出力の 1 行目に、使った対象を次のいずれかで書く。

- `対象: 未コミットの変更`
- `対象: ローカル diff（git diff <base>...HEAD）`

## Task

Review the diff for:

- correctness and edge cases
- security issues
- performance
- style consistency

Provide actionable comments and propose minimal patches.
