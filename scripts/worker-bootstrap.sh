#!/usr/bin/env bash
# Bootstrap a delegated-worker worktree so that every worker starts from the
# same state: a worktree under .claude/worktrees/<slug>, the Node version pinned
# by .nvmrc (or a warning naming which node was used instead), `npm ci`, a
# node_modules sanity check, and a manifest of the files `npm ci` leaves
# untracked. The manifest is the baseline that scripts/tree-pollution-check.sh
# diffs against after the worker finishes.
#
# Why the manifest lives outside the worktree: `.bootstrap-manifest` at the
# worktree root is NOT covered by .gitignore (measured with
# `git check-ignore -v .bootstrap-manifest` -> exit 1), so it would itself show
# up as pollution. It is written to
#   ${RIVER_WORKER_STATE_DIR:-$HOME/.claude/state}/worker-bootstrap-<slug>.txt
#
# Why the Node lookup does not stop on a mismatch: CI is the authority for the
# Node version. A worker on the wrong Node must still be able to run, but the
# mismatch has to be visible in its report -- workers have reported "Node 22 is
# not available, verified on v26" on a machine that had Node 22 installed under
# a Homebrew keg outside PATH (`/opt/homebrew/opt/node@22/bin`).
#
# .nvmrc forms: `22.22.2` (exact), `22` / `22.1` (prefix). `lts/*` style
# aliases are not supported and always produce the mismatch warning.
#
# Usage:
#   scripts/worker-bootstrap.sh <branch> [--base <ref>]
#   RIVER_WORKER_STATE_DIR=/path scripts/worker-bootstrap.sh <branch>
#
# Exit codes:
#   0  bootstrap complete (Node mismatch and npm ls warnings do not change this)
#   1  worktree could not be created, or `npm ci` failed
#   64 usage error

# shellcheck disable=SC2329  # probe_* are invoked through the loop variable
set -euo pipefail

usage() {
  echo "usage: scripts/worker-bootstrap.sh <branch> [--base <ref>]" >&2
  exit 64
}

BRANCH=""
BASE="origin/main"
while [ "$#" -gt 0 ]; do
  case "$1" in
    --base)
      [ "$#" -ge 2 ] || usage
      BASE="$2"
      shift 2
      ;;
    --base=*)
      BASE="${1#--base=}"
      shift
      ;;
    -h | --help)
      usage
      ;;
    -*)
      echo "error: unknown option '$1'." >&2
      usage
      ;;
    *)
      [ -z "${BRANCH}" ] || usage
      BRANCH="$1"
      shift
      ;;
  esac
done
[ -n "${BRANCH}" ] || usage
[ -n "${BASE}" ] || usage

REPO_ROOT="$(git rev-parse --show-toplevel)"
# The main checkout, even when this script is run from inside another worktree.
COMMON_DIR="$(git rev-parse --path-format=absolute --git-common-dir)"
MAIN_ROOT="$(dirname "${COMMON_DIR}")"
[ -d "${MAIN_ROOT}/.claude" ] || MAIN_ROOT="${REPO_ROOT}"

SLUG="$(printf '%s' "${BRANCH}" | tr '/' '-')"
WORKTREE="${MAIN_ROOT}/.claude/worktrees/${SLUG}"
STATE_DIR="${RIVER_WORKER_STATE_DIR:-${HOME}/.claude/state}"
MANIFEST="${STATE_DIR}/worker-bootstrap-${SLUG}.txt"

echo "== 1. worktree"
if git -C "${MAIN_ROOT}" worktree list --porcelain | grep -qxF "worktree ${WORKTREE}"; then
  echo "reuse: ${WORKTREE} (already registered; branch: $(git -C "${WORKTREE}" rev-parse --abbrev-ref HEAD))"
else
  if git -C "${MAIN_ROOT}" show-ref --verify --quiet "refs/heads/${BRANCH}"; then
    echo "branch '${BRANCH}' already exists locally; attaching it (base '${BASE}' ignored)"
    git -C "${MAIN_ROOT}" worktree add "${WORKTREE}" "${BRANCH}" || {
      echo "error: git worktree add failed." >&2
      exit 1
    }
  else
    git -C "${MAIN_ROOT}" worktree add "${WORKTREE}" -b "${BRANCH}" "${BASE}" || {
      echo "error: git worktree add failed (base '${BASE}')." >&2
      exit 1
    }
  fi
  echo "created: ${WORKTREE} (branch ${BRANCH} from ${BASE})"
fi

echo "== 2. node"
WANT="$(tr -d '[:space:]' < "${WORKTREE}/.nvmrc" 2>/dev/null || true)"
WANT="${WANT#v}"
WANT_MAJOR="${WANT%%.*}"
NODE_BIN=""
NODE_VIA=""

# Each probe sets NODE_BIN to a node binary of the wanted version, or leaves it
# empty. The first hit wins; all probes are best-effort and must not abort.
probe_nvm() {
  local nvm_sh="${NVM_DIR:-${HOME}/.nvm}/nvm.sh"
  [ -s "${nvm_sh}" ] || return 0
  local out
  # shellcheck disable=SC1090
  out="$(bash -c ". '${nvm_sh}' >/dev/null 2>&1 && nvm which '${WANT}' 2>/dev/null" || true)"
  [ -x "${out}" ] && NODE_BIN="${out}" && NODE_VIA="nvm"
  return 0
}
probe_fnm() {
  command -v fnm >/dev/null 2>&1 || return 0
  local out
  out="$(fnm exec --using="${WANT}" -- sh -c 'command -v node' 2>/dev/null || true)"
  [ -x "${out}" ] && NODE_BIN="${out}" && NODE_VIA="fnm"
  return 0
}
probe_volta() {
  command -v volta >/dev/null 2>&1 || return 0
  local out
  out="$(volta run --node "${WANT}" -- sh -c 'command -v node' 2>/dev/null || true)"
  [ -x "${out}" ] && NODE_BIN="${out}" && NODE_VIA="volta"
  return 0
}
probe_mise() {
  command -v mise >/dev/null 2>&1 || return 0
  local out
  out="$(mise where "node@${WANT}" 2>/dev/null || true)"
  [ -x "${out}/bin/node" ] && NODE_BIN="${out}/bin/node" && NODE_VIA="mise"
  return 0
}
probe_asdf() {
  command -v asdf >/dev/null 2>&1 || return 0
  local out
  out="$(asdf where nodejs "${WANT}" 2>/dev/null || true)"
  [ -x "${out}/bin/node" ] && NODE_BIN="${out}/bin/node" && NODE_VIA="asdf"
  return 0
}
# Homebrew keg-only install (`brew install node@22`): not on PATH by default.
# This is where Node 22 actually lived on the maintainer machine (2026-09-05).
probe_brew_keg() {
  local prefix
  for prefix in /opt/homebrew /usr/local; do
    local bin="${prefix}/opt/node@${WANT_MAJOR}/bin/node"
    if [ -x "${bin}" ]; then
      NODE_BIN="${bin}"
      NODE_VIA="homebrew keg (${prefix}/opt/node@${WANT_MAJOR}/bin)"
      return 0
    fi
  done
  return 0
}

if [ -n "${WANT}" ]; then
  for probe in probe_nvm probe_fnm probe_volta probe_mise probe_asdf probe_brew_keg; do
    "${probe}"
    [ -n "${NODE_BIN}" ] && break
  done
fi

if [ -n "${NODE_BIN}" ]; then
  NODE_DIR="$(dirname "${NODE_BIN}")"
  export PATH="${NODE_DIR}:${PATH}"
else
  NODE_VIA="PATH"
fi

if ! command -v node >/dev/null 2>&1; then
  echo "error: no node binary found on PATH." >&2
  exit 1
fi
HAVE="$(node --version)"
HAVE="${HAVE#v}"
echo "node: v${HAVE} via ${NODE_VIA} ($(command -v node))"
echo ".nvmrc: ${WANT:-<none>}"
# A partial pin (`22` / `22.1`) is satisfied by any node whose version starts
# with it; a full pin (`22.22.2`) needs an exact match. `lts/*` aliases are not
# supported: they resolve through nvm only and would always warn here.
version_satisfies() {
  case "$1" in
    "$2" | "$2".*) return 0 ;;
  esac
  return 1
}
if [ -n "${WANT}" ] && ! version_satisfies "${HAVE}" "${WANT}"; then
  echo "WARNING: node v${HAVE} does not match .nvmrc ${WANT}. CI runs ${WANT}; runners/github-action/dist built here may differ from CI."
  echo "         align with: nvm use / fnm use / volta pin / mise use, or export PATH=/opt/homebrew/opt/node@${WANT_MAJOR}/bin:\$PATH"
fi

echo "== 3. npm ci"
(cd "${WORKTREE}" && npm ci) || {
  echo "error: npm ci failed in ${WORKTREE}." >&2
  exit 1
}

echo "== 4. npm ls sanity"
LS_ISSUES="$(cd "${WORKTREE}" && npm ls --depth=0 2>&1 | grep -cE 'invalid|extraneous|UNMET|missing' || true)"
if [ "${LS_ISSUES}" != "0" ]; then
  echo "WARNING: npm ls --depth=0 reports ${LS_ISSUES} line(s) with invalid/extraneous/UNMET/missing (node_modules drift = false-red source)."
else
  echo "ok: npm ls --depth=0 reports no invalid/extraneous/UNMET/missing"
fi

echo "== 5. baseline manifest"
mkdir -p "${STATE_DIR}"
{
  echo "# worker-bootstrap manifest"
  echo "# worktree: ${WORKTREE}"
  echo "# branch: ${BRANCH}"
  echo "# node: v${HAVE} via ${NODE_VIA}"
  echo "# created: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  git -C "${WORKTREE}" ls-files -z --others --exclude-standard | tr '\0' '\n' | grep -v '^$' | sort || true
} > "${MANIFEST}"
echo "manifest: ${MANIFEST} ($(grep -cv '^#' "${MANIFEST}" || true) untracked path(s) after npm ci)"

echo "== 6. first verification commands"
echo "  cd ${WORKTREE}"
[ -n "${NODE_BIN}" ] && echo "  export PATH=$(dirname "${NODE_BIN}"):\$PATH"
echo "  npm test"
echo "  npm run lint"
echo "  scripts/tree-pollution-check.sh ${WORKTREE}   # organizer, after the worker finishes"
exit 0
