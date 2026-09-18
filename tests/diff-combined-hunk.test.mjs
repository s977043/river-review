import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

import { parseUnifiedDiff } from '../src/lib/diff-processor.mjs';

// Issue #2294 — CONTRACT TEST.
//
// This file previously pinned the DEFECT: `parseUnifiedDiff` registered the
// files of a merge commit's combined diff (`diff --cc` / `@@@`) and silently
// discarded every hunk body, because the hunk-header regexp matched only
// `@@ -N,M +N,M @@` while the file-header triple check used `startsWith('@@')`
// and so accepted `@@@`. Those expectations were replaced when #2294 was fixed;
// they are preserved in git history, not here.
//
// What is asserted now is the fixed behaviour: a combined hunk opens, and its
// body is counted by PREFIX COLUMN (one column per parent) rather than by a
// single prefix character.
//
// The fix deliberately adds no hunk-termination rule and no new file-header
// acceptance — the failure class that produced four consecutive broken designs
// in #2261 and a fifth in #2288. It changes two things only: which hunk headers
// `parseHunkHeader` accepts, and how a body line is classified once a combined
// hunk is open.
//
// Fixtures are produced by real git, never hand-written: each test builds a
// throwaway repository, creates an actual merge commit, and feeds the real
// output of `git show --cc` / `git log -p --cc` to the parser. The one
// hand-written case is explicitly labelled as an adversarial probe.

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

test('#2294: `git show --cc` parses the combined hunk and recovers the resolved line', () => {
  const { diff, parsed } = withTempRepo((dir, git) => {
    buildConflictMerge(dir, git);
    const diffText = git('show', '--cc', '--no-color', 'HEAD');
    return { diff: diffText, parsed: parseUnifiedDiff(diffText) };
  });

  // Precondition: the fixture really is a combined diff produced by git.
  assert.match(diff, /^diff --cc f\.txt$/m, 'fixture is a real `diff --cc` section');
  const combinedHeaders = diff.split('\n').filter((l) => l.startsWith('@@@'));
  assert.equal(combinedHeaders.length, 1, 'fixture carries one `@@@` hunk header');

  assert.deepEqual(
    parsed.files.map((f) => f.path),
    ['f.txt']
  );
  // The `@@@` header now opens a hunk (it did not before #2294).
  assert.equal(parsed.files[0].hunks.length, 1, 'the combined hunk is parsed');
  assert.equal(parsed.files[0].hunks[0].parentCount, 2, 'two parents read off the marker');
  // `f.txt` is `a / RESOLVED / c / d`; only line 2 differs from a parent, and it
  // is rendered `++RESOLVED` — added relative to BOTH parents. Lines 1, 3 and 4
  // are context in both columns, so they are present but not added.
  assert.deepEqual(parsed.files[0].addedLines, [2], 'the merge resolution is reviewable');
  assert.deepEqual(parsed.files[0].hunks[0].addedLines, [2]);
});

test('#2294: the per-parent `-` columns of a combined hunk do not advance the new line number', () => {
  const parsed = withTempRepo((dir, git) => {
    buildConflictMerge(dir, git);
    return parseUnifiedDiff(git('show', '--cc', '--no-color', 'HEAD'));
  });
  const [hunk] = parsed.files[0].hunks;
  // The body carries `- MAIN` (parent 1 only) and ` -SIDE` (parent 2 only).
  // Both are absent from the merge result, so neither may consume a line
  // number: counting them as content would push `++RESOLVED` past line 2 and
  // anchor every downstream finding one or two lines low.
  const parentOnly = hunk.lines.filter((l) => l.slice(0, 2).includes('-'));
  assert.equal(parentOnly.length, 2, 'fixture has one parent-only line per parent');
  assert.equal(hunk.newStart, 1, 'new-side range starts at line 1');
  assert.deepEqual(hunk.addedLines, [2]);
});

test('#2294: an octopus merge (3 parents, `@@@@`) parses with three prefix columns', () => {
  const { diff, parsed } = withTempRepo((dir, git) => {
    const write = (name, text) => writeFileSync(join(dir, name), text);
    // `h.txt` is introduced independently on two side branches and never exists
    // on `main`. That is what makes the octopus strategy actually run and
    // conflict (leaving a 2-entry MERGE_HEAD) instead of refusing up front,
    // which is what yields a genuine 3-parent commit.
    write('seed.txt', 'seed\n');
    git('add', '-A');
    git('commit', '-qm', 'root');
    git('switch', '-qc', 'o1');
    write('h.txt', 'one\n');
    git('add', '-A');
    git('commit', '-qm', 'o1');
    git('switch', '-q', 'main');
    git('switch', '-qc', 'o2', 'main');
    write('h.txt', 'two\n');
    git('add', '-A');
    git('commit', '-qm', 'o2');
    git('switch', '-q', 'main');
    // `main` must diverge too, otherwise it is an ancestor of both side
    // branches and git fast-forwards one of them away, leaving a 2-parent
    // commit and a `@@@` header instead of the `@@@@` this test is about.
    write('seed.txt', 'seed2\n');
    git('commit', '-qam', 'main moves');
    try {
      git('merge', 'o1', 'o2');
    } catch {
      /* expected conflict */
    }
    write('h.txt', 'merged\n');
    git('add', '-A');
    git('commit', '-qm', 'octopus');
    const diffText = git('show', '--cc', '--no-color', 'HEAD');
    return { diff: diffText, parsed: parseUnifiedDiff(diffText) };
  });

  // Precondition: real git emits `parents + 1` markers, so three parents give
  // `@@@@`. This is the case that a marker-agnostic "two or three @" rule would
  // silently miss.
  assert.ok(
    diff.split('\n').some((l) => l.startsWith('@@@@ ')),
    'fixture carries a 3-parent `@@@@` hunk header'
  );
  assert.deepEqual(
    parsed.files.map((f) => f.path),
    ['h.txt']
  );
  assert.equal(parsed.files[0].hunks.length, 1);
  assert.equal(parsed.files[0].hunks[0].parentCount, 3, 'three parents read off the marker');
  assert.deepEqual(parsed.files[0].addedLines, [1], 'the resolved line is reviewable');
});

test('#2294: in `git log -p --cc` every section parses, combined and ordinary alike', () => {
  const parsed = withTempRepo((dir, git) => {
    buildConflictMerge(dir, git);
    return parseUnifiedDiff(git('log', '-p', '--cc', '--no-color'));
  });

  assert.deepEqual(
    parsed.files.map((f) => f.path),
    ['f.txt', 'f.txt', 'f.txt', 'f.txt']
  );
  // Before #2294 exactly one entry — the merge, first in `git log` order — had
  // zero hunks. Nothing may be empty now, and no section may have been dropped
  // or invented: the ordinary sections are the regression guard.
  assert.equal(
    parsed.files.filter((f) => f.hunks.length === 0).length,
    0,
    'no section loses its body'
  );
  for (const file of parsed.files) {
    assert.ok(file.addedLines.length > 0, 'every section keeps added lines');
  }
});

test('#2294: a combined section next to an ordinary one leaks nothing between them', () => {
  // The #2288 failure shape: a section absorbed into its neighbour, which both
  // drops a real file and injects fabricated line numbers into the survivor.
  // Asserted in both orders because the boundary state is direction-sensitive.
  const parsed = withTempRepo((dir, git) => {
    buildConflictMerge(dir, git);
    writeFileSync(join(dir, 'g.txt'), 'x\ny\n');
    git('add', '-A');
    git('commit', '-qm', 'later');
    const merge = git('show', '--cc', '--no-color', 'HEAD~1');
    const ordinary = git('show', '--no-color', 'HEAD');
    return {
      ccFirst: parseUnifiedDiff(merge + ordinary),
      ccSecond: parseUnifiedDiff(ordinary + merge),
    };
  });

  const shape = (r) => r.files.map((f) => [f.path, f.addedLines]);
  assert.deepEqual(shape(parsed.ccFirst), [
    ['f.txt', [2]],
    ['g.txt', [1, 2]],
  ]);
  assert.deepEqual(shape(parsed.ccSecond), [
    ['g.txt', [1, 2]],
    ['f.txt', [2]],
  ]);
});

test('#2294: a forged file-header triple inside a combined hunk mints no ghost file', () => {
  // Adversarial, hand-written on purpose. In a two-parent combined diff a line
  // deleted from both parents whose content reads `- a/ghost.md` renders as
  // `--- a/ghost.md`, and one added to both reading `+ b/ghost.md` renders as
  // `+++ b/ghost.md` — the exact #2249/#2280 ghost shape, produced from real
  // column prefixes rather than from a hand-written header. It must not open a
  // file: `diff --cc` marks the stream git-formatted, and that section's
  // boundary was already consumed by the real header above.
  const diff = [
    'diff --cc real.md',
    'index 1111111,2222222..3333333 100644',
    '--- a/real.md',
    '+++ b/real.md',
    '@@@ -1,3 -1,3 +1,3 @@@',
    '  keep',
    '--- a/ghost.md',
    '+++ b/ghost.md',
    '++resolved',
    '',
  ].join('\n');

  const parsed = parseUnifiedDiff(diff);
  assert.deepEqual(
    parsed.files.map((f) => f.path),
    ['real.md'],
    'no ghost.md is minted'
  );
  // Line 1 is context; `--- a/ghost.md` is deleted from both parents so it
  // consumes no line number; `+++ b/ghost.md` and `++resolved` are added at
  // lines 2 and 3.
  assert.deepEqual(parsed.files[0].addedLines, [2, 3]);
});

test('#2294: `\\ No newline at end of file` inside a combined hunk consumes no line number', () => {
  // Git emits this marker between body lines whenever a side of the merge ends
  // without a trailing newline, so it lands mid-hunk rather than only at the
  // end. It is metadata, not content: counting it would push every line after
  // it one low and anchor findings on the wrong line. Hand-written because
  // forcing git to interleave the marker mid-hunk is not deterministic, and the
  // property under test is the classifier's, not git's.
  const diff = [
    'diff --cc m.txt',
    '--- a/m.txt',
    '+++ b/m.txt',
    '@@@ -1,2 -1,2 +1,2 @@@',
    '  a',
    '- old',
    '\\ No newline at end of file',
    '++new',
    '',
  ].join('\n');
  const parsed = parseUnifiedDiff(diff);
  // `a` is line 1; `- old` exists only in parent 1 so it consumes nothing; the
  // marker consumes nothing; `++new` is therefore line 2, not line 3.
  assert.deepEqual(parsed.files[0].addedLines, [2]);
});

test('#2294: a hand-written header whose marker width disagrees with its range count still parses', () => {
  // `@@@ ... @@@` with a single old range and `@@@@ ... @@` are both malformed —
  // real git keeps marker width and range count in step. The pre-#2294 regexp
  // was unanchored and read them as ordinary single-parent hunks; refusing them
  // now would re-open the very fail-silent drop this change closes, so the RANGE
  // COUNT decides the column width and both keep their old results.
  const single = ['--- a/x.md', '+++ b/x.md', '@@@ -1,1 +1,1 @@@', '-o', '+n', ''].join('\n');
  const wide = ['--- a/x.md', '+++ b/x.md', '@@@@ -1,1 +1,1 @@', '-o', '+n', ''].join('\n');
  for (const diff of [single, wide]) {
    const parsed = parseUnifiedDiff(diff);
    assert.equal(parsed.files.length, 1);
    assert.equal(parsed.files[0].hunks.length, 1);
    assert.equal(parsed.files[0].hunks[0].parentCount, 1, 'range count wins over marker width');
    assert.deepEqual(parsed.files[0].addedLines, [1]);
  }
});

test('#2294: the hunk-header regexp is anchored, narrowing the pre-#2294 acceptance set', () => {
  // MEASURED divergence from the pre-#2294 parser, pinned in both directions.
  // The old regexp was unanchored and read any line merely CONTAINING
  // `@@ -N,M +N,M @@`, so `@@ foo @@ -20,2 +20,2 @@` opened a second hunk at
  // line 20; anchored, the line is hunk content instead.
  //
  // Old parser on this exact input: `hunks 2, addedLines [2, 21]`.
  // Anchoring is the deliberate choice: no git or GNU diff producer can put an
  // unprefixed `@@` at column 0 inside a hunk body, so this band is hand-written
  // only, and the unanchored reading opens a hunk at a line the file lacks.
  const diff = [
    '--- a/f.md',
    '+++ b/f.md',
    '@@ -1,2 +1,2 @@',
    ' ctx',
    '+first',
    '@@ foo @@ -20,2 +20,2 @@',
    ' ctx2',
    '+second',
    '',
  ].join('\n');
  const parsed = parseUnifiedDiff(diff);
  assert.equal(parsed.files.length, 1);
  assert.equal(parsed.files[0].hunks.length, 1, 'the mid-line header does not open a hunk');
  assert.deepEqual(
    parsed.files[0].addedLines,
    [2, 4],
    'the mid-line header is counted as hunk content, not as a new hunk at line 20'
  );
});

test('#2294: a combined hunk reports the FIRST parent in oldStart / oldLines', () => {
  // The docblock promises this, and it is what every existing caller of
  // `hunk.oldStart` expects from the single-parent form. Asserted for two and
  // three parents so that reading a different range off the header is caught.
  const twoParent = parseUnifiedDiff(
    [
      'diff --cc m.txt',
      '--- a/m.txt',
      '+++ b/m.txt',
      '@@@ -27,7 -40,9 +22,7 @@@',
      '  a',
      '++merged',
      '',
    ].join('\n')
  );
  assert.equal(twoParent.files[0].hunks[0].parentCount, 2);
  assert.equal(twoParent.files[0].hunks[0].oldStart, 27, 'first parent start');
  assert.equal(twoParent.files[0].hunks[0].oldLines, 7, 'first parent length');
  assert.equal(twoParent.files[0].hunks[0].newStart, 22);
  assert.deepEqual(twoParent.files[0].addedLines, [23]);

  const threeParent = parseUnifiedDiff(
    [
      'diff --cc m.txt',
      '--- a/m.txt',
      '+++ b/m.txt',
      '@@@@ -5,3 -60,4 -70,5 +8,3 @@@@',
      '   a',
      '+++merged',
      '',
    ].join('\n')
  );
  assert.equal(threeParent.files[0].hunks[0].parentCount, 3);
  assert.equal(threeParent.files[0].hunks[0].oldStart, 5, 'first parent start');
  assert.equal(threeParent.files[0].hunks[0].oldLines, 3, 'first parent length');
  assert.equal(threeParent.files[0].hunks[0].newStart, 8);
  assert.deepEqual(threeParent.files[0].addedLines, [9]);
});

test('#2294: in a combined body a `-` column beats a `+` column', () => {
  // Real git never mixes them — a `-` column already says the line is absent
  // from the merge result, which contradicts `+` — so this is a defensive pin
  // on hand-written input. If `+` won, the line would be recorded as added at a
  // number the merge result does not have, and would push everything below it
  // one line down.
  const parsed = parseUnifiedDiff(
    [
      'diff --cc m.txt',
      '--- a/m.txt',
      '+++ b/m.txt',
      '@@@ -1,3 -1,3 +1,2 @@@',
      '  a',
      '+-contradictory',
      '-+contradictory2',
      '++real',
      '',
    ].join('\n')
  );
  // `a` is line 1. Both contradictory lines carry a `-` column, so neither is
  // added and neither consumes a line number. `++real` is therefore line 2.
  assert.deepEqual(parsed.files[0].addedLines, [2]);
});

test('#2294: the single-parent `\\ No newline` asymmetry is pinned as pre-existing', () => {
  // CHARACTERISATION, NOT A CONTRACT. In an ORDINARY hunk the marker still
  // counts as a context line and advances the counter, so the additions below
  // are reported at [3, 5] while the real file has them at 2 and 4. This is
  // byte-identical to the pre-#2294 parser — it is not a regression from this
  // change, and it is deliberately NOT fixed here because the combined-diff fix
  // must not also change ordinary-path line numbering. Tracked in #2309; when
  // that issue is fixed, this expectation is EXPECTED TO CHANGE.
  //
  // It is pinned because the asymmetry with `classifyCombinedBodyLine` is what
  // makes "classify every body line as combined" an otherwise-invisible change.
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
  assert.deepEqual(parsed.files[0].addedLines, [3, 5], 'pre-existing off-by-one, not a regression');
});

test('#2294: ordinary single-parent parsing is untouched', () => {
  // The single-parent path must be byte-identical to pre-#2294 behaviour: every
  // non-combined band (git default, git --unified=0, non-git `diff -u -r`,
  // hand-written) flows through it, and those are the bands #2261/#2280/#2288
  // each broke in turn.
  const diff = [
    'diff --git a/x.md b/x.md',
    '--- a/x.md',
    '+++ b/x.md',
    '@@ -1,2 +1,3 @@ function foo()',
    ' a',
    '-old',
    '+new',
    '+tail',
    '',
  ].join('\n');
  const parsed = parseUnifiedDiff(diff);
  assert.equal(parsed.files[0].hunks[0].parentCount, 1);
  assert.equal(parsed.files[0].hunks[0].oldStart, 1);
  assert.equal(parsed.files[0].hunks[0].oldLines, 2);
  assert.equal(parsed.files[0].hunks[0].newStart, 1);
  assert.equal(parsed.files[0].hunks[0].newLines, 3);
  assert.deepEqual(parsed.files[0].addedLines, [2, 3]);

  // `@@ -N +N @@` (no comma) keeps defaulting both counts to 1.
  const noComma = parseUnifiedDiff(
    ['--- a/y.md', '+++ b/y.md', '@@ -5 +5 @@', '-o', '+n', ''].join('\n')
  );
  assert.equal(noComma.files[0].hunks[0].oldLines, 1);
  assert.equal(noComma.files[0].hunks[0].newLines, 1);
  assert.deepEqual(noComma.files[0].addedLines, [5]);
});
