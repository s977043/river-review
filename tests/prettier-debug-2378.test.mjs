import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import prettier from 'prettier';

const targets = [
  'docs/eval/human-attention-decision-surface.md',
  'docs/eval/human-attention-fixtures.yaml',
  'tests/human-attention-eval-fixtures.test.mjs',
];

function firstDiff(actual, expected) {
  const a = actual.split('\n');
  const e = expected.split('\n');
  const max = Math.max(a.length, e.length);
  const out = [];
  for (let i = 0; i < max; i += 1) {
    if (a[i] === e[i]) continue;
    const start = Math.max(0, i - 3);
    const end = Math.min(max, i + 10);
    for (let line = start; line < end; line += 1) {
      out.push(`A ${line + 1}: ${a[line] ?? '<EOF>'}`);
      out.push(`E ${line + 1}: ${e[line] ?? '<EOF>'}`);
    }
    break;
  }
  return out.join('\n');
}

describe('temporary #2378 prettier diagnostic', () => {
  for (const target of targets) {
    it(target, async () => {
      const actual = readFileSync(target, 'utf8');
      const config = JSON.parse(readFileSync('.prettierrc.json', 'utf8'));
      const expected = await prettier.format(actual, { ...config, filepath: target });
      if (actual !== expected) {
        assert.fail(`${target}\n${firstDiff(actual, expected)}`);
      }
    });
  }
});
