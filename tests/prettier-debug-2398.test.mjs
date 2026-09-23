import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import prettier from 'prettier';

const targets = [
  'tests/fixtures/human-attention/decision-surface-eval-cases.json',
  'tests/human-attention-eval-contract.test.mjs',
];

function firstDiff(actual, expected) {
  const a = actual.split('\n');
  const e = expected.split('\n');
  const max = Math.max(a.length, e.length);

  for (let i = 0; i < max; i += 1) {
    if (a[i] === e[i]) continue;

    const start = Math.max(0, i - 3);
    const end = Math.min(max, i + 12);
    const lines = [];

    for (let line = start; line < end; line += 1) {
      lines.push(`A ${line + 1}: ${a[line] ?? '<EOF>'}`);
      lines.push(`E ${line + 1}: ${e[line] ?? '<EOF>'}`);
    }
    return lines.join('\n');
  }

  return '';
}

describe('temporary #2398 prettier diagnostic', () => {
  for (const target of targets) {
    it(target, async () => {
      const actual = readFileSync(target, 'utf8');
      const config = JSON.parse(readFileSync('.prettierrc.json', 'utf8'));
      const expected = await prettier.format(actual, {
        ...config,
        filepath: target,
      });

      if (actual !== expected) {
        assert.fail(`${target}\n${firstDiff(actual, expected)}`);
      }
    });
  }
});
