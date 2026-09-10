import assert from 'node:assert/strict';
import test from 'node:test';

import { spawnSyncGuarded } from '../spawn-guard.mjs';

test('timeout error includes bounded process-state diagnostics', () => {
  const stdoutMarker = 'SPAWN_GUARD_STDOUT_MARKER';
  const stderrMarker = 'SPAWN_GUARD_STDERR_MARKER';
  let error;
  try {
    spawnSyncGuarded(
      process.execPath,
      [
        '-e',
        `const fs = require('node:fs'); fs.writeSync(1, 'o'.repeat(3_000) + '${stdoutMarker}'); fs.writeSync(2, 'e'.repeat(3_000) + '${stderrMarker}'); setInterval(() => {}, 1_000);`,
      ],
      { encoding: 'utf8', timeout: 1_000 }
    );
  } catch (caught) {
    error = caught;
  }

  assert.ok(error instanceof Error, 'timeout error should be thrown');
  assert.match(error.message, /spawnSyncGuarded timed out/);
  assert.match(error.message, /call=\d+/);
  assert.match(error.message, new RegExp(`command=${JSON.stringify(process.execPath)}`));
  assert.match(error.message, /args=\[/);
  assert.match(error.message, /cwd=/);
  assert.match(error.message, /elapsed_ms=/);
  assert.match(error.message, /child_ps=/);
  assert.match(error.message, /stdout_tail="…/);
  assert.match(error.message, new RegExp(`stdout_tail=.*${stdoutMarker}`));
  assert.match(error.message, /stderr_tail="…/);
  assert.match(error.message, new RegExp(`stderr_tail=.*${stderrMarker}`));
  assert.match(error.message, /signals=SIGPIPE\(default=ignored; js_listeners=\d+\)/);
  assert.match(error.message, /env_path_head=/);
  assert.match(error.message, /env_shell=/);
  assert.match(error.message, /env_tmpdir=/);
});
