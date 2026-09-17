import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

import { parseUnifiedDiff } from '../src/lib/diff-processor.mjs';

// Issue #2294 — CHARACTERISATION TEST, NOT A CONTRACT.
//
// `parseUnifiedDiff` silently discards the body of a merge commit's combined
// diff (`diff --cc` / `@@@`). The file header is accepted (the `+++ b/<path>`
// line looks like any other), but the hunk header regexp only matches
// `@@ -N,M +N,M @@`, so the `@@@ -N,M -N,M +N,M @@@` form never opens a hunk
// and every body line is dropped. No error, no warning: the caller sees
// "files changed, but zero reviewable lines".
//
// Everything asserted below is the CURRENT, DEFECTIVE behaviour, recorded so
// that a future fix has a visible before/after. DO NOT read these assertions
// as the desired behaviour. When #2294 is fixed, these expectations are
// EXPECTED TO CHANGE — update them, do not preserve them.
//
// Why pin instead of fix: this parse band has already taken four consecutive
// fix designs that each introduced a new defect (postmortem: issue #2261), so
// the defect band is made visible first. PR #2284 pinned the sibling U0 band
// in `tests/diff-header-triple.test.mjs` the same way.
//
// Fixtures are produced by real git, never hand-written: each test builds a
// throwaway repository, creates an actual merge commit, and feeds the real
// output of `git show --cc` / `git log -p --cc` to the parser.

const withTempRepo = (fn) => {
  const dir = mkdtempSync(join(tmpdir(), 'rr-2294-'));
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
  try {
    git('init', '-q', '-b', 'main');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'test');
    return fn(dir, git);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

/**
 * Build a merge commit whose merge resolution differs from both parents, which
 * is what makes `git show --cc` emit a combined hunk instead of nothing.
 * @param {string} dir
 * @param {(...args: string[]) => string} git
 */
const buildConflictMerge = (dir, git) => {
  const write = (name, text) => writeFileSync(join(dir, name), text);
  write('f.txt', 'a\nb\nc\nd\n');
  git('add', '-A');
  git('commit', '-qm', 'root');

  git('switch', '-qc', 'side');
  write('f.txt', 'a\nSIDE\nc\nd\n');
  git('commit', '-qam', 'side');

  git('switch', '-q', 'main');
  write('f.txt', 'a\nMAIN\nc\nd\n');
  git('commit', '-qam', 'main');

  // The merge conflicts on purpose; the resolution below belongs to neither
  // parent, so it shows up as a `++` line in the combined diff.
  try {
    git('merge', 'side');
  } catch {
    /* expected conflict */
  }
  write('f.txt', 'a\nRESOLVED\nc\nd\n');
  git('add', '-A');
  git('commit', '-qm', 'merge');
};

test('#2294 (current behaviour): `git show --cc` registers the file but drops every hunk', () => {
  const { diff, parsed } = withTempRepo((dir, git) => {
    buildConflictMerge(dir, git);
    const diffText = git('show', '--cc', '--no-color', 'HEAD');
    return { diff: diffText, parsed: parseUnifiedDiff(diffText) };
  });

  // Precondition: the fixture really is a combined diff produced by git.
  assert.match(diff, /^diff --cc f\.txt$/m, 'fixture is a real `diff --cc` section');
  const combinedHeaders = diff.split('\n').filter((l) => l.startsWith('@@@'));
  assert.equal(combinedHeaders.length, 1, 'fixture carries one `@@@` hunk header');

  // Pinned defect, part 1: the file IS registered (header detection accepts it).
  assert.deepEqual(
    parsed.files.map((f) => f.path),
    ['f.txt']
  );

  // Pinned defect, part 2: the body is gone. The `@@@` header matches neither
  // the hunk regexp nor anything else, so no hunk is ever opened. DEFECT — the
  // resolved line `++RESOLVED` is a real change and should be reviewable.
  assert.equal(parsed.files[0].hunks.length, 0, 'every `@@@` hunk is dropped');
  assert.deepEqual(parsed.files[0].addedLines, [], 'no added line survives');
});

test('#2294 (current behaviour): dropping the combined body raises neither error nor warning', () => {
  const messages = [];
  const originalWarn = console.warn;
  const originalError = console.error;
  console.warn = (...args) => messages.push(['warn', ...args]);
  console.error = (...args) => messages.push(['error', ...args]);

  let parsed;
  try {
    parsed = withTempRepo((dir, git) => {
      buildConflictMerge(dir, git);
      // Must not throw: the loss is entirely silent today.
      return parseUnifiedDiff(git('show', '--cc', '--no-color', 'HEAD'));
    });
  } finally {
    console.warn = originalWarn;
    console.error = originalError;
  }

  // Pinned defect, part 3: fail-silent. There is no diagnostic channel at all
  // — no thrown error, no console output, and no counter on the result telling
  // the caller that hunks were discarded. This is the property that makes the
  // bug look like a normal "no findings" run. A fix is expected to break this
  // assertion (for example by exposing an `unparsedHunks` count).
  assert.deepEqual(messages, [], 'nothing is logged');
  assert.deepEqual(Object.keys(parsed), ['files'], 'result carries no diagnostic field');
  assert.equal(parsed.files.length, 1);
  assert.equal(parsed.files[0].hunks.length, 0);
});

test('#2294 (current behaviour): in `git log -p --cc` the plain sections parse and only the combined one is empty', () => {
  const parsed = withTempRepo((dir, git) => {
    buildConflictMerge(dir, git);
    // Mixed input: three ordinary `diff --git` commits plus the merge, which
    // is rendered as a combined diff.
    return parseUnifiedDiff(git('log', '-p', '--cc', '--no-color'));
  });

  // Every section registers its file, merge included.
  assert.deepEqual(
    parsed.files.map((f) => f.path),
    ['f.txt', 'f.txt', 'f.txt', 'f.txt']
  );

  // Pinned defect, part 4: the damage is confined to the combined section —
  // ordinary sections in the same input are unaffected. Exactly one entry (the
  // merge, which comes first in `git log` order) has no hunk.
  const empty = parsed.files.filter((f) => f.hunks.length === 0);
  const populated = parsed.files.filter((f) => f.hunks.length > 0);
  assert.equal(empty.length, 1, 'only the combined section loses its body');
  assert.equal(
    parsed.files[0].hunks.length,
    0,
    'the merge is the first section and is the empty one'
  );
  assert.equal(populated.length, 3, 'the three ordinary commits still parse');
  for (const file of populated) {
    assert.ok(file.addedLines.length > 0, 'ordinary sections keep their added lines');
  }
});
