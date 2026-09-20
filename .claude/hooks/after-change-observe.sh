#!/bin/bash
# Claude Code PostToolUse adapter for the neutral `after-change` trigger
# (#2275 PR-3C, Epic #2054 Phase 3).
#
# THIS FILE IS THE HOST BOUNDARY. `PostToolUse`, `Write`, `Edit`, `MultiEdit`
# and the hook payload shape appear here and nowhere else: what it hands to
# Node is a neutral description of the change (project root, subject revision,
# `git diff --name-status` text). `src/lib/after-change-adapter.mjs` and
# `src/lib/fast-verification.mjs` are pinned by tests to be free of that
# vocabulary.
#
# WHAT IT DOES NOT DO. It holds no gate, no decision and no merge authority; it
# never blocks the session (always exits 0); it runs no formatter and changes no
# file in the working tree. Formatting stays the separate convenience hook
# (`.claude/hooks/format.sh`, `scripts/plugin-format-hook.sh`), which produces
# no verification evidence — mutation and evidence are deliberately not mixed.
#
# OFF BY DEFAULT. Without RIVER_AFTER_CHANGE_OBSERVE=1 this hook returns
# immediately, so a host that has not opted in — including every host without
# the plugin — behaves exactly as it did before this PR.
#
# The shebang is /bin/bash on purpose: homebrew bash 5.3.15 deadlocks on
# heredocs at or above PIPE_BUF on macOS. Nothing here uses a heredoc either.
set -euo pipefail

if [ "${RIVER_AFTER_CHANGE_OBSERVE:-0}" != "1" ]; then
  exit 0
fi

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$PROJECT_DIR" || exit 0

# PostToolUse delivers a JSON payload on stdin. Read the tool name from it and
# act only on the edit tools; anything else (or an unreadable payload) is not
# an after-change event as far as this adapter is concerned.
TOOL_NAME=""
if [ ! -t 0 ]; then
  HOOK_INPUT="$(cat 2>/dev/null || true)"
  if [ -n "${HOOK_INPUT:-}" ] && command -v jq >/dev/null 2>&1; then
    TOOL_NAME="$(printf '%s' "$HOOK_INPUT" | jq -r '.tool_name // empty' 2>/dev/null || true)"
  fi
fi
case "$TOOL_NAME" in
  Write | Edit | MultiEdit) ;;
  *) exit 0 ;;
esac

# Missing prerequisites are reported, never treated as a pass.
if ! command -v node >/dev/null 2>&1; then
  echo "[river-review:after-change] not run (node not found)"
  exit 0
fi
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "[river-review:after-change] not run (not a git repository)"
  exit 0
fi

SUBJECT_REVISION="$(git rev-parse HEAD 2>/dev/null || true)"
if [ -z "$SUBJECT_REVISION" ]; then
  echo "[river-review:after-change] not run (subject revision unreadable)"
  exit 0
fi

# The status letters are the record of what the change did, including what it
# REMOVED. The adapter parses them so deletions are declared to the checkpoint
# rather than inferred from the filesystem (see after-change-adapter.mjs).
NAME_STATUS="$(git diff --name-status HEAD 2>/dev/null || true)"

OUT_DIR="${TMPDIR:-/tmp}/river-review-after-change"
OUT_FILE="$OUT_DIR/$(date -u +%Y%m%dT%H%M%SZ)-$$.json"

ADAPTER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Build the neutral request with printf, never a heredoc (PIPE_BUF deadlock),
# and let jq do the quoting so a path with a quote or a newline cannot break
# the JSON.
REQUEST="$(jq -n \
  --arg projectRoot "$PROJECT_DIR" \
  --arg subjectRevision "$SUBJECT_REVISION" \
  --arg nameStatus "$NAME_STATUS" \
  --arg trustedTree "${RIVER_TRUSTED_TREE:-}" \
  --arg selectedFile "${RIVER_AFTER_CHANGE_SELECTED:-}" \
  --arg outFile "$OUT_FILE" \
  '{projectRoot: $projectRoot, subjectRevision: $subjectRevision, nameStatus: $nameStatus, trustedTree: $trustedTree, selectedFile: $selectedFile, outFile: $outFile}' \
  2>/dev/null || true)"
if [ -z "$REQUEST" ]; then
  echo "[river-review:after-change] not run (jq unavailable)"
  exit 0
fi

printf '%s' "$REQUEST" | node "$ADAPTER_DIR/after-change-observe.mjs" || {
  echo "[river-review:after-change] not run (adapter failed)"
  exit 0
}
exit 0
