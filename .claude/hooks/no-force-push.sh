#!/usr/bin/env bash
# PreToolUse hook (matcher: Bash): block destructive git commands deterministically.
#
# Background: AGENTS.md Safety bans commands that rewrite already-pushed branch
# history (`git push --force` / `-f` / `--force-with-lease`) or discard work
# (`git reset --hard`, `git stash drop`). That ban is stated in prose in four
# places (AGENTS.md Safety, CLAUDE.md, docs/development/worker-discipline-template.md,
# and the commands) yet still slipped through once each in #1656 and #1720.
# This hook makes the prose deterministic. `permissions.deny` was not used
# because its prefix matching lets `git push origin branch --force` through —
# a hook sees the whole command string and is argument-order independent.
#
# Contract (PreToolUse):
#   stdin  : JSON payload; the Bash tool command is .tool_input.command
#   exit 0 : allow the tool call to proceed
#   exit 2 : block the tool call; stderr is fed back to Claude
#
# Behavior:
#   - Commands that cannot contain a git invocation: exit 0 immediately.
#   - The command string is sanitized before matching: heredoc bodies are
#     dropped, line continuations are joined, and quoted segments are replaced
#     by a space (so `grep -rn -- "--force-with-lease" .` and
#     `echo "do not use git push --force"` stay allowed). A quoted segment that
#     is itself only a force flag (`git push "--force"`) is kept.
#   - Blocked: `git push` with --force / -f / --force-with-lease (any argument
#     order, `--force-with-lease=<ref>` included), `git reset --hard`,
#     `git stash drop`, `git stash clear`.
#   - Explicitly NOT blocked (non-destructive or out of the AGENTS.md scope):
#     `git fetch --tags --force` / `git fetch -f` (used by
#     .github/workflows/release-please.yml), `git tag -f`, `git clean`,
#     `git checkout -- <path>`, `git restore`. Ambiguous input is allowed:
#     a false positive stalls all development, a miss costs one incident.
#
# Known limitation: quoted text is treated as data, so an interpreter form such
# as `bash -c "git push --force"` is not detected. The hook is defense-in-depth;
# AGENTS.md Safety remains the SSoT for the ban.
set -u

# --- Extract the Bash command from the stdin JSON payload -------------------
if [ -t 0 ]; then
  # No hook payload (manual invocation without stdin): nothing to check.
  exit 0
fi
HOOK_INPUT="$(cat 2>/dev/null || true)"
if [ -z "$HOOK_INPUT" ] || ! command -v jq >/dev/null 2>&1; then
  exit 0
fi
COMMAND="$(printf '%s' "$HOOK_INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null || true)"
if [ -z "$COMMAND" ]; then
  exit 0
fi

# --- Fast path: skip anything that cannot be a destructive git command ------
case "$COMMAND" in
  *git*) ;;
  *) exit 0 ;;
esac
case "$COMMAND" in
  *force* | *--hard* | *stash* | *-f*) ;;
  *) exit 0 ;;
esac
if ! command -v awk >/dev/null 2>&1; then
  # No sanitizer available: allow rather than risk blocking on a raw match.
  exit 0
fi

# --- Sanitize: drop heredoc bodies, join line continuations -----------------
SQ="'"
# shellcheck disable=SC2016  # awk program: $0 must not be expanded by the shell
STRIP_HEREDOC='
BEGIN { delim = ""; buf = "" }
{
  if (delim != "") {
    t = $0
    sub(/^[[:space:]]+/, "", t)
    sub(/[[:space:]]+$/, "", t)
    if (t == delim) { delim = "" }
    next
  }
  line = $0
  if (match(line, /(^|[^<])<<-?[[:space:]]*[^[:space:];&|<>]+/)) {
    d = substr(line, RSTART, RLENGTH)
    sub(/^[^<]?<<-?[[:space:]]*/, "", d)
    gsub(/"/, "", d)
    gsub(Q, "", d)
    if (d != "") { delim = d }
  }
  buf = buf line
  if (buf ~ /\\$/) { sub(/\\$/, " ", buf); next }
  print buf
  buf = ""
}
END { if (buf != "") { print buf } }
'

# --- Sanitize: replace quoted segments with a space -------------------------
# A segment whose content is itself a force flag is kept, so that
# `git push "--force"` is still caught while `echo "... --force"` is not.
# shellcheck disable=SC2016  # awk program: $0 must not be expanded by the shell
STRIP_QUOTES='
function flagish(s,   t) {
  t = s
  sub(/^[[:space:]]+/, "", t)
  if (t ~ /^(-f|--force|--force-with-lease)([[:space:]=]|$)/) { return " " t " " }
  return " "
}
BEGIN { st = 0; seg = "" }
{
  line = $0
  out = ""
  i = 1
  n = length(line)
  while (i <= n) {
    c = substr(line, i, 1)
    if (st == 0) {
      if (c == "\\") { out = out " "; i += 2; continue }
      if (c == Q) { st = 1; seg = ""; i++; continue }
      if (c == "\"") { st = 2; seg = ""; i++; continue }
      out = out c
      i++
      continue
    }
    if (st == 1) {
      if (c == Q) { st = 0; out = out flagish(seg); i++; continue }
      seg = seg c
      i++
      continue
    }
    if (c == "\\") { seg = seg substr(line, i + 1, 1); i += 2; continue }
    if (c == "\"") { st = 0; out = out flagish(seg); i++; continue }
    seg = seg c
    i++
  }
  if (st != 0) { seg = seg " " }
  print out
}
'

SANITIZED="$(
  printf '%s\n' "$COMMAND" |
    awk -v Q="$SQ" "$STRIP_HEREDOC" |
    awk -v Q="$SQ" "$STRIP_QUOTES"
)"

# --- Destructive-command detection ------------------------------------------
# G = a `git` word start: beginning of string or a shell separator, then `git`
# followed by whitespace and any number of global options — with an inline
# value (`--git-dir=x`) or a separate value token (`-C /repo`) — before the
# subcommand. `[^;&|]*` keeps each match inside one command segment, so
# `git push origin x && git fetch --tags --force` does not match.
# Uses POSIX ERE only (portable across BSD/GNU grep).
GIT_OPT='(-[^[:space:]]+([[:space:]]+[^-[:space:]][^[:space:]]*)?[[:space:]]+)*'
G="(^|[;&|([:space:]])git[[:space:]]+${GIT_OPT}"
FORCE_FLAG='(--force|--force-with-lease|-[[:alnum:]]*f[[:alnum:]]*)([[:space:]=]|$)'
BLOCK_RE="${G}push([[:space:]]+[^;&|]*)?[[:space:]]+${FORCE_FLAG}"
BLOCK_RE="${BLOCK_RE}|${G}reset([[:space:]]+[^;&|]*)?[[:space:]]+--hard([[:space:]=]|\$)"
BLOCK_RE="${BLOCK_RE}|${G}stash[[:space:]]+(drop|clear)([[:space:]]|\$)"

if ! printf '%s' "$SANITIZED" | grep -qE "$BLOCK_RE"; then
  exit 0
fi

EXCERPT="$(printf '%s' "$COMMAND" | tr '\n' ' ' | cut -c1-200)"
# The message below was a `cat >&2 <<EOF` heredoc until #1950. bash 5.3.15
# (homebrew) deadlocks deterministically when a heredoc body exceeds 512 bytes;
# this body is 564, so the guard hung at the exact moment it tried to BLOCK a
# destructive command — the one path that must never fail. A quoted multi-line
# string fed to `printf` reproduces the heredoc byte for byte (double quotes
# keep `${EXCERPT}` expanding, and the body contains no other `$`, backtick,
# backslash or `"`), and unlike a split heredoc it has no size ceiling at all.
# Do NOT convert this back to a heredoc — see #1950.
BLOCKED_MESSAGE="[no-force-push] BLOCKED: destructive git command.
  command: ${EXCERPT}
  AGENTS.md Safety bans rewriting already-pushed branch history
  (git push --force / -f / --force-with-lease) and discarding work
  (git reset --hard, git stash drop, git stash clear).
  --force-with-lease is not an exception.
  Instead: take the remote in with 'git merge origin/<branch>' or
  'git merge --ff-only origin/<branch>', then push a fast-forward.
  If history still looks like it must be rewritten, do not work around this
  hook — stop and escalate to the organizer / human."
printf '%s\n' "$BLOCKED_MESSAGE" >&2

# Record the block in the harness event log (best effort; see harness-event.sh).
# The excerpt is the matched segment of the sanitized command (quoted text
# already replaced by a space); the writer then masks every token that is not a
# plain word or a bare flag. AGENTS.md Safety has no ledger id, so ruleId stays
# empty. The no-op is defined first and the library sourced only if readable:
# a failed `.` exits the shell under POSIX mode, which would turn exit 2 into 1.
harness_event() { :; }
HARNESS_EVENT_LIB="$(dirname "$0")/harness-event.sh"
# shellcheck source=.claude/hooks/harness-event.sh
if [ -r "$HARNESS_EVENT_LIB" ]; then . "$HARNESS_EVENT_LIB"; fi
harness_event 'hook:no-force-push' block '' \
  "$(printf '%s\n' "$SANITIZED" | grep -oE "$BLOCK_RE" 2>/dev/null | head -n 1)"
exit 2
