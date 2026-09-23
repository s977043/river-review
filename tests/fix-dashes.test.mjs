import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { withTempDir } from './helpers/temp-dir.mjs';

const script = path.resolve(import.meta.dirname, '../scripts/fix-dashes.mjs');

function run(cwd, args = ['--check']) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd,
    encoding: 'utf8',
    timeout: 10_000,
  });
  assert.ifError(result.error);
  return result;
}

function write(root, file, content) {
  const target = path.join(root, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
  return target;
}

test('dash check retains nested targets and skips excluded directories', async () => {
  await withTempDir(async (dir) => {
    const target = write(dir, 'docs/nested/guide.md', '# Guide — Details\n');
    write(dir, 'docs/build/generated.md', '# Ignore — This\n');
    write(dir, 'docs/.drafts/note.md', '# Ignore — This\n');
    write(dir, 'pages/guide.md', '# Outside — Scope\n');
    assert.equal(run(dir).status, 1);
    assert.equal(fs.readFileSync(target, 'utf8'), '# Guide — Details\n');
    assert.equal(run(dir, []).status, 0);
    assert.equal(fs.readFileSync(target, 'utf8'), '# Guide—Details\n');
    assert.equal(run(dir).status, 0);
  });
});

test('dash check preserves numeric ranges, milestones, tables and code fences', async () => {
  await withTempDir(async (dir) => {
    const content =
      '# v0.2.0 – Developer Experience\n\n1 — 2\n\n| Value | — |\n\n```text\nA — B\n```\n';
    const target = write(dir, 'README.md', content);
    assert.equal(run(dir).status, 0);
    assert.equal(fs.readFileSync(target, 'utf8'), content);
  });
});

test('dash check and fix fail on read errors while processing remaining files', async () => {
  await withTempDir(async (dir) => {
    // A directory at a root file target reliably causes a read error on Linux.
    fs.mkdirSync(path.join(dir, 'README.md'));
    const target = write(dir, 'AGENTS.md', '# Guide — Details\n');
    const check = run(dir);
    assert.equal(check.status, 1);
    assert.match(check.stderr, /Error processing.*README\.md/);
    const fix = run(dir, []);
    assert.equal(fix.status, 1);
    assert.equal(fs.readFileSync(target, 'utf8'), '# Guide—Details\n');
    const clean = run(dir);
    assert.equal(clean.status, 1);
    assert.doesNotMatch(clean.stdout, /No heading\/title dash normalizations needed/);
  });
});
