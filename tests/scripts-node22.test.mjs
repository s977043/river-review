import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSyncGuarded } from './helpers/spawn-guard.mjs';

// scripts/node22.sh を実プロセス実行で固定する。NODE22_BIN に偽の node を置いた
// 使い捨て dir を渡し、(a) PATH 先頭に bin dir が入った状態で exec される
// (b) node が無い / major が .nvmrc と違うと 127 で止まる (c) 引数なしは 64 を検査する。
const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'node22.sh');

function fakeBin(t, version) {
  const dir = mkdtempSync(join(tmpdir(), 'rr-node22-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  if (version) {
    const node = join(dir, 'node');
    writeFileSync(node, `#!/bin/sh\necho ${version}\n`);
    chmodSync(node, 0o755);
  }
  return dir;
}

function run(bin, args) {
  return spawnSyncGuarded('bash', [SCRIPT, ...args], {
    encoding: 'utf8',
    env: { ...process.env, NODE22_BIN: bin },
  });
}

test('puts NODE22_BIN first on PATH so env-shebang tools resolve that node', (t) => {
  const bin = fakeBin(t, 'v22.0.0');
  const res = run(bin, ['sh', '-c', 'command -v node; node']);
  assert.equal(res.status, 0, res.stderr);
  assert.deepEqual(res.stdout.trim().split('\n'), [join(bin, 'node'), 'v22.0.0']);
});

test('passes the exit status of the command through', (t) => {
  const res = run(fakeBin(t, 'v22.0.0'), ['sh', '-c', 'exit 3']);
  assert.equal(res.status, 3);
});

test('exits 127 when the bin dir has no node', (t) => {
  const res = run(fakeBin(t, null), ['true']);
  assert.equal(res.status, 127);
  assert.match(res.stderr, /\.nvmrc/);
});

test('exits 127 when the node major differs from .nvmrc', (t) => {
  const res = run(fakeBin(t, 'v26.1.0'), ['true']);
  assert.equal(res.status, 127);
  assert.match(res.stderr, /does not match \.nvmrc/);
});

test('exits 64 without a command', (t) => {
  const res = run(fakeBin(t, 'v22.0.0'), []);
  assert.equal(res.status, 64);
});
