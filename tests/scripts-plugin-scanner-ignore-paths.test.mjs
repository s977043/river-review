import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  compareIgnorePaths,
  formatReport,
  globToRegExp,
  parseIgnorePaths,
} from '../scripts/report-plugin-scanner-ignore-paths.mjs';

test('ignore_paths を TOML の配列から取り出す', () => {
  assert.deepEqual(
    parseIgnorePaths('[scanner]\nignore_paths = [\n  "tests/**", # comment\n  \'src/*.mjs\',\n]\n'),
    ['tests/**', 'src/*.mjs']
  );
});

test('コメント中の引用符を ignore_paths として取り出さない', () => {
  assert.deepEqual(
    parseIgnorePaths('ignore_paths = ["tests/**", # "not/a/path/**"\n "src/**"]\n'),
    ['tests/**', 'src/**']
  );
});

test('文字クラスを含む glob を配列末尾まで取り出す', () => {
  assert.deepEqual(parseIgnorePaths('ignore_paths = ["src/file[0-9].mjs"]\n'), [
    'src/file[0-9].mjs',
  ]);
});

test('scanner 互換の glob で * と ** を区別する', () => {
  assert.match('tests/unit/a.test.mjs', globToRegExp('tests/**'));
  assert.match('skills/foo/fixtures/a.json', globToRegExp('skills/*/fixtures/**'));
  assert.doesNotMatch('skills/foo/bar/fixtures/a.json', globToRegExp('skills/*/fixtures/**'));
  assert.doesNotMatch('tests/unit/a.test.mjs', globToRegExp('tests/*.mjs'));
});

test('追加と削除の ignore_paths、および一致する追跡ファイルを Markdown に出す', () => {
  const report = compareIgnorePaths(
    'ignore_paths = ["old/**", "shared/**"]',
    'ignore_paths = ["shared/**", "tests/**"]',
    ['old/a.mjs', 'tests/a.test.mjs', 'tests/b.test.mjs', 'shared/x.mjs']
  );
  assert.deepEqual(report.added, [
    { pattern: 'tests/**', files: ['tests/a.test.mjs', 'tests/b.test.mjs'] },
  ]);
  assert.deepEqual(report.removed, [{ pattern: 'old/**', files: ['old/a.mjs'] }]);
  const markdown = formatReport(report, 1);
  assert.match(markdown, /`tests\/\*\*` — 2 件/);
  assert.match(markdown, /`tests\/a\.test\.mjs`/);
  assert.match(markdown, /ほか 1 件/);
  assert.match(markdown, /削除された `ignore_paths`/);
  assert.match(markdown, /`old\/a\.mjs`/);
});

test('CLI は git ls-files の追跡ファイルだけを対象にする', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rr-plugin-scanner-ignore-'));
  try {
    execFileSync('git', ['init', '--quiet'], { cwd: dir });
    writeFileSync(join(dir, 'before.toml'), 'ignore_paths = []\n');
    writeFileSync(join(dir, 'after.toml'), 'ignore_paths = ["tests/**"]\n');
    mkdirSync(join(dir, 'tests'));
    writeFileSync(join(dir, 'tests', 'tracked.test.mjs'), '');
    writeFileSync(join(dir, 'tests', 'untracked.test.mjs'), '');
    execFileSync('git', ['add', 'before.toml', 'after.toml', 'tests/tracked.test.mjs'], {
      cwd: dir,
    });
    const script = join(process.cwd(), 'scripts', 'report-plugin-scanner-ignore-paths.mjs');
    const output = execFileSync(
      'node',
      [script, '--before', 'before.toml', '--after', 'after.toml'],
      {
        cwd: dir,
        encoding: 'utf8',
      }
    );
    assert.match(output, /`tests\/\*\*` — 1 件/);
    assert.match(output, /`tests\/tracked\.test\.mjs`/);
    assert.doesNotMatch(output, /untracked\.test\.mjs/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
