import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import prettier from 'prettier';

test('diagnose skill-id resolver prettier output', async () => {
  const root = path.dirname(fileURLToPath(import.meta.url));
  const target = path.join(root, 'skill-id-resolution-contract.test.mjs');
  const input = await readFile(target, 'utf8');
  const config = (await prettier.resolveConfig(target)) ?? {};
  const formatted = await prettier.format(input, { ...config, filepath: target });

  if (formatted !== input) {
    console.error('PRETTIER_EXPECTED_START');
    console.error(formatted);
    console.error('PRETTIER_EXPECTED_END');
  }

  assert.equal(input, formatted);
});
