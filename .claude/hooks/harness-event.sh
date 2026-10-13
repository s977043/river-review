#!/usr/bin/env bash
# Shared writer for the agent harness event log. Sourced by hooks; not a hook
# itself and not registered in .claude/settings.json.
#
# Appends one JSON line to ${HARNESS_EVENTS_PATH:-~/.claude/state/harness-events.jsonl}
# in the format defined by docs/development/agent-harness-design.md
# ("追加する signal"): {ts, source, kind, ruleId, cwd, session_id, detail}.
# scripts/harness/record-event.mjs writes the same format for organizer records.
#
# Usage (after sourcing):
#   harness_event <source> <kind> <ruleId> <excerpt>
# The caller's stdin payload is read from $HOOK_INPUT when set (cwd, session_id,
# tool_name). The excerpt is split on whitespace and every token that is not a
# plain lowercase word (`^[a-z][a-z0-9-]*$`) or a bare flag without a value
# (`^--?[a-z][a-z-]*$`) is replaced by `*`, then cut to 120 characters. This is
# an allowlist so that credential shapes nobody listed (URLs with userinfo,
# `-H Authorization:...`, `-bghp_...`) never reach the log. A secret made only
# of lowercase letters and hyphens is indistinguishable from a word and is kept.
#
# Best effort: every failure (no jq, unwritable path, a path that is not a
# regular file, invalid arguments) is swallowed. The function never writes to stdout/stderr and always returns 0,
# so it cannot change a hook's exit code or message contract.

harness_event() {
  (
    command -v jq >/dev/null 2>&1 || exit 0
    case "${2:-}" in
      block | warn | self-report) ;;
      *) exit 0 ;;
    esac
    printf '%s' "${1:-}" | grep -qE '^(hook|command|script):[a-z0-9-]+$' || exit 0
    if [ -n "${HARNESS_EVENTS_PATH:-}" ]; then
      events_path="$HARNESS_EVENTS_PATH"
    elif [ -n "${HOME:-}" ]; then
      events_path="$HOME/.claude/state/harness-events.jsonl"
    else
      exit 0
    fi
    # Event metadata includes cwd and session_id. New log files and
    # directories should not be readable by other local users.
    umask 077
    mkdir -p "$(dirname "$events_path")" || exit 0
    # Do not append through a symlink, FIFO or device.
    [ ! -L "$events_path" ] || exit 0
    [ -f "$events_path" ] || [ ! -e "$events_path" ] || exit 0
    line="$(
      printf '%s' "${HOOK_INPUT:-}" | jq -c -R -s \
        --arg ts "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        --arg source "$1" \
        --arg kind "$2" \
        --arg ruleId "${3:-}" \
        --arg excerpt "${4:-}" \
        --arg pwd "$PWD" \
        '(try fromjson catch {}) as $p
        | ($p | if type == "object" then . else {} end) as $p
        | {
            ts: $ts,
            source: $source,
            kind: $kind,
            ruleId: $ruleId,
            cwd: ($p.cwd // $pwd | tostring),
            session_id: ($p.session_id // "" | tostring),
            detail: {
              tool_name: ($p.tool_name // "Bash" | tostring),
              excerpt: (
                [$excerpt | splits("\\s+") | select(. != "")
                  | if test("^[a-z][a-z0-9-]*$") or test("^--?[a-z][a-z-]*$") then . else "*" end]
                | join(" ") | .[0:120]
              )
            }
          }'
    )" || exit 0
    [ -n "$line" ] || exit 0
    printf '%s\n' "$line" >>"$events_path"
  ) >/dev/null 2>&1 </dev/null
  return 0
}
