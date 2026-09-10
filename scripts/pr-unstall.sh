#!/usr/bin/env bash
# Detect a bot-pushed, stalled PR head and choose the escape for it.
#
# A head pushed by `github-actions[bot]` with `GITHUB_TOKEN` never runs its
# workflows: every run sits at `completed` / `action_required`, so the required
# contexts stay unreported and the PR shows `N of N required status checks are
# expected`. This script mechanises the decision that used to be made by hand:
#
#   1. read the head SHA (`repos/:owner/:repo/pulls/<N>`, full 40 chars) and its
#      workflow runs (`actions/runs?head_sha=`); one or more `action_required`
#      runs with nothing still queued / in progress means the head is stalled
#   2. a release-please head (`release-please--*`) is kicked with
#      scripts/release-please-kick.sh (empty commit from your own account)
#   3. any other head is advanced with
#      `PUT repos/:owner/:repo/pulls/<N>/update-branch`, whose merge commit is
#      pushed with your own token and therefore fires CI
#   4. a 422 from update-branch (merge conflict, or nothing to merge) cannot be
#      resolved from here: the local procedure is PRINTED, never run, because
#      it touches a working tree
#
# The cause and the decision rules stay in the `CLAUDE.md` guard
# "`N of N required checks are expected` = bot/GITHUB_TOKEN push"; the manual
# procedure stays in docs/runbook/bot-pushed-head-kick.md. This script does not
# replace either -- it runs the same steps and quotes the runbook when it stops.
#
# Usage:
#   scripts/pr-unstall.sh <pr-number>             # dry-run: judge, print next command
#   scripts/pr-unstall.sh --execute <pr-number>   # run step 2 or 3
#   REPO=owner/repo scripts/pr-unstall.sh 123
#
# Exit codes:
#   0  not stalled (or already merged / closed), or the escape was executed
#   1  stalled, but not resolvable from here (422 etc.); the procedure was printed
#   2  a GitHub API read failed -- the stall could not be judged
#   64 usage error
#
# Exit 2 exists so that a failed read is never reported as "not stalled".
#
# The judging functions (`judge_stall`, `choose_route`) take JSON / strings and
# call no `gh`, so they can be exercised by sourcing this file:
#   source scripts/pr-unstall.sh && judge_stall "$(cat runs.json)"

set -euo pipefail

WRITE_ACCOUNT="${WRITE_ACCOUNT:-s977043}"

usage() {
  echo "usage: scripts/pr-unstall.sh [--execute] <pr-number>" >&2
  exit 64
}

# Run a `gh api` read, or abort. Never let a failed read fall through as an
# empty result: that is what turns an API error into a false "not stalled".
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

# judge_stall <actions-runs-json>
# Prints one word:
#   stalled  at least one run is `action_required` AND no run is still moving
#            (`status` other than `completed`: queued, in_progress, waiting ...)
#            -- the head cannot advance on its own
#   clear    no `action_required` run, or something is still running (a kick
#            or an update-branch already landed; wait for it instead)
#   no-runs  the endpoint listed nothing -- ambiguous, never "stalled"
# This is the definition shared with scripts/wait-pr-ready.sh, which reports
# any `action_required` run: that script says "something is stalled", this one
# says "and nothing will clear it". A run count of zero is never the diagnosis
# (runbook, "A run count of zero is never the diagnosis"), so no-runs is
# reported separately rather than folded into either verdict.
judge_stall() {
  local runs_json="$1"
  printf '%s' "${runs_json}" | jq -r '
    (.workflow_runs // []) as $runs
    | if ($runs | length) == 0 then "no-runs"
      elif any($runs[]; .conclusion == "action_required")
           and (any($runs[]; .status != "completed") | not) then "stalled"
      else "clear" end'
}

# choose_route <head-ref>
# Prints `kick` for a release-please branch, `update-branch` otherwise.
choose_route() {
  case "$1" in
    release-please--*) echo "kick" ;;
    *) echo "update-branch" ;;
  esac
}

# Print the manual procedure for a 422 from update-branch. Which procedure
# depends on why GitHub refused; the message text is the only discriminator.
print_422_procedure() {
  # 以下の 2 つは #2144 まで `cat >&2 <<PROC` の heredoc だった。bash 5.3.15
  # （homebrew）は本体が 512 バイトを超える heredoc で決定論的に deadlock する。
  # conflict 側の本体は 538 バイトで帯に入り、`--execute` の 422 経路がそのまま
  # 固まっていた（隣の 318 バイト側は帯の下なので通っており、片方だけ落ちていた）。
  # #1951 が同じ原因で 3 本を直しているが、本スクリプトはその 16 日後に追加された
  # ため掃引の対象外だった。heredoc へ戻さないこと。
  local pr="$1" head_ref="$2" body="$3"
  local script_dir
  script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
  echo "update-branch returned 422 for #${pr}; nothing was changed." >&2
  echo "${body}" >&2
  if printf '%s' "${body}" | grep -qi 'no new commits'; then
    printf '%s\n' \
      'The head is not behind its base, so update-branch has nothing to merge' \
      '(runbook Step 2, "pure BLOCKED"). The remaining escape is an empty commit' \
      'pushed from your own account:' \
      '' \
      "  gh api user --jq .login | grep -q ${WRITE_ACCOUNT} || gh auth switch -u ${WRITE_ACCOUNT}" \
      "  ${script_dir}/release-please-kick.sh ${head_ref}" >&2
  else
    printf '%s\n' \
      'Resolve the conflict locally, from your own account, then push (fast-forward,' \
      'no force). This is not automated because it edits a working tree:' \
      '' \
      '  git fetch origin' \
      "  git switch ${head_ref}" \
      '  git merge origin/main' \
      '  # if the only conflicts are under runners/github-action/dist/**:' \
      '  npm run build:action && git add runners/github-action/dist' \
      '  git commit            # completes the merge' \
      '  git push              # fast-forward; do not rebase, do not force' \
      '' \
      'See docs/runbook/bot-pushed-head-kick.md and CLAUDE.md "Strict-mode batch merge".' >&2
  fi
}

ensure_write_account() {
  gh api user --jq .login | grep -q "${WRITE_ACCOUNT}" || gh auth switch -u "${WRITE_ACCOUNT}"
}

main() {
  local execute=0 pr=''
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --execute) execute=1 ;;
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

  local repo="${REPO:-$(gh repo view --json nameWithOwner --jq .nameWithOwner)}"
  local script_dir
  script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

  local pr_json head_sha head_ref merged state
  pr_json=$(gh_api_or_die "PR #${pr} in ${repo}" "repos/${repo}/pulls/${pr}")
  head_sha=$(printf '%s' "${pr_json}" | jq -r '.head.sha')
  head_ref=$(printf '%s' "${pr_json}" | jq -r '.head.ref')
  merged=$(printf '%s' "${pr_json}" | jq -r '.merged')
  state=$(printf '%s' "${pr_json}" | jq -r '.state')

  echo "#${pr}	${head_ref}	${head_sha}	state=${state}	merged=${merged}"

  if [ "${merged}" = "true" ]; then
    echo "#${pr} is already merged; nothing to unstall."
    return 0
  fi
  if [ "${state}" != "open" ]; then
    echo "#${pr} is ${state} and not merged; nothing to unstall."
    return 0
  fi

  # The full 40-character SHA is mandatory here: an abbreviated SHA matches
  # nothing and returns total_count 0 without an error.
  local runs_json verdict
  runs_json=$(gh_api_or_die "workflow runs of #${pr}" \
    "repos/${repo}/actions/runs?head_sha=${head_sha}&per_page=100")
  verdict=$(judge_stall "${runs_json}")
  printf '%s' "${runs_json}" | jq -r '.workflow_runs[] | "  \(.name)\t\(.status)\t\(.conclusion)"'

  case "${verdict}" in
    clear)
      echo "#${pr} is not stalled: no action_required run of ${head_sha}, or a run is still moving."
      return 0
      ;;
    no-runs)
      echo "#${pr}: the runs endpoint listed nothing for ${head_sha}." >&2
      echo "  Zero is ambiguous and never the diagnosis; re-check the SHA and" >&2
      echo "  take a positive control per docs/runbook/bot-pushed-head-kick.md." >&2
      return 0
      ;;
  esac

  local route
  route=$(choose_route "${head_ref}")
  echo "#${pr} is STALLED: action_required runs of ${head_sha} and nothing still moving."
  echo "route: ${route}"

  local guard="gh api user --jq .login | grep -q ${WRITE_ACCOUNT} || gh auth switch -u ${WRITE_ACCOUNT}"
  if [ "${execute}" -eq 0 ]; then
    echo "dry-run; next command (re-run with --execute to run it):"
    echo "  ${guard}"
    case "${route}" in
      kick) echo "  ${script_dir}/release-please-kick.sh ${head_ref}" ;;
      update-branch) echo "  gh api --method PUT repos/${repo}/pulls/${pr}/update-branch" ;;
    esac
    return 0
  fi

  ensure_write_account
  case "${route}" in
    kick)
      REPO="${repo}" "${script_dir}/release-please-kick.sh" "${head_ref}"
      echo "kicked ${head_ref}; wait for the new head with scripts/wait-pr-ready.sh ${pr}"
      return 0
      ;;
    update-branch)
      local out
      if out=$(gh api --method PUT "repos/${repo}/pulls/${pr}/update-branch" 2>&1); then
        echo "${out}"
        echo "update-branch accepted for #${pr}; wait for the new head with scripts/wait-pr-ready.sh ${pr}"
        return 0
      fi
      if printf '%s' "${out}" | grep -q 'HTTP 422'; then
        print_422_procedure "${pr}" "${head_ref}" "${out}"
        return 1
      fi
      echo "error: update-branch failed for #${pr} (not a 422):" >&2
      echo "${out}" >&2
      return 2
      ;;
  esac
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  main "$@"
fi
