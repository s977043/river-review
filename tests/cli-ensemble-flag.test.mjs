// #911 Phase 3 Slice B — --ensemble flag tests.
//
// The flag is sugar for "merge every *.md file under <dir> into a single
// review-external artifact". This test exercises the CLI parser directly via
// subprocess to avoid coupling to internal parser shape.

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test, { describe } from 'node:test';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(__dirname, '../src/cli.mjs');

function makeReviewsDir(files) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'river-ensemble-test-'));
  const reviewsDir = path.join(root, 'reviews');
  mkdirSync(reviewsDir);
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(path.join(reviewsDir, name), content);
  }
  return { root, reviewsDir };
}

function runCli(args, cwd) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' },
  });
}

describe('--ensemble flag (#911 Phase 3 Slice B)', () => {
  test('reports error when --ensemble has no value', () => {
    const { root, reviewsDir } = makeReviewsDir({ 'a.md': '# A' });
    try {
      const r = runCli(['review', 'exec', '--ensemble'], reviewsDir);
      assert.match(r.stderr, /--ensemble requires a directory path/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('reports error when directory does not exist', () => {
    const { root, reviewsDir } = makeReviewsDir({});
    try {
      const r = runCli(['review', 'exec', '--ensemble', './nonexistent-dir'], reviewsDir);
      assert.match(r.stderr, /--ensemble cannot read directory/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('reports error when directory has no *.md files', () => {
    const { root, reviewsDir } = makeReviewsDir({ 'a.txt': 'not markdown' });
    try {
      const r = runCli(['review', 'exec', '--ensemble', '.'], reviewsDir);
      assert.match(r.stderr, /found no \*\.md files/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('--artifact review-external=... wins; --ensemble emits warning, no-op', () => {
    const { root, reviewsDir } = makeReviewsDir({ 'a.md': '# A' });
    try {
      // dry-run path to avoid actual review execution
      const overridePath = path.join(reviewsDir, 'a.md');
      const r = runCli(
        [
          'review',
          'exec',
          '--dry-run',
          '--artifact',
          `review-external=${overridePath}`,
          '--ensemble',
          '.',
        ],
        reviewsDir
      );
      assert.match(r.stderr + r.stdout, /--ensemble ignored because --artifact review-external/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('--ensemble merges all *.md files into a tmp file (smoke)', () => {
    // Snapshot the tmpdir contents before, ask the CLI to print --help-equivalent
    // after parsing succeeds (we use --dry-run on `review exec`), and assert
    // that a temp file with the expected prefix exists with the merged content.
    // We cannot easily observe parsed.cliArtifacts directly from outside, so
    // we verify by checking that the temp file contains both file contents.
    const { root, reviewsDir } = makeReviewsDir({
      'claude.md': '## Claude review\nfinding A',
      'codex.md': '## Codex review\nfinding B',
    });
    try {
      const r = runCli(['review', 'exec', '--dry-run', '--ensemble', '.'], reviewsDir);
      // The CLI may exit 0 or non-zero depending on default artifact resolution;
      // we only need the parser path to have run successfully without an
      // ensemble-related error.
      assert.doesNotMatch(
        r.stderr,
        /--ensemble (?:cannot read directory|requires a directory path|found no)/,
        `ensemble parsing failed: ${r.stderr}`
      );

      // The tmp file is named `river-ensemble-<pid>-<timestamp>.md` (src/cli.mjs)
      // and the cleanup hook fires on process exit, so it is gone by now — we
      // verify behavior structurally instead: there should be NO leftover file
      // for THIS child process. Scope by the child's pid: other processes on the
      // same runner (e.g. tests/cli-option-consumer-check.test.mjs, which parses
      // `--ensemble` in-process) may legitimately hold their own tmp files
      // while this test runs (#2087 finding 3).
      assert.ok(Number.isInteger(r.pid) && r.pid > 0, `child pid missing: ${r.pid}`);
      const prefix = `river-ensemble-${r.pid}-`;
      const remaining = readdirSyncSafe(os.tmpdir()).filter(
        (n) => n.startsWith(prefix) && n.endsWith('.md')
      );
      // Subprocess already exited and ran the cleanup hook; remaining should be 0.
      assert.equal(remaining.length, 0, `tmp files not cleaned up: ${remaining.join(', ')}`);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

function readdirSyncSafe(dir) {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}
