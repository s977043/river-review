#!/usr/bin/env bash
# Open (or update) an issue when a CI workflow on main turns red, and close it
# when a later main run of the same workflow succeeds.
#
# Called by .github/workflows/main-ci-red-alert.yml. With EVENT_NAME set to
# workflow_run / workflow_dispatch the inputs are filled by load_event; without
# it they come straight from the env (tests, local runs):
#   REPO           owner/repo
#   WORKFLOW_NAME  the watched workflow's `name:` (e.g. CI)
#   CONCLUSION     workflow_run conclusion: failure | success | anything else
#   HEAD_SHA       full head sha of the run
#   RUN_ID         run id (empty for a simulated run: no jobs are listed)
#   RUN_URL        run html url
#
# Dedupe key: an OPEN issue labelled `ci-red` whose title starts with
# "main CI red: <WORKFLOW_NAME> @". A second red run comments on it instead of
# opening another issue.
#
# Any gh failure exits non-zero (set -e), so the alert job turns red instead of
# silently dropping the alert.
set -euo pipefail

LABEL='ci-red'

find_open_issue() {
  gh issue list --repo "${REPO}" --label "${LABEL}" --state open \
    --json number,title \
    --jq "map(select(.title | startswith(\"main CI red: ${WORKFLOW_NAME} @\"))) | .[0].number // empty"
}

failed_jobs() {
  if [ -z "${RUN_ID}" ]; then
    echo '- (simulated run: no jobs)'
    return
  fi
  gh run view "${RUN_ID}" --repo "${REPO}" --json jobs \
    --jq '.jobs[] | select(.conclusion == "failure") | "- " + .name'
}

merged_pr() {
  gh api "repos/${REPO}/commits/${HEAD_SHA}/pulls" --jq '.[0].number // empty'
}

on_failure() {
  local short pr jobs body issue revert
  short="${HEAD_SHA:0:7}"
  jobs=$(failed_jobs)
  pr=$(merged_pr)
  if [ -n "${pr}" ]; then
    revert="Revert with \`scripts/revert-pr.sh ${pr}\` if the fix is not quick."
    pr="#${pr}"
  else
    revert='No merged PR found for this commit; revert the commit by hand if needed.'
    pr='(none found)'
  fi
  body=$(printf '%s\n' \
    "Workflow **${WORKFLOW_NAME}** failed on main." \
    '' \
    "- Run: ${RUN_URL}" \
    "- Head commit: ${HEAD_SHA}" \
    "- Merged by PR: ${pr}" \
    '' \
    'Failing jobs:' \
    "${jobs:-- (no failed job reported)}" \
    '' \
    "${revert}")
  issue=$(find_open_issue)
  if [ -n "${issue}" ]; then
    gh issue comment "${issue}" --repo "${REPO}" --body "${body}"
    echo "updated #${issue}"
  else
    gh label create "${LABEL}" --repo "${REPO}" --color B60205 \
      --description 'CI on main is red' --force
    gh issue create --repo "${REPO}" --label "${LABEL}" \
      --title "main CI red: ${WORKFLOW_NAME} @ ${short}" --body "${body}"
  fi
}

on_success() {
  local issue
  issue=$(find_open_issue)
  if [ -z "${issue}" ]; then
    echo 'no open ci-red issue; nothing to do'
    return
  fi
  gh issue close "${issue}" --repo "${REPO}" \
    --comment "recovered at ${HEAD_SHA} (${RUN_URL})"
  echo "closed #${issue}"
}

# workflow_run: read the run from the event payload and ignore anything that is
# not a push / merge_group run on main. The workflow file deliberately does not
# reference the run's head ref: the HOL plugin scanner flags any workflow_run
# workflow that names it next to a checkout (GITHUB_ACTIONS_UNTRUSTED_CHECKOUT),
# even though the checkout here is the default branch.
# workflow_dispatch: simulate a run from SIMULATE_* inputs.
load_event() {
  local event branch kind
  case "${EVENT_NAME:-}" in
    workflow_run)
      event="${GITHUB_EVENT_PATH:?}"
      branch=$(jq -r '.workflow_run.head_branch' "${event}")
      kind=$(jq -r '.workflow_run.event' "${event}")
      if [ "${branch}" != 'main' ] || { [ "${kind}" != 'push' ] && [ "${kind}" != 'merge_group' ]; }; then
        echo "run on ${branch} (${kind}) is not a main push / merge_group run: no action"
        SKIP=1
        return
      fi
      WORKFLOW_NAME=$(jq -r '.workflow_run.name' "${event}")
      CONCLUSION=$(jq -r '.workflow_run.conclusion' "${event}")
      HEAD_SHA=$(jq -r '.workflow_run.head_sha' "${event}")
      RUN_ID=$(jq -r '.workflow_run.id' "${event}")
      RUN_URL=$(jq -r '.workflow_run.html_url' "${event}")
      ;;
    workflow_dispatch)
      WORKFLOW_NAME="${WORKFLOW_NAME:-CI}"
      CONCLUSION="${SIMULATE_CONCLUSION:?}"
      HEAD_SHA="${SIMULATE_SHA:?}"
      RUN_ID=''
      RUN_URL="${SIMULATE_RUN_URL:-(simulated)}"
      ;;
  esac
}

main() {
  # Not `load_event || ...`: set -e is off inside a function called from a
  # `||` list, so a failed jq read would be swallowed.
  SKIP=''
  load_event
  [ -z "${SKIP}" ] || return 0
  : "${REPO:?}" "${WORKFLOW_NAME:?}" "${CONCLUSION:?}" "${HEAD_SHA:?}"
  RUN_ID="${RUN_ID:-}"
  RUN_URL="${RUN_URL:-(simulated)}"
  case "${CONCLUSION}" in
    failure) on_failure ;;
    success) on_success ;;
    *) echo "conclusion ${CONCLUSION}: no action" ;;
  esac
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  main "$@"
fi
