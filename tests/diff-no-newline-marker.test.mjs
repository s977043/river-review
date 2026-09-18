import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

import { parseUnifiedDiff } from '../src/lib/diff-processor.mjs';

// Issue #2309 — CONTRACT TEST.
//
// `\ No newline at end of file` is metadata about the preceding line, not a
// line of the merge result. Before this fix the ORDINARY (single-parent) path
// counted it as a context line, so every addition after the marker was reported
// one line too low. `classifyCombinedBodyLine` already excluded it (#2294); the
// asymmetry is what this file closes.
//
// Fixtures are produced by real git wherever the shape is one git emits — a
// file with no trailing newline forces the marker with no hand-authoring. The
// hand-written cases are limited to shapes git cannot emit and are labelled.
//
// Measured on the pre-fix parser (`a7cb83ba`) with the band-1 fixture below:
// `addedLines [3, 4, 5]` where the resulting file has those lines at 2, 3, 4.

const withTempRepo = (fn) => {
  const dir = mkdtempSync(join(tmpdir(), 'rr-2309-'));
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
 * Commit `before`, then `after`, and return the real `git diff` between them.
 * @param {Record<string, string>} before
 * @param {Record<string, string>} after
 * @param {string[]} diffArgs
 */
const realGitDiff = (before, after, diffArgs = []) =>
  withTempRepo((dir, git) => {
    const writeAll = (files) => {
      for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
    };
    writeAll(before);
    git('add', '-A');
    git('commit', '-qm', 'before');
    writeAll(after);
    git('add', '-A');
    git('commit', '-qm', 'after');
    return git('diff', ...diffArgs, 'HEAD~1', 'HEAD');
  });

test('#2309: band 1 (git default) — marker after a deleted line does not shift later additions', () => {
  // `f.md` has no trailing newline in either revision, so real git emits the
  // marker twice: once after the last deleted line and once at end of file.
  const diff = realGitDiff(
    { 'f.md': 'a\nb\nc', 'g.md': 'x\ny\nz\n' },
    { 'f.md': 'a\nb2\nc\nd', 'g.md': 'x\ny2\nz\n' }
  );
  assert.ok(
    diff.split('\n').some((l) => l.startsWith('\\ No newline')),
    'fixture really carries the marker'
  );
  const parsed = parseUnifiedDiff(diff);
  const f = parsed.files.find((x) => x.path === 'f.md');
  const g = parsed.files.find((x) => x.path === 'g.md');
  // Result file is a / b2 / c / d — the additions are at 2, 3 and 4.
  assert.deepEqual(f.addedLines, [2, 3, 4]);
  // A file WITHOUT the marker in the same diff is unaffected.
  assert.deepEqual(g.addedLines, [2]);
});

test('#2309: band 2 (git --unified=0) agrees with band 1', () => {
  // `--unified=0` is a band real git emits that looks like hand-written input
  // (#2261/#2280), so it is measured separately rather than assumed.
  const diff = realGitDiff(
    { 'f.md': 'a\nb\nc', 'g.md': 'x\ny\nz\n' },
    { 'f.md': 'a\nb2\nc\nd', 'g.md': 'x\ny2\nz\n' },
    ['--unified=0']
  );
  const parsed = parseUnifiedDiff(diff);
  assert.deepEqual(parsed.files.find((x) => x.path === 'f.md').addedLines, [2, 3, 4]);
  assert.deepEqual(parsed.files.find((x) => x.path === 'g.md').addedLines, [2]);
});

test('#2309: marker directly after a deleted line, with additions below', () => {
  // The trailing newline is ADDED, so git emits exactly one marker and it sits
  // between the deleted line and the added lines — the position that produced
  // the off-by-one reported in #2309.
  const diff = realGitDiff({ 'q.md': 'a\nb\nc' }, { 'q.md': 'a\nb\nc\nd\n' });
  const parsed = parseUnifiedDiff(diff);
  // Result file is a / b / c / d — `c` and `d` are the additions, at 3 and 4.
  assert.deepEqual(parsed.files[0].addedLines, [3, 4]);
});

test('#2309: marker directly after a context line at end of file', () => {
  // Last line unchanged and newline-less; the change is earlier in the hunk, so
  // the marker trails a CONTEXT line. Nothing is added below it, so this shape
  // never showed the defect — it is pinned so the fix cannot start dropping
  // context lines that precede the marker.
  const diff = realGitDiff({ 'p.md': 'a\nb\nc\nd\ntail' }, { 'p.md': 'a\nB\nc\nd\ntail' });
  const parsed = parseUnifiedDiff(diff);
  assert.deepEqual(parsed.files[0].addedLines, [2]);
  assert.equal(parsed.files[0].hunks.length, 1);
});

test('#2309: marker directly after an added line at end of file', () => {
  // Marker at the very end of the hunk, trailing the final `+` line.
  const diff = realGitDiff({ 'r.md': 'a\nb\n' }, { 'r.md': 'a\nb\nc' });
  const parsed = parseUnifiedDiff(diff);
  assert.deepEqual(parsed.files[0].addedLines, [3]);
});

test('#2309: band 4 (non-git `diff -u -r`, short and long options) agrees', () => {
  // GNU/BSD `diff` emits the same marker with no `diff --git` line. The short
  // option form is the one that regressed in #2288, so both forms are measured.
  const dir = mkdtempSync(join(tmpdir(), 'rr-2309-nongit-'));
  try {
    const a = join(dir, 'a');
    const b = join(dir, 'b');
    execFileSync('mkdir', ['-p', a, b]);
    writeFileSync(join(a, 'f1.txt'), 'a\nb\nc');
    writeFileSync(join(b, 'f1.txt'), 'a\nb2\nc\nd');
    writeFileSync(join(a, 'f2.txt'), 'x\ny\nz\n');
    writeFileSync(join(b, 'f2.txt'), 'x\ny2\nz\n');
    const run = (args) => {
      try {
        return execFileSync('diff', args, { cwd: dir, encoding: 'utf8' });
      } catch (error) {
        // `diff` exits 1 when files differ, which is the expected case here.
        return error.stdout;
      }
    };
    for (const args of [
      ['-u', '-r', 'a', 'b'],
      ['--unified', '--recursive', 'a', 'b'],
    ]) {
      const parsed = parseUnifiedDiff(run(args));
      assert.deepEqual(
        parsed.files.map((f) => [f.path, f.addedLines]),
        [
          // `b/` is stripped as a Git-style destination prefix; that is
          // pre-existing path handling, unchanged by #2309.
          ['f1.txt', [2, 3, 4]],
          ['f2.txt', [2]],
        ],
        `non-git diff ${args.join(' ')}`
      );
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('#2309: band 4 concatenation (git + non-git, both orders) keeps files separate', () => {
  // Concatenated producer output is the band #2288 actually regressed in: a
  // section whose `diff ` header is not recognised gets absorbed into the
  // previous file and injects its line numbers there. Asserting `addedLines`
  // and not only paths is what makes that visible.
  const gitSection = realGitDiff({ 'f.md': 'a\nb\nc' }, { 'f.md': 'a\nb2\nc\nd' });
  const nonGitSection = [
    'diff -u -r na/h1.txt nb/h1.txt',
    '--- na/h1.txt\t2026-09-18 00:00:00',
    '+++ nb/h1.txt\t2026-09-18 00:00:00',
    '@@ -1,3 +1,4 @@',
    ' a',
    '-b',
    '-c',
    '\\ No newline at end of file',
    '+b2',
    '+c',
    '+d',
    '\\ No newline at end of file',
    '',
  ].join('\n');

  const forward = parseUnifiedDiff(gitSection + nonGitSection);
  assert.deepEqual(
    forward.files.map((f) => [f.path, f.addedLines]),
    [
      ['f.md', [2, 3, 4]],
      ['nb/h1.txt', [2, 3, 4]],
    ]
  );

  const reverse = parseUnifiedDiff(nonGitSection + gitSection);
  assert.deepEqual(
    reverse.files.map((f) => [f.path, f.addedLines]),
    [
      ['nb/h1.txt', [2, 3, 4]],
      ['f.md', [2, 3, 4]],
    ]
  );
});

test('#2309: band 5 (hand-written) — the issue body repro', () => {
  // HAND-WRITTEN, verbatim from the #2309 report. Pre-fix measurement: [3, 5].
  const parsed = parseUnifiedDiff(
    [
      '--- a/f.md',
      '+++ b/f.md',
      '@@ -1,3 +1,4 @@',
      ' a',
      '\\ No newline at end of file',
      '+b2',
      ' c',
      '+d',
      '',
    ].join('\n')
  );
  assert.deepEqual(parsed.files[0].addedLines, [2, 4]);
});

test('#2309: band 5 (hand-written) — declared counts that disagree with the body', () => {
  // overstate (`@@ -1,9` with a two-line body) and understate, both carrying the
  // marker. Neither the file set nor hunk opening may change; only the numbers
  // the marker used to inflate.
  const overstate = parseUnifiedDiff(
    [
      '--- a/f.md',
      '+++ b/f.md',
      '@@ -1,9 +1,9 @@',
      ' a',
      '\\ No newline at end of file',
      '+b2',
      '--- a/g.md',
      '+++ b/g.md',
      '@@ -1,1 +1,1 @@',
      '-o',
      '+n',
      '',
    ].join('\n')
  );
  assert.deepEqual(
    overstate.files.map((f) => [f.path, f.addedLines]),
    [
      ['f.md', [2]],
      ['g.md', [1]],
    ]
  );

  const understate = parseUnifiedDiff(
    [
      '--- a/f.md',
      '+++ b/f.md',
      '@@ -1,1 +1,3 @@',
      '-o',
      '\\ No newline at end of file',
      '+n',
      '\\ No newline at end of file',
      '+t',
      '',
    ].join('\n')
  );
  assert.deepEqual(understate.files[0].addedLines, [1, 2]);
});

test('#2309: the marker test is the `\\ ` prefix, not the English sentence', () => {
  // git localises the message; the prefix is what is stable. A hand-written body
  // line whose content begins with a raw backslash is indistinguishable from the
  // marker and is therefore treated as one — that shape is unrepresentable as
  // real diff content, where every body line carries a ` `/`+`/`-` prefix.
  const localised = parseUnifiedDiff(
    [
      '--- a/f.md',
      '+++ b/f.md',
      '@@ -1,2 +1,2 @@',
      ' a',
      '\\ Kein Zeilenumbruch am Dateiende',
      '+b',
      '',
    ].join('\n')
  );
  assert.deepEqual(localised.files[0].addedLines, [2]);
});
