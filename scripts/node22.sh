#!/usr/bin/env bash
# Run a command with the .nvmrc Node major first on PATH, without `export` in the caller.
#
#   scripts/node22.sh <cmd> [args...]
#   scripts/node22.sh npm test
#   scripts/node22.sh node --test tests/foo.test.mjs
#
# PATH is set here (not only the node binary) because npm's shebang is
# `#!/usr/bin/env node`: calling .../node@22/bin/npm alone still runs npm on the
# default node. NODE22_BIN overrides the bin dir (default: Homebrew keg).
# Exit 127 when the bin dir has no node or its major differs from .nvmrc.
set -euo pipefail

if [ "$#" -eq 0 ]; then
  echo "usage: scripts/node22.sh <cmd> [args...]" >&2
  exit 64
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WANT="$(tr -d '[:space:]' < "${REPO_ROOT}/.nvmrc")"
WANT_MAJOR="${WANT#v}"
WANT_MAJOR="${WANT_MAJOR%%.*}"
BIN_DIR="${NODE22_BIN:-/opt/homebrew/opt/node@${WANT_MAJOR}/bin}"

if [ ! -x "${BIN_DIR}/node" ]; then
  echo "error: no node in ${BIN_DIR}; .nvmrc requires ${WANT}. Set NODE22_BIN to a Node ${WANT_MAJOR} bin dir." >&2
  exit 127
fi
HAVE="$("${BIN_DIR}/node" --version)"
HAVE_MAJOR="${HAVE#v}"
HAVE_MAJOR="${HAVE_MAJOR%%.*}"
if [ "${HAVE_MAJOR}" != "${WANT_MAJOR}" ]; then
  echo "error: ${BIN_DIR}/node is ${HAVE}, which does not match .nvmrc ${WANT}. Set NODE22_BIN to a Node ${WANT_MAJOR} bin dir." >&2
  exit 127
fi

PATH="${BIN_DIR}:${PATH}"
export PATH
exec "$@"
