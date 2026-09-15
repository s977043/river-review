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
import { diffWithContext } from '../src/lib/git.mjs';
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
