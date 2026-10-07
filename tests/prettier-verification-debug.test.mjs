import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import prettier from 'prettier';

test('debug prettier output for review-resolution-verification test', async () => {
  const url = new URL('./review-resolution-verification.test.mjs', import.meta.url);
  const source = readFileSync(url, 'utf8');
  const formatted = await prettier.format(source, {
    filepath: url.pathname,
    semi: true,
    trailingComma: 'es5',
    singleQuote: true,
    printWidth: 100,
    tabWidth: 2,
    useTabs: false,
    proseWrap: 'preserve',
  });

  if (source !== formatted) {
    console.error('PRETTIER_OUTPUT_START');
    console.error(formatted);
    console.error('PRETTIER_OUTPUT_END');
  }
  assert.equal(source, formatted);
});
