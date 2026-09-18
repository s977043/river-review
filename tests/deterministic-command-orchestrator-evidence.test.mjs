import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  ALLOWLIST_RELATIVE_PATH,
  runDeterministicGates,
} from '../src/lib/deterministic-command-orchestrator.mjs';

async function makeTrustedTree() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'river-evidence-trusted-'));
  const allowlistPath = path.join(dir, ALLOWLIST_RELATIVE_PATH);
  await fs.mkdir(path.dirname(allowlistPath), { recursive: true });
  await fs.writeFile(
    allowlistPath,
    [
      'version: 1',
      'commands:',
      '  - command: /usr/bin/tool-fail',
      '    selfContained: true',
      '  - command: /usr/bin/tool-timeout',
      '    selfContained: true',
    ].join('\n'),
    'utf8'
  );
  return dir;
}

async function makeSourceDir() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'river-evidence-src-'));
  await fs.writeFile(path.join(dir, 'changed.txt'), 'changed', 'utf8');
  return dir;
}

const skill = (id, command) => ({
  id,
  metadata: { deterministicGate: { command, args: [] } },
});

test('runDeterministicGates preserves only safe executor metadata for evidence', async () => {
  const trustedTree = await makeTrustedTree();
  const sourceDir = await makeSourceDir();

  try {
    const execImpl = async ({ entry }) => {
      if (entry.command === '/usr/bin/tool-fail') {
        return {
          status: 'fail',
          reasonCode: 'STRICT_BLOCK',
          durationMs: 17,
          exitCode: 2,
          stdoutBytes: 31,
          stdout: 'SECRET_MUST_NOT_ESCAPE',
          stderr: 'SECRET_MUST_NOT_ESCAPE',
          arbitrary: 'must-not-propagate',
        };
      }
      return {
        status: 'unrunnable',
        reasonCode: 'DETERMINISTIC_UNRUNNABLE',
        durationMs: 30_000,
        stdoutBytes: 0,
        unrunnableCause: 'timeout',
        stdout: 'SECRET_MUST_NOT_ESCAPE',
        stderr: 'SECRET_MUST_NOT_ESCAPE',
      };
    };

    const result = await runDeterministicGates({
      trustedTree,
      selected: [
        skill('fail-check', '/usr/bin/tool-fail'),
        skill('timeout-check', '/usr/bin/tool-timeout'),
      ],
      reviewSourceDir: sourceDir,
      changedFiles: ['changed.txt'],
      processEnv: { PATH: '/usr/bin' },
      execImpl,
    });

    assert.equal(result.strictBlock, true);
    assert.equal(result.deterministicUnrunnable, true);
    assert.deepEqual(result.results, [
      {
        gateIndex: 0,
        skillId: 'fail-check',
        status: 'fail',
        reasonCode: 'STRICT_BLOCK',
        durationMs: 17,
        exitCode: 2,
        stdoutBytes: 31,
        staging: { requested: 1, copied: 1, complete: true, skipped: [], deleted: [] },
      },
      {
        gateIndex: 1,
        skillId: 'timeout-check',
        status: 'unrunnable',
        reasonCode: 'DETERMINISTIC_UNRUNNABLE',
        durationMs: 30_000,
        stdoutBytes: 0,
        unrunnableCause: 'timeout',
        staging: { requested: 1, copied: 1, complete: true, skipped: [], deleted: [] },
      },
    ]);

    const serialized = JSON.stringify(result);
    assert.equal(serialized.includes('SECRET_MUST_NOT_ESCAPE'), false);
    assert.equal(serialized.includes('arbitrary'), false);
  } finally {
    await fs.rm(trustedTree, { recursive: true, force: true });
    await fs.rm(sourceDir, { recursive: true, force: true });
  }
});
