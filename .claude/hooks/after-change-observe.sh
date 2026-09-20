#!/bin/bash
# Claude Code PostToolUse adapter for the neutral `after-change` trigger
# (#2275 PR-3C, Epic #2054 Phase 3).
#
# THIS FILE IS THE HOST BOUNDARY. `PostToolUse`, `Write`, `Edit`, `MultiEdit`
# and the hook payload shape appear here and nowhere else: what it hands to
# Node is a neutral description of the change (project root, subject revision,
# git's own record of what changed). `src/lib/after-change-adapter.mjs` and
# `src/lib/fast-verification.mjs` are pinned by tests to be free of that
# vocabulary.
#
# WHAT IT DOES NOT DO. It holds no gate, decision and no merge authority; it
# never blocks the session (always exits 0); it runs no formatter and changes no
# file in the working tree. Formatting stays the separate convenience hook
# (`.claude/hooks/format.sh`, `scripts/plugin-format-hook.sh`), which produces
# no verification evidence -- mutation and evidence are deliberately not mixed.
#
# OFF BY DEFAULT. Without RIVER_AFTER_CHANGE_OBSERVE=1 this hook returns
# immediately, so a host that has not opted in -- including every host without
# the plugin -- behaves exactly as it did before this PR.
#
# NO SILENT SKIP ONCE OPTED IN (#2275: "timeout / failure / missing
# prerequisites は silent success にせず evidence status に残す"). Every
# prerequisite is checked BEFORE the payload is read and reports a `not run
# (...)` line when it is missing. The one deliberately silent exit is a tool
# that is not an edit: that is not an after-change event, so there is nothing to
# report about it.
#
# The shebang is /bin/bash on purpose: homebrew bash 5.3.15 deadlocks on
# heredocs at or above PIPE_BUF on macOS. Nothing here uses a heredoc either.
set -euo pipefail

if [ "${RIVER_AFTER_CHANGE_OBSERVE:-0}" != "1" ]; then
  exit 0
fi

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$PROJECT_DIR" || exit 0

# Prerequisites first, so a missing one is REPORTED rather than swallowed by a
# later step that cannot tell "absent tool" from "not an edit".
for tool in jq node git; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "[river-review:after-change] not run ($tool not found)"
    exit 0
  fi
done

# PostToolUse delivers a JSON payload on stdin.
if [ -t 0 ]; then
  echo "[river-review:after-change] not run (no hook payload on stdin)"
  exit 0
fi
HOOK_INPUT="$(cat 2>/dev/null || true)"
if [ -z "${HOOK_INPUT:-}" ]; then
  echo "[river-review:after-change] not run (empty hook payload)"
  exit 0
fi
TOOL_NAME="$(printf '%s' "$HOOK_INPUT" | jq -r '.tool_name // empty' 2>/dev/null || true)"
if [ -z "$TOOL_NAME" ]; then
  echo "[river-review:after-change] not run (tool name unreadable in payload)"
  exit 0
fi

# The one silent exit: a non-edit tool is not an after-change event.
case "$TOOL_NAME" in
  Write | Edit | MultiEdit) ;;
  *) exit 0 ;;
esac

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "[river-review:after-change] not run (not a git repository)"
  exit 0
fi

# `--verify` matters: plain `git rev-parse HEAD` prints the literal string
# "HEAD" and exits 0 on an unborn branch, which would record a non-SHA as the
# subject revision and collapse every run onto one occurrence key.
SUBJECT_REVISION="$(git rev-parse --verify HEAD 2>/dev/null || true)"
if [ -z "$SUBJECT_REVISION" ]; then
  echo "[river-review:after-change] not run (subject revision unreadable)"
  exit 0
fi

# TWO sources, NUL-delimited. The diff reports only TRACKED paths, so a newly
# created file -- the most common result of a Write -- is absent from it; the
# `--others` list is that half. `-z` keeps paths raw: without it git quotes any
# path with a TAB or a non-ASCII byte, and a quoted spelling either cannot be
# staged or, for a deletion, excuses a file that was never really named.
# base64 IN THE PIPELINE, not after: a bash variable cannot hold a NUL byte, so
# assigning the raw `-z` stream to one silently concatenates every path into a
# single unusable field. The blob never exists as a shell string.
NAME_STATUS_B64="$( (git diff -z --name-status HEAD 2>/dev/null || true) | base64 | tr -d '\n')"
UNTRACKED_B64="$( (git ls-files -z --others --exclude-standard 2>/dev/null || true) | base64 | tr -d '\n')"

OUT_DIR="${TMPDIR:-/tmp}/river-review-after-change"
OUT_FILE="$OUT_DIR/$(date -u +%Y%m%dT%H%M%SZ)-$$.json"

ADAPTER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Build the neutral request with jq, never a heredoc (PIPE_BUF deadlock), and
# let jq do the quoting so a path with a quote or a newline cannot break the
# JSON. The NUL-delimited blobs travel base64-encoded and are decoded in Node.
REQUEST="$(jq -n \
  --arg projectRoot "$PROJECT_DIR" \
  --arg subjectRevision "$SUBJECT_REVISION" \
  --arg nameStatusZ "$NAME_STATUS_B64" \
  --arg untrackedZ "$UNTRACKED_B64" \
  --arg trustedTree "${RIVER_TRUSTED_TREE:-}" \
  --arg selectedFile "${RIVER_AFTER_CHANGE_SELECTED:-}" \
  --arg outFile "$OUT_FILE" \
  '{projectRoot: $projectRoot, subjectRevision: $subjectRevision, nameStatusZBase64: $nameStatusZ, untrackedZBase64: $untrackedZ, trustedTree: $trustedTree, selectedFile: $selectedFile, outFile: $outFile}' \
  2>/dev/null || true)"
if [ -z "$REQUEST" ]; then
  echo "[river-review:after-change] not run (neutral request could not be built)"
  exit 0
fi

printf '%s' "$REQUEST" | node "$ADAPTER_DIR/after-change-observe.mjs" || {
  echo "[river-review:after-change] not run (adapter failed)"
  exit 0
}
exit 0
