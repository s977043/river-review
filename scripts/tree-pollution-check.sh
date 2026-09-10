#!/usr/bin/env bash
# Report files a delegated worker left in its worktree that were not there
# right after scripts/worker-bootstrap.sh ran. Run by the organizer after the
# worker reports completion.
#
# Two write sources have polluted worktrees and were distinguishable only by
# mtime (docs/development/retrospectives/2026-09-04-05.md, improvement #1):
#   - whatever the bootstrap itself leaves untracked after `npm ci`. Measured on
#     2026-09-05 (Node 22.22.2, origin/main) this was 0 paths; 5 untracked
#     skills/agent-skills/as-* dirs were observed in an earlier session
#     (retrospectives/2026-09-03-04.md) but did not reproduce and their origin
#     is unidentified.
#   - an old-version CLI run by a "read-only" review agent wrote 141 files
#     (skills/agent-skills/as-* 134, .agents/, .river/feedback/2026-09.jsonl,
#     .river/memory/index.json)
# The bootstrap manifest records the first set, so anything beyond it is the
# worker's own writing.
#
# Classification of untracked paths that are NOT in the baseline:
#   (a) baseline-known generated output -- skills/agent-skills/as-* listed in
#       the manifest; reported as information only, never a failure
#   (b) known CLI write targets       -- .river/feedback/*.jsonl,
#       .river/memory/index.json, .agents/**, new skills/agent-skills/as-*
#   (c) anything else
# Ignored files under the (b) directories are scanned too, because
# .river/feedback/* and .river/memory/* are gitignored and would otherwise be
# invisible to `git status`.
#
# Nothing is deleted. `rm` is denied by .claude/settings.json; the script only
# prints `mv` commands that move the files out of the tree.
#
# Usage:
#   scripts/tree-pollution-check.sh [<worktree-path>]      (default: cwd)
#   RIVER_WORKER_STATE_DIR=/path scripts/tree-pollution-check.sh <worktree>
#   RIVER_BOOTSTRAP_MANIFEST=/file scripts/tree-pollution-check.sh <worktree>
#
# Exit codes:
#   0  no (b) or (c) path
#   1  at least one (b) or (c) path (listed on stdout)
#   64 usage error, or <worktree-path> is not a git worktree

set -euo pipefail

if [ "$#" -gt 1 ]; then
  echo "usage: scripts/tree-pollution-check.sh [<worktree-path>]" >&2
  exit 64
fi
TARGET="${1:-.}"
if ! TARGET="$(cd "${TARGET}" 2>/dev/null && pwd)" || ! git -C "${TARGET}" rev-parse --show-toplevel >/dev/null 2>&1; then
  echo "error: '${1:-.}' is not a git worktree." >&2
  exit 64
fi
TARGET="$(git -C "${TARGET}" rev-parse --show-toplevel)"
SLUG="$(basename "${TARGET}")"
STATE_DIR="${RIVER_WORKER_STATE_DIR:-${HOME}/.claude/state}"
MANIFEST="${RIVER_BOOTSTRAP_MANIFEST:-${STATE_DIR}/worker-bootstrap-${SLUG}.txt}"

# Directories an old-version CLI writes into. Ignored entries under these are
# listed as well as untracked ones.
CLI_WRITE_DIRS=(.river/feedback .river/memory .agents)

# Paths are read NUL-separated (-z) so that git never applies its C-style
# `"..."` quoting to names with spaces or non-ASCII bytes; a quoted name would
# miss the `case` patterns below and break the mv commands.
collect_paths() {
  {
    git -C "${TARGET}" ls-files -z --others --exclude-standard 2>/dev/null | tr '\0' '\n' || true
    git -C "${TARGET}" ls-files -z --others --ignored --exclude-standard -- "${CLI_WRITE_DIRS[@]}" 2>/dev/null | tr '\0' '\n' || true
  } | grep -v '^$' | sort -u || true
}

is_cli_target() {
  case "$1" in
    .river/feedback/*.jsonl | .river/memory/index.json | .agents/* | skills/agent-skills/as-*) return 0 ;;
  esac
  return 1
}

CURRENT="$(collect_paths)"
if [ -f "${MANIFEST}" ]; then
  BASELINE="$(grep -v '^#' "${MANIFEST}" | grep -v '^$' | sort -u || true)"
  echo "baseline: ${MANIFEST}"
else
  BASELINE=""
  echo "baseline: none (${MANIFEST} not found) -- every untracked path is reported"
fi

NEW="$(comm -23 <(printf '%s\n' "${CURRENT}" | grep -v '^$' || true) <(printf '%s\n' "${BASELINE}" | grep -v '^$' || true))"
KNOWN_A="$(comm -12 <(printf '%s\n' "${CURRENT}" | grep -v '^$' || true) <(printf '%s\n' "${BASELINE}" | grep -v '^$' || true) | grep '^skills/agent-skills/as-' || true)"

B_LIST=""
C_LIST=""
while IFS= read -r p; do
  [ -n "${p}" ] || continue
  if is_cli_target "${p}"; then
    B_LIST="${B_LIST}${p}"$'\n'
  else
    C_LIST="${C_LIST}${p}"$'\n'
  fi
done <<< "${NEW}"

count_lines() { printf '%s' "$1" | grep -c . || true; }
N_A="$(count_lines "${KNOWN_A}")"
N_B="$(count_lines "${B_LIST}")"
N_C="$(count_lines "${C_LIST}")"

echo "worktree: ${TARGET}"
echo "(a) baseline generated output still present: ${N_A}"
echo "(b) known CLI write targets, not in baseline: ${N_B}"
[ "${N_B}" -eq 0 ] || printf '%s' "${B_LIST}" | sed 's/^/    /'
echo "(c) other untracked, not in baseline: ${N_C}"
[ "${N_C}" -eq 0 ] || printf '%s' "${C_LIST}" | sed 's/^/    /'

if [ "${N_B}" -eq 0 ] && [ "${N_C}" -eq 0 ]; then
  echo "result: clean"
  exit 0
fi

QUARANTINE="${TMPDIR:-/tmp}"
QUARANTINE="${QUARANTINE%/}/tree-pollution-${SLUG}-$(date -u +%Y%m%dT%H%M%SZ)"
echo "result: POLLUTED -- nothing was deleted. To move the files out of the tree:"
printf '%s%s' "${B_LIST}" "${C_LIST}" | while IFS= read -r p; do
  [ -n "${p}" ] || continue
  echo "  mkdir -p \"${QUARANTINE}/$(dirname "${p}")\" && mv \"${TARGET}/${p}\" \"${QUARANTINE}/${p}\""
done
exit 1
