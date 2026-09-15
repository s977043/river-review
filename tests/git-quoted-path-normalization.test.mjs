// tests/git-quoted-path-normalization.test.mjs
//
// #2234: git quotes pathnames it considers unusual (every non-ASCII byte while
// `core.quotePath` is at its default, plus quotes/backslashes/control
// characters even when it is off). `git diff --name-only` and the unified-diff
// `+++` header quote the SAME file differently — the header puts the `b/`
// prefix INSIDE the quotes — so the two path routes used to disagree. That
// split one file into a bogus `selected` entry and a bogus `excluded` entry at
// once, and made `config.exclude.files` minimatch patterns miss the file.
//
// These tests pin the normalization itself, the two routes agreeing, and the
// two user-visible consequences.

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { parseUnifiedDiff } from '../src/lib/diff-processor.mjs';
import { diffWithContext, listChangedFiles, unquoteGitPath } from '../src/lib/git.mjs';
import { planLocalReview } from '../src/lib/local-runner.mjs';
import { createTempGitRepo, runGit } from './helpers/temp-repo.mjs';

const NON_ASCII = 'src/日本語.mjs';
const WITH_SPACE = 'src/with space.mjs';
const WITH_QUOTE = 'src/quo"te.mjs';

describe('unquoteGitPath (#2234)', () => {
  it('returns unquoted paths unchanged', () => {
    assert.equal(unquoteGitPath('src/app.js'), 'src/app.js');
    assert.equal(unquoteGitPath('src/with space.mjs'), 'src/with space.mjs');
    assert.equal(unquoteGitPath(''), '');
    assert.equal(unquoteGitPath('"'), '"');
  });

  it('decodes octal escapes as UTF-8 bytes, not as individual characters', () => {
    assert.equal(
      unquoteGitPath('"s/\\346\\227\\245\\346\\234\\254\\350\\252\\236.mjs"'),
      's/日本語.mjs'
    );
  });

  it('decodes the single-letter C escapes git emits', () => {
    assert.equal(unquoteGitPath('"s/quo\\"te.mjs"'), 's/quo"te.mjs');
    assert.equal(unquoteGitPath('"s/back\\\\slash.mjs"'), 's/back\\slash.mjs');
    assert.equal(unquoteGitPath('"s/tab\\there.mjs"'), 's/tab\there.mjs');
  });

  it('is tolerant of non-string input', () => {
    assert.equal(unquoteGitPath(null), null);
    assert.equal(unquoteGitPath(undefined), undefined);
  });
});

describe('parseUnifiedDiff unquotes before stripping the a/ b/ prefix (#2234)', () => {
  it('yields the real path for a quoted header', () => {
    const diff = [
      'diff --git "a/s/\\346\\227\\245.mjs" "b/s/\\346\\227\\245.mjs"',
      '--- "a/s/\\346\\227\\245.mjs"',
      '+++ "b/s/\\346\\227\\245.mjs"',
      '@@ -1,1 +1,1 @@',
      '-old',
      '+new',
    ].join('\n');

    const parsed = parseUnifiedDiff(diff);
    assert.equal(parsed.files.length, 1);
    assert.equal(parsed.files[0].path, 's/日.mjs');
    assert.equal(parsed.files[0].newPath, 's/日.mjs');
    assert.equal(parsed.files[0].oldPath, 's/日.mjs');
  });

  it('leaves plain ASCII headers untouched', () => {
    const diff = ['--- a/src/app.js', '+++ b/src/app.js', '@@ -1,1 +1,1 @@', '-a', '+b'].join('\n');
    assert.equal(parseUnifiedDiff(diff).files[0].path, 'src/app.js');
  });
});

describe('git path routes agree on unusual paths (#2234)', () => {
  it('listChangedFiles and parseUnifiedDiff return the same real, on-disk paths', async (t) => {
    const { dir, cleanup } = await createTempGitRepo({
      prefix: 'river-quotepath-routes-',
      initialFiles: {
        'src/app.js': 'export const value = 1;\n',
        [NON_ASCII]: 'export const a = 1;\n',
        [WITH_SPACE]: 'export const b = 1;\n',
        [WITH_QUOTE]: 'export const c = 1;\n',
      },
      changedFiles: {
        'src/app.js': 'export const value = 2;\n',
        [NON_ASCII]: 'export const a = 2;\n',
        [WITH_SPACE]: 'export const b = 2;\n',
        [WITH_QUOTE]: 'export const c = 2;\n',
      },
    });
    t.after(cleanup);
    await runGit(['add', '.'], dir);

    const expected = ['src/app.js', NON_ASCII, WITH_SPACE, WITH_QUOTE].sort();

    const named = await listChangedFiles(dir, 'HEAD');
    assert.deepEqual(named.slice().sort(), expected);

    const parsed = parseUnifiedDiff(await diffWithContext(dir, 'HEAD'));
    assert.deepEqual(parsed.files.map((entry) => entry.path).sort(), expected);

    for (const path of [...named, ...parsed.files.map((entry) => entry.path)]) {
      assert.equal(existsSync(join(dir, path)), true, `expected ${path} to exist on disk`);
    }
  });
});

describe('fileScope and config.exclude.files on unusual paths (#2234)', () => {
  it('keeps selected and excluded disjoint and every path real', async (t) => {
    const { dir, cleanup } = await createTempGitRepo({
      prefix: 'river-quotepath-scope-',
      initialFiles: {
        'src/app.js': 'export const value = 1;\n',
        [NON_ASCII]: 'export const a = 1;\n',
        [WITH_SPACE]: 'export const b = 1;\n',
        [WITH_QUOTE]: 'export const c = 1;\n',
      },
      changedFiles: {
        'src/app.js': 'export const value = 2;\n',
        [NON_ASCII]: 'export const a = 2;\n',
        [WITH_SPACE]: 'export const b = 2;\n',
        [WITH_QUOTE]: 'export const c = 2;\n',
      },
    });
    t.after(cleanup);
    await runGit(['add', '.'], dir);

    const context = await planLocalReview({ cwd: dir, dryRun: true });
    assert.equal(context.status, 'ok');

    const scope = context.reviewFileScope;
    const excludedPaths = scope.excluded.map((entry) => entry.path);
    assert.deepEqual(
      scope.selected.slice().sort(),
      ['src/app.js', NON_ASCII, WITH_SPACE, WITH_QUOTE].sort()
    );
    assert.deepEqual(excludedPaths, []);
    for (const path of [...scope.selected, ...excludedPaths]) {
      assert.equal(path.includes('\\'), false, `path ${path} still carries an escape`);
      assert.equal(existsSync(join(dir, path)), true, `expected ${path} to exist on disk`);
      assert.equal(
        scope.selected.includes(path) && excludedPaths.includes(path),
        false,
        `path ${path} appears in both selected and excluded`
      );
    }
  });

  it('applies config.exclude.files to a non-ASCII path', async (t) => {
    const { dir, cleanup } = await createTempGitRepo({
      prefix: 'river-quotepath-exclude-',
      initialFiles: {
        '.river-review.json': JSON.stringify(
          { exclude: { files: ['src/日本語.mjs', 'src/with space.mjs'] } },
          null,
          2
        ),
        'src/app.js': 'export const value = 1;\n',
        [NON_ASCII]: 'export const a = 1;\n',
        [WITH_SPACE]: 'export const b = 1;\n',
      },
      changedFiles: {
        'src/app.js': 'export const value = 2;\n',
        [NON_ASCII]: 'export const a = 2;\n',
        [WITH_SPACE]: 'export const b = 2;\n',
      },
    });
    t.after(cleanup);
    await runGit(['add', '.'], dir);

    const context = await planLocalReview({ cwd: dir, dryRun: true });
    assert.equal(context.status, 'ok');
    assert.deepEqual(context.reviewFileScope.selected, ['src/app.js']);
    assert.deepEqual(
      context.reviewFileScope.excluded.slice().sort((a, b) => a.path.localeCompare(b.path)),
      [
        { path: WITH_SPACE, reasonCode: 'configured_exclusion' },
        { path: NON_ASCII, reasonCode: 'configured_exclusion' },
      ].sort((a, b) => a.path.localeCompare(b.path))
    );
  });
});
