import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import prettier from 'prettier';

test('debug prettier output for review-resolution.mjs', async () => {
  const path = new URL('../src/lib/review-resolution.mjs', import.meta.url);
  const source = readFileSync(path, 'utf8');
  const formatted = await prettier.format(source, {
    filepath: 'src/lib/review-resolution.mjs',
    semi: true,
    trailingComma: 'es5',
    singleQuote: true,
    printWidth: 100,
    tabWidth: 2,
    useTabs: false,
  });

  if (source !== formatted) {
    console.error('PRETTIER_OUTPUT_START');
    console.error(formatted);
    console.error('PRETTIER_OUTPUT_END');
  }
  assert.equal(source, formatted);
});
