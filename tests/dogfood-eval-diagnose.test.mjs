import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('river-review-code dogfood keeps fixture eval green', () => {
  const result = spawnSync(process.execPath, ['scripts/evaluate-review-fixtures.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  assert.equal(result.status, 0, 'npm run eval:fixtures equivalent must pass');
});
