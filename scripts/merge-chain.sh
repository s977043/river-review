#!/usr/bin/env bash
# Merge N independent PRs one after another under `strict: true` branch
# protection, without re-running the whole CI matrix N times.
#
# This is the `CLAUDE.md` guard "Strict-mode batch merge" and the
# docs/governance.md "マージ前チェックリスト" run as one loop:
#
#   1. bring every remaining PR to the same `origin/main` with
#      `PUT repos/:owner/:repo/pulls/<N>/update-branch` (a 422 for a merge
#      conflict is handed to scripts/pr-unstall.sh, which prints the manual
#      procedure; a 422 for "no new commits" means the head is current)
#      (an accepted update-branch is followed by a wait for the head to move,
#      because the 202 is asynchronous)
#   2. wait for CI on all of them with scripts/wait-pr-ready.sh
#   3. judge the DISPOSITION of the first PR:
#        (a) line comments        `pulls/<N>/comments`   must be 0
#        (b) human issue comments `issues/<N>/comments`  must be 0
#                                 (`*[bot]` and `vercel*` authors are ignored)
#        (c) labels               must not contain `blocked`
#        (d) required checks      latest run per name must be `pass`, using
#                                 the exact jq from docs/governance.md
#   4. if every item is clear, `gh pr merge <N> --squash --delete-branch`
#      with the PR title as the squash subject; if ANY item is not clear,
#      stop and say which PR and which item -- that is a request for a human
#      decision, not a failure
#   5. update the remaining PRs again and go back to 2
#
# Comment counts are only counted here, not judged: a single human comment
# stops the chain so that its disposition can be recorded by a person (see
# governance.md for the disposition rules). This script never reads or
# alters the PR body, so a stray `Closes` in it is the PR author's to fix.
#
# Usage:
#   scripts/merge-chain.sh <pr-number> [pr-number ...]             # dry-run
#   scripts/merge-chain.sh --execute <pr-number> [pr-number ...]   # merge
#   REPO=owner/repo scripts/merge-chain.sh 123 124
#
# Dry-run judges the disposition of every PR in one pass, prints the command
# each step would run, and ends with a table. It never writes.
#
# Exit codes:
#   0  every PR merged (dry-run: every PR would merge)
#   1  CI failed, a head is stalled, update-branch hit a merge conflict, or
#      an accepted update-branch never moved the head
#   2  a GitHub API read failed -- the state could not be determined
#   3  a disposition item stopped the chain (human decision needed)
#   4  wait-pr-ready.sh timed out (TIMEOUT_SECONDS) before CI settled
#   64 usage error
#
# A head with `action_required` runs beside `queued` / `in_progress` runs is
# still moving: wait-pr-ready.sh reports it (exit 1) and pr-unstall.sh judges
# it "not stalled". Re-run the chain once those runs finish; if only
# `action_required` remains, pr-unstall.sh takes over.
#
# The judging functions (`count_human_comments`, `has_blocked_label`,
# `failing_required_checks`) take JSON and call no `gh`, so they can be
# exercised by sourcing this file:
#   source scripts/merge-chain.sh && count_human_comments "$(cat comments.json)"

set -euo pipefail

WRITE_ACCOUNT="${WRITE_ACCOUNT:-s977043}"
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

usage() {
  echo "usage: scripts/merge-chain.sh [--execute] <pr-number> [pr-number ...]" >&2
  exit 64
}

# Run a `gh api` read, or abort. Never let a failed read fall through as an
# empty result: that is what turns an API error into a false green.
gh_api_or_die() {
  local what="$1"
  shift
  local out
  if ! out=$(gh api "$@" 2>&1); then
    echo "error: GitHub API read failed (${what})." >&2
    echo "       command: gh api $*" >&2
    echo "       If this is a 404 or a permission error, check the active gh" >&2
    echo "       account first: gh api user --jq .login" >&2
    echo "${out}" >&2
    exit 2
  fi
  printf '%s' "${out}"
}

# count_human_comments <issue-comments-json>
# Counts comments whose author is neither `*[bot]` nor `vercel*`.
# `gh api --paginate` without --slurp concatenates one array per page; the
# `.[]?` over each top-level value copes with both one and many pages.
count_human_comments() {
  printf '%s' "$1" | jq -s '
    [ .[] | .[]? | (.user.login // "")
      | select((endswith("[bot]") | not) and (startswith("vercel") | not)) ]
    | length'
}

# count_line_comments <pull-comments-json>
count_line_comments() {
  printf '%s' "$1" | jq -s '[ .[] | .[]? ] | length'
}

# has_blocked_label <labels-json>   (the `.labels` array of a pull object)
# Prints `yes` or `no`.
has_blocked_label() {
  printf '%s' "$1" | jq -r 'if any(.[]; .name == "blocked") then "yes" else "no" end'
}

# failing_required_checks <gh-pr-checks-json>
# Applies the docs/governance.md § "1. CI green の確認" jq verbatim -- keep
# the same name and pending / startedAt handling -- then prints every
# surviving check that is not in the `pass` bucket, one `name<TAB>bucket`
# per line. Empty output means green.
failing_required_checks() {
  printf '%s' "$1" | jq -r '
    group_by(.name) | map(if any(.[]; .bucket == "pending") then (map(select(.bucket == "pending")) | first) else max_by(.startedAt) end) | .[] | select(.bucket != "skipping")
    | select(.bucket != "pass") | "\(.name)\t\(.bucket)"'
}

ensure_write_account() {
  gh api user --jq .login | grep -q "${WRITE_ACCOUNT}" || gh auth switch -u "${WRITE_ACCOUNT}"
}

# read_checks <pr>  -- `gh pr checks` exits non-zero when a check is failing or
# pending, so its status cannot separate "red" from "read failed"; the output
# being a JSON array is what tells the two apart.
read_checks() {
  local pr="$1" out
  out=$(gh pr checks "${pr}" --repo "${REPO}" --json name,bucket,startedAt 2>&1) || true
  if ! printf '%s' "${out}" | jq -e 'type == "array"' >/dev/null 2>&1; then
    echo "error: gh pr checks #${pr} did not return a JSON array:" >&2
    echo "${out}" >&2
    exit 2
  fi
  printf '%s' "${out}"
}

# judge_pr <pr>  -- sets DISPOSITION_* globals and returns 0 (clear) / 2 (a
# read failed, nothing judged) / 3 (stop).
#
# The caller captures the return value, and any form that does so (`if f`,
# `f || rc=$?`, `f && a || b`) runs the function with `set -e` suspended. An
# `exit 2` inside `$(...)` then only leaves that subshell, and the empty
# result would read as green (#2102). Every read therefore carries an
# explicit `|| return 2`; the `exit 2` in the helpers stays for direct callers.
judge_pr() {
  local pr="$1" pr_json line_json issue_json checks_json
  pr_json=$(gh_api_or_die "PR #${pr} in ${REPO}" "repos/${REPO}/pulls/${pr}") || return 2
  DISPOSITION_TITLE=$(printf '%s' "${pr_json}" | jq -r '.title')
  DISPOSITION_STATE=$(printf '%s' "${pr_json}" | jq -r '.state')
  DISPOSITION_BLOCKED=$(has_blocked_label "$(printf '%s' "${pr_json}" | jq -c '.labels // []')")

  line_json=$(gh_api_or_die "line comments of #${pr}" --paginate "repos/${REPO}/pulls/${pr}/comments?per_page=100") || return 2
  DISPOSITION_LINE=$(count_line_comments "${line_json}")

  issue_json=$(gh_api_or_die "issue comments of #${pr}" --paginate "repos/${REPO}/issues/${pr}/comments?per_page=100") || return 2
  DISPOSITION_HUMAN=$(count_human_comments "${issue_json}")

  checks_json=$(read_checks "${pr}") || return 2
  # A jq failure here (a non-object element, a missing field) is a read
  # failure, not "no failing checks": never let it fall through as an empty
  # result, which would read as a green verdict.
  local checks_lines
  if ! checks_lines=$(failing_required_checks "${checks_json}"); then
    echo "error: could not judge the checks of #${pr}; gh pr checks returned an unexpected shape:" >&2
    printf '%s\n' "${checks_json}" >&2
    return 2
  fi
  DISPOSITION_CHECKS=$(printf '%s' "${checks_lines}" | tr '\t' '=' | paste -sd ',' -)

  DISPOSITION_REASONS=''
  [ "${DISPOSITION_LINE}" -eq 0 ] || DISPOSITION_REASONS="${DISPOSITION_REASONS} line-comments=${DISPOSITION_LINE}"
  [ "${DISPOSITION_HUMAN}" -eq 0 ] || DISPOSITION_REASONS="${DISPOSITION_REASONS} human-comments=${DISPOSITION_HUMAN}"
  [ "${DISPOSITION_BLOCKED}" = "no" ] || DISPOSITION_REASONS="${DISPOSITION_REASONS} label=blocked"
  [ -z "${DISPOSITION_CHECKS}" ] || DISPOSITION_REASONS="${DISPOSITION_REASONS} checks=${DISPOSITION_CHECKS}"
  [ -z "${DISPOSITION_REASONS}" ] || return 3
  return 0
}

# wait_for_new_head <pr> <old-sha>
# `update-branch` answers 202 and pushes the merge commit asynchronously.
# `wait-pr-ready.sh` treats `behind` as settled, so calling it against the old
# head returns 0 at once and the later `gh pr merge` is refused by strict
# mode. Poll until the head moves, for at most UPDATE_BRANCH_WAIT_SECONDS
# (default 120; 0 skips the wait). Returns 1 when the head never moved.
wait_for_new_head() {
  local pr="$1" before="$2" deadline now
  local limit="${UPDATE_BRANCH_WAIT_SECONDS:-120}"
  [ "${limit}" -gt 0 ] || return 0
  deadline=$(($(date +%s) + limit))
  while :; do
    now=$(gh_api_or_die "PR #${pr} in ${REPO}" "repos/${REPO}/pulls/${pr}" --jq '.head.sha') || return 2
    if [ "${now}" != "${before}" ]; then
      echo "  #${pr} head moved ${before:0:8} -> ${now:0:8}"
      return 0
    fi
    if [ "$(date +%s)" -ge "${deadline}" ]; then
      echo "error: #${pr} head did not move within ${limit}s after update-branch was accepted." >&2
      return 1
    fi
    sleep "${INTERVAL_SECONDS:-5}"
  done
}

# update_branch <pr>  -- returns 0 (accepted and head moved, or already current),
# 1 (conflict, or the head never moved), 2 (a read failed). Called as
# `update_branch || ...`, so `set -e` is suspended inside: see judge_pr.
update_branch() {
  local pr="$1" out
  local before
  before=$(gh_api_or_die "PR #${pr} in ${REPO}" "repos/${REPO}/pulls/${pr}" --jq '.head.sha') || return 2
  if out=$(gh api --method PUT "repos/${REPO}/pulls/${pr}/update-branch" 2>&1); then
    echo "  update-branch accepted for #${pr}"
    wait_for_new_head "${pr}" "${before}"
    return $?
  fi
  if printf '%s' "${out}" | grep -q 'HTTP 422' && printf '%s' "${out}" | grep -qi 'no new commits'; then
    echo "  #${pr} is already at the base tip (422: no new commits)"
    return 0
  fi
  if printf '%s' "${out}" | grep -q 'HTTP 422'; then
    echo "update-branch returned 422 for #${pr}; handing over to scripts/pr-unstall.sh for the procedure." >&2
    echo "${out}" >&2
    REPO="${REPO}" "${SCRIPT_DIR}/pr-unstall.sh" "${pr}" >&2 || true
    return 1
  fi
  echo "error: update-branch failed for #${pr}:" >&2
  echo "${out}" >&2
  return 2
}

print_table_header() {
  printf 'pr\tstate\tline_comments\thuman_comments\tblocked\tnon_pass_checks\tverdict\ttitle\n'
}

print_table_row() {
  local pr="$1" verdict="$2"
  printf '#%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
    "${pr}" "${DISPOSITION_STATE}" "${DISPOSITION_LINE}" "${DISPOSITION_HUMAN}" \
    "${DISPOSITION_BLOCKED}" "${DISPOSITION_CHECKS:--}" "${verdict}" "${DISPOSITION_TITLE}"
}

main() {
  local execute=0
  local -a prs=()
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --execute) execute=1 ;;
      -h | --help) usage ;;
      '' | -* | *[!0-9]*)
        echo "error: '$1' is not a PR number." >&2
        usage
        ;;
      *) prs+=("$1") ;;
    esac
    shift
  done
  [ "${#prs[@]}" -gt 0 ] || usage

  REPO="${REPO:-$(gh repo view --json nameWithOwner --jq .nameWithOwner)}"
  local guard="gh api user --jq .login | grep -q ${WRITE_ACCOUNT} || gh auth switch -u ${WRITE_ACCOUNT}"

  # Drop PRs that are already merged / closed before planning anything.
  local -a remaining=()
  local pr merged state
  for pr in "${prs[@]}"; do
    merged=$(gh_api_or_die "PR #${pr} in ${REPO}" "repos/${REPO}/pulls/${pr}" --jq '"\(.state) \(.merged)"')
    state="${merged% *}"
    merged="${merged#* }"
    if [ "${merged}" = "true" ]; then
      echo "#${pr} is already merged; skipped."
    elif [ "${state}" != "open" ]; then
      echo "#${pr} is ${state} and not merged; skipped."
    else
      remaining+=("${pr}")
    fi
  done
  if [ "${#remaining[@]}" -eq 0 ]; then
    echo "Nothing to merge."
    return 0
  fi

  if [ "${execute}" -eq 0 ]; then
    echo "dry-run for: ${remaining[*]} (re-run with --execute to merge)"
    echo "step 1  ${guard}"
    for pr in "${remaining[@]}"; do
      echo "        gh api --method PUT repos/${REPO}/pulls/${pr}/update-branch"
    done
    echo "step 2  ${SCRIPT_DIR}/wait-pr-ready.sh ${remaining[*]}"
    echo "step 3  disposition (judged now, against the current heads):"
    local rc=0 judge_rc verdict
    print_table_header
    for pr in "${remaining[@]}"; do
      judge_pr "${pr}" && judge_rc=0 || judge_rc=$?
      case "${judge_rc}" in
        0) verdict="merge" ;;
        3)
          verdict="STOP:${DISPOSITION_REASONS# }"
          rc=3
          ;;
        *)
          echo "error: could not judge #${pr} (read failed); nothing decided." >&2
          return 2
          ;;
      esac
      print_table_row "${pr}" "${verdict}"
    done
    echo "step 4  gh pr merge <N> --squash --delete-branch --subject '<title> (#N)'  (per PR, only when its verdict is merge)"
    echo "step 5  update-branch the rest, back to step 2"
    return "${rc}"
  fi

  ensure_write_account
  local -a rest=()
  local merged_so_far=''
  while [ "${#remaining[@]}" -gt 0 ]; do
    echo "step 1  update-branch: ${remaining[*]}"
    for pr in "${remaining[@]}"; do
      update_branch "${pr}" || return $?
    done

    echo "step 2  wait-pr-ready: ${remaining[*]}"
    local wait_rc=0
    REPO="${REPO}" "${SCRIPT_DIR}/wait-pr-ready.sh" "${remaining[@]}" || wait_rc=$?
    case "${wait_rc}" in
      0) ;;
      2)
        echo "wait-pr-ready timed out; nothing merged from: ${remaining[*]}" >&2
        return 4
        ;;
      65) return 2 ;;
      *) return 1 ;;
    esac

    pr="${remaining[0]}"
    echo "step 3  disposition of #${pr}"
    print_table_header
    local judge_rc
    judge_pr "${pr}" && judge_rc=0 || judge_rc=$?
    case "${judge_rc}" in
      0) print_table_row "${pr}" "merge" ;;
      3)
        print_table_row "${pr}" "STOP:${DISPOSITION_REASONS# }"
        echo "stopped at #${pr}:${DISPOSITION_REASONS} -- a human decision is needed (docs/governance.md マージ前チェックリスト)." >&2
        echo "merged so far: ${merged_so_far:-(none)}" >&2
        echo "remaining, not merged: ${remaining[*]}" >&2
        return 3
        ;;
      *)
        echo "error: could not judge #${pr} (read failed); nothing merged from: ${remaining[*]}" >&2
        echo "merged so far: ${merged_so_far:-(none)}" >&2
        return 2
        ;;
    esac

    echo "step 4  gh pr merge ${pr} --squash --delete-branch"
    ensure_write_account
    gh pr merge "${pr}" --repo "${REPO}" --squash --delete-branch --subject "${DISPOSITION_TITLE} (#${pr})"
    echo "merged #${pr}"
    merged_so_far="${merged_so_far:+${merged_so_far} }#${pr}"

    # bash 3.2 (the system bash on macOS) treats `"${arr[@]}"` on an empty array as
    # an unbound variable under `set -u`, so dropping the last PR aborted the script
    # right after a successful merge. Rebuild the list only while entries remain.
    if [ "${#remaining[@]}" -gt 1 ]; then
      remaining=("${remaining[@]:1}")
    else
      remaining=()
    fi
  done
  echo "All PRs merged."
  return 0
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  main "$@"
fi
