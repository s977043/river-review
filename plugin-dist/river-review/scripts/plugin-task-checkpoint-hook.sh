#!/usr/bin/env bash
# Self-contained Stop hook for the river-review plugin (#2054 PR-5, Epic #2011).
#
# Adapter for the neutral `task-checkpoint` trigger (flows/entry-map.json
# `triggers.task-checkpoint`): when the executor stops, i.e. is about to declare
# its task done, emit a Review Artifact pinned to the `review-task` Flow entry.
#
# What this hook does NOT do (ADR-009 D3, RA-1..RA-4): it holds no judgment.
# It passes ONE entry name to the CLI and nothing else — no verdict vocabulary,
# no cutoff, no branching on the review result. The Flow, the Intent and the
# skill selection all live in the repository; this file only names the entry.
#
# Fail-soft, like scripts/plugin-format-hook.sh: every missing prerequisite
# (node, git, the CLI, a readable diff) exits 0 with a one-line notice, so the
# hook never blocks the host session. The artifact is written under the
# runner's temp dir, never into the consumer's working tree.
set -euo pipefail

# Opt-out: RIVER_TASK_CHECKPOINT_HOOK=0 disables the hook entirely (no CLI
# run, no file written). Disabling the plugin does the same.
if [ "${RIVER_TASK_CHECKPOINT_HOOK:-1}" = "0" ]; then
  exit 0
fi

PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$PROJECT_DIR" || exit 0

# Stop hooks receive a JSON payload on stdin. `stop_hook_active` is true when
# Claude is already continuing because of a Stop hook; never re-enter then.
if [ ! -t 0 ]; then
  HOOK_INPUT="$(cat 2>/dev/null || true)"
  if [ -n "${HOOK_INPUT:-}" ] && command -v jq >/dev/null 2>&1; then
    if [ "$(printf '%s' "$HOOK_INPUT" | jq -r '.stop_hook_active // false' 2>/dev/null)" = "true" ]; then
      exit 0
    fi
  fi
fi

if ! command -v node >/dev/null 2>&1; then
  echo "[river-review:task-checkpoint] node not found, skipping"
  exit 0
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "[river-review:task-checkpoint] not a git repository, skipping"
  exit 0
fi

# The entry name is the ONLY review-related value this adapter carries.
ENTRY="review-task"

# Locate the CLI: the consumer's own installed river-review first (npm), then
# the plugin's source when its dependencies are installed. A plugin checkout
# without node_modules cannot run the CLI, so the hook steps aside.
CLI=()
if npx --no-install river-review --help >/dev/null 2>&1; then
  CLI=(npx --no-install river-review)
elif [ -n "${CLAUDE_PLUGIN_ROOT:-}" ] && [ -f "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs" ] && [ -d "${CLAUDE_PLUGIN_ROOT}/node_modules" ]; then
  CLI=(node "${CLAUDE_PLUGIN_ROOT}/src/cli.mjs")
else
  echo "[river-review:task-checkpoint] river-review CLI not available (install the npm package or run npm ci in the plugin), skipping"
  exit 0
fi

OUT_DIR="${TMPDIR:-/tmp}/river-review-task-checkpoint"
mkdir -p "$OUT_DIR" 2>/dev/null || exit 0
OUT_FILE="$OUT_DIR/$(date -u +%Y%m%dT%H%M%SZ)-$$.json"

# Keep the temp dir bounded: one .json (+ .log) per Stop would otherwise
# accumulate for the life of the machine. Retain the newest KEEP artifacts
# (by name, which starts with a UTC timestamp) and drop the rest with their
# logs. This is the only deletion this hook performs, and only inside its own
# temp dir.
KEEP="${RIVER_TASK_CHECKPOINT_KEEP:-20}"
# Fail-soft (#2119): a non-numeric KEEP (`abc`, `1.5`, `-1`) would make the
# arithmetic below abort under `set -u`; fall back to the default instead.
case "$KEEP" in ''|*[!0-9]*) KEEP=20;; esac
# Portable (BSD head has no `-n -N`): count, then drop the oldest `count - KEEP`.
total=$(find "$OUT_DIR" -maxdepth 1 -name '*.json' | wc -l | tr -d ' ')
drop=$((total - KEEP))
if [ "$drop" -gt 0 ]; then
  # Count inside the loop and skip past `drop` instead of piping into `head`.
  # Any consumer that closes the pipe early -- `head -n "$drop"`, or a loop that
  # `break`s -- kills `sort` with SIGPIPE, and `pipefail` turns that into a 141
  # exit for the whole hook (#2135). Whether it fires depends on the pipe buffer
  # size, so it reproduced on macOS while Linux CI stayed green. `continue`
  # keeps reading to EOF, so `sort` always finishes writing.
  # A here-doc fed from a command substitution was tried first and deadlocked on
  # lists this long; do not reintroduce one here.
  seen=0
  find "$OUT_DIR" -maxdepth 1 -name '*.json' | sort | while IFS= read -r old; do
    seen=$((seen + 1))
    [ "$seen" -le "$drop" ] || continue
    rm -f -- "$old" "$old.log"
  done
fi

if "${CLI[@]}" review plan --plan-only --entry "$ENTRY" --output-file "$OUT_FILE" . >/dev/null 2>"$OUT_FILE.log"; then
  echo "[river-review:task-checkpoint] Review Artifact pinned to entry ${ENTRY}: ${OUT_FILE}"
else
  echo "[river-review:task-checkpoint] review plan --entry ${ENTRY} did not complete (see ${OUT_FILE}.log), continuing"
fi
exit 0
