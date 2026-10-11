#!/usr/bin/env bash
# Verify a delegated agent's completion report from the parent side (#2607).
#
# Runs Steps 1-4 of .claude/commands/verify-agent-report.md and prints one
# PASS / FAIL row per claim. Step 5 (re-running the claimed tests) stays manual.
# Read-only: the only write is `git fetch`, which updates FETCH_HEAD.
#
# Usage:
#   scripts/verify-agent-report.sh [options] <branch> [PR|-] [SHA|-] [files...]
#   options:
#     --worktree <path>   also check that the worktree HEAD log contains the SHA,
#                         that it is clean, and that the files exist there
#     --repo-dir <path>   git repository to query (default: current directory)
#   REMOTE=origin REPO=owner/repo  override the remote / the gh repository
#
# Exit codes:
#   0   PASS: every claim matched (WARN rows allowed)
#   1   FABRICATION_SUSPECTED: at least one claim did not match
#
# WARN marks a claim that is real but no longer the tip: the claimed SHA is an
# ancestor of the branch / PR head (e.g. a bot pushed a dist rebuild on top).
#   64  usage error
#
# The judging functions (`judge_sha`, `judge_pr`) take strings / JSON and call
# no `gh`, so they can be exercised by sourcing this file.

set -euo pipefail

REMOTE="${REMOTE:-origin}"
FAILED=0

usage() {
  echo "usage: scripts/verify-agent-report.sh [--worktree <path>] [--repo-dir <path>] <branch> [PR|-] [SHA|-] [files...]" >&2
  exit 64
}

row() {
  local verdict="$1" check="$2" detail="$3"
  printf '%s\t%s\t%s\n' "${verdict}" "${check}" "${detail}"
  case "${verdict}" in PASS | WARN) ;; *) FAILED=1 ;; esac
}

# judge_sha <claimed> <actual>
# Prints PASS when the claimed SHA (at least 7 hex chars) is a prefix of actual.
judge_sha() {
  local claimed="$1" actual="$2"
  if [[ ! "${claimed}" =~ ^[0-9a-f]{7,40}$ ]]; then
    echo "FAIL claimed SHA '${claimed}' is not 7-40 hex chars"
  elif [ -n "${actual}" ] && [ "${actual#"${claimed}"}" != "${actual}" ]; then
    echo "PASS"
  else
    echo "FAIL claimed ${claimed}, actual ${actual:-<none>}"
  fi
}

# judge_pr <pr-json> <repo> <claimed-sha|->
# Checks the PR url belongs to <repo> and, when given, that headRefOid matches.
judge_pr() {
  local json="$1" repo="$2" claimed="$3" url head
  url=$(printf '%s' "${json}" | jq -r '.url // ""')
  head=$(printf '%s' "${json}" | jq -r '.headRefOid // ""')
  if [[ "${url}" != "https://github.com/${repo}/pull/"* ]]; then
    echo "FAIL url ${url:-<none>} is not in ${repo}"
  elif [ "${claimed}" != "-" ]; then
    judge_sha "${claimed}" "${head}"
  else
    echo "PASS"
  fi
}

main() {
  local worktree='' repo_dir='.'
  local positional=()
  while [ "$#" -gt 0 ]; do
    case "$1" in
      --worktree) [ "$#" -ge 2 ] || usage; worktree="$2"; shift ;;
      --repo-dir) [ "$#" -ge 2 ] || usage; repo_dir="$2"; shift ;;
      -h | --help) usage ;;
      *) positional+=("$1") ;;
    esac
    shift
  done
  [ "${#positional[@]}" -ge 1 ] || usage
  local branch="${positional[0]}" pr="${positional[1]:--}" sha="${positional[2]:--}"
  local files=("${positional[@]:3}")
  # Bash 3.2 has no ${var,,}; git prints lowercase, so compare in lowercase.
  sha=$(printf '%s' "${sha}" | tr 'A-F' 'a-f')
  [ -n "${branch}" ] || usage
  if [ "${pr}" != "-" ] && [[ ! "${pr}" =~ ^[0-9]+$ ]]; then
    echo "error: '${pr}' is not a PR number." >&2
    usage
  fi

  printf 'RESULT\tCHECK\tDETAIL\n'

  # Step 1: --exit-code is mandatory; without it a missing ref exits 0.
  local ls_out remote_sha=''
  if ls_out=$(git -C "${repo_dir}" ls-remote --exit-code --heads "${REMOTE}" "refs/heads/${branch}" 2>&1); then
    remote_sha=$(printf '%s' "${ls_out}" | awk 'NR==1 {print $1}')
    row PASS branch "${REMOTE}/${branch} at ${remote_sha}"
  else
    row FAIL branch "${REMOTE}/${branch} not found (ls-remote exit $?)"
  fi

  # Fetch once so ancestry can tell "tip advanced" from "not on the branch".
  local fetched=0 on_branch=0
  if [ -n "${remote_sha}" ] && git -C "${repo_dir}" fetch --quiet "${REMOTE}" "refs/heads/${branch}" 2>/dev/null; then
    fetched=1
    if [ "${sha}" != "-" ] && git -C "${repo_dir}" merge-base --is-ancestor "${sha}" FETCH_HEAD 2>/dev/null; then
      on_branch=1
    fi
  fi

  if [ "${sha}" != "-" ]; then
    local v
    v=$(judge_sha "${sha}" "${remote_sha}")
    if [ "${v%% *}" = FAIL ] && [ "${on_branch}" -eq 1 ]; then
      v="WARN tip advanced (e.g. bot dist push): ${sha} is an ancestor of ${remote_sha}"
    fi
    row "${v%% *}" branch-head "${v#* }"
  fi

  # Step 2
  if [ "${pr}" != "-" ]; then
    local repo pr_json v pr_head
    repo="${REPO:-$(gh repo view --json nameWithOwner --jq .nameWithOwner 2>/dev/null || true)}"
    if pr_json=$(gh pr view "${pr}" --repo "${repo}" --json url,headRefOid,state 2>&1); then
      v=$(judge_pr "${pr_json}" "${repo}" "${sha}")
      pr_head=$(printf '%s' "${pr_json}" | jq -r '.headRefOid // ""')
      if [[ "${v}" == "FAIL claimed "* ]] && [ "${on_branch}" -eq 1 ] && [ -n "${pr_head}" ] &&
        git -C "${repo_dir}" merge-base --is-ancestor "${sha}" "${pr_head}" 2>/dev/null; then
        v="WARN tip advanced (e.g. bot dist push): ${sha} is an ancestor of PR head ${pr_head}"
      fi
      row "${v%% *}" pr "#${pr} $(printf '%s' "${pr_json}" | jq -r '.state') ${v#* }"
    else
      row FAIL pr "#${pr} not readable in ${repo} (check gh account first: gh api user --jq .login)"
    fi
  fi

  # Steps 3-4: the claimed SHA (or, when none is claimed, the branch tip) must contain the files.
  local ref='' ref_note=''
  if [ "${fetched}" -eq 1 ]; then
    ref="${remote_sha}"
    [ "${sha}" = "-" ] || ref_note=" (branch tip: claimed SHA not on branch)"
    if [ "${sha}" != "-" ]; then
      if [ "${on_branch}" -eq 1 ]; then
        row PASS commit "${sha} is on ${branch}"
        ref="${sha}"
        ref_note=''
      else
        row FAIL commit "${sha} is not on ${branch}"
      fi
    fi
  elif [ -n "${remote_sha}" ]; then
    row FAIL commit "git fetch ${REMOTE} ${branch} failed; ancestry and files unchecked"
    ref_note=" (fetch failed)"
  fi

  local f
  for f in ${files[@]+"${files[@]}"}; do
    if [ -n "${ref}" ] && git -C "${repo_dir}" cat-file -e "${ref}:${f}" 2>/dev/null; then
      row PASS file "${f} in ${ref:0:12}${ref_note}"
    else
      row FAIL file "${f} missing in ${ref:-<no ref>}${ref_note}"
    fi
  done

  if [ -n "${worktree}" ]; then
    if [ "${sha}" != "-" ] && git -C "${worktree}" log --format=%H -20 2>/dev/null | grep -q "^${sha}"; then
      row PASS worktree-log "${sha} in ${worktree}"
    elif [ "${sha}" != "-" ]; then
      row FAIL worktree-log "${sha} not in last 20 commits of ${worktree}"
    fi
    local dirty
    if dirty=$(git -C "${worktree}" status --porcelain 2>&1) && [ -z "${dirty}" ]; then
      row PASS worktree-status "clean"
    else
      row FAIL worktree-status "uncommitted or unreadable: ${dirty%%$'\n'*}"
    fi
    for f in ${files[@]+"${files[@]}"}; do
      if [ -e "${worktree}/${f}" ]; then
        row PASS worktree-file "${f}"
      else
        row FAIL worktree-file "${f} missing"
      fi
    done
  fi

  if [ "${FAILED}" -eq 0 ]; then
    echo "VERDICT: PASS"
    return 0
  fi
  echo "VERDICT: FABRICATION_SUSPECTED"
  return 1
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  main "$@"
fi
