#!/usr/bin/env bash
# Revert a merged (squash) PR and, with --execute, open the revert PR.
# The caller's checkout is never switched or modified: the revert is made in a
# temporary worktree that is always removed. Procedure: docs/runbook/revert.md.
#
#   1. read the PR with `gh pr view <N> --json mergeCommit,state,title`;
#      refuse unless state is MERGED and the merge commit is on <remote>/main
#   2. refuse if branch revert/pr-<N> exists locally or on <remote>
#   3. check that the revert applies to <remote>/main with
#      `git merge-tree --write-tree` (writes objects only, no ref or worktree);
#      on conflict list the paths and stop
#   4. warn when the reverted commit touches the Action bundle or its inputs
#      (runners/github-action/dist/**, runners/github-action/src/**, src/**):
#      the dist may need a rebuild and the bot push can stall CI
#      (scripts/pr-unstall.sh)
#   5. with --execute only: check the active gh account, add a detached
#      worktree at <remote>/main under `mktemp -d`, create revert/pr-<N> there,
#      `git revert --no-edit <sha>` (never reset), push, open the PR
#      "revert: <title> (#<N>)", and remove the worktree on exit
#
# Usage:
#   scripts/revert-pr.sh <pr-number>            # dry-run (default): creates nothing
#   scripts/revert-pr.sh <pr-number> --execute  # push and open the PR
#
# Environment:
#   REPO    owner/repo (default: `gh repo view` of the current checkout)
#   REMOTE  git remote that points at REPO (default: origin)
#
# Exit codes:
#   0  revert applies cleanly (dry-run), or pushed and PR opened (--execute)
#   1  stopped: the revert conflicts with <remote>/main
#   2  a gh or git command failed
#   3  refused: PR not MERGED, no merge commit, merge commit not on main,
#      or branch revert/pr-<N> already exists
#   64 usage error

set -euo pipefail

WORKTREE=''
CREATED_BRANCH=''
PUSHED=0

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

# cleanup: remove only the worktree (and unpushed branch) this run created.
cleanup() {
  if [ -n "${WORKTREE}" ]; then
    git worktree remove --force "${WORKTREE}" || echo "revert-pr: could not remove ${WORKTREE}" >&2
    [ ! -d "${WORKTREE}" ] || rmdir "${WORKTREE}" 2>/dev/null || true
  fi
  if [ -n "${CREATED_BRANCH}" ] && [ "${PUSHED}" -eq 0 ]; then
    git branch -q -D "${CREATED_BRANCH}" || true
  fi
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

  # Reverting sha onto main == merging sha^ into main with sha as the base.
  local mt rc=0
  mt="$(git merge-tree --write-tree --name-only --merge-base="${sha}" "${remote}/main" "${sha}^")" || rc=$?
  if [ "${rc}" -eq 1 ]; then
    echo "revert-pr: conflict while reverting ${sha} onto ${remote}/main:" >&2
    sed -n '2,/^$/p' <<<"${mt}" | sed '/^$/d; s/^/  /' >&2
    die 1 "stopped. Nothing was created; resolve by hand or fix forward"
  fi
  [ "${rc}" -eq 0 ] || die 2 "git merge-tree failed"

  local bundle path
  bundle="$(git diff-tree --no-commit-id --name-only -r "${sha}" | touches_bundle)"
  if [ -n "${bundle}" ]; then
    echo "WARNING: the reverted commit touches the Action bundle or its sources:" >&2
    while IFS= read -r path; do echo "  ${path}" >&2; done <<<"${bundle}"
    echo "  The revert PR may need 'npm run build:action', and a bot dist push can" >&2
    echo "  stall required checks: see scripts/pr-unstall.sh and" >&2
    echo "  docs/runbook/bot-pushed-head-kick.md" >&2
  fi

  local pr_title="revert: ${title} (#${pr})"
  if [ "${execute}" -eq 0 ]; then
    echo "dry-run: PR #${pr} (${sha}) reverts cleanly onto ${remote}/main; nothing created."
    echo "         To publish: scripts/revert-pr.sh ${pr} --execute"
    echo "         PR title would be: ${pr_title}"
    return 0
  fi

  local owner="${repo%%/*}" login
  login="$(gh api user --jq .login)" || die 2 "gh api user failed"
  if [ "${login}" != "${owner}" ]; then
    gh auth switch -u "${owner}" >&2 || die 2 "gh account is ${login}; switch to ${owner} failed"
  fi

  trap cleanup EXIT
  WORKTREE="$(mktemp -d "${TMPDIR:-/tmp}/revert-pr-${pr}.XXXXXX")" || die 2 "mktemp failed"
  git worktree add -q --detach "${WORKTREE}" "${remote}/main" || die 2 "git worktree add failed"
  git -C "${WORKTREE}" switch -q -c "${branch}" || die 2 "git switch -c ${branch} failed"
  CREATED_BRANCH="${branch}"
  [ "$(git -C "${WORKTREE}" rev-parse --abbrev-ref HEAD)" = "${branch}" ] ||
    die 2 "worktree is not on ${branch}"

  git -C "${WORKTREE}" revert --no-edit "${sha}" || die 2 "git revert failed"
  local head
  head="$(git -C "${WORKTREE}" rev-parse HEAD)"
  echo "reverted PR #${pr} (${sha}) on ${branch}: ${head}"

  git -C "${WORKTREE}" push -q -u "${remote}" "${branch}" || die 2 "git push failed"
  PUSHED=1
  [ "$(git ls-remote "${remote}" "refs/heads/${branch}" | cut -f1)" = "${head}" ] ||
    die 2 "pushed ref does not match ${head}"

  local body
  body="$(printf 'Reverts #%s\n\n## 理由\n\n<!-- なぜ fix-forward ではなく revert か -->\n' "${pr}")"
  if ! gh pr create --repo "${repo}" --base main --head "${branch}" --title "${pr_title}" --body "${body}"; then
    echo "revert-pr: ${branch} was pushed but gh pr create failed. Do not rerun this script" >&2
    echo "  (the branch now exists, so it refuses). Check the gh account, then open the PR:" >&2
    printf '  gh pr create --repo %q --base main --head %q --title %q --body %q\n' \
      "${repo}" "${branch}" "${pr_title}" "Reverts #${pr}" >&2
    exit 2
  fi
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  main "$@"
fi
