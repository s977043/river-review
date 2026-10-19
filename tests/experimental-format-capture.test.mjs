import { readFileSync } from 'node:fs';
import test from 'node:test';
import { format, resolveConfig } from 'prettier';

test('temporary format capture — must remove before merge', async () => {
  for (const path of [
    'scripts/experiments/small-change-host-observe.mjs',
    'tests/small-change-host-observe.test.mjs',
  ]) {
    const options = (await resolveConfig(path)) ?? {};
    const formatted = await format(readFileSync(path, 'utf8'), { ...options, filepath: path });
    process.stdout.write('RR_FMT|' + path + '|' + Buffer.from(formatted).toString('base64') + '\n');
  }
});
