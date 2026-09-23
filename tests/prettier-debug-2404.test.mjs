import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import prettier from 'prettier';

const targets = [
  'scripts/evaluate-human-attention.mjs',
  'tests/human-attention-eval-e2e.test.mjs',
];

function firstDiffs(actual, expected) {
  const a = actual.split('\n');
  const e = expected.split('\n');
  const max = Math.max(a.length, e.length);
  const chunks = [];

  for (let i = 0; i < max && chunks.length < 8; i += 1) {
    if (a[i] === e[i]) continue;
    const start = Math.max(0, i - 3);
    const end = Math.min(max, i + 10);
    chunks.push(
      [
        `@@ around line ${i + 1} @@`,
        ...Array.from({ length: end - start }, (_, offset) => {
          const line = start + offset;
          return `A ${line + 1}: ${a[line] ?? '<EOF>'}\nE ${line + 1}: ${e[line] ?? '<EOF>'}`;
        }),
      ].join('\n')
    );
    i = end - 1;
  }

  return chunks.join('\n\n');
}

describe('temporary #2404 prettier diagnostic', () => {
  for (const target of targets) {
    it(target, async () => {
      const actual = readFileSync(target, 'utf8');
      const config = JSON.parse(readFileSync('.prettierrc.json', 'utf8'));
      const expected = await prettier.format(actual, { ...config, filepath: target });

      if (actual !== expected) {
        assert.fail(`${target}\n${firstDiffs(actual, expected)}`);
      }
    });
  }
});
