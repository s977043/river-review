#!/usr/bin/env bash
# Offline contracts by default; opt into a bounded real Codex invocation with --live.
set -euo pipefail
repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"
if [[ $# -gt 1 || ( $# -eq 1 && "$1" != --live ) ]]; then
  printf 'Usage: bash scripts/verify-codex.sh [--live]\n' >&2
  exit 2
fi
bash scripts/local-npm.sh run plugin:validate
bash scripts/local-npm.sh run plugin:sync:check
bash scripts/local-npm.sh run agent-skills:validate
bash scripts/local-npm.sh exec -- node --test --test-reporter=spec \
  tests/validate-plugin-manifest.test.mjs \
  tests/cross-runtime-conformance.test.mjs \
  tests/agent-contract.test.mjs \
  tests/adapter-entry-conformance.test.mjs
if [[ "${1:-}" == --live ]]; then
  command -v codex >/dev/null || { printf 'error: codex is required\n' >&2; exit 1; }
  command -v timeout >/dev/null || { printf 'error: timeout is required\n' >&2; exit 1; }
  plugin_list="$(codex plugin list 2>&1)" || {
    printf 'error: unable to inspect Codex plugins\n%s\n' "$plugin_list" >&2
    exit 1
  }
  if ! grep -Eq 'river-review@river-review-marketplace[[:space:]]+installed, enabled[[:space:]]+1\.' <<<"$plugin_list"; then
    printf 'error: River Review 1.x is not installed and enabled in Codex\n%s\n' "$plugin_list" >&2
    exit 1
  fi
  codex --version
  timeout --kill-after=10s 180s codex exec --ephemeral --sandbox read-only --json \
    'Use the $river-review:river-review-testing skill to review tests/fix-dashes.test.mjs for coverage and stability. Return concise findings or explicitly report no findings. Do not edit files, run shell commands, access external services, or delegate.' </dev/null
fi
