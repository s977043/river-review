import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

import { parseUnifiedDiff } from '../src/lib/diff-processor.mjs';
import { collectAddedLineHints } from '../src/lib/git.mjs';

// Issues #2249 / #2260 / #2280, plus the PR #2288 review.
//
// `parseUnifiedDiff` recognises a file header only as the complete three-line
// sequence `--- <old>` / `+++ <new>` / `@@ ...`. For plain unified diff, that
// triple remains the structural discriminator. Once a Git `diff --git` marker
// is observed, the parser additionally requires an unconsumed marker before it
// accepts the next triple as a file boundary. This prevents a `--unified=0`
// hunk-body pair plus the next `@@` from forging a file boundary.
//
// The marker is the `diff --` FAMILY, not the literal `diff --git`, because
// real Git labels merge sections `diff --cc <path>` (band 5).
//
// The five input bands below are run deliberately because the earlier attempt
// at #2249 (PR #2251, closed) tracked where a hunk ENDS and broke a different
// band on each iteration. The current rule uses the producer's Git file marker
// when available and does not add a hunk-termination heuristic.

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
  // boundary in plain unified diff, so it stays accepted. Narrowing that case
  // further is what produced the regressions in the closed PR #2251;
  // `collectAddedLineHints` (the only place D4 was originally observed) is out
  // of scope and is a dead export.
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

// --- Band 4: `--unified=0` (issue 2280) ------------------------------------
//
// With zero context lines, a hunk body's deleted line `-- old.md` prints as
// `--- old.md`, the added line `++ new.md` prints as `+++ new.md`, and the NEXT
// hunk's `@@` follows immediately. The three-line sequence is therefore not a
// sufficient file-boundary proof for Git-formatted input. The pending
// `diff --git` marker is the stronger boundary authority.

const withU0Repo = (fn) =>
  withTempRepo((dir, git) => {
    const body = Array.from({ length: 40 }, (_, i) => `line${i + 1}`);
    // Line 3 already reads `-- old.md`, so its deletion prints as `--- old.md`.
    body[2] = '-- old.md';
    writeFileSync(join(dir, 'notes.md'), `${body.join('\n')}\n`);
    git('add', '-A');
    git('commit', '-qm', 'seed');
    const next = [...body];
    next[2] = '++ new.md';
    // A distant second edit is what supplies the following `@@`.
    next[30] = 'CHANGED31';
    writeFileSync(join(dir, 'notes.md'), `${next.join('\n')}\n`);
    git('add', '-A');
    return fn(git);
  });

test('band 4 (U0): a hunk-body pair plus the next `@@` stays on the real file (#2280)', () => {
  const files = withU0Repo(
    (git) => parseUnifiedDiff(git('diff', '--cached', '--unified=0', '--no-color')).files
  );
  assert.deepEqual(
    files.map((f) => f.path),
    ['notes.md']
  );
  assert.deepEqual(files[0].addedLines, [3, 31]);
  assert.equal(files[0].hunks.length, 2);
});

test('band 4 (U0 vs U3): zero and three context lines resolve to the same file and additions', () => {
  const { u0, u3 } = withU0Repo((git) => ({
    u0: parseUnifiedDiff(git('diff', '--cached', '--unified=0', '--no-color')).files,
    u3: parseUnifiedDiff(git('diff', '--cached', '--unified=3', '--no-color')).files,
  }));
  assert.deepEqual(
    u0.map((f) => f.path),
    ['notes.md']
  );
  assert.deepEqual(
    u3.map((f) => f.path),
    ['notes.md']
  );
  assert.deepEqual(u0[0].addedLines, [3, 31]);
  assert.deepEqual(u3[0].addedLines, [3, 31]);
  assert.equal(u0[0].hunks.length, 2);
  assert.equal(u3[0].hunks.length, 2);
});

test('band 4 (U0): each real Git file boundary remains parseable in a multi-file diff', () => {
  const files = withTempRepo((dir, git) => {
    writeFileSync(join(dir, 'a.txt'), 'a\n');
    writeFileSync(join(dir, 'b.txt'), 'b\n');
    git('add', '-A');
    git('commit', '-qm', 'seed');
    writeFileSync(join(dir, 'a.txt'), 'A\n');
    writeFileSync(join(dir, 'b.txt'), 'B\n');
    git('add', '-A');
    return parseUnifiedDiff(git('diff', '--cached', '--unified=0', '--no-color')).files;
  });
  assert.deepEqual(files.map((f) => f.path).sort(), ['a.txt', 'b.txt']);
  assert.deepEqual(
    files.map((f) => f.addedLines),
    [[1], [1]]
  );
});

test('band 4 (U0): parseUnifiedDiff and collectAddedLineHints agree on real file paths', () => {
  const { parsedPaths, hintPaths } = withU0Repo((git) => {
    const text = git('diff', '--cached', '--unified=0', '--no-color');
    return {
      parsedPaths: parseUnifiedDiff(text).files.map((f) => f.path),
      hintPaths: [...collectAddedLineHints(text).keys()],
    };
  });
  assert.deepEqual(parsedPaths, ['notes.md']);
  assert.deepEqual(hintPaths, ['notes.md']);
  assert.deepEqual(parsedPaths, hintPaths);
});

// --- Band 5: combined diff (`diff --cc`) — PR #2288 review -----------------
//
// Real Git labels a merge commit's sections `diff --cc <path>`, not
// `diff --git`. When the file-marker check was anchored on the literal
// `diff --git`, `gitFileBoundaryPending` was never re-armed for a combined
// section, so the section that followed a `diff --git` section was absorbed
// into the PREVIOUS file — measured on `origin/main` a7300837 vs PR head
// a8a9cb92 with `git log -p --cc`:
//
//   base: later.txt[1]  shared.txt[]  shared.txt[1]  ...
//   head: later.txt[1,12,15]          shared.txt[1]  ...
//
// i.e. the combined entry disappeared and line numbers 12 and 15 were injected
// into a one-line file. The marker check therefore matches the `diff --`
// family. NOTE: combined hunks still parse as zero hunks because the hunk
// regex does not accept `@@@` (issue #2294) — that is unchanged from `main`
// and deliberately out of scope here.

const withMergeRepo = (fn) =>
  withTempRepo((dir, git) => {
    git('config', 'commit.gpgsign', 'false');
    writeFileSync(join(dir, 'shared.txt'), 'a\nb\nc\n');
    git('add', '-A');
    git('commit', '-qm', 'seed');
    git('switch', '-qc', 'feat');
    writeFileSync(join(dir, 'shared.txt'), 'a\nB\nc\n');
    git('add', '-A');
    git('commit', '-qm', 'feat');
    git('switch', '-q', '-');
    writeFileSync(join(dir, 'shared.txt'), 'A\nb\nc\n');
    git('add', '-A');
    git('commit', '-qm', 'trunk');
    try {
      git('merge', '--no-edit', 'feat');
    } catch {
      // expected conflict; resolve it so the merge commit is a real one
    }
    writeFileSync(join(dir, 'shared.txt'), 'A\nB\nc\n');
    git('add', '-A');
    git('commit', '-qm', 'resolve');
    // A plain commit AFTER the merge, so a `diff --git` section precedes the
    // `diff --cc` section in `git log -p --cc` output. Without this ordering
    // the defect does not reproduce.
    writeFileSync(join(dir, 'later.txt'), 'x\n');
    git('add', '-A');
    git('commit', '-qm', 'later');
    return fn(git);
  });

test('band 5 (--cc): a combined section is not absorbed into the preceding file (#2288)', () => {
  const { text, files } = withMergeRepo((git) => {
    const t = git('log', '-p', '--cc', '--no-color');
    return { text: t, files: parseUnifiedDiff(t).files };
  });
  assert.ok(/^diff --cc /m.test(text), 'the fixture really contains a `diff --cc` section');
  assert.ok(/^diff --git /m.test(text), 'a `diff --git` section precedes it');

  const later = files.filter((f) => f.path === 'later.txt');
  assert.equal(later.length, 1);
  assert.deepEqual(
    later[0].addedLines,
    [1],
    'the one-line file must not absorb the combined section’s line numbers'
  );

  // The combined section registers as its own entry rather than vanishing.
  assert.ok(
    files.length >= 2 && files.some((f) => f.path === 'shared.txt' && f.hunks.length === 0),
    'the `diff --cc` section is a distinct file entry (zero hunks until #2294)'
  );
});

test('band 5 (--cc): `git show --cc` of the merge alone registers the combined file', () => {
  const files = withMergeRepo(
    (git) => parseUnifiedDiff(git('show', '--cc', '--no-color', 'HEAD~1')).files
  );
  assert.deepEqual(
    files.map((f) => f.path),
    ['shared.txt']
  );
});

// --- The `diff --` widening must not mint ghosts from hunk CONTENT ----------
//
// The failure mode this guards against is the one that recurred four times in
// #2261: a newly added boundary signal that fires inside a hunk body. It
// cannot fire here, because every line inside a well-formed hunk body carries
// a ` `/`+`/`-` prefix, so `diff --stat` as file CONTENT reaches the parser as
// `+diff --stat`, never at column 0.

test('a hunk body containing `diff --` content lines mints no ghost file', () => {
  const run = (unified) =>
    withTempRepo((dir, git) => {
      writeFileSync(join(dir, 'doc.md'), 'l1\nl2\nl3\n');
      git('add', '-A');
      git('commit', '-qm', 'seed');
      writeFileSync(join(dir, 'doc.md'), 'l1\ndiff --stat\ndiff --git a/ghost.md b/ghost.md\nl3\n');
      git('add', '-A');
      return parseUnifiedDiff(git('diff', '--cached', unified, '--no-color')).files;
    });
  for (const unified of ['--unified=3', '--unified=0']) {
    const files = run(unified);
    assert.deepEqual(
      files.map((f) => f.path),
      ['doc.md'],
      `no ghost with ${unified}`
    );
    assert.deepEqual(files[0].addedLines, [2, 3], `additions are counted with ${unified}`);
  }
});

// --- Known limitation, pinned so it cannot change silently ------------------

test('KNOWN LIMITATION: a marker-less section concatenated after a Git section is absorbed', () => {
  // CHARACTERISATION, NOT A CONTRACT. This shape is byte-for-byte identical to
  // the band-4 `--unified=0` ghost, so splitting them apart requires a
  // hunk-termination rule — the approach that failed four times in #2261. No
  // diff producer emits it. Recorded here so the trade-off is visible: on
  // `origin/main` a7300837 this parsed as ['a.txt', 'b.txt'].
  const files = withTempRepo((dir, git) => {
    writeFileSync(join(dir, 'a.txt'), 'a\n');
    git('add', '-A');
    git('commit', '-qm', 'seed');
    writeFileSync(join(dir, 'a.txt'), 'A\n');
    git('add', '-A');
    const gitPart = git('diff', '--cached', '--no-color');
    return parseUnifiedDiff(
      gitPart + ['--- a/b.txt', '+++ b/b.txt', '@@ -1 +1 @@', '-b', '+B', ''].join('\n')
    ).files;
  });
  assert.deepEqual(
    files.map((f) => f.path),
    ['a.txt'],
    'the marker-less section is absorbed; see the band-5 rationale'
  );
});
