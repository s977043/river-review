import { readFileSync } from 'node:fs';
import test from 'node:test';
import { format, resolveConfig } from 'prettier';

const FILES = [
  'scripts/experiments/small-change-shadow-batch.mjs',
  'tests/fixtures/small-change-merged-pr-metadata.json',
  'tests/small-change-shadow-batch.test.mjs',
];

test('temporary formatter diagnostics — remove before merge', async () => {
  for (const path of FILES) {
    const source = readFileSync(path, 'utf8');
    const options = (await resolveConfig(path)) ?? {};
    const formatted = await format(source, { ...options, filepath: path });
    process.stdout.write(`RR_FMT|${path}|${Buffer.from(formatted).toString('base64')}\n`);
  }
});
