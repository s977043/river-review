#!/usr/bin/env bash
# Tear down a delegated-worker worktree after its PR merged. The counterpart of
# scripts/worker-bootstrap.sh: it reverses what the bootstrap set up, in the
# order the organizer has been typing by hand after every merge, with the
# read-only checks hoisted to the front so a refusal touches nothing (#2119):
#   0. git fetch --prune origin, then verify that local main is on `main` and
#      is an ancestor of origin/main (so step 4 is guaranteed to fast-forward)
#   1. git worktree remove --force .claude/worktrees/<slug>   (skipped if absent)
#   2. git branch -D <branch>                                  (skipped if absent)
#   3. (fetch already done in step 0)
#   4. git merge --ff-only origin/main                         (main checkout)
#   5. mv the bootstrap manifest to ${STATE_DIR}/archive/     (never rm)
#
# <slug> is derived exactly as the bootstrap derives it: `tr '/' '-'`.
#
# What `--force` in step 1 does and does not cover: it is NOT a licence to
# discard uncommitted work, so the script refuses (exit 1, listing the paths)
# when `git -C <worktree> status --porcelain` is non-empty. Commit or move that
# work first, then rerun. A locked worktree (`git worktree lock`) is not removed
# by a single `--force` either (git needs `-f -f`); the script does not escalate,
# so `git worktree unlock <path>` first, then rerun.
#
# The script changes nothing unless the main checkout is on `main` AND local
# main is an ancestor of origin/main: a merge --ff-only on any other branch
# would land origin/main on the wrong ref, and a local main that is ahead of
# (or diverged from) origin/main cannot fast-forward. Both checks run before
# step 1, and a mismatch exits 1 with nothing touched.
#
# Usage:
#   scripts/worker-cleanup.sh <branch>
#   RIVER_WORKER_STATE_DIR=/path scripts/worker-cleanup.sh <branch>
#
# Exit codes:
#   0  cleanup complete (absent worktree / branch / manifest are reported, not errors)
#   1  refused or failed: main checkout not on `main`, local main not an ancestor
#      of origin/main, uncommitted changes in the worktree, or a git command failed
#   64 usage error, or <branch> is `main` / `master` / `release-please--*`

set -euo pipefail

usage() {
  echo "usage: scripts/worker-cleanup.sh <branch>" >&2
  exit 64
}

BRANCH=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    -h | --help)
      usage
      ;;
    -*)
      echo "error: unknown option '$1'." >&2
      usage
      ;;
    *)
      [ -z "${BRANCH}" ] || usage
      BRANCH="$1"
      shift
      ;;
  esac
done
[ -n "${BRANCH}" ] || usage

case "${BRANCH}" in
  main | master | release-please--*)
    echo "error: refusing to clean up protected branch '${BRANCH}'." >&2
    exit 64
    ;;
esac

REPO_ROOT="$(git rev-parse --show-toplevel)"
# The main checkout, even when this script is run from inside another worktree.
COMMON_DIR="$(git rev-parse --path-format=absolute --git-common-dir)"
MAIN_ROOT="$(dirname "${COMMON_DIR}")"
[ -d "${MAIN_ROOT}/.claude" ] || MAIN_ROOT="${REPO_ROOT}"

SLUG="$(printf '%s' "${BRANCH}" | tr '/' '-')"
WORKTREE="${MAIN_ROOT}/.claude/worktrees/${SLUG}"
STATE_DIR="${RIVER_WORKER_STATE_DIR:-${HOME}/.claude/state}"
MANIFEST="${STATE_DIR}/worker-bootstrap-${SLUG}.txt"
ARCHIVE_DIR="${STATE_DIR}/archive"

echo "== 0. preconditions: fetch, main checkout on main, main can fast-forward"
git -C "${MAIN_ROOT}" fetch --prune origin || {
  echo "error: git fetch --prune origin failed. Nothing was changed." >&2
  exit 1
}
CURRENT="$(git -C "${MAIN_ROOT}" rev-parse --abbrev-ref HEAD)"
if [ "${CURRENT}" != "main" ]; then
  echo "error: ${MAIN_ROOT} is on '${CURRENT}', not 'main'. Nothing was changed." >&2
  echo "       switch the main checkout to main first (git -C '${MAIN_ROOT}' switch main), then rerun." >&2
  exit 1
fi
echo "ok: ${MAIN_ROOT} is on main"
if ! git -C "${MAIN_ROOT}" merge-base --is-ancestor HEAD origin/main; then
  echo "error: local main ($(git -C "${MAIN_ROOT}" rev-parse --short HEAD)) is not an ancestor of origin/main ($(git -C "${MAIN_ROOT}" rev-parse --short origin/main)); merge --ff-only would fail. Nothing was changed." >&2
  echo "       reconcile local main with origin/main first (do not reset --hard), then rerun." >&2
  exit 1
fi
echo "ok: local main is an ancestor of origin/main"

echo "== 1. worktree"
if git -C "${MAIN_ROOT}" worktree list --porcelain | grep -qxF "worktree ${WORKTREE}"; then
  DIRTY="$(git -C "${WORKTREE}" status --porcelain)"
  if [ -n "${DIRTY}" ]; then
    echo "error: ${WORKTREE} has uncommitted changes; not removing it." >&2
    echo "       --force only overrides a worktree lock, it does not discard work. Commit or move these first:" >&2
    printf '%s\n' "${DIRTY}" | sed 's/^/         /' >&2
    exit 1
  fi
  git -C "${MAIN_ROOT}" worktree remove --force "${WORKTREE}" || {
    echo "error: git worktree remove failed for ${WORKTREE}." >&2
    echo "       if the worktree is locked, run: git -C '${MAIN_ROOT}' worktree unlock '${WORKTREE}', then rerun." >&2
    exit 1
  }
  echo "removed: ${WORKTREE}"
else
  echo "skip: ${WORKTREE} is not a registered worktree"
fi

echo "== 2. local branch"
if git -C "${MAIN_ROOT}" show-ref --verify --quiet "refs/heads/${BRANCH}"; then
  git -C "${MAIN_ROOT}" branch -D "${BRANCH}" || {
    echo "error: git branch -D ${BRANCH} failed." >&2
    exit 1
  }
  echo "deleted: ${BRANCH}"
else
  echo "skip: local branch '${BRANCH}' does not exist"
fi

echo "== 3. fetch --prune (done in step 0)"

echo "== 4. merge --ff-only origin/main"
git -C "${MAIN_ROOT}" merge --ff-only origin/main || {
  echo "error: git merge --ff-only origin/main failed (local main has diverged?)." >&2
  exit 1
}
echo "main: $(git -C "${MAIN_ROOT}" rev-parse --short HEAD)"

echo "== 5. bootstrap manifest"
if [ -f "${MANIFEST}" ]; then
  mkdir -p "${ARCHIVE_DIR}"
  mv "${MANIFEST}" "${ARCHIVE_DIR}/"
  echo "archived: ${ARCHIVE_DIR}/$(basename "${MANIFEST}")"
else
  echo "skip: no manifest at ${MANIFEST}"
fi
exit 0
