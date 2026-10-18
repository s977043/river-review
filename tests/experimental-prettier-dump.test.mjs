import { readFileSync } from 'node:fs';
import test from 'node:test';
import { format, resolveConfig } from 'prettier';

const FILES = [
  'pages/guides/small-change-shadow.en.md',
  'pages/guides/small-change-shadow.md',
  'scripts/experiments/small-change-shadow.mjs',
  'tests/small-change-shadow.test.mjs',
];

test('temporary formatter diagnostics — remove before merge', async () => {
  for (const path of FILES) {
    const source = readFileSync(path, 'utf8');
    const options = (await resolveConfig(path)) ?? {};
    const formatted = await format(source, { ...options, filepath: path });
    process.stdout.write(`RR_FORMAT_OUTPUT|${path}|${Buffer.from(formatted).toString('base64')}\n`);
  }
});
