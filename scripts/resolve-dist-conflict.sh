#!/usr/bin/env bash
# Resolve a PR's merge conflict with the base branch when the only conflicted
# paths are the generated GitHub Action bundle (runners/github-action/dist/**).
#
# Every PR that rebuilds the dist (dependabot bumps, src/ changes) conflicts
# with the base once another dist-touching PR merges, almost always in
# `index.mjs.map`. The bundle is generated, so the resolution is mechanical:
# take either side, reinstall, rebuild, and commit the merge. This script runs
# that procedure in a throwaway worktree:
#
#   1. read the PR's head / base branch with `gh pr view`; refuse a fork PR,
#      a PR that is not open, and a head branch that is `main` or the base
#   2. fetch both branches and add a detached worktree at the PR head under
#      `mktemp -d`
#   3. `git merge --no-ff --no-commit <remote>/<base>`; stop if any conflicted
#      path lies outside runners/github-action/dist/ (nothing is auto-resolved
#      there: package-lock.json, src/ and the rest need a human)
#   4. take `--theirs` for the conflicted dist files, then `npm ci` BEFORE
#      `npm run build:action` (in the other order a stale node_modules bundles
#      the old dependencies and the dist looks clean), stage the dist, check
#      that no unmerged or non-dist change is left, and commit the merge.
#      The commit runs the repository's hooks (lint-staged can rewrite and
#      re-stage files), so the committed tree must equal the `git write-tree`
#      recorded just before the commit
#   5. rebuild once more and require `git status --porcelain -- runners/` to be
#      empty (the committed dist is reproducible)
#   6. with --push only: push the merge to the PR branch as a fast-forward
#      (never forced) and require `git ls-remote` to equal the local HEAD
#
# Success is judged with `git diff --name-only --diff-filter=U`, never by
# grepping the dist for `<<<<<<<`: the bundle legitimately contains that
# string (a conflict-marker detector is part of the sources).
#
# Usage:
#   scripts/resolve-dist-conflict.sh <pr-number>          # dry-run (default)
#   scripts/resolve-dist-conflict.sh --push <pr-number>   # also push
#
# Pushing requires the explicit --push flag. A dry-run leaves the merge commit
# in the object store and prints the push command for it, so the result can
# be inspected first and pushed by hand.
#
# Environment:
#   REPO            owner/repo (default: `gh repo view` of the current checkout)
#   REMOTE          git remote that points at REPO (default: origin)
#   CO_AUTHORED_BY  "Name <email>"; appended as a Co-Authored-By trailer to the
#                   merge commit (set it when an AI agent runs the script)
#
# Exit codes:
#   0  resolved (and pushed with --push), or the head already contains the base
#   1  stopped: a non-dist path conflicts, the rebuild is not reproducible, a
#      non-dist file changed, the commit failed or a commit hook changed the
#      committed tree, or the push could not be verified. The worktree is
#      kept and its path printed
#   2  a gh or git read failed (including an unparsable `gh pr view` answer)
#   3  refused: Node major != .nvmrc major, fork PR, PR not open, head branch
#      is `main` or the base, or another run holds the lock for this PR
#   64 usage error

set -euo pipefail

DIST_PREFIX='runners/github-action/dist/'

usage() {
  echo "usage: scripts/resolve-dist-conflict.sh [--push] <pr-number>" >&2
  exit 64
}

# non_dist_paths: read paths on stdin, print the ones outside DIST_PREFIX.
non_dist_paths() {
  local path
  while IFS= read -r path; do
    [ -n "${path}" ] || continue
    case "${path}" in
      "${DIST_PREFIX}"*) ;;
      *) printf '%s\n' "${path}" ;;
    esac
  done
}

# major_of <version>: "v22.22.2" / "22.22.2" / "22" -> "22".
major_of() {
  local v="${1#v}"
  printf '%s' "${v%%.*}"
}

main() {
  local push=0 pr=''
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --push) push=1 ;;
      --no-push) push=0 ;;
      -h | --help) usage ;;
      '' | -* | *[!0-9]*)
        echo "error: '$1' is not a PR number." >&2
        usage
        ;;
      *)
        [ -z "${pr}" ] || usage
        pr="$1"
        ;;
    esac
    shift
  done
  [ -n "${pr}" ] || usage

  local root
  if ! root=$(git rev-parse --show-toplevel 2>/dev/null); then
    echo "error: run this from inside the repository checkout." >&2
    exit 2
  fi

  local want have
  if [ ! -f "${root}/.nvmrc" ]; then
    echo "error: ${root}/.nvmrc not found." >&2
    exit 3
  fi
  want=$(major_of "$(tr -d '[:space:]' < "${root}/.nvmrc")")
  have=$(major_of "$(node -p 'process.versions.node')")
  if [ "${want}" != "${have}" ]; then
    echo "refused: Node major ${have} does not match .nvmrc major ${want}." >&2
    echo "  A dist built with another Node major differs from CI's." >&2
    echo "  Put Node ${want} first on PATH (e.g. /opt/homebrew/opt/node@${want}/bin) and re-run." >&2
    exit 3
  fi

  local repo remote
  remote="${REMOTE:-origin}"
  if [ -n "${REPO:-}" ]; then
    repo="${REPO}"
  elif ! repo=$(gh repo view --json nameWithOwner --jq .nameWithOwner 2>&1); then
    echo "error: could not resolve the repository with gh: ${repo}" >&2
    exit 2
  fi

  local pr_json
  if ! pr_json=$(gh pr view "${pr}" --repo "${repo}" \
    --json headRefName,headRepositoryOwner,isCrossRepository,baseRefName,state 2>&1); then
    echo "error: gh pr view ${pr} failed in ${repo}." >&2
    echo "       If this is a 404 or a permission error, check the active gh" >&2
    echo "       account first: gh api user --jq .login" >&2
    echo "${pr_json}" >&2
    exit 2
  fi
  local head base state cross owner
  if ! head=$(printf '%s' "${pr_json}" | jq -r '.headRefName') \
    || ! base=$(printf '%s' "${pr_json}" | jq -r '.baseRefName') \
    || ! state=$(printf '%s' "${pr_json}" | jq -r '.state') \
    || ! cross=$(printf '%s' "${pr_json}" | jq -r '.isCrossRepository') \
    || ! owner=$(printf '%s' "${pr_json}" | jq -r '.headRepositoryOwner.login'); then
    echo "error: could not parse the gh pr view answer for #${pr}:" >&2
    echo "${pr_json}" >&2
    exit 2
  fi

  if [ "${state}" != "OPEN" ]; then
    echo "refused: #${pr} is ${state}, not OPEN." >&2
    exit 3
  fi
  if [ "${cross}" != "false" ] || [ "${owner}" != "${repo%%/*}" ]; then
    echo "refused: #${pr} comes from a fork (${owner}:${head}); this script only" >&2
    echo "  pushes to branches of ${repo}." >&2
    exit 3
  fi
  if [ "${head}" = "${base}" ] || [ "${head}" = "main" ]; then
    echo "refused: #${pr} has head branch '${head}' (base '${base}'); this script" >&2
    echo "  never pushes to main or to the base branch." >&2
    exit 3
  fi
  echo "#${pr}: ${head} <- ${base} (${repo}, remote ${remote})"

  # One run per PR at a time. mkdir is atomic, so two runs cannot both win.
  local lock
  lock="${TMPDIR:-/tmp}"
  lock="${lock%/}/resolve-dist-conflict-${repo//\//-}-${pr}.lock"
  if ! mkdir "${lock}" 2>/dev/null; then
    echo "refused: another run holds ${lock} (pid $(cat "${lock}/pid" 2>/dev/null || echo '?'))." >&2
    echo "  If no run is alive, remove the lock: rm ${lock}/pid && rmdir ${lock}" >&2
    exit 3
  fi
  printf '%s\n' "$$" > "${lock}/pid"
  # shellcheck disable=SC2064 # expand ${lock} now; it is local to main
  trap "rm -f '${lock}/pid'; rmdir '${lock}' 2>/dev/null || true" EXIT

  if ! git fetch --quiet "${remote}" \
    "+refs/heads/${base}:refs/remotes/${remote}/${base}" \
    "+refs/heads/${head}:refs/remotes/${remote}/${head}"; then
    echo "error: git fetch ${remote} ${base} ${head} failed." >&2
    exit 2
  fi
  local head_sha base_sha
  head_sha=$(git rev-parse "refs/remotes/${remote}/${head}")
  base_sha=$(git rev-parse "refs/remotes/${remote}/${base}")
  echo "head ${head_sha}"
  echo "base ${base_sha}"

  if git merge-base --is-ancestor "${base_sha}" "${head_sha}"; then
    echo "#${pr}: ${head} already contains ${base}; nothing to resolve."
    return 0
  fi

  local tmp wt
  tmp=$(mktemp -d)
  # Name the checkout after package.json `name`, the canonical build-directory
  # name that scripts/normalize-dist.mjs rewrites the bundle to.
  wt="${tmp}/$(jq -r .name "${root}/package.json")"
  git worktree add --quiet --detach "${wt}" "${head_sha}"
  echo "worktree ${wt}"

  local keep_msg="worktree kept for inspection: ${wt}
  remove it with: git worktree remove --force ${wt}"

  # A conflicting merge exits 1; a failure to start the merge leaves no
  # MERGE_HEAD. Distinguish the two instead of trusting the exit code.
  git -C "${wt}" merge --no-ff --no-commit "${base_sha}" > "${tmp}/merge.log" 2>&1 || true
  if ! git -C "${wt}" rev-parse -q --verify MERGE_HEAD > /dev/null; then
    cat "${tmp}/merge.log" >&2
    echo "error: git merge did not start." >&2
    echo "${keep_msg}" >&2
    exit 1
  fi

  local conflicted blocking
  conflicted=$(git -C "${wt}" diff --name-only --diff-filter=U)
  blocking=$(printf '%s\n' "${conflicted}" | non_dist_paths)
  if [ -n "${blocking}" ]; then
    echo "stopped: conflicts outside ${DIST_PREFIX} need a human:" >&2
    printf '%s\n' "${blocking}" | sed 's/^/  /' >&2
    echo "${keep_msg}" >&2
    exit 1
  fi
  if [ -n "${conflicted}" ]; then
    echo "conflicted (dist only):"
    printf '%s\n' "${conflicted}" | sed 's/^/  /'
  else
    echo "no conflicts; rebuilding the merged tree anyway"
  fi

  # A pipe rather than a heredoc / here-string: heredoc bodies over 512 bytes
  # deadlock on homebrew bash 5.3.15 (see print_422_procedure in
  # scripts/pr-unstall.sh), and the conflict list can exceed that.
  local f
  printf '%s\n' "${conflicted}" | while IFS= read -r f; do
    [ -n "${f}" ] || continue
    # A modify/delete conflict whose base side deleted the file has no
    # "theirs" version; the rebuild below decides whether it exists.
    git -C "${wt}" checkout --theirs -- "${f}" 2> /dev/null || git -C "${wt}" rm --quiet -- "${f}"
  done

  echo "npm ci ..."
  if ! (cd "${wt}" && npm ci > "${tmp}/npm-ci.log" 2>&1); then
    tail -20 "${tmp}/npm-ci.log" >&2
    echo "${keep_msg}" >&2
    exit 1
  fi
  echo "npm run build:action ..."
  if ! (cd "${wt}" && npm run build:action > "${tmp}/build-1.log" 2>&1); then
    tail -20 "${tmp}/build-1.log" >&2
    echo "${keep_msg}" >&2
    exit 1
  fi
  git -C "${wt}" add -A -- "${DIST_PREFIX}"

  local unmerged stray
  unmerged=$(git -C "${wt}" diff --name-only --diff-filter=U)
  # Staged paths are the merge itself; only what the install / build left in
  # the working tree outside the dist (unstaged or untracked) is suspect.
  stray=$({
    git -C "${wt}" diff --name-only
    git -C "${wt}" ls-files --others --exclude-standard
  } | non_dist_paths)
  if [ -n "${unmerged}" ] || [ -n "${stray}" ]; then
    echo "stopped: unmerged or non-dist changes remain after the rebuild:" >&2
    printf '%s\n' "${unmerged}" "${stray}" | sed '/^$/d; s/^/  /' >&2
    echo "${keep_msg}" >&2
    exit 1
  fi

  local msg="Merge ${remote}/${base} into ${head}

Resolve conflicts in ${DIST_PREFIX} by rebuilding with
scripts/resolve-dist-conflict.sh (npm ci + npm run build:action)."
  if [ -n "${CO_AUTHORED_BY:-}" ]; then
    msg="${msg}

Co-Authored-By: ${CO_AUTHORED_BY}"
  fi
  # The commit runs the repository's hooks, which can rewrite or add files
  # after the checks above (lint-staged re-stages what it formats).
  local tree
  tree=$(git -C "${wt}" write-tree)
  if ! git -C "${wt}" commit --quiet -m "${msg}"; then
    echo "error: git commit failed." >&2
    echo "${keep_msg}" >&2
    exit 1
  fi
  local merge_sha committed
  merge_sha=$(git -C "${wt}" rev-parse HEAD)
  echo "merge commit ${merge_sha}"
  committed=$(git -C "${wt}" rev-parse 'HEAD^{tree}')
  if [ "${committed}" != "${tree}" ]; then
    echo "stopped: a commit hook changed the committed tree; not pushed:" >&2
    git -C "${wt}" diff --name-only "${tree}" "${committed}" | sed 's/^/  /' >&2
    echo "${keep_msg}" >&2
    exit 1
  fi

  echo "npm run build:action (reproducibility check) ..."
  if ! (cd "${wt}" && npm run build:action > "${tmp}/build-2.log" 2>&1); then
    tail -20 "${tmp}/build-2.log" >&2
    echo "${keep_msg}" >&2
    exit 1
  fi
  local drift
  drift=$(git -C "${wt}" status --porcelain --untracked-files=all -- runners/)
  if [ -n "${drift}" ]; then
    echo "stopped: a second rebuild changed runners/; the dist is not reproducible:" >&2
    printf '%s\n' "${drift}" >&2
    echo "${keep_msg}" >&2
    exit 1
  fi
  echo "second rebuild: runners/ unchanged"

  if [ "${push}" -eq 0 ]; then
    echo "dry-run: not pushed. To push this merge (fast-forward, no force):"
    echo "  git push ${remote} ${merge_sha}:refs/heads/${head}"
  else
    # No + and no --force: git rejects the push if the PR branch moved.
    if ! git -C "${wt}" push --quiet "${remote}" "HEAD:refs/heads/${head}"; then
      echo "error: push to ${remote}/${head} was rejected (the branch may have moved)." >&2
      echo "${keep_msg}" >&2
      exit 1
    fi
    local remote_sha
    remote_sha=$(git ls-remote --exit-code "${remote}" "refs/heads/${head}" | cut -f1) || remote_sha=''
    if [ "${remote_sha}" != "${merge_sha}" ]; then
      echo "error: ${remote}/${head} is '${remote_sha}', expected ${merge_sha}." >&2
      echo "${keep_msg}" >&2
      exit 1
    fi
    echo "pushed: ${remote}/${head} = ${remote_sha}"
  fi

  git worktree remove --force "${wt}"
  rm -f "${tmp}/merge.log" "${tmp}/npm-ci.log" "${tmp}/build-1.log" "${tmp}/build-2.log"
  rmdir "${tmp}"
  return 0
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  main "$@"
fi
