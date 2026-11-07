#!/usr/bin/env bash
# Run the read-only checks of .claude/commands/preflight.md and return the
# verdict as an exit code, so that a delegated worker can run them too.
#
# PR state always comes from REST (`gh api`): `gh pr list` lags behind merges, so
# its hits are re-read before they are reported. The only local side effect is
# `git fetch origin main`.
#
# Any read that fails or returns an unexpected shape stops with exit 2. It must
# never fall through to SAFE.
#
# Usage:
#   scripts/preflight.sh [<PR number> | #<PR number> | <keyword> | --issue <N>]...
#   RIVER_PREFLIGHT_TIMEOUT=<seconds> sets the deadline per network read (default 30).
#
# Exit codes:
#   0  SAFE
#   1  needs confirmation: OBSOLETE, PARALLEL_WORK_DETECTED, or PARTIAL
#   2  a read failed; nothing can be said about the task
#   64 usage error

set -uo pipefail

usage() {
  echo "usage: scripts/preflight.sh [<PR number> | #<PR number> | <keyword> | --issue <N>]..." >&2
  exit 64
}

fail() {
  echo "error: $1" >&2
  echo "verdict: UNKNOWN (read failed; check 'gh auth status' for an account switch first)"
  exit 2
}

PRS=()
ISSUES=()
KEYWORDS=()
while [ "$#" -gt 0 ]; do
  case "$1" in
    --issue)
      [ "$#" -ge 2 ] || usage
      case "$2" in '' | *[!0-9]*) usage ;; esac
      ISSUES+=("$2")
      shift 2
      ;;
    -*)
      usage
      ;;
    *[![:space:]]*)
      number="${1#\#}"
      case "${number}" in
        '' | *[!0-9]*) KEYWORDS+=("$1") ;;
        *) PRS+=("${number}") ;;
      esac
      shift
      ;;
    *)
      usage
      ;;
  esac
done
[ "$(( ${#PRS[@]} + ${#ISSUES[@]} + ${#KEYWORDS[@]} ))" -gt 0 ] || usage

READ_TIMEOUT="${RIVER_PREFLIGHT_TIMEOUT-30}"
case "${READ_TIMEOUT}" in
  '' | *[!0-9]* | 0) usage ;;
esac

# macOS has no `timeout`, but perl ships with macOS and the CI runners. The child
# runs in its own process group so that a grandchild holding the stdout pipe dies
# with it; otherwise `$(...)` would keep waiting after the deadline.
with_deadline() {
  perl -e '
    my $seconds = shift;
    my $pid = fork() // exit 127;
    if (!$pid) { setpgrp(0, 0); exec { $ARGV[0] } @ARGV; exit 127; }
    $SIG{ALRM} = sub { kill "KILL", -$pid; print STDERR "timed out: @ARGV\n"; exit 124; };
    alarm $seconds;
    waitpid($pid, 0);
    exit(($? >> 8) || ($? ? 1 : 0));
  ' "${READ_TIMEOUT}" "$@"
}

# Prints open / merged / closed. `gh` and `jq` failures, an empty body, and an
# unknown state all return non-zero.
read_state() {
  local body
  body="$(with_deadline gh api "repos/{owner}/{repo}/$1")" || return 2
  printf '%s' "${body}" | jq -er '
    if .state == "open" then "open"
    elif .state == "closed" then (if .merged == true then "merged" else "closed" end)
    else error("unknown state") end'
}

OBSOLETE=0
PARALLEL=0
TARGETS_OK=0
TARGETS_NG=0

check_target() {
  local label="$1" path="$2" state
  state="$(read_state "${path}")" || fail "could not read the state of ${label}"
  echo "${label}: ${state}"
  if [ "${state}" = "open" ]; then
    TARGETS_OK=$((TARGETS_OK + 1))
  else
    TARGETS_NG=$((TARGETS_NG + 1))
    OBSOLETE=$((OBSOLETE + 1))
  fi
}

# ${arr[@]+...}: bash 3.2 treats expanding an empty array as unbound under `set -u`.
for pr in ${PRS[@]+"${PRS[@]}"}; do
  check_target "PR #${pr}" "pulls/${pr}"
done
for issue in ${ISSUES[@]+"${ISSUES[@]}"}; do
  check_target "issue #${issue}" "issues/${issue}"
done

is_target_pr() {
  local pr
  for pr in ${PRS[@]+"${PRS[@]}"}; do
    [ "${pr}" = "$1" ] && return 0
  done
  return 1
}

check_similar_prs() {
  local list_state="$1" keyword="$2" limit="$3" body lines number detail state
  body="$(with_deadline gh pr list --state "${list_state}" --search "${keyword}" --limit "${limit}" \
    --json number,title,headRefName,author)" \
    || fail "gh pr list --state ${list_state} failed for '${keyword}'"
  lines="$(printf '%s' "${body}" | jq -er '
    if type == "array" then
      map("\(.number)\t\(.title) (\(.author.login // "unknown"), \(.headRefName))") | join("\n")
    else error("not an array") end')" \
    || fail "unexpected gh pr list response for '${keyword}'"
  while IFS=$'\t' read -r number detail; do
    [ -n "${number}" ] || continue
    is_target_pr "${number}" && continue
    state="$(read_state "pulls/${number}")" || fail "could not read the state of PR #${number}"
    echo "similar PR for '${keyword}': #${number} [${state}] ${detail}"
    PARALLEL=$((PARALLEL + 1))
  done < <(printf '%s\n' "${lines}")
}

if [ "${#KEYWORDS[@]}" -gt 0 ]; then
  with_deadline git fetch --quiet origin main || fail "git fetch origin main failed"
  # FETCH_HEAD: a narrowed remote.origin.fetch leaves origin/main stale after this fetch.
  MAIN_LOG="$(git log FETCH_HEAD --oneline -15)" || fail "git log FETCH_HEAD failed"
  for keyword in "${KEYWORDS[@]}"; do
    matches="$(printf '%s\n' "${MAIN_LOG}" | grep -iF -- "${keyword}")"
    if [ -n "${matches}" ]; then
      echo "main commits matching '${keyword}':"
      printf '%s\n' "${matches}"
      OBSOLETE=$((OBSOLETE + 1))
    fi
    check_similar_prs open "${keyword}" 30
    check_similar_prs closed "${keyword}" 5
  done
fi

if [ "${TARGETS_OK}" -gt 0 ] && [ "${TARGETS_NG}" -gt 0 ]; then
  echo "verdict: PARTIAL"
elif [ "${OBSOLETE}" -gt 0 ] && [ "${PARALLEL}" -gt 0 ]; then
  echo "verdict: OBSOLETE, PARALLEL_WORK_DETECTED"
elif [ "${OBSOLETE}" -gt 0 ]; then
  echo "verdict: OBSOLETE"
elif [ "${PARALLEL}" -gt 0 ]; then
  echo "verdict: PARALLEL_WORK_DETECTED"
else
  echo "verdict: SAFE"
  exit 0
fi
exit 1
