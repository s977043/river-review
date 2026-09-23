import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import prettier from 'prettier';

const target = 'src/cli/render.mjs';

function diffChangedRegion(actual, expected) {
  const a = actual.split('\n');
  const e = expected.split('\n');
  const startNeedle = 'export function buildHumanDecisionSurface';
  const start = Math.max(
    0,
    Math.min(
      a.findIndex((line) => line.includes(startNeedle)),
      e.findIndex((line) => line.includes(startNeedle))
    ) - 8
  );
  const endNeedle = 'function formatFindingsSectionsMarkdown';
  const aEnd = a.findIndex((line) => line.includes(endNeedle));
  const eEnd = e.findIndex((line) => line.includes(endNeedle));
  const end = Math.max(aEnd, eEnd) + 8;
  const lines = [];
  for (let i = start; i <= end; i += 1) {
    if (a[i] === e[i]) continue;
    lines.push(`A ${i + 1}: ${a[i] ?? '<EOF>'}`);
    lines.push(`E ${i + 1}: ${e[i] ?? '<EOF>'}`);
  }
  return lines.join('\n');
}

describe('temporary #2370 prettier diagnostic', () => {
  it('prints repository-config delta for the Decision Surface region', async () => {
    const actual = readFileSync(target, 'utf8');
    const config = JSON.parse(readFileSync('.prettierrc.json', 'utf8'));
    const expected = await prettier.format(actual, { ...config, filepath: target });

    if (actual !== expected) {
      assert.fail(`Prettier delta in Decision Surface region:\n${diffChangedRegion(actual, expected)}`);
    }
  });
});
