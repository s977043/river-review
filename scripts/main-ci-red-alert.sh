#!/usr/bin/env bash
# Open (or update) an issue when a CI workflow on main turns red, and close it
# when a later main run of the same workflow succeeds.
#
# Called by .github/workflows/main-ci-red-alert.yml. Inputs come from the env:
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

main() {
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
