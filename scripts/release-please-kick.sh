#!/usr/bin/env bash
# Advance the release-please branch by an empty commit via the GitHub REST API.
# Use when the release-please PR is BLOCKED because required status checks were
# not registered on the auto-generated branch.
#
# This script is the canonical kick procedure on this repository. It pushes the
# empty commit with your own `gh` credentials, so the new head counts as a real
# user push and re-fires `pull_request` workflows. It needs no repository secret.
#
# The .github/workflows/release-please-kick.yml route was removed in #2709
# (background: #1800 / #1807). It required the `RELEASE_KICK_PAT` Actions
# secret, which was never registered here, so every run failed.
#
# SSoT for when to kick and BEHIND vs pure BLOCKED:
#   docs/runbook/bot-pushed-head-kick.md
#
# Usage:
#   scripts/release-please-kick.sh [branch]
#   REPO=owner/repo scripts/release-please-kick.sh [branch]

set -euo pipefail

REPO="${REPO:-$(gh repo view --json nameWithOwner --jq .nameWithOwner)}"
BRANCH="${1:-}"
if [ -z "${BRANCH}" ]; then
  BRANCH=$(gh pr list --repo "${REPO}" --state open --search 'in:title "chore(main): release"' --json headRefName --jq '.[0].headRefName')
  if [ -z "${BRANCH}" ] || [ "${BRANCH}" = "null" ]; then
    echo "error: no open release-please PR found. Pass the branch name explicitly." >&2
    exit 1
  fi
  echo "Auto-detected branch: ${BRANCH}"
fi

PARENT=$(gh api "repos/${REPO}/git/refs/heads/${BRANCH}" --jq '.object.sha')
TREE=$(gh api "repos/${REPO}/git/commits/${PARENT}" --jq '.tree.sha')
NEW=$(gh api "repos/${REPO}/git/commits" --method POST \
  -f message='chore: trigger CI on release-please branch' \
  -f tree="${TREE}" \
  -f "parents[]=${PARENT}" \
  --jq '.sha')
gh api -X PATCH "repos/${REPO}/git/refs/heads/${BRANCH}" -f sha="${NEW}" >/dev/null

echo "Advanced ${BRANCH}"
echo "  parent: ${PARENT}"
echo "  new:    ${NEW}"
