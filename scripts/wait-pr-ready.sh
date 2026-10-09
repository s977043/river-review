#!/usr/bin/env bash
# Wait until one or more pull requests settle, then report their state.
# Use instead of hand-writing a `for i in $(seq ...); do gh pr view ...; sleep`
# loop: those loops are retyped per session and mis-typing one turns it into an
# infinite wait or an early bail-out.
#
# The PR state is read through `gh api repos/:owner/:repo/pulls/<N>` rather than
# `gh pr view`, because `gh pr view` has been observed serving a stale head SHA
# (PR #2021). Check runs are read with the full 40-character head SHA, because
# `actions/runs?head_sha=` and `gh run list --commit` match the full SHA only and
# return zero rows with no error for an abbreviated one.
#
# SSoT for the bot-push / `action_required` stall this script surfaces:
#   docs/runbook/bot-pushed-head-kick.md
#
# Usage:
#   scripts/wait-pr-ready.sh <pr-number> [pr-number ...]
#   TIMEOUT_SECONDS=1800 INTERVAL_SECONDS=30 scripts/wait-pr-ready.sh 123 124
#   REPO=owner/repo scripts/wait-pr-ready.sh 123
#
# A head whose workflows were stalled by a bot push is reported too. Such a head
# has no check runs to fail: on PR #2023 the check-runs endpoint listed a single
# entry (`Vercel Preview Comments`) while `actions/runs?head_sha=` listed 13 runs,
# all `action_required`. The stall is therefore read from the runs endpoint, and
# it is reported as a failure rather than waited on, because waiting never clears
# it -- see the runbook for the escape. For each stalled PR the dry-run verdict
# of scripts/pr-unstall.sh is appended to stderr, followed by the
# `scripts/pr-unstall.sh --execute <N>` command that escapes it. The escape is
# printed, never run, because it pushes. A failing pr-unstall.sh is reported
# with its exit status and does not change this script's exit code.
#
# Exit codes:
#   0  every PR settled with no failing check and no stalled run
#   1  at least one PR has a failing check or a stalled (`action_required`) run
#   2  timed out before every PR settled
#   64 usage error
#   65 a GitHub API read failed -- the PR state could not be determined
#
# Exit 65 exists so that a failed read is never reported as "no failing check".
# Suppressing an API error into an empty result would let a permission error, a
# rate limit, or a dropped connection produce a green exit 0.

set -euo pipefail

if [ "$#" -eq 0 ]; then
  echo "usage: scripts/wait-pr-ready.sh <pr-number> [pr-number ...]" >&2
  exit 64
fi

for arg in "$@"; do
  case "${arg}" in
    '' | *[!0-9]*)
      echo "error: '${arg}' is not a PR number." >&2
      exit 64
      ;;
  esac
done

TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-1800}"
INTERVAL_SECONDS="${INTERVAL_SECONDS:-30}"
REPO="${REPO:-$(gh repo view --json nameWithOwner --jq .nameWithOwner)}"
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

# mergeable_state values that mean GitHub has finished computing the PR.
# `blocked` and `unknown` are deliberately absent: `blocked` is the state a
# bot-pushed head sits in while its workflows stay `action_required`, and
# `unknown` means the mergeability computation is still running.
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
    exit 65
  fi
  printf '%s' "${out}"
}

is_settled() {
  case "$1" in
    clean | dirty | behind) return 0 ;;
    *) return 1 ;;
  esac
}

deadline=$(($(date +%s) + TIMEOUT_SECONDS))
exit_code=2

while :; do
  all_settled=1
  any_failed=0
  report=''
  stalled_prs=''

  for pr in "$@"; do
    pr_json=$(gh_api_or_die "PR #${pr} in ${REPO}" "repos/${REPO}/pulls/${pr}")

    head_sha=$(printf '%s' "${pr_json}" | jq -r '.head.sha')
    state=$(printf '%s' "${pr_json}" | jq -r '.mergeable_state // "unknown"')

    failed=$(gh_api_or_die "check runs of #${pr}" \
      "repos/${REPO}/commits/${head_sha}/check-runs?per_page=100" \
      --jq '[.check_runs[] | select(.conclusion == "failure" or .conclusion == "timed_out" or .conclusion == "cancelled") | "\(.name) (\(.conclusion))"] | join(", ")')

    # The full 40-character SHA is mandatory here: an abbreviated SHA matches
    # nothing and returns total_count 0 without an error.
    stalled=$(gh_api_or_die "workflow runs of #${pr}" \
      "repos/${REPO}/actions/runs?head_sha=${head_sha}&per_page=100" \
      --jq '[.workflow_runs[] | select(.conclusion == "action_required") | .name] | join(", ")')

    report="${report}#${pr}	${head_sha}	${state}	${failed:--}	${stalled:--}
"

    if [ -n "${stalled}" ]; then
      stalled_prs="${stalled_prs} ${pr}"
    fi
    if [ -n "${failed}" ] || [ -n "${stalled}" ]; then
      any_failed=1
    fi
    if ! is_settled "${state}"; then
      all_settled=0
    fi
  done

  if [ "${any_failed}" -eq 1 ]; then
    exit_code=1
    break
  fi
  if [ "${all_settled}" -eq 1 ]; then
    exit_code=0
    break
  fi
  if [ "$(date +%s)" -ge "${deadline}" ]; then
    exit_code=2
    break
  fi

  sleep "${INTERVAL_SECONDS}"
done

printf 'pr\thead_sha\tmergeable_state\tfailed_checks\tstalled_runs\n'
printf '%s' "${report}"

case "${exit_code}" in
  0) echo "All PRs settled with no failing check." ;;
  1)
    echo "At least one PR has a failing check or a stalled run." >&2
    echo "For a non-empty stalled_runs column, follow docs/runbook/bot-pushed-head-kick.md." >&2
    for pr in ${stalled_prs}; do
      echo "" >&2
      echo "pr-unstall.sh dry-run for #${pr}:" >&2
      unstall_rc=0
      REPO="${REPO}" "${SCRIPT_DIR}/pr-unstall.sh" "${pr}" </dev/null >&2 2>&1 || unstall_rc=$?
      if [ "${unstall_rc}" -ne 0 ]; then
        echo "pr-unstall.sh exited ${unstall_rc} for #${pr}; the stall above still stands." >&2
      fi
      echo "To escape (pushes from your own account): ${SCRIPT_DIR}/pr-unstall.sh --execute ${pr}" >&2
    done
    ;;
  2) echo "Timed out after ${TIMEOUT_SECONDS}s before every PR settled." >&2 ;;
esac

exit "${exit_code}"
