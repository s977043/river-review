import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import prettier from 'prettier';

for (const target of [
  'tests/paired-replay.test.mjs',
  'docs/development/1574-p2-paired-replay.md',
]) {
  test(`diagnose prettier: ${target}`, async () => {
    const input = await readFile(path.resolve(target), 'utf8');
    const config = (await prettier.resolveConfig(path.resolve(target))) ?? {};
    const formatted = await prettier.format(input, { ...config, filepath: path.resolve(target) });

    if (formatted !== input) {
      console.error(`PRETTIER_EXPECTED_START ${target}`);
      console.error(formatted);
      console.error(`PRETTIER_EXPECTED_END ${target}`);
    }
    assert.equal(input, formatted);
  });
}
