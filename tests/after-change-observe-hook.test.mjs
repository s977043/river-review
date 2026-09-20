// .claude/hooks/after-change-observe.sh (#2275 PR-3C): the Claude Code
// PostToolUse boundary of the after-change checkpoint. The hook is driven for
// real here — a real git repo, a real payload on stdin, the real Node adapter
// and the real #1401 executor — because the one thing that must never happen
// (a host that did not opt in behaving differently) is a property of the
// script, not of the module it calls.

import { after, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ALLOWLIST_RELATIVE_PATH } from '../src/lib/deterministic-command-orchestrator.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');
const SCRIPT = path.join(REPO_ROOT, '.claude', 'hooks', 'after-change-observe.sh');
const TRUE_BIN = '/usr/bin/true';

const tempDirs = [];
after(() => {
  for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true });
});

const makeTempDir = (prefix) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
};

const run = (args, options) =>
  new Promise((resolve) => {
    execFile(args[0], args.slice(1), options, () => resolve());
  });

async function makeRepo() {
  const dir = makeTempDir('river-afterchange-repo-');
  const git = (...a) => run(['git', ...a], { cwd: dir });
  await git('init', '-q');
  await git('config', 'user.email', 'test@example.com');
  await git('config', 'user.name', 'test');
  await fsp.writeFile(path.join(dir, 'kept.txt'), 'kept\n', 'utf8');
  await fsp.writeFile(path.join(dir, 'gone.txt'), 'gone\n', 'utf8');
  await git('add', '-A');
  await git('commit', '-qm', 'init');
  // The working tree now modifies one file and DELETES another.
  await fsp.writeFile(path.join(dir, 'kept.txt'), 'changed\n', 'utf8');
  await fsp.rm(path.join(dir, 'gone.txt'));
  return dir;
}

function makeTrustedTree() {
  const dir = makeTempDir('river-afterchange-hook-trusted-');
  const allowlistPath = path.join(dir, ALLOWLIST_RELATIVE_PATH);
  fs.mkdirSync(path.dirname(allowlistPath), { recursive: true });
  fs.writeFileSync(
    allowlistPath,
    ['version: 1', 'commands:', `  - command: ${TRUE_BIN}`, '    selfContained: true'].join('\n'),
    'utf8'
  );
  return dir;
}

function makeSelectedFile() {
  const dir = makeTempDir('river-afterchange-selected-');
  const file = path.join(dir, 'selected.json');
  fs.writeFileSync(
    file,
    JSON.stringify([{ id: 'skill-true', metadata: { deterministicGate: { command: TRUE_BIN } } }]),
    'utf8'
  );
  return file;
}

async function runHook({ cwd, env, stdin = '' }) {
  const child = execFile('bash', [SCRIPT], { cwd, env }, () => {});
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (d) => (stdout += d));
  child.stderr.on('data', (d) => (stderr += d));
  child.stdin.end(stdin);
  const code = await new Promise((resolve) => child.on('close', resolve));
  return { code, stdout, stderr };
}

const evidenceIn = (tmp) => {
  const dir = path.join(tmp, 'river-review-after-change');
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')) : [];
};

const payload = (toolName) => JSON.stringify({ tool_name: toolName, tool_input: {} });

describe('after-change-observe.sh (#2275 PR-3C)', () => {
  test('MUTATION (c): without the opt-in it does nothing at all', async () => {
    const dir = await makeRepo();
    const tmp = makeTempDir('river-afterchange-tmp-');
    const result = await runHook({
      cwd: dir,
      // No RIVER_AFTER_CHANGE_OBSERVE: this is the state of every host today.
      env: { ...process.env, CLAUDE_PROJECT_DIR: dir, TMPDIR: tmp },
      stdin: payload('Write'),
    });
    assert.equal(result.code, 0);
    assert.equal(result.stdout, '');
    assert.deepEqual(evidenceIn(tmp), []);
  });

  test('an explicit opt-out value does not enable it either', async () => {
    const dir = await makeRepo();
    const tmp = makeTempDir('river-afterchange-tmp-');
    for (const value of ['0', 'true', '']) {
      const result = await runHook({
        cwd: dir,
        env: {
          ...process.env,
          RIVER_AFTER_CHANGE_OBSERVE: value,
          CLAUDE_PROJECT_DIR: dir,
          TMPDIR: tmp,
        },
        stdin: payload('Write'),
      });
      assert.equal(result.code, 0);
      assert.equal(result.stdout, '', `"${value}" produced output`);
    }
    assert.deepEqual(evidenceIn(tmp), []);
  });

  test('a non-edit tool is not an after-change event', async () => {
    const dir = await makeRepo();
    const tmp = makeTempDir('river-afterchange-tmp-');
    const result = await runHook({
      cwd: dir,
      env: {
        ...process.env,
        RIVER_AFTER_CHANGE_OBSERVE: '1',
        CLAUDE_PROJECT_DIR: dir,
        TMPDIR: tmp,
      },
      stdin: payload('Bash'),
    });
    assert.equal(result.code, 0);
    assert.equal(result.stdout, '');
    assert.deepEqual(evidenceIn(tmp), []);
  });

  test('opted in: a change that deletes a file produces a pass, not unrunnable', async () => {
    const dir = await makeRepo();
    const tmp = makeTempDir('river-afterchange-tmp-');
    const result = await runHook({
      cwd: dir,
      env: {
        ...process.env,
        RIVER_AFTER_CHANGE_OBSERVE: '1',
        RIVER_TRUSTED_TREE: makeTrustedTree(),
        RIVER_AFTER_CHANGE_SELECTED: makeSelectedFile(),
        CLAUDE_PROJECT_DIR: dir,
        TMPDIR: tmp,
      },
      stdin: payload('Edit'),
    });
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /\[river-review:after-change\] status=pass /);
    const files = evidenceIn(tmp);
    assert.equal(files.length, 1, `expected one evidence file, got ${files}`);
    const evidence = JSON.parse(
      fs.readFileSync(path.join(tmp, 'river-review-after-change', files[0]), 'utf8')
    );
    assert.equal(evidence.mode, 'observe');
    assert.equal(evidence.triggerId, 'after-change');
    assert.deepEqual(evidence.changedFiles, ['gone.txt', 'kept.txt']);
    // The deletion was DECLARED by the adapter, which is why this is a verdict.
    assert.deepEqual(evidence.checks[0].staging.deleted, ['gone.txt']);
    assert.equal(evidence.checks[0].status, 'pass');
    // The hook wrote nothing into the project tree.
    assert.ok(!fs.existsSync(path.join(dir, '.river')));
  });

  test('a missing prerequisite is reported, never a silent success', async () => {
    const outside = makeTempDir('river-afterchange-nogit-');
    const tmp = makeTempDir('river-afterchange-tmp-');
    const result = await runHook({
      cwd: outside,
      env: {
        ...process.env,
        RIVER_AFTER_CHANGE_OBSERVE: '1',
        CLAUDE_PROJECT_DIR: outside,
        TMPDIR: tmp,
      },
      stdin: payload('Write'),
    });
    assert.equal(result.code, 0);
    assert.match(result.stdout, /not run \(not a git repository\)/);
    assert.deepEqual(evidenceIn(tmp), []);
  });

  test('opted in with no selected check: skipped with a reason, never pass', async () => {
    const dir = await makeRepo();
    const tmp = makeTempDir('river-afterchange-tmp-');
    const result = await runHook({
      cwd: dir,
      env: {
        ...process.env,
        RIVER_AFTER_CHANGE_OBSERVE: '1',
        CLAUDE_PROJECT_DIR: dir,
        TMPDIR: tmp,
      },
      stdin: payload('MultiEdit'),
    });
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /status=skipped reason=no-deterministic-check-selected/);
  });
});
