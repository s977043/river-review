// Temporary formatter diagnostic — remove before merging this PR.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import * as prettier from 'prettier';

test('report exact doc formatting delta for #2701', async () => {
  const filename = 'docs/development/2701-incident-revert-reviewer-benchmark-gap-analysis.md';
  const text = readFileSync(filename, 'utf8');
  const options = { ...(await prettier.resolveConfig(filename)), filepath: filename };
  const normalized = await prettier.format(text, options);
  const folder = mkdtempSync(path.join(tmpdir(), 'rr-format-diff-'));
  try {
    const left = path.join(folder, 'original.md');
    const right = path.join(folder, 'prettier.md');
    writeFileSync(left, text);
    writeFileSync(right, normalized);
    const diff = spawnSync('diff', ['-u', left, right], { encoding: 'utf8' });
    console.log('PRETTIER_DIAGNOSTIC_START');
    console.log(diff.stdout || 'no diff');
    console.log('PRETTIER_DIAGNOSTIC_END');
    assert.ok(diff.status === 0 || diff.status === 1);
  } finally {
    rmSync(folder, { recursive: true, force: true });
  }
});
