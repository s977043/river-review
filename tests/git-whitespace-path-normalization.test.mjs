// tests/git-whitespace-path-normalization.test.mjs
//
// #2241: the same failure shape as #2234, but for ASCII whitespace, which git
// does NOT quote. git appends a TAB separator to a diff header only when the
// path contains whitespace (`+++ b/ leadspace.mjs\t`, while `+++ b/normal.mjs`
// has none). The three routes that read a path out of git output each applied
// their own `.trim()`, so:
//
//   - `listChangedFiles` trimmed the whole `--name-only` line and ate leading
//     AND trailing spaces that are part of the path;
//   - `parseUnifiedDiff` trimmed after `slice(4)` and ate the trailing space
//     along with the TAB;
//   - `collectAddedLineHints` matched the literal string `'+++ b/'`, which a
//     quoted header (`+++ "b/\346\227\245.mjs"`) never matches, so those files
//     dropped out of the hint map entirely.
//
// The fix routes all three through `normalizeGitPathToken` /
// `parseDiffHeaderPath` in src/lib/git.mjs. These tests run real `git diff`
// over real on-disk files, because the TAB separator and the quoting are
// produced by git and cannot be observed in a hand-written diff string.

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { parseUnifiedDiff } from '../src/lib/diff-processor.mjs';
import {
  collectAddedLineHints,
  diffWithContext,
  listChangedFiles,
  normalizeGitPathToken,
  parseDiffHeaderPath,
} from '../src/lib/git.mjs';
import { createTempGitRepo, runGit } from './helpers/temp-repo.mjs';

const LEADING = ' leadspace.mjs';
const TRAILING = 'trailspace .mjs';
const INNER = 'src/in ner.mjs';
const PLAIN = 'src/normal.mjs';
const NON_ASCII = 'src/日本語.mjs';

describe('normalizeGitPathToken / parseDiffHeaderPath (#2241)', () => {
  it('keeps leading, trailing and inner whitespace that is part of the path', () => {
    assert.equal(normalizeGitPathToken(' leadspace.mjs'), ' leadspace.mjs');
    assert.equal(normalizeGitPathToken('trailspace .mjs'), 'trailspace .mjs');
    assert.equal(normalizeGitPathToken('in ner.mjs'), 'in ner.mjs');
  });

  it('strips only the delimiters git itself added (TAB trailer, CR)', () => {
    assert.equal(parseDiffHeaderPath('b/ leadspace.mjs\t'), ' leadspace.mjs');
    assert.equal(parseDiffHeaderPath('b/trailspace .mjs\t'), 'trailspace .mjs');
    assert.equal(normalizeGitPathToken('src/app.js\r'), 'src/app.js');
    assert.equal(parseDiffHeaderPath('b/src/app.js'), 'src/app.js');
  });

  it('unquotes before stripping the a/ b/ prefix', () => {
    assert.equal(
      parseDiffHeaderPath('"b/src/\\346\\227\\245\\346\\234\\254\\350\\252\\236.mjs"'),
      'src/日本語.mjs'
    );
  });

  it('passes non-string input through unchanged', () => {
    assert.equal(normalizeGitPathToken(null), null);
    assert.equal(normalizeGitPathToken(undefined), undefined);
  });
});

async function whitespaceRepo() {
  return createTempGitRepo({
    prefix: 'river-whitespace-routes-',
    initialFiles: {
      [PLAIN]: 'export const value = 1;\n',
      [LEADING]: 'export const a = 1;\n',
      [TRAILING]: 'export const b = 1;\n',
      [INNER]: 'export const c = 1;\n',
      [NON_ASCII]: 'export const d = 1;\n',
    },
    changedFiles: {
      [PLAIN]: 'export const value = 2;\n',
      [LEADING]: 'export const a = 2;\n',
      [TRAILING]: 'export const b = 2;\n',
      [INNER]: 'export const c = 2;\n',
      [NON_ASCII]: 'export const d = 2;\n',
    },
  });
}

describe('the path routes agree on whitespace paths (#2241)', () => {
  it('listChangedFiles and parseUnifiedDiff return the same real, on-disk paths', async (t) => {
    const { dir, cleanup } = await whitespaceRepo();
    t.after(cleanup);
    await runGit(['add', '.'], dir);

    const expected = [PLAIN, LEADING, TRAILING, INNER, NON_ASCII].sort();

    const named = await listChangedFiles(dir, 'HEAD');
    assert.deepEqual(named.slice().sort(), expected);

    const parsed = parseUnifiedDiff(await diffWithContext(dir, 'HEAD'));
    assert.deepEqual(parsed.files.map((entry) => entry.path).sort(), expected);

    for (const path of [...named, ...parsed.files.map((entry) => entry.path)]) {
      assert.equal(existsSync(join(dir, path)), true, `expected ${path} to exist on disk`);
    }
  });

  it('collectAddedLineHints records every changed file, quoted paths included', async (t) => {
    const { dir, cleanup } = await whitespaceRepo();
    t.after(cleanup);
    await runGit(['add', '.'], dir);

    const hints = collectAddedLineHints(await diffWithContext(dir, 'HEAD'));
    assert.deepEqual([...hints.keys()].sort(), [PLAIN, LEADING, TRAILING, INNER, NON_ASCII].sort());
    for (const [path, line] of hints) {
      assert.equal(existsSync(join(dir, path)), true, `expected ${path} to exist on disk`);
      assert.equal(typeof line, 'number');
    }
  });
});

describe('plain ASCII paths are unaffected (#2241 regression guard)', () => {
  it('keeps the existing behaviour for paths without whitespace', async (t) => {
    const { dir, cleanup } = await createTempGitRepo({
      prefix: 'river-whitespace-plain-',
      initialFiles: { 'src/app.js': 'export const value = 1;\n' },
      changedFiles: { 'src/app.js': 'export const value = 2;\n' },
    });
    t.after(cleanup);
    await runGit(['add', '.'], dir);

    assert.deepEqual(await listChangedFiles(dir, 'HEAD'), ['src/app.js']);
    const diffText = await diffWithContext(dir, 'HEAD');
    assert.deepEqual(
      parseUnifiedDiff(diffText).files.map((entry) => entry.path),
      ['src/app.js']
    );
    assert.deepEqual([...collectAddedLineHints(diffText).keys()], ['src/app.js']);
  });

  it('still ignores the new side of a deletion (+++ /dev/null)', () => {
    const diffText = [
      'diff --git a/gone.js b/gone.js',
      '--- a/gone.js',
      '+++ /dev/null',
      '@@ -1,2 +0,0 @@',
      '-const a = 1;',
      '-const b = 2;',
      '',
    ].join('\n');
    assert.equal(collectAddedLineHints(diffText).size, 0);
  });
});
