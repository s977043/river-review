// The race #2341 reports is intermittent in the wild, so it is pinned here in a
// form that is deterministic on both runners: a script that exits IMMEDIATELY,
// before reading a byte, fed a payload larger than the pipe buffer (64KiB on
// macOS and Linux alike). The write then cannot complete before the reader is
// gone, so `EPIPE` is guaranteed rather than occasional.
//
// Measured on this repo before the fix: the bare `child.stdin.end(payload)`
// shape raised `uncaughtException: write EPIPE` on 5 of 5 runs.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { endHookStdin } from '../hook-stdin.mjs';

// Larger than the 64KiB pipe buffer, so the write cannot finish in one go.
const OVERSIZED = 'x'.repeat(1024 * 1024);

function makeScript(t, body) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'river-hook-stdin-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'hook.sh');
  fs.writeFileSync(file, `#!/bin/bash\n${body}\n`, { mode: 0o755 });
  return file;
}

function runScript(script, payload) {
  return new Promise((resolve, reject) => {
    const child = execFile('bash', [script], {}, () => {});
    let stdout = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.on('error', reject);
    endHookStdin(child, payload);
    child.on('close', (code) => resolve({ code, stdout }));
  });
}

describe('endHookStdin (#2341)', () => {
  test('a script that exits before reading stdin does not raise EPIPE', async (t) => {
    const script = makeScript(t, 'exit 0');
    const result = await runScript(script, OVERSIZED);
    // The verdict still arrives: the exit code is the hook's, not the writer's.
    assert.equal(result.code, 0);
  });

  test('the early exit is reported verbatim, not swallowed into a success', async (t) => {
    const script = makeScript(t, 'echo "not run (opted out)"\nexit 0');
    const result = await runScript(script, OVERSIZED);
    assert.equal(result.code, 0);
    assert.match(result.stdout, /not run \(opted out\)/);
  });

  test('a reader that consumes the payload still receives all of it', async (t) => {
    // The tolerance must not cut the write short for a hook that DOES read.
    const script = makeScript(t, 'wc -c');
    const result = await runScript(script, OVERSIZED);
    assert.equal(result.code, 0);
    assert.equal(Number(result.stdout.trim()), OVERSIZED.length);
  });

  test('a non-zero early exit is still reported as its own code', async (t) => {
    const script = makeScript(t, 'exit 3');
    const result = await runScript(script, OVERSIZED);
    assert.equal(result.code, 3);
  });
});
