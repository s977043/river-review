#!/usr/bin/env node
// Fail fast when the local lychee is older than the version .lychee.toml needs.
// `include_fragments = "anchor-only"` is accepted from lychee 0.24.0; older
// binaries abort with an opaque TOML type error. CI (lychee-action v2.9.0)
// downloads lychee 0.24.2.
import { execFileSync } from 'child_process';

const MIN_VERSION = [0, 24, 0];

let output;
try {
  output = execFileSync('lychee', ['--version'], { encoding: 'utf8', timeout: 10000 });
} catch {
  console.error(
    `lychee not found. Install lychee >= ${MIN_VERSION.join('.')} (e.g. \`brew install lychee\`).`
  );
  process.exit(1);
}

const match = output.match(/(\d+)\.(\d+)\.(\d+)/);
if (!match) {
  console.error(`Could not parse lychee version from: ${output.trim()}`);
  process.exit(1);
}
const actual = match.slice(1, 4).map(Number);
const tooOld = actual.map((n, i) => n - MIN_VERSION[i]).find((d) => d !== 0);
if (tooOld !== undefined && tooOld < 0) {
  console.error(
    `lychee ${actual.join('.')} is too old: .lychee.toml requires lychee >= ${MIN_VERSION.join('.')} ` +
      '(include_fragments = "anchor-only"). CI uses lychee 0.24.2. ' +
      'Upgrade with `brew upgrade lychee`.'
  );
  process.exit(1);
}
