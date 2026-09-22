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
  codex --version
  timeout --kill-after=10s 180s codex exec --ephemeral --sandbox read-only --json \
    'Read .codex-plugin/plugin.json, flows/entry-map.json and flows/plan-review.flow.json. Report the plugin version, skills path, review-plan resolution and stopConditions. State whether River Review is registered in your available skills or only readable from this checkout. Do not edit files, delegate, or access external services. Do not claim an end-to-end review passed from these reads alone.' </dev/null
fi
