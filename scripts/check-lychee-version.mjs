#!/usr/bin/env node
// Fail fast when the local lychee is older than the version .lychee.toml needs.
// `include_fragments = "anchor-only"` is accepted from lychee 0.24.0; older
// binaries abort with an opaque TOML type error. CI (lychee-action v2.9.0)
// downloads lychee 0.24.2.
import { execFileSync } from 'child_process';
import { isDirectRun } from './lib/is-direct-run.mjs';

export const MIN_VERSION = [0, 24, 0];

const INSTALL_HINT =
  'Install options: `brew install lychee`, `cargo install lychee`, or a release binary from ' +
  'https://github.com/lycheeverse/lychee/releases (see https://lychee.cli.rs/installation/).';

// Returns { version: [major, minor, patch], prerelease: string | null } or null.
export function parseLycheeVersion(output) {
  const match = String(output ?? '').match(/v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?/);
  if (!match) return null;
  return { version: match.slice(1, 4).map(Number), prerelease: match[4] ?? null };
}

// A prerelease of MIN_VERSION (e.g. 0.24.0-alpha.1) precedes it, so it fails.
export function meetsMinimum(parsed, min = MIN_VERSION) {
  const diff = parsed.version.map((n, i) => n - min[i]).find((d) => d !== 0);
  if (diff !== undefined) return diff > 0;
  return parsed.prerelease === null;
}

// Returns null when OK, otherwise the error message to print.
export function checkLychee(run) {
  let output;
  try {
    output = run();
  } catch (error) {
    if (error.code === 'ENOENT') {
      return `lychee not found. lychee >= ${MIN_VERSION.join('.')} is required. ${INSTALL_HINT}`;
    }
    const stderr = String(error.stderr ?? '')
      .trim()
      .split('\n')
      .slice(-5)
      .join('\n');
    const detail = error.status != null ? `exit code ${error.status}` : error.message;
    return `lychee was found but \`lychee --version\` failed (${detail}).${stderr ? `\n${stderr}` : ''}`;
  }
  const parsed = parseLycheeVersion(output);
  if (!parsed) return `Could not parse lychee version from: ${String(output).trim()}`;
  if (!meetsMinimum(parsed)) {
    const actual = parsed.version.join('.') + (parsed.prerelease ? `-${parsed.prerelease}` : '');
    return (
      `lychee ${actual} is too old: .lychee.toml requires lychee >= ${MIN_VERSION.join('.')} ` +
      `(include_fragments = "anchor-only"). CI uses lychee 0.24.2. ${INSTALL_HINT}`
    );
  }
  return null;
}

if (isDirectRun(import.meta.url)) {
  const message = checkLychee(() =>
    execFileSync('lychee', ['--version'], {
      encoding: 'utf8',
      timeout: 10000,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  );
  if (message) {
    console.error(message);
    process.exit(1);
  }
}
