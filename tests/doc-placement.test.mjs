import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const checker = fileURLToPath(new URL('../scripts/check-doc-placement.mjs', import.meta.url));
const communityFiles = [
  'CODE_OF_CONDUCT.md',
  'CONTRIBUTING.md',
  'CONTRIBUTING.en.md',
  'SECURITY.md',
];
const rootFiles = [
  'AGENTS.md',
  'AGENT_LEARNINGS.md',
  'CHANGELOG.md',
  'CLAUDE.md',
  'GEMINI.md',
  'README.md',
  'README.en.md',
  'ROADMAP.md',
];

function runChecker(t, { roots = rootFiles, missing = [], directories = [] } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'river-doc-placement-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, 'scripts'));
  mkdirSync(path.join(root, '.github'));
  copyFileSync(checker, path.join(root, 'scripts/check-doc-placement.mjs'));
  for (const name of roots) writeFileSync(path.join(root, name), '# Test document\n');
  for (const name of communityFiles) {
    if (missing.includes(name)) continue;
    const target = path.join(root, '.github', name);
    if (directories.includes(name)) mkdirSync(target);
    else writeFileSync(target, '# Community document\n');
  }
  const result = spawnSync(process.execPath, [path.join(root, 'scripts/check-doc-placement.mjs')], {
    cwd: root,
    encoding: 'utf8',
    timeout: 15000,
  });
  assert.ifError(result.error);
  return result;
}

test('valid root documents and community files pass placement checks', (t) => {
  const result = runChecker(t);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /8 total, 8 in allowlist, 0 violation\(s\)/);
});

test('an unexpected root document still fails the existing allowlist', (t) => {
  const result = runChecker(t, { roots: ['README.md', 'scratch.md'] });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /2 total, 1 in allowlist, 1 violation\(s\)/);
  assert.match(result.stderr, /scratch\.md: not in root allowlist/);
});

test('a missing community file does not reduce the allowed root count', (t) => {
  const result = runChecker(t, { roots: ['README.md'], missing: ['SECURITY.md'] });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /1 total, 1 in allowlist, 1 violation\(s\)/);
  assert.match(result.stderr, /\.github\/SECURITY\.md/);
});

test('missing community files cannot produce a negative allowed root count', (t) => {
  const result = runChecker(t, { roots: [], missing: communityFiles });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /0 total, 0 in allowlist, 4 violation\(s\)/);
  for (const name of communityFiles) assert.ok(result.stderr.includes(`.github/${name}`));
});

test('a directory named SECURITY.md is not a community document', (t) => {
  const result = runChecker(t, { directories: ['SECURITY.md'] });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /8 total, 8 in allowlist, 1 violation\(s\)/);
  assert.match(result.stderr, /\.github\/SECURITY\.md.*not a regular file/);
});

test('root and community violations are aggregated without hiding either', (t) => {
  const result = runChecker(t, {
    roots: ['README.md', 'scratch.md'],
    missing: ['CONTRIBUTING.en.md'],
    directories: ['SECURITY.md'],
  });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /2 total, 1 in allowlist, 3 violation\(s\)/);
  assert.ok(result.stderr.includes('scratch.md'));
  assert.ok(result.stderr.includes('.github/CONTRIBUTING.en.md'));
  assert.ok(result.stderr.includes('.github/SECURITY.md'));
});

test('all four required community paths must point to files', (t) => {
  for (const name of communityFiles) {
    const result = runChecker(t, { directories: [name] });
    assert.equal(result.status, 1, name);
    assert.ok(result.stderr.includes(`.github/${name}: not a regular file`));
    assert.match(result.stdout, /4 required, 1 invalid/);
  }
});

test('an empty root is valid when all required community documents exist', (t) => {
  const result = runChecker(t, { roots: [] });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /0 total, 0 in allowlist, 0 violation\(s\)/);
  assert.match(result.stdout, /4 required, 0 invalid/);
});
