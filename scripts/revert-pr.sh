#!/usr/bin/env bash
# Revert a merged (squash) PR on a new branch and, with --execute, open the
# revert PR. Procedure and timing: docs/runbook/revert.md.
#
#   1. read the PR with `gh pr view <N> --json mergeCommit,state,title`;
#      refuse unless state is MERGED and the merge commit is on <remote>/main
#   2. create branch revert/pr-<N> from <remote>/main (refuse if it exists)
#   3. `git revert --no-edit <sha>` (never reset); on conflict abort the
#      revert, leave the branch, and stop
#   4. warn when the reverted commit touches the Action bundle or its inputs
#      (runners/github-action/dist/**, runners/github-action/src/**, src/**):
#      the dist may need a rebuild and the bot push can stall CI
#      (scripts/pr-unstall.sh)
#   5. with --execute only: check the active gh account, push the branch, and
#      open the PR "revert: <title> (#<N>)"
#
# Usage:
#   scripts/revert-pr.sh <pr-number>            # dry-run (default): no push
#   scripts/revert-pr.sh <pr-number> --execute  # push and open the PR
#
# Environment:
#   REPO    owner/repo (default: `gh repo view` of the current checkout)
#   REMOTE  git remote that points at REPO (default: origin)
#
# Exit codes:
#   0  reverted (and pushed + PR opened with --execute)
#   1  stopped: the revert conflicts (branch kept, revert aborted)
#   2  a gh or git command failed
#   3  refused: PR not MERGED, no merge commit, merge commit not on main,
#      branch revert/pr-<N> already exists, or the working tree is dirty
#   64 usage error

set -euo pipefail

usage() {
  echo "usage: scripts/revert-pr.sh <pr-number> [--execute]" >&2
  exit 64
}

die() {
  local code="$1"
  shift
  echo "revert-pr: $*" >&2
  exit "${code}"
}

# touches_bundle: read paths on stdin, print those that feed the Action bundle.
touches_bundle() {
  grep -E '^(runners/github-action/(dist|src)/|src/)' || true
}

main() {
  local pr='' execute=0
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --execute) execute=1 ;;
      -*) usage ;;
      *)
        [ -z "${pr}" ] || usage
        pr="$1"
        ;;
    esac
    shift
  done
  [[ "${pr}" =~ ^[1-9][0-9]*$ ]] || usage

  local remote="${REMOTE:-origin}" repo
  if [ -n "${REPO:-}" ]; then
    repo="${REPO}"
  else
    repo="$(gh repo view --json nameWithOwner --jq .nameWithOwner)" ||
      die 2 "gh repo view failed (wrong gh account? gh api user --jq .login)"
  fi

  [ -z "$(git status --porcelain --untracked-files=no)" ] ||
    die 3 "working tree has uncommitted changes; commit or use a clean worktree"

  local info state sha title
  info="$(gh pr view "${pr}" --repo "${repo}" --json mergeCommit,state,title)" ||
    die 2 "gh pr view ${pr} failed (wrong gh account? gh api user --jq .login)"
  state="$(jq -r '.state' <<<"${info}")" || die 2 "unparsable gh pr view answer"
  sha="$(jq -r '.mergeCommit.oid // empty' <<<"${info}")" || die 2 "unparsable gh pr view answer"
  title="$(jq -r '.title' <<<"${info}")" || die 2 "unparsable gh pr view answer"

  [ "${state}" = MERGED ] || die 3 "PR #${pr} is ${state}, not MERGED"
  [ -n "${sha}" ] || die 3 "PR #${pr} has no merge commit"

  git fetch -q "${remote}" main || die 2 "git fetch ${remote} main failed"
  git cat-file -e "${sha}^{commit}" 2>/dev/null ||
    die 3 "merge commit ${sha} is not in the local object store after fetch"
  git merge-base --is-ancestor "${sha}" "${remote}/main" ||
    die 3 "merge commit ${sha} is not on ${remote}/main"

  local branch="revert/pr-${pr}"
  if git rev-parse -q --verify "refs/heads/${branch}" >/dev/null; then
    die 3 "branch ${branch} already exists locally"
  fi
  if git ls-remote --exit-code --heads "${remote}" "refs/heads/${branch}" >/dev/null 2>&1; then
    die 3 "branch ${branch} already exists on ${remote}"
  fi

  local bundle path
  bundle="$(git diff-tree --no-commit-id --name-only -r "${sha}" | touches_bundle)"

  git switch -q -c "${branch}" "${remote}/main" || die 2 "git switch -c ${branch} failed"
  [ "$(git rev-parse --abbrev-ref HEAD)" = "${branch}" ] || die 2 "not on ${branch} after switch"

  if ! git revert --no-edit "${sha}"; then
    echo "revert-pr: conflict while reverting ${sha}:" >&2
    git diff --name-only --diff-filter=U >&2 || true
    git revert --abort || true
    die 1 "stopped. Branch ${branch} is left at ${remote}/main; resolve by hand or fix forward"
  fi

  echo "reverted PR #${pr} (${sha}) on ${branch}: $(git rev-parse HEAD)"
  if [ -n "${bundle}" ]; then
    echo "WARNING: the reverted commit touches the Action bundle or its sources:" >&2
    while IFS= read -r path; do echo "  ${path}" >&2; done <<<"${bundle}"
    echo "  The revert PR may need 'npm run build:action', and a bot dist push can" >&2
    echo "  stall required checks: see scripts/pr-unstall.sh and" >&2
    echo "  docs/runbook/bot-pushed-head-kick.md" >&2
  fi

  local pr_title="revert: ${title} (#${pr})"
  if [ "${execute}" -eq 0 ]; then
    echo "dry-run: not pushed. To publish: scripts/revert-pr.sh ${pr} --execute"
    echo "         (delete the local branch first: git branch -D ${branch})"
    echo "         PR title would be: ${pr_title}"
    return 0
  fi

  local owner="${repo%%/*}" login
  login="$(gh api user --jq .login)" || die 2 "gh api user failed"
  if [ "${login}" != "${owner}" ]; then
    gh auth switch -u "${owner}" >&2 || die 2 "gh account is ${login}; switch to ${owner} failed"
  fi

  git push -u "${remote}" "${branch}" || die 2 "git push failed"
  [ "$(git ls-remote "${remote}" "refs/heads/${branch}" | cut -f1)" = "$(git rev-parse HEAD)" ] ||
    die 2 "pushed ref does not match local HEAD"

  local body
  body="$(printf 'Reverts #%s\n\n## 理由\n\n<!-- なぜ fix-forward ではなく revert か -->\n' "${pr}")"
  gh pr create --repo "${repo}" --base main --head "${branch}" --title "${pr_title}" --body "${body}" ||
    die 2 "gh pr create failed"
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  main "$@"
fi
