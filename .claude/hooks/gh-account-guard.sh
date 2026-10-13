#!/usr/bin/env bash
# PreToolUse hook (matcher: Bash): guard the active gh CLI account before gh ops.
#
# Background: the local gh keyring holds two accounts (s977043 for this repo,
# kominem-unilabo for work) and the active account silently switches mid-session,
# causing 404 / permission errors on gh pr create / merge / gh api write calls,
# and 404 / "Could not resolve to a Repository" on read calls (#2604).
# This hook makes the prose guard in CLAUDE.md ("Verify gh active account before
# write ops") deterministic for both reads and writes.
#
# Contract (PreToolUse):
#   stdin  : JSON payload; the Bash tool command is .tool_input.command
#   exit 0 : allow the tool call to proceed
#   exit 2 : block the tool call; stderr is fed back to Claude
#
# Behavior:
#   - Non-gh commands and `gh auth ...`: exit 0 without calling gh.
#   - Each gh call (segment) that names another owner explicitly — the
#     `--repo`/`-R owner/repo` value, or a `repos/<owner>/` endpoint as the
#     first positional argument of `gh api` — is dropped, so work-repo calls are
#     never switched. Title/body text and `#` comments are not read for owners,
#     except an unquoted value shaped like `-R…` / `--repo=…` (e.g.
#     `--body -Rother/x`), which is mistaken for an owner and exempts the call.
#     The remaining segments decide: any write among them makes it a write.
#   - A read is also skipped when the command contains `cd`/`pushd` or
#     `GH_REPO=`, or the payload `.cwd` is outside this repository (by git
#     common dir, so linked worktrees count as inside). Writes ignore these.
#   - Every other gh call: verify `gh api user --jq .login` == expected account.
#     If it differs, run `gh auth switch -u <expected>` and notify via stderr
#     (exit 0 so the original command proceeds on the corrected account).
#     If the switch itself fails, a WRITE op is blocked with exit 2; a READ op
#     only gets a stderr warning (exit 0), because a failed read breaks nothing
#     and blocking it would make the guard itself the cause of failed reads.
#
# Testability: expected account overridable via GH_ACCOUNT_GUARD_EXPECTED;
# `gh` is resolved via PATH so tests can inject a stub.
set -u

EXPECTED_ACCOUNT="${GH_ACCOUNT_GUARD_EXPECTED:-s977043}"

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

# --- Fast path: skip anything that cannot contain a gh invocation -----------
case "$COMMAND" in
  *gh*) ;;
  *) exit 0 ;;
esac

# --- Write-op detection ------------------------------------------------------
# G = a `gh` word start: beginning of string or a shell separator, then `gh`
# followed by whitespace, then any number of global options — with an inline
# value (`--repo=o/r`) or a separate value token (`-R o/r`) — before the
# subcommand. Uses POSIX ERE only (portable across BSD/GNU grep).
GH_OPT='(-[^[:space:]]+([[:space:]]+[^-[:space:]][^[:space:]]*)?[[:space:]]+)*'
G="(^|[;&|([:space:]])gh[[:space:]]+${GH_OPT}"
WRITE_RE="${G}pr[[:space:]]+(create|merge|edit|close|comment|ready|reopen|review|update-branch)"
WRITE_RE="${WRITE_RE}|${G}issue[[:space:]]+(create|edit|close|comment|reopen|delete|transfer|pin|unpin|lock|unlock)"
# gh api: explicit non-GET method (value may be quoted, e.g. -X "POST") ...
WRITE_RE="${WRITE_RE}|${G}api[[:space:]][^;|&]*(-X|--method)[[:space:]=]*[\"']?(POST|PATCH|PUT|DELETE|post|patch|put|delete)"
# ... or body fields / input, which make gh api default to POST
WRITE_RE="${WRITE_RE}|${G}api[[:space:]][^;|&]*[[:space:]](-f|-F|--field|--raw-field|--input)([[:space:]=]|\$)"
WRITE_RE="${WRITE_RE}|${G}release[[:space:]]+(create|edit|delete|delete-asset|upload)"
WRITE_RE="${WRITE_RE}|${G}workflow[[:space:]]+(run|enable|disable)"
WRITE_RE="${WRITE_RE}|${G}run[[:space:]]+(rerun|cancel|delete)"
WRITE_RE="${WRITE_RE}|${G}repo[[:space:]]+(create|delete|edit|rename|archive|unarchive|fork|sync)"
WRITE_RE="${WRITE_RE}|${G}label[[:space:]]+(create|edit|delete|clone)"
WRITE_RE="${WRITE_RE}|${G}(secret|variable)[[:space:]]+(set|delete)"

# --- Classify each gh invocation (segment) -----------------------------------
# A segment is one `gh ...` call up to the next `;`, `&` or `|`. `gh auth ...`
# segments and segments that name another owner are dropped; the command is
# guarded if any segment remains, and is a write if a remaining one is a write.
# Owners come only from the `--repo`/`-R` value and from a `repos/<owner>/`
# endpoint in the first positional argument of `gh api`, after dropping quoted
# strings that contain whitespace and `#` comments, so title/body text cannot
# exempt a call.
AUTH_RE="^[;&|([:space:]]?gh[[:space:]]+${GH_OPT}auth([[:space:]]|\$)"
OWNER_TOKEN='[A-Za-z0-9][A-Za-z0-9_.-]*'
REPO_FLAG_RE="(^|[[:space:]])(--repo|-R)(=|[[:space:]]*)[\"']?${OWNER_TOKEN}/"
API_PATH_RE="^[;&|([:space:]]?gh[[:space:]]+${GH_OPT}api[[:space:]]+${GH_OPT}[\"']?/?repos/${OWNER_TOKEN}/"
EXPECTED_LOWER="$(printf '%s' "$EXPECTED_ACCOUNT" | tr '[:upper:]' '[:lower:]')"
HAS_GUARDED=0
IS_WRITE=0
EXCERPT=''
while IFS= read -r SEG; do
  [ -n "$SEG" ] || continue
  if printf '%s\n' "$SEG" | grep -qE "$AUTH_RE"; then
    continue
  fi
  NORM="$(printf '%s\n' "$SEG" | sed -E "s/\"[^\"]*[[:space:]][^\"]*\"//g; s/'[^']*[[:space:]][^']*'//g; s/(^|[[:space:]])#.*\$//")"
  OWNERS="$({
    printf '%s\n' "$NORM" | grep -oE "$REPO_FLAG_RE" | sed -E "s#^[[:space:]]?(--repo|-R)[=[:space:]]*[\"']?##"
    printf '%s\n' "$NORM" | grep -oE "$API_PATH_RE" | sed -E 's#.*repos/##'
  } | sed -E 's#/$##' | tr '[:upper:]' '[:lower:]')"
  if printf '%s\n' "$OWNERS" | grep -v '^$' | grep -qvxF "$EXPECTED_LOWER"; then
    continue
  fi
  HAS_GUARDED=1
  # First 4 words of the call with spaced quoted text dropped; the writer then
  # masks every token that is not a plain word or a bare flag.
  WORDS="$(printf '%s\n' "$NORM" | awk '{ print $1, $2, $3, $4 }')"
  [ -n "$EXCERPT" ] || EXCERPT="$WORDS"
  if printf '%s\n' "$SEG" | grep -qE "$WRITE_RE"; then
    [ "$IS_WRITE" = 1 ] || EXCERPT="$WORDS"
    IS_WRITE=1
  fi
done < <(printf '%s\n' "$COMMAND" | grep -oE "${G}[^;&|]*" || true)

if [ "$HAS_GUARDED" = 0 ]; then
  exit 0
fi

# --- Reads that may target another repo implicitly are left alone ------------
# Writes are always checked. A read is skipped when the command changes
# directory, sets GH_REPO, or the payload cwd is outside this repository
# (compared by git common dir so linked worktrees count as inside).
if [ "$IS_WRITE" = 0 ]; then
  if printf '%s\n' "$COMMAND" | grep -qE '(^|[;&|([:space:]])(cd|pushd)([[:space:]]|$)|GH_REPO='; then
    exit 0
  fi
  CWD="$(printf '%s' "$HOOK_INPUT" | jq -r '.cwd // empty' 2>/dev/null || true)"
  if [ -n "$CWD" ]; then
    HOOK_GIT="$(git -C "$(dirname "$0")" rev-parse --path-format=absolute --git-common-dir 2>/dev/null || true)"
    CWD_GIT="$(git -C "$CWD" rev-parse --path-format=absolute --git-common-dir 2>/dev/null || true)"
    if [ -z "$CWD_GIT" ] || [ "$CWD_GIT" != "$HOOK_GIT" ]; then
      exit 0
    fi
  fi
fi

# --- Verify / correct the active account -------------------------------------
if ! command -v gh >/dev/null 2>&1; then
  # gh not installed: nothing to guard; the command will fail on its own.
  exit 0
fi

ACTIVE_LOGIN="$(gh api user --jq .login 2>/dev/null || true)"
if [ "$ACTIVE_LOGIN" = "$EXPECTED_ACCOUNT" ]; then
  exit 0
fi

OP_KIND='read'
if [ "$IS_WRITE" = 1 ]; then
  OP_KIND='write'
fi

# Record the failed switch in the harness event log (best effort; see harness-event.sh).
# The no-op is defined first and the library sourced only if readable: a failed
# `.` exits the shell under POSIX mode, which would turn exit 2 into 1.
record_event() {
  harness_event() { :; }
  local lib
  lib="$(dirname "$0")/harness-event.sh"
  # shellcheck source=.claude/hooks/harness-event.sh
  if [ -r "$lib" ]; then . "$lib"; fi
  harness_event 'hook:gh-account-guard' "$1" 'verify-gh-active-account' "$EXCERPT"
}

if gh auth switch -u "$EXPECTED_ACCOUNT" >/dev/null 2>&1; then
  echo "[gh-account-guard] active gh account was '${ACTIVE_LOGIN:-unknown}'; switched to '${EXPECTED_ACCOUNT}' before gh ${OP_KIND} op" >&2
  exit 0
fi

if [ "$IS_WRITE" = 0 ]; then
  echo "[gh-account-guard] WARNING: active gh account is '${ACTIVE_LOGIN:-unknown}' (expected '${EXPECTED_ACCOUNT}') and 'gh auth switch -u ${EXPECTED_ACCOUNT}' failed. A 404 or 'Could not resolve to a Repository' from this read means the account, not a missing resource." >&2
  record_event warn
  exit 0
fi

echo "[gh-account-guard] BLOCKED: active gh account is '${ACTIVE_LOGIN:-unknown}' (expected '${EXPECTED_ACCOUNT}') and 'gh auth switch -u ${EXPECTED_ACCOUNT}' failed. Run 'gh auth status' and switch manually before retrying." >&2
record_event block
exit 2
