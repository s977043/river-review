import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

import { parseUnifiedDiff } from '../src/lib/diff-processor.mjs';

// Issue #2249 / #2260.
//
// `parseUnifiedDiff` recognises a file header only as the complete three-line
// sequence `--- <old>` / `+++ <new>` / `@@ ...`. The third line is the
// discriminator: an unprefixed `@@` can never occur inside a well-formed hunk
// body, while `--- x` / `+++ y` inside a body are just the deleted line `-- x`
// and the added line `++ y`.
//
// The three input bands below are run deliberately, because the earlier
// attempt at this fix (PR #2251, closed) tracked where a hunk ENDS and broke a
// different band on each iteration. A structural test on the header itself has
// no hunk-termination rule to get wrong.

const paths = (text) => parseUnifiedDiff(text).files.map((f) => f.path);

// --- Band 1: git-generated (declaration and body always agree) --------------

const withTempRepo = (fn) => {
  const dir = mkdtempSync(join(tmpdir(), 'rr-2249-'));
  const git = (...args) => execFileSync('git', args, { cwd: dir, encoding: 'utf8' });
  try {
    git('init', '-q');
    git('config', 'user.email', 'test@example.com');
    git('config', 'user.name', 'test');
    git('commit', '--allow-empty', '-qm', 'root');
    return fn(dir, git);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

test('band 1 (git): a hunk-body `+++ ` line is not registered as a file', () => {
  const files = withTempRepo((dir, git) => {
    const body = Array.from({ length: 80 }, (_, i) => `line${i + 1}`);
    writeFileSync(join(dir, 'notes.md'), `${body.join('\n')}\n`);
    git('add', '-A');
    git('commit', '-qm', 'seed');
    // `++ phantom.md` in the source becomes `+++ phantom.md` in the diff; the
    // distant edit is what produces the following `@@`, which is required to
    // reproduce the ghost.
    const next = [...body];
    next.splice(3, 0, '++ phantom.md');
    next[68] = 'line67 changed';
    writeFileSync(join(dir, 'notes.md'), `${next.join('\n')}\n`);
    git('add', '-A');
    return paths(git('diff', '--cached', '--unified=3', '--no-color'));
  });
  assert.deepEqual(files, ['notes.md']);
  assert.ok(!files.includes('phantom.md'), 'the ghost path is gone');
});

test('band 1 (git): additions, deletions and multiple files still parse', () => {
  const files = withTempRepo((dir, git) => {
    writeFileSync(join(dir, 'keep.txt'), 'a\n');
    writeFileSync(join(dir, 'gone.txt'), 'b\n');
    git('add', '-A');
    git('commit', '-qm', 'seed');
    writeFileSync(join(dir, 'keep.txt'), 'a2\n');
    writeFileSync(join(dir, 'added.txt'), 'new\n');
    rmSync(join(dir, 'gone.txt'));
    git('add', '-A');
    return paths(git('diff', '--cached', '--unified=3', '--no-color'));
  });
  assert.deepEqual(files.sort(), ['added.txt', 'gone.txt', 'keep.txt']);
});

// --- Band 2: non-git generators --------------------------------------------

const withTempTrees = (fn) => {
  const dir = mkdtempSync(join(tmpdir(), 'rr-2249-nongit-'));
  try {
    mkdirSync(join(dir, 'a'));
    mkdirSync(join(dir, 'b'));
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

const plainDiff = (cwd, left, right) => {
  try {
    return execFileSync('diff', ['-u', left, right], { cwd, encoding: 'utf8' });
  } catch (error) {
    // `diff` exits 1 when the inputs differ, which is the expected case here.
    return error.stdout ?? '';
  }
};

test('band 2 (non-git): `diff -u -r` keeps every file (regression for D1)', () => {
  const files = withTempTrees((dir) => {
    writeFileSync(join(dir, 'a', 'f1.txt'), 'a\nkeep\n');
    writeFileSync(join(dir, 'b', 'f1.txt'), 'b\nkeep\n');
    writeFileSync(join(dir, 'a', 'f2.txt'), 'x\n');
    writeFileSync(join(dir, 'b', 'f2.txt'), 'y\n');
    let out;
    try {
      out = execFileSync('diff', ['-u', '-r', 'a', 'b'], { cwd: dir, encoding: 'utf8' });
    } catch (error) {
      out = error.stdout ?? '';
    }
    return paths(out);
  });
  assert.deepEqual(files.sort(), ['f1.txt', 'f2.txt']);
});

test('band 2 (non-git): concatenated per-file `diff -u` keeps every file', () => {
  const files = withTempTrees((dir) => {
    writeFileSync(join(dir, 'a', 'f1.txt'), 'a\n');
    writeFileSync(join(dir, 'b', 'f1.txt'), 'b\n');
    writeFileSync(join(dir, 'a', 'f2.txt'), 'x\n');
    writeFileSync(join(dir, 'b', 'f2.txt'), 'y\n');
    return paths(plainDiff(dir, 'a/f1.txt', 'b/f1.txt') + plainDiff(dir, 'a/f2.txt', 'b/f2.txt'));
  });
  assert.deepEqual(files.sort(), ['f1.txt', 'f2.txt']);
});

test('band 2 (non-git): a hunk-body `+++ ` line is not registered as a file', () => {
  const files = withTempTrees((dir) => {
    const body = Array.from({ length: 40 }, (_, i) => `l${i + 1}`);
    writeFileSync(join(dir, 'a', 'f3.txt'), `${body.join('\n')}\n`);
    const next = [...body];
    next.splice(2, 0, '++ phantom.md');
    next[30] = 'l30 changed';
    writeFileSync(join(dir, 'b', 'f3.txt'), `${next.join('\n')}\n`);
    return paths(plainDiff(dir, 'a/f3.txt', 'b/f3.txt'));
  });
  assert.deepEqual(files, ['f3.txt']);
});

// --- Band 3: hand-written patches whose declaration and body disagree -------

test('band 3 (overstate, no `diff --git`): the second file survives (#2260 / D2)', () => {
  // `@@ -1,9 +1,9 @@` declares nine lines but the body has two. Nothing here
  // depends on the declared count, so the second header is still recognised.
  const text = [
    '--- a/f1.txt',
    '+++ b/f1.txt',
    '@@ -1,9 +1,9 @@',
    '-a',
    '+b',
    '--- a/f2.txt',
    '+++ b/f2.txt',
    '@@ -1 +1 @@',
    '-x',
    '+y',
    '',
  ].join('\n');
  assert.deepEqual(paths(text), ['f1.txt', 'f2.txt']);
});

test('band 3 (understate): the second file survives', () => {
  const text = [
    '--- a/a.md',
    '+++ b/a.md',
    '@@ -1,1 +1,1 @@',
    '-old',
    '+new',
    ' context',
    ' context2',
    '--- a/b.md',
    '+++ b/b.md',
    '@@ -5,1 +5,1 @@',
    '-p',
    '+q',
    '',
  ].join('\n');
  assert.deepEqual(paths(text), ['a.md', 'b.md']);
});

test('band 3: a lone body `+++ ` followed by `@@` is not a header (D3)', () => {
  const text = [
    '--- a/a.md',
    '+++ b/a.md',
    '@@ -1,1 +1,1 @@',
    '-old',
    '+new',
    '+++ phantom.md',
    '@@ -20,1 +20,1 @@',
    '-p',
    '+q',
    '',
  ].join('\n');
  assert.deepEqual(paths(text), ['a.md']);
});

test('band 3: `@@ -1,0 +1,0 @@` does not revive the lone-`+++` ghost', () => {
  const text = [
    '--- a/a.md',
    '+++ b/a.md',
    '@@ -1,0 +1,0 @@',
    '-old',
    '+new',
    '+++ phantom.md',
    '@@ -20,1 +20,1 @@',
    '-p',
    '+q',
    '',
  ].join('\n');
  assert.deepEqual(paths(text), ['a.md']);
});

test('band 3: a lone body `+++ ` at end of input is not a header', () => {
  const text = [
    '--- a/a.md',
    '+++ b/a.md',
    '@@ -1,2 +1,2 @@',
    '-old',
    '+new',
    '+++ trailing.md',
    '',
  ].join('\n');
  assert.deepEqual(paths(text), ['a.md']);
});

test('band 3: a forged `--- `/`+++ `/`@@ ` triple is accepted, as on main (D4)', () => {
  // A forged triple is syntactically indistinguishable from a real file
  // boundary, so it stays accepted — this pins the behaviour as UNCHANGED from
  // `main` rather than as desirable. Narrowing it further is what produced the
  // regressions in the closed PR #2251; `collectAddedLineHints` (the only place
  // D4 was ever observed) is out of scope and is a dead export.
  const text = [
    '--- a/a.md',
    '+++ b/a.md',
    '@@ -1,1 +1,1 @@',
    '-old',
    '+new',
    '--- forged.md',
    '+++ forged2.md',
    '@@ -20,1 +20,1 @@',
    '-p',
    '+q',
    '',
  ].join('\n');
  assert.deepEqual(paths(text), ['a.md', 'forged2.md']);
});

test('a forged `--- `/`+++ ` PAIR not followed by `@@` is not a header', () => {
  // The source lines `-- old.md` / `++ new.md` forge the header pair itself.
  // Only the missing third line tells them apart from a real boundary, so this
  // is the case that the `@@` lookahead — and nothing else — has to catch.
  const text = [
    '--- a/a.md',
    '+++ b/a.md',
    '@@ -1,4 +1,4 @@',
    ' keep',
    '--- old.md',
    '+++ new.md',
    ' keep2',
    ' keep3',
    '',
  ].join('\n');
  assert.deepEqual(paths(text), ['a.md']);
});

test('a lone body `--- ` line does not open a file on its own', () => {
  const text = [
    '--- a/a.md',
    '+++ b/a.md',
    '@@ -1,4 +1,4 @@',
    ' keep',
    '--- orphan.md',
    ' keep2',
    '@@ -20,1 +20,1 @@',
    '-p',
    '+q',
    '',
  ].join('\n');
  assert.deepEqual(paths(text), ['a.md']);
});

test('a `+++ ` header with no preceding `--- ` is not a file', () => {
  // Every real unified-diff producer emits the pair; a bare `+++ ` only ever
  // appears as hunk content.
  const text = ['+++ b/solo.md', '@@ -1 +1 @@', '-a', '+b', ''].join('\n');
  assert.deepEqual(paths(text), []);
});

test('/dev/null headers still resolve to the real path on both sides', () => {
  const text = [
    'diff --git a/new.md b/new.md',
    '--- /dev/null',
    '+++ b/new.md',
    '@@ -0,0 +1,1 @@',
    '+one',
    'diff --git a/gone.md b/gone.md',
    '--- a/gone.md',
    '+++ /dev/null',
    '@@ -1,1 +0,0 @@',
    '-bye',
    '',
  ].join('\n');
  const parsed = parseUnifiedDiff(text);
  assert.deepEqual(
    parsed.files.map((f) => [f.path, f.oldPath, f.newPath]),
    [
      ['new.md', '/dev/null', 'new.md'],
      ['gone.md', 'gone.md', '/dev/null'],
    ]
  );
});

test('hunks and added lines after a rejected ghost stay on the real file', () => {
  const text = [
    '--- a/a.md',
    '+++ b/a.md',
    '@@ -1,1 +1,1 @@',
    '-old',
    '+new',
    '+++ phantom.md',
    '@@ -20,1 +20,1 @@',
    '-p',
    '+q',
    '',
  ].join('\n');
  const [file, ...rest] = parseUnifiedDiff(text).files;
  assert.equal(rest.length, 0);
  assert.equal(file.hunks.length, 2, 'the second hunk belongs to a.md, not to a ghost');
  // `+++ phantom.md` is the added line `++ phantom.md` at new-file line 2. The
  // earlier expectation of [1, 20] pinned an undercount that the `+++` guard in
  // the body counter produced; the guard is gone, so the added line is counted.
  assert.deepEqual(file.addedLines, [1, 2, 20]);
});

test('a deleted `-- ` line does not advance the new-file line number', () => {
  // Regression for the review of #2249: once the header test became the
  // three-line triple, a body line `--- del.md` reaches the line counter for
  // the first time. Excluding it there made a DELETED line advance
  // `newLineNumber`, shifting every following addedLines entry by one —
  // `addedLines` is tolerance-0 ground truth for verifier.mjs, so the shift
  // rejects valid findings.
  const files = withTempRepo((dir, git) => {
    writeFileSync(join(dir, 'f.md'), 'l1\n-- del.md\nl3\n');
    git('add', '-A');
    git('commit', '-qm', 'seed');
    writeFileSync(join(dir, 'f.md'), 'l1\nADD1\nl3\nADD2\n');
    git('add', '-A');
    return parseUnifiedDiff(git('diff', '--cached', '--unified=3', '--no-color')).files;
  });
  assert.equal(files.length, 1);
  assert.deepEqual(files[0].addedLines, [2, 4]);
});

test('an added `++ ` line is counted as an addition', () => {
  const files = withTempRepo((dir, git) => {
    writeFileSync(join(dir, 'g.md'), 'l1\nl2\n');
    git('add', '-A');
    git('commit', '-qm', 'seed');
    writeFileSync(join(dir, 'g.md'), 'l1\n++ add.md\nl2\nTAIL\n');
    git('add', '-A');
    return parseUnifiedDiff(git('diff', '--cached', '--unified=3', '--no-color')).files;
  });
  assert.equal(files.length, 1);
  assert.deepEqual(files[0].addedLines, [2, 4]);
});
