// tests/diff-header-hunk-body.test.mjs
//
// #2249: `parseUnifiedDiff` decided that a line was a file header from the
// 4-character prefix `+++ ` / `--- ` alone, without asking whether it was
// inside a hunk body. A source line whose own content begins with `++` is
// emitted as `+++ <text>` when it is ADDED, so the parser registered a file
// that does not exist on disk and re-parented the rest of the diff under it.
//
// Two properties of the reproduction matter:
//
//   - a SECOND hunk is required. The ghost header only becomes a `files[]`
//     entry once a following `@@` attaches a hunk to it, so a single-hunk diff
//     silently passes.
//   - the body has to END by LINE BUDGET. Resetting only on `diff --git` is a
//     git-only terminator, so a non-git unified diff (`diff -u -r`, a patch
//     file) stayed inside the first hunk forever and every later file's header
//     was read as body — every file but the first silently dropped. That
//     regression was introduced by the first cut of this fix and is covered
//     below; `review plan|exec --artifact diff=<path>` can reach it.
//   - adjacency ("the previous line was `--- `") is NOT a sufficient guard:
//     replacing `-- old.md` with `++ new.md` inside a hunk makes git emit
//     `--- old.md` / `+++ new.md`, a forged header PAIR.
//
// The fix tracks hunk state (`diff --git` resets, `@@` sets) and treats a
// `+++ `/`--- ` line as a header only outside a hunk — see
// `isDiffFileHeaderLine` in src/lib/git.mjs, shared with `collectAddedLineHints`.
//
// These tests write real files into a real repo and parse real `git diff`
// output, because the shape git actually emits (context prefixes, the `@@`
// placement, header quoting) cannot be trusted from a hand-written string.
// Each test first asserts the fixture really contains the hazard, so a broken
// fixture fails loudly instead of passing vacuously.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseUnifiedDiff } from '../src/lib/diff-processor.mjs';
import { collectAddedLineHints, diffWithContext } from '../src/lib/git.mjs';
import { createTempGitRepo, writeFileRelative, runGit } from './helpers/temp-repo.mjs';

const LONG_BODY = Array.from({ length: 80 }, (_, i) => `line${i + 1}`);

/** Build the file content, then a modified copy with a far-apart second edit. */
function withSecondHunk(lines) {
  const copy = [...lines];
  copy[70] = 'line71 changed';
  return copy.join('\n') + '\n';
}

async function diffOf(initial, changed, { name = 'notes.md' } = {}) {
  const { dir, cleanup } = await createTempGitRepo({
    initialFiles: { [name]: initial },
  });
  writeFileRelative(dir, name, changed);
  const diff = await diffWithContext(dir, 'HEAD', { unified: 3 });
  return { diff, cleanup };
}

function assertFixture(diff, ghostLine) {
  const lines = diff.split('\n');
  assert.ok(
    lines.includes(ghostLine),
    `fixture broken: expected the hunk body to contain ${JSON.stringify(ghostLine)}`
  );
  const hunkCount = lines.filter((l) => l.startsWith('@@')).length;
  assert.ok(hunkCount >= 2, `fixture broken: expected >= 2 hunks, got ${hunkCount}`);
}

describe('parseUnifiedDiff: header lines inside a hunk body (#2249)', () => {
  it('does not register an added `++ path` line as a file', async (t) => {
    const initial = LONG_BODY.join('\n') + '\n';
    const changedLines = [...LONG_BODY];
    changedLines.splice(3, 0, '++ phantom.md');
    const { diff, cleanup } = await diffOf(initial, withSecondHunk(changedLines));
    t.after(cleanup);

    assertFixture(diff, '+++ phantom.md');

    const files = parseUnifiedDiff(diff).files;
    assert.deepEqual(
      files.map((f) => f.path),
      ['notes.md']
    );
    assert.equal(files[0].hunks.length, 2, 'both hunks belong to the real file');
  });

  it('does not register a forged `--- `/`+++ ` header PAIR inside a hunk', async (t) => {
    const initialLines = [...LONG_BODY];
    initialLines.splice(3, 0, '-- old.md');
    const changedLines = [...initialLines];
    changedLines[3] = '++ new.md';
    const { diff, cleanup } = await diffOf(
      initialLines.join('\n') + '\n',
      withSecondHunk(changedLines)
    );
    t.after(cleanup);

    assertFixture(diff, '+++ new.md');
    assert.ok(diff.split('\n').includes('--- old.md'), 'fixture broken: no forged `--- ` line');

    const files = parseUnifiedDiff(diff).files;
    assert.deepEqual(
      files.map((f) => f.path),
      ['notes.md']
    );
    assert.deepEqual(
      files.map((f) => f.oldPath),
      ['notes.md'],
      'the forged `--- old.md` must not become the old path'
    );
  });

  it('still reads real headers for quoted and whitespace paths (#2240/#2241)', async (t) => {
    const QUOTED = '日本語.mjs';
    const SPACED = 'my notes file.md';
    const body = LONG_BODY.join('\n') + '\n';
    const { dir, cleanup } = await createTempGitRepo({
      initialFiles: { [QUOTED]: body, [SPACED]: body },
    });
    t.after(cleanup);
    await runGit(['config', 'core.quotePath', 'true'], dir);
    // Both files carry the ghost line AND a second hunk, so the guard is
    // exercised on paths that need normalization rather than only on ASCII ones.
    for (const name of [QUOTED, SPACED]) {
      const lines = [...LONG_BODY];
      lines.splice(3, 0, '++ phantom.md');
      writeFileRelative(dir, name, withSecondHunk(lines));
    }
    const diff = await diffWithContext(dir, 'HEAD', { unified: 3 });
    assertFixture(diff, '+++ phantom.md');

    const paths = parseUnifiedDiff(diff).files.map((f) => f.path);
    assert.deepEqual([...paths].sort(), [SPACED, QUOTED].sort());
  });
});

describe('parseUnifiedDiff: non-git unified diff (#2249 follow-up)', () => {
  // `diff -u -r` emits `diff -u -r a/f.txt b/f.txt` instead of `diff --git`, so
  // a parser that only leaves a hunk on `diff --git` never leaves it at all.
  // Generated with the real `diff` binary: the header shape (the TAB + mtime
  // suffix, the absence of `index` lines) is the tool's, not ours to invent.
  async function nonGitDiff(t) {
    const { mkdtempSync, mkdirSync, writeFileSync } = await import('node:fs');
    const { execFileSync } = await import('node:child_process');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { rm } = await import('node:fs/promises');

    const root = mkdtempSync(join(tmpdir(), 'rr-nongit-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    for (const side of ['a', 'b']) {
      mkdirSync(join(root, side));
      for (const name of ['f1.txt', 'f2.txt']) {
        writeFileSync(join(root, side, name), `one\n${side === 'a' ? 'two' : 'TWO'}\nthree\n`);
      }
    }
    try {
      execFileSync('diff', ['-u', '-r', 'a', 'b'], { cwd: root, encoding: 'utf8' });
    } catch (err) {
      return err.stdout;
    }
    throw new Error('fixture broken: `diff -u -r` reported no differences');
  }

  it('keeps every file when the diff has no `diff --git` lines', async (t) => {
    const diff = await nonGitDiff(t);
    assert.ok(!diff.includes('diff --git'), 'fixture broken: expected a non-git diff');
    assert.equal(
      diff.split('\n').filter((l) => l.startsWith('+++ ')).length,
      2,
      'fixture broken: expected two file headers'
    );

    assert.deepEqual(
      parseUnifiedDiff(diff).files.map((f) => f.path),
      ['f1.txt', 'f2.txt']
    );
  });

  // A patch file built by concatenating per-file `diff -u` output has NO
  // unprefixed line between the files at all — the next thing after hunk 1's
  // body is `--- a/f2.txt`, which wears a `-` and so reads as a deletion line.
  // Only the hunk's line budget can end the body here.
  async function concatenatedPatch(t) {
    const { mkdtempSync, mkdirSync, writeFileSync } = await import('node:fs');
    const { execFileSync } = await import('node:child_process');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { rm } = await import('node:fs/promises');

    const root = mkdtempSync(join(tmpdir(), 'rr-patchcat-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    for (const side of ['a', 'b']) {
      mkdirSync(join(root, side));
      for (const name of ['f1.txt', 'f2.txt']) {
        writeFileSync(join(root, side, name), `one\n${side === 'a' ? 'two' : 'TWO'}\nthree\n`);
      }
    }
    const parts = ['f1.txt', 'f2.txt'].map((name) => {
      try {
        execFileSync('diff', ['-u', `a/${name}`, `b/${name}`], { cwd: root, encoding: 'utf8' });
      } catch (err) {
        return err.stdout;
      }
      throw new Error('fixture broken: `diff -u` reported no differences');
    });
    return parts.join('');
  }

  it('keeps every file in a concatenated patch with no separator lines', async (t) => {
    const patch = await concatenatedPatch(t);
    const lines = patch.split('\n');
    const secondHeader = lines.findIndex((l, i) => i > 0 && l.startsWith('--- '));
    assert.ok(secondHeader > 0, 'fixture broken: expected a second file header');
    // Everything between the first hunk header and the second file header must
    // be body-prefixed, so nothing but the budget can end that hunk.
    const firstHunk = lines.findIndex((l) => l.startsWith('@@'));
    const between = lines.slice(firstHunk + 1, secondHeader);
    assert.ok(between.length > 0, 'fixture broken: empty first hunk');
    assert.deepEqual(
      between.filter((l) => l !== '' && !' +-\\'.includes(l[0])),
      [],
      'fixture broken: an unprefixed line would end the hunk without the budget'
    );

    assert.deepEqual(
      parseUnifiedDiff(patch).files.map((f) => f.path),
      ['f1.txt', 'f2.txt']
    );
    assert.deepEqual([...collectAddedLineHints(patch).keys()], ['f1.txt', 'f2.txt']);
  });

  it('collectAddedLineHints agrees with parseUnifiedDiff on the same diff', async (t) => {
    // The two path routes must not disagree (#2241): a hunk-state terminator
    // fixed on only one of them puts them back out of sync.
    const diff = await nonGitDiff(t);
    assert.deepEqual([...collectAddedLineHints(diff).keys()], ['f1.txt', 'f2.txt']);
  });
});

describe('parseUnifiedDiff: a hunk whose declared counts do not match its body', () => {
  // Hand-written and tool-rewritten patches (our own fixtures included) carry
  // `@@` counts that disagree with the lines that follow. A line-budget
  // terminator alone would still be inside hunk 1 when hunk 2's `@@` arrives
  // and would swallow it, collapsing two hunks into one. An unprefixed line
  // cannot be body, which is what ends the hunk here.
  const DIFF = [
    'diff --git a/src/lib/format.mjs b/src/lib/format.mjs',
    '--- a/src/lib/format.mjs',
    '+++ b/src/lib/format.mjs',
    '@@ -10,3 +10,6 @@ export function formatA(x) {', // says 3/6, body carries 2/5
    ' export function formatA(x) {',
    '+  x = trim(x);',
    ' }',
    '@@ -40,3 +43,6 @@ export function formatB(y) {',
    ' export function formatB(y) {',
    '+  y = pad(y);',
    ' }',
    '',
  ].join('\n');

  it('still starts the next hunk', () => {
    const files = parseUnifiedDiff(DIFF).files;
    assert.deepEqual(
      files.map((f) => f.path),
      ['src/lib/format.mjs']
    );
    assert.deepEqual(
      files[0].hunks.map((h) => h.oldStart),
      [10, 40],
      'both hunks must survive a header whose counts overstate the body'
    );
  });

  it('collectAddedLineHints reads the same first hunk', () => {
    assert.deepEqual(Object.fromEntries(collectAddedLineHints(DIFF)), {
      'src/lib/format.mjs': 10,
    });
  });
});

// A hunk header may LIE about how many lines its body has. These fixtures are
// written by hand on purpose: the point is exactly the shapes git never emits
// but a hand-edited or tool-rewritten patch does, reaching us through
// `review plan|exec --artifact diff=<path>`. Each one places a would-be header
// AFTER the point where a mis-tuned budget frees the hunk, and follows it with
// a second `@@` — a ghost is only recorded once a hunk attaches to it.
describe('parseUnifiedDiff: a body line must not become a file (#2249 follow-up)', () => {
  const SECOND_HUNK = ['@@ -20,1 +20,1 @@', '-p', '+q', ''];

  function assertNoGhost(diff, expected) {
    assert.deepEqual(
      parseUnifiedDiff(diff).files.map((f) => f.path),
      expected,
      'parseUnifiedDiff registered a path that is not in the diff'
    );
    assert.deepEqual(
      [...collectAddedLineHints(diff).keys()],
      expected,
      'collectAddedLineHints registered a path that is not in the diff'
    );
  }

  it('understated counts do not turn a later `+++ foo` into a file', () => {
    // Declares 1 line per side over a 3-line body, so the budget empties while
    // the body is still going. `+++ phantom.md` has no `--- ` before it, so the
    // header PAIR never opens.
    assertNoGhost(
      [
        '--- a/a.md',
        '+++ b/a.md',
        '@@ -1,1 +1,1 @@',
        '-old',
        '+new',
        '+++ phantom.md',
        ...SECOND_HUNK,
      ].join('\n'),
      ['a.md']
    );
  });

  it('an omitted `@@` count means 1, not 0', () => {
    // `@@ -3 +4 @@` is the abbreviated form. Read as 0/0 the hunk never opens,
    // and the forged pair in its body (`-- old.md` -> `++ new.md`) is read as a
    // file header pair.
    assertNoGhost(
      ['--- a/a.md', '+++ b/a.md', '@@ -3 +4 @@', '--- old.md', '+++ new.md', ...SECOND_HUNK].join(
        '\n'
      ),
      ['a.md']
    );
  });

  it('`\\ No newline at end of file` does not spend the budget', () => {
    // It annotates the previous line and belongs to neither side's count.
    // Charged as a line, the budget empties one line early and the forged pair
    // that follows is read as a header pair.
    assertNoGhost(
      [
        '--- a/a.md',
        '+++ b/a.md',
        '@@ -1,2 +1,2 @@',
        '-old',
        '\\ No newline at end of file',
        '+new',
        '--- forged.md',
        '+++ forged2.md',
        ...SECOND_HUNK,
      ].join('\n'),
      ['a.md']
    );
  });

  it('an empty line counts as body, not as a hunk terminator', () => {
    // Tools that strip trailing whitespace turn a blank context line ' ' into
    // ''. Treated as unprefixed it would end the hunk, and the forged pair
    // after it would be read as a header pair.
    assertNoGhost(
      [
        '--- a/a.md',
        '+++ b/a.md',
        '@@ -1,4 +1,4 @@',
        ' keep',
        '',
        '--- old.md',
        '+++ new.md',
        ...SECOND_HUNK,
      ].join('\n'),
      ['a.md']
    );
  });
});
