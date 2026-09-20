/**
 * Deterministic command orchestrator tests (#1401 §11.8 (c2a) / §11.5.3).
 *
 * The orchestrator is the confluence point: allowlist → sandbox → executor →
 * aggregate into { strictBlock, deterministicUnrunnable }. These tests inject a
 * mock `execImpl` and `mkdtempImpl`, so NO real process is ever spawned and the
 * real `executeDeterministicCommand` never runs. The most important case is the
 * safe default: an unset `trustedTree` executes nothing and returns
 * { false, false, [] }.
 *
 * A real host-trusted allowlist file IS written to a temp dir (the module reads
 * it via fs), but every command in it is a harmless absolute path that is never
 * launched because `execImpl` is mocked.
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

import {
  runDeterministicGates,
  ALLOWLIST_RELATIVE_PATH,
} from '../src/lib/deterministic-command-orchestrator.mjs';

/** Build a valid host-trusted allowlist YAML for the given entries. */
function allowlistYaml(entries) {
  const lines = ['version: 1', 'commands:'];
  for (const e of entries) {
    lines.push(`  - command: ${e.command}`);
    if (Array.isArray(e.args) && e.args.length > 0) {
      lines.push('    args:');
      for (const a of e.args) lines.push(`      - ${JSON.stringify(a)}`);
    }
    lines.push('    selfContained: true');
  }
  return lines.join('\n');
}

/** Write a trusted-tree base checkout with an allowlist file; return its path. */
async function makeTrustedTree(entries) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'river-trusted-'));
  const allowlistPath = path.join(dir, ALLOWLIST_RELATIVE_PATH);
  await fs.mkdir(path.dirname(allowlistPath), { recursive: true });
  await fs.writeFile(allowlistPath, allowlistYaml(entries), 'utf8');
  return dir;
}

/** A skill with a deterministicGate command definition. */
function skill(id, command, args) {
  return { id, metadata: { deterministicGate: { command, args } } };
}

/** Factory: a mock execImpl returning a fixed status; records its calls. */
function mockExec(statusByCommand) {
  const calls = [];
  const impl = async ({ entry, sandboxDir, env }) => {
    calls.push({ entry, sandboxDir, env });
    const status = statusByCommand[entry.command] ?? 'pass';
    const reasonCode =
      status === 'fail'
        ? 'STRICT_BLOCK'
        : status === 'unrunnable'
          ? 'DETERMINISTIC_UNRUNNABLE'
          : 'DETERMINISTIC_PASS';
    return { status, reasonCode };
  };
  return { impl, calls };
}

/** A source dir with a couple of changed files to stage. */
async function makeSourceDir() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'river-src-'));
  await fs.writeFile(path.join(dir, 'a.txt'), 'hello', 'utf8');
  return dir;
}

describe('runDeterministicGates — safe default (trustedTree unset)', () => {
  test('no trustedTree → executes nothing, returns { false, false, [] }', async () => {
    const { impl, calls } = mockExec({});
    const result = await runDeterministicGates({
      selected: [skill('s1', '/usr/bin/tool', [])],
      execImpl: impl,
      mkdtempImpl: async () => {
        throw new Error('mkdtemp must not be called when trustedTree is unset');
      },
    });
    assert.deepEqual(result, { strictBlock: false, deterministicUnrunnable: false, results: [] });
    assert.equal(calls.length, 0, 'execImpl must not be called');
  });

  test('trustedTree given but allowlist file absent → { false, false, [] }', async () => {
    const emptyTree = await fs.mkdtemp(path.join(os.tmpdir(), 'river-empty-'));
    try {
      const { impl, calls } = mockExec({});
      const result = await runDeterministicGates({
        trustedTree: emptyTree,
        selected: [skill('s1', '/usr/bin/tool', [])],
        execImpl: impl,
      });
      assert.deepEqual(result, {
        strictBlock: false,
        deterministicUnrunnable: false,
        results: [],
      });
      assert.equal(calls.length, 0);
    } finally {
      await fs.rm(emptyTree, { recursive: true, force: true });
    }
  });
});

describe('runDeterministicGates — single matching command', () => {
  let trustedTree;
  let sourceDir;

  beforeEach(async () => {
    trustedTree = await makeTrustedTree([{ command: '/usr/bin/tool', args: [] }]);
    sourceDir = await makeSourceDir();
  });
  afterEach(async () => {
    await fs.rm(trustedTree, { recursive: true, force: true });
    await fs.rm(sourceDir, { recursive: true, force: true });
  });

  test('pass → both flags false, execImpl called once', async () => {
    const { impl, calls } = mockExec({ '/usr/bin/tool': 'pass' });
    const result = await runDeterministicGates({
      trustedTree,
      selected: [skill('s1', '/usr/bin/tool', [])],
      reviewSourceDir: sourceDir,
      changedFiles: ['a.txt'],
      processEnv: { PATH: '/usr/bin' },
      execImpl: impl,
    });
    assert.equal(result.strictBlock, false);
    assert.equal(result.deterministicUnrunnable, false);
    assert.deepEqual(result.results, [
      {
        gateIndex: 0,
        skillId: 's1',
        status: 'pass',
        reasonCode: 'DETERMINISTIC_PASS',
        // #2311: every row carries what actually reached its sandbox.
        staging: { requested: 1, copied: 1, complete: true, skipped: [], deleted: [] },
      },
    ]);
    assert.equal(calls.length, 1);
    // The executor received the matched entry and a scrubbed env (no secrets).
    assert.equal(calls[0].entry.command, '/usr/bin/tool');
    assert.equal(calls[0].env.PATH, '/usr/bin');
  });

  test('fail → strictBlock true', async () => {
    const { impl } = mockExec({ '/usr/bin/tool': 'fail' });
    const result = await runDeterministicGates({
      trustedTree,
      selected: [skill('s1', '/usr/bin/tool', [])],
      reviewSourceDir: sourceDir,
      changedFiles: ['a.txt'],
      execImpl: impl,
    });
    assert.equal(result.strictBlock, true);
    assert.equal(result.deterministicUnrunnable, false);
  });

  test('unrunnable → deterministicUnrunnable true', async () => {
    const { impl } = mockExec({ '/usr/bin/tool': 'unrunnable' });
    const result = await runDeterministicGates({
      trustedTree,
      selected: [skill('s1', '/usr/bin/tool', [])],
      reviewSourceDir: sourceDir,
      changedFiles: ['a.txt'],
      execImpl: impl,
    });
    assert.equal(result.strictBlock, false);
    assert.equal(result.deterministicUnrunnable, true);
  });
});

describe('runDeterministicGates — allowlist matching', () => {
  test('command NOT on the allowlist is never executed', async () => {
    const trustedTree = await makeTrustedTree([{ command: '/usr/bin/allowed', args: [] }]);
    const sourceDir = await makeSourceDir();
    try {
      const { impl, calls } = mockExec({});
      const result = await runDeterministicGates({
        trustedTree,
        // skill references a command that is NOT in the trusted allowlist
        selected: [skill('s1', '/usr/bin/not-allowed', [])],
        reviewSourceDir: sourceDir,
        changedFiles: ['a.txt'],
        execImpl: impl,
      });
      assert.deepEqual(result, {
        strictBlock: false,
        deterministicUnrunnable: false,
        results: [],
      });
      assert.equal(calls.length, 0, 'unlisted command must not run');
    } finally {
      await fs.rm(trustedTree, { recursive: true, force: true });
      await fs.rm(sourceDir, { recursive: true, force: true });
    }
  });

  test('argv mismatch (different args) does not match → not executed', async () => {
    const trustedTree = await makeTrustedTree([{ command: '/usr/bin/tool', args: ['--check'] }]);
    const sourceDir = await makeSourceDir();
    try {
      const { impl, calls } = mockExec({});
      const result = await runDeterministicGates({
        trustedTree,
        selected: [skill('s1', '/usr/bin/tool', ['--other'])],
        reviewSourceDir: sourceDir,
        changedFiles: ['a.txt'],
        execImpl: impl,
      });
      assert.equal(result.results.length, 0);
      assert.equal(calls.length, 0);
    } finally {
      await fs.rm(trustedTree, { recursive: true, force: true });
      await fs.rm(sourceDir, { recursive: true, force: true });
    }
  });
});

describe('runDeterministicGates — aggregation over multiple skills', () => {
  test('one fail + one unrunnable → strictBlock AND deterministicUnrunnable both true', async () => {
    const trustedTree = await makeTrustedTree([
      { command: '/usr/bin/tool-fail', args: [] },
      { command: '/usr/bin/tool-unrunnable', args: [] },
    ]);
    const sourceDir = await makeSourceDir();
    try {
      const { impl, calls } = mockExec({
        '/usr/bin/tool-fail': 'fail',
        '/usr/bin/tool-unrunnable': 'unrunnable',
      });
      const result = await runDeterministicGates({
        trustedTree,
        selected: [
          skill('s-fail', '/usr/bin/tool-fail', []),
          skill('s-unrunnable', '/usr/bin/tool-unrunnable', []),
        ],
        reviewSourceDir: sourceDir,
        changedFiles: ['a.txt'],
        execImpl: impl,
      });
      assert.equal(result.strictBlock, true);
      assert.equal(result.deterministicUnrunnable, true);
      assert.equal(calls.length, 2);
      assert.equal(result.results.length, 2);
    } finally {
      await fs.rm(trustedTree, { recursive: true, force: true });
      await fs.rm(sourceDir, { recursive: true, force: true });
    }
  });
});

describe('runDeterministicGates — temp dir lifecycle', () => {
  test('sandbox temp dirs are created and cleaned up (observed via mocks)', async () => {
    const trustedTree = await makeTrustedTree([{ command: '/usr/bin/tool', args: [] }]);
    const sourceDir = await makeSourceDir();
    const created = [];
    // mkdtempImpl that actually creates real dirs so copy/cleanup can operate.
    const mkdtempImpl = async (prefix) => {
      const dir = await fs.mkdtemp(prefix);
      created.push(dir);
      return dir;
    };
    try {
      const { impl } = mockExec({ '/usr/bin/tool': 'pass' });
      await runDeterministicGates({
        trustedTree,
        selected: [skill('s1', '/usr/bin/tool', [])],
        reviewSourceDir: sourceDir,
        changedFiles: ['a.txt'],
        execImpl: impl,
        mkdtempImpl,
      });
      // Two temp dirs (clean cwd + empty HOME) created for the one command.
      assert.equal(created.length, 2, 'clean cwd + empty HOME created');
      // Both removed in finally.
      for (const dir of created) {
        await assert.rejects(() => fs.stat(dir), /ENOENT/, `temp dir ${dir} should be removed`);
      }
    } finally {
      await fs.rm(trustedTree, { recursive: true, force: true });
      await fs.rm(sourceDir, { recursive: true, force: true });
    }
  });

  test('temp dirs cleaned up even when execImpl throws', async () => {
    const trustedTree = await makeTrustedTree([{ command: '/usr/bin/tool', args: [] }]);
    const sourceDir = await makeSourceDir();
    const created = [];
    const mkdtempImpl = async (prefix) => {
      const dir = await fs.mkdtemp(prefix);
      created.push(dir);
      return dir;
    };
    try {
      const throwingExec = async () => {
        throw new Error('boom');
      };
      await assert.rejects(
        () =>
          runDeterministicGates({
            trustedTree,
            selected: [skill('s1', '/usr/bin/tool', [])],
            reviewSourceDir: sourceDir,
            changedFiles: ['a.txt'],
            execImpl: throwingExec,
            mkdtempImpl,
          }),
        /boom/
      );
      assert.equal(created.length, 2);
      for (const dir of created) {
        await assert.rejects(() => fs.stat(dir), /ENOENT/);
      }
    } finally {
      await fs.rm(trustedTree, { recursive: true, force: true });
      await fs.rm(sourceDir, { recursive: true, force: true });
    }
  });
});
