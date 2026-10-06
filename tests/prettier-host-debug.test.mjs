import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import prettier from 'prettier';

for (const relativePath of [
  '../src/lib/review-resolution-host.mjs',
  './review-resolution-host.test.mjs',
]) {
  test(`debug prettier output: ${relativePath}`, async () => {
    const url = new URL(relativePath, import.meta.url);
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
      console.error(`PRETTIER_OUTPUT_START:${relativePath}`);
      console.error(formatted);
      console.error(`PRETTIER_OUTPUT_END:${relativePath}`);
    }
    assert.equal(source, formatted);
  });
}
