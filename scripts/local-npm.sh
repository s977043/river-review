#!/usr/bin/env bash
# Run npm with the exact Node version in .nvmrc without changing global defaults.
# Usage: bash scripts/local-npm.sh run dev
#        bash scripts/local-npm.sh test
set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"
required_version="$(cat .nvmrc)"

if [[ "$(node --version 2>/dev/null || true)" != "v${required_version}" ]]; then
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  if [[ ! -s "$NVM_DIR/nvm.sh" ]]; then
    printf 'error: Node %s is required. Activate it with your version manager.\n' "$required_version" >&2
    exit 1
  fi
  # shellcheck source=/dev/null
  source "$NVM_DIR/nvm.sh" --no-use
  nvm use --silent "$required_version" || exit 1
fi

if [[ "$(node --version)" != "v${required_version}" ]]; then
  printf 'error: Node version does not match .nvmrc.\n' >&2
  exit 1
fi
exec npm "$@"
