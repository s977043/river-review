#!/usr/bin/env bash
# PreToolUse hook (matcher: Bash): block Bash commands that read the contents
# of paths denied to the Read tool by .claude/settings.json.
#
# Background: settings.json denies `Read(./secrets/**)` and `Read(./**/*secret*)`,
# but a Bash call such as `cat src/lib/secret-redactor.mjs` or
# `git show <ref>:src/lib/secret-redactor.mjs` prints the same content and
# bypasses the deny (observed 2026-10-16 during the PR #2691 review).
# The file name avoids the word itself: the deny glob would block editing it.
#
# Contract (PreToolUse):
#   stdin  : JSON payload; the Bash tool command is .tool_input.command
#   exit 0 : allow the tool call to proceed
#   exit 2 : block the tool call; stderr is fed back to Claude
#
# Scope: a path argument is "denied" when it contains `secret` (this covers both
# `*secret*` and `secrets/`). The command is split into segments on ; & | ( )
# backticks and newlines; heredoc bodies are dropped. A segment is blocked when:
#   - its verb is a content reader (cat head tail less more sed awk grep egrep
#     fgrep rg bat nl od xxd hexdump strings cut sort uniq tac rev base64 diff
#     cmp vim vi view nano) and a file argument is denied. For grep/egrep/fgrep/
#     rg/sed/awk the first positional argument is the pattern/script and is not
#     a path, unless the pattern was given with -e / -f;
#   - it is `git show` / `git cat-file` with a denied argument (incl. <ref>:path);
#   - it is `git diff` with a denied argument and none of --stat / --numstat /
#     --shortstat / --name-only / --name-status / --summary / --dirstat;
#   - it redirects a denied path into stdin (`< path`).
# Commands that only name a path (ls, git add, git commit, git log -- path,
# git diff --stat, node --test tests/secret-redactor.test.mjs) are allowed.
#
# Known residual bypasses (defense-in-depth, not a sandbox): interpreters
# (`node -e`, `python -c`, `bash -c "..."`), `git log -p`, `gh pr diff`,
# `git grep`, `cp`/`mv` then read, globs or variables that expand to a denied
# path (`cat src/lib/*redactor*`, `cat "$F"`), and reader verbs not listed.
set -u

if [ -t 0 ]; then
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

case "$COMMAND" in
  *secret*) ;;
  *) exit 0 ;;
esac
if ! command -v awk >/dev/null 2>&1; then
  exit 0
fi

SQ="'"
# Same heredoc / line-continuation sanitizer as no-force-push.sh.
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

# Tokenize each line into segments and print the first denied path read by a
# segment (or nothing). Quoted text stays part of its token, so
# `cat "secret.txt"` is caught while `echo "cat secret.txt"` is not.
# shellcheck disable=SC2016  # awk program: $0 must not be expanded by the shell
DETECT='
function denied(s) { return s ~ /secret/ }
function endtok() {
  if (has) {
    if (redir_in) { if (denied(tok)) { hit = tok } ; redir_in = 0 }
    else if (redir_out) { redir_out = 0 }
    else { nt++; T[nt] = tok }
  }
  tok = ""; has = 0
}
function check(   i, v, n, a, skip, stat, sc) {
  i = 1
  while (i <= nt && (T[i] ~ /^[A-Za-z_][A-Za-z0-9_]*=/ || T[i] ~ /^(sudo|env|command|exec|time|nohup)$/)) { i++ }
  if (i > nt) { return "" }
  v = T[i]; sub(/.*\//, "", v); i++
  if (v ~ /^(cat|head|tail|less|more|sed|awk|gawk|grep|egrep|fgrep|rg|bat|nl|od|xxd|hexdump|strings|cut|sort|uniq|tac|rev|base64|diff|cmp|vim|vi|view|nano)$/) {
    skip = (v ~ /^(sed|awk|gawk|grep|egrep|fgrep|rg)$/)
    for (n = i; n <= nt; n++) {
      a = T[n]
      if (skip && (a ~ /^-(e|f)/ || a ~ /^--(regexp|file)/ || a ~ /^--expression/)) {
        skip = 0
        if (a ~ /^(-e|-f|--regexp|--file|--expression)$/) { n++; if (a == "-f" && denied(T[n])) { return T[n] } }
        continue
      }
      if (a ~ /^-/) { if (a ~ /=/) { sub(/^[^=]*=/, "", a); if (denied(a)) { return a } } ; continue }
      if (skip) { skip = 0; continue }
      if (denied(a)) { return a }
    }
    return ""
  }
  if (v == "git") {
    while (i <= nt && T[i] ~ /^-/) {
      if (T[i] ~ /^(-C|-c|--git-dir|--work-tree|--namespace)$/) { i++ }
      i++
    }
    if (i > nt) { return "" }
    sc = T[i]; i++
    if (sc == "show" || sc == "cat-file" || sc == "diff") {
      stat = 0
      if (sc == "diff") {
        for (n = i; n <= nt; n++) { if (T[n] ~ /^--(stat|numstat|shortstat|name-only|name-status|summary|dirstat)(=|$)/) { stat = 1 } }
      }
      if (stat) { return "" }
      for (n = i; n <= nt; n++) { if (denied(T[n])) { return T[n] } }
    }
  }
  return ""
}
function endseg(   r) {
  endtok()
  if (hit == "") { r = check(); if (r != "") { hit = r } }
  delete T; nt = 0; redir_in = 0; redir_out = 0
}
BEGIN { hit = ""; nt = 0; has = 0; tok = ""; st = 0 }
{
  line = $0; n = length(line); i = 1
  while (i <= n) {
    c = substr(line, i, 1)
    if (st == 1) { if (c == Q) { st = 0 } else { tok = tok c } ; i++; continue }
    if (st == 2) {
      if (c == "\\") { tok = tok substr(line, i + 1, 1); i += 2; continue }
      if (c == "\"") { st = 0 } else { tok = tok c }
      i++; continue
    }
    if (c == Q) { st = 1; has = 1; i++; continue }
    if (c == "\"") { st = 2; has = 1; i++; continue }
    if (c == "\\") { tok = tok substr(line, i + 1, 1); has = 1; i += 2; continue }
    if (c == "#" && !has) { break }
    if (c ~ /[[:space:]]/) { endtok(); i++; continue }
    if (c ~ /[;&|()`]/) { endseg(); i++; continue }
    if (c == "<") { endtok(); redir_in = 1; i++; continue }
    if (c == ">") { endtok(); redir_out = 1; i++; continue }
    tok = tok c; has = 1; i++
  }
  if (st == 0) { endseg() }
}
END { if (st != 0) { endseg() } ; if (hit != "") { print hit } }
'

HIT="$(
  printf '%s\n' "$COMMAND" |
    awk -v Q="$SQ" "$STRIP_HEREDOC" |
    awk -v Q="$SQ" "$DETECT"
)"
if [ -z "$HIT" ]; then
  exit 0
fi

BLOCKED_MESSAGE="[denied-read-guard] BLOCKED: this command reads a path denied by settings.
  path: $(printf '%s' "$HIT" | cut -c1-200)
  .claude/settings.json denies Read(./secrets/**) and Read(./**/*secret*);
  reading the same content through Bash bypasses that deny.
  Do not work around this hook (other verbs, interpreters, copies).
  Report to the organizer / human that the task needs this path instead."
printf '%s\n' "$BLOCKED_MESSAGE" >&2

harness_event() { :; }
HARNESS_EVENT_LIB="$(dirname "$0")/harness-event.sh"
# shellcheck source=.claude/hooks/harness-event.sh
if [ -r "$HARNESS_EVENT_LIB" ]; then . "$HARNESS_EVENT_LIB"; fi
harness_event 'hook:denied-read-guard' block '' 'denied read'
exit 2
