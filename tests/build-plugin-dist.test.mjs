import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildExpected, diffDist, PLUGIN_INPUTS } from '../scripts/build-plugin-dist.mjs';

test('committed plugin-dist matches a fresh build (#2756)', async () => {
  assert.deepEqual(await diffDist(await buildExpected()), []);
});

test('the plugin dist ships no package.json and keeps the manifest', async () => {
  const expected = await buildExpected();
  assert.equal(expected.has('package.json'), false);
  assert.ok(expected.has('.claude-plugin/plugin.json'));
  assert.ok(!PLUGIN_INPUTS.includes('package.json'));
});

test('diffDist reports missing, differing, mode-changed and unexpected files', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-plugin-dist-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.writeFileSync(path.join(dir, 'same.md'), 'same');
  fs.writeFileSync(path.join(dir, 'changed.md'), 'old');
  fs.writeFileSync(path.join(dir, 'hook.sh'), 'x', { mode: 0o644 });
  fs.writeFileSync(path.join(dir, 'leftover.md'), 'gone');
  const expected = new Map([
    ['same.md', { content: Buffer.from('same'), executable: false }],
    ['changed.md', { content: Buffer.from('new'), executable: false }],
    ['hook.sh', { content: Buffer.from('x'), executable: true }],
    ['added.md', { content: Buffer.from('a'), executable: false }],
  ]);
  assert.deepEqual(await diffDist(expected, dir), [
    'differs: changed.md',
    'missing: added.md',
    'mode differs: hook.sh',
    'unexpected: leftover.md',
  ]);
});
