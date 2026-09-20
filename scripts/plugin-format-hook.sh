#!/usr/bin/env bash
# Self-contained PostToolUse format hook for the river-review plugin.
#
# Bundled inside the plugin and invoked via ${CLAUDE_PLUGIN_ROOT} in
# hooks/hooks.json, so it works when the plugin is installed into another
# project (unlike .claude/hooks/format.sh, which assumes the river-review
# repo layout).
#
# Behavior: formats the consumer project's changed files with the project's
# own prettier. Degrades gracefully (exit 0) when npm / git / prettier are
# unavailable, so it never blocks the host project.
#
# CONVENIENCE ONLY -- NOT VERIFICATION EVIDENCE (#2275 PR-3C). This hook MUTATES
# the working tree and swallows prettier's exit status (`|| true`), so "it ran"
# says nothing about whether the change is correct. The after-change
# fast-verification checkpoint is the separate, non-mutating adapter
# (`.claude/hooks/after-change-observe.sh`), and the two are deliberately not
# merged: a formatter that quietly succeeds must never be readable as a check
# that passed.
set -euo pipefail

# Run in the consumer's project directory (set by Claude Code), falling back
# to the current working directory.
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-$(pwd)}"
cd "$PROJECT_DIR" || exit 0

# Avoid double-formatting: if the host project already ships its own
# repo-internal format hook (e.g. developing the river-review repo itself,
# where .claude/settings.json wires .claude/hooks/format.sh), defer to it.
if [ -f .claude/hooks/format.sh ]; then
  echo "[river-review:format] project has its own .claude/hooks/format.sh, deferring to it"
  exit 0
fi

if ! command -v npx >/dev/null 2>&1; then
  echo "[river-review:format] npx not found, skipping"
  exit 0
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "[river-review:format] not a git repository, skipping"
  exit 0
fi

# PostToolUse passes a stdin JSON payload whose .tool_input.file_path is the
# single file just edited (the input is stdin JSON, not an env var). When that
# file is available and jq can parse it, format only that file; otherwise fall
# back to formatting the whole changed-file set below. This keeps the hook
# backward-compatible when stdin / jq / file_path are absent.
TARGET_FILE=""
if [ ! -t 0 ]; then
  HOOK_INPUT="$(cat 2>/dev/null || true)"
  if [ -n "${HOOK_INPUT:-}" ] && command -v jq >/dev/null 2>&1; then
    TARGET_FILE="$(printf '%s' "$HOOK_INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null || true)"
  fi
fi

if [ -n "$TARGET_FILE" ] && [ -f "$TARGET_FILE" ] && printf '%s' "$TARGET_FILE" | grep -qE '\.(js|jsx|ts|tsx|cjs|mjs|json|md|yml|yaml)$'; then
  if npx --no-install prettier --version >/dev/null 2>&1; then
    npx --no-install prettier --write "$TARGET_FILE" || true
    echo "[river-review:format] formatted 1 file (target: $TARGET_FILE)"
  else
    echo "[river-review:format] prettier not installed in project, skipping"
  fi
  exit 0
fi

CHANGED_FILES=$(git diff --name-only --diff-filter=ACMRTUXB HEAD 2>/dev/null || echo "")
if [ -z "$CHANGED_FILES" ]; then
  exit 0
fi

FILES_TO_FORMAT=$(echo "$CHANGED_FILES" | grep -E '\.(js|jsx|ts|tsx|cjs|mjs|json|md|yml|yaml)$' || true)
if [ -z "$FILES_TO_FORMAT" ]; then
  exit 0
fi

# Use the consumer project's prettier only (no install). If absent, skip.
if ! npx --no-install prettier --version >/dev/null 2>&1; then
  echo "[river-review:format] prettier not installed in project, skipping"
  exit 0
fi

files_array=()
while IFS= read -r file; do
  [ -f "$file" ] && files_array+=("$file")
done <<<"$FILES_TO_FORMAT"

if [ ${#files_array[@]} -gt 0 ]; then
  npx --no-install prettier --write "${files_array[@]}" || true
  echo "[river-review:format] formatted ${#files_array[@]} file(s)"
fi
