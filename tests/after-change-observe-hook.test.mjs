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

  test('B1: a tracked edit mixed with a NEW file puts the new file in the evidence', async () => {
    const dir = await makeRepo();
    // The most common PostToolUse(Write): a brand-new file, invisible to
    // `git diff --name-status HEAD`. Mixed with a tracked edit the run is not
    // empty, so before this fix it published `pass` over only `tracked.txt`.
    await fsp.writeFile(path.join(dir, 'brand-new.mjs'), 'export const x = 1;\n', 'utf8');
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
      stdin: payload('Write'),
    });
    assert.equal(result.code, 0, result.stderr);
    const evidence = JSON.parse(
      fs.readFileSync(path.join(tmp, 'river-review-after-change', evidenceIn(tmp)[0]), 'utf8')
    );
    assert.ok(
      evidence.changedFiles.includes('brand-new.mjs'),
      `new file missing from evidence: ${JSON.stringify(evidence.changedFiles)}`
    );
    assert.deepEqual(evidence.changedFiles, ['brand-new.mjs', 'gone.txt', 'kept.txt']);
    assert.equal(evidence.checks[0].staging.requested, 2);
    assert.equal(evidence.checks[0].status, 'pass');
  });

  test('M1: a non-ASCII path reaches the checkpoint verbatim, not git-quoted', async () => {
    const dir = await makeRepo();
    await fsp.writeFile(path.join(dir, '日本語.txt'), 'new\n', 'utf8');
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
      stdin: payload('Write'),
    });
    assert.equal(result.code, 0, result.stderr);
    const evidence = JSON.parse(
      fs.readFileSync(path.join(tmp, 'river-review-after-change', evidenceIn(tmp)[0]), 'utf8')
    );
    assert.ok(evidence.changedFiles.includes('日本語.txt'), JSON.stringify(evidence.changedFiles));
    assert.ok(!evidence.changedFiles.some((f) => f.includes('\\3')), 'octal-escaped path leaked');
    assert.equal(evidence.checks[0].status, 'pass');
  });

  test('M2: jq missing is reported, not a silent skip', async () => {
    const dir = await makeRepo();
    const tmp = makeTempDir('river-afterchange-tmp-');
    // A PATH holding node and git but no jq. Before the fix the jq check sat
    // INSIDE the tool-name extraction, so the tool name came back empty and
    // the script fell through `case *)` and exited saying nothing at all.
    const binDir = makeTempDir('river-afterchange-bin-');
    for (const tool of ['bash', 'node', 'git', 'base64', 'tr', 'date', 'cat', 'dirname', 'pwd']) {
      const real = fs.existsSync(`/usr/bin/${tool}`) ? `/usr/bin/${tool}` : null;
      const resolved = real ?? `/bin/${tool}`;
      if (fs.existsSync(resolved)) fs.symlinkSync(resolved, path.join(binDir, tool));
    }
    fs.symlinkSync(process.execPath, path.join(binDir, 'node-real'));
    fs.rmSync(path.join(binDir, 'node'), { force: true });
    fs.symlinkSync(process.execPath, path.join(binDir, 'node'));
    const result = await runHook({
      cwd: dir,
      env: {
        ...process.env,
        PATH: binDir,
        RIVER_AFTER_CHANGE_OBSERVE: '1',
        CLAUDE_PROJECT_DIR: dir,
        TMPDIR: tmp,
      },
      stdin: payload('Write'),
    });
    assert.equal(result.code, 0);
    assert.match(result.stdout, /not run \(jq not found\)/);
    assert.deepEqual(evidenceIn(tmp), []);
  });

  test('M2: an unreadable payload is reported, not a silent skip', async () => {
    const dir = await makeRepo();
    const tmp = makeTempDir('river-afterchange-tmp-');
    const env = {
      ...process.env,
      RIVER_AFTER_CHANGE_OBSERVE: '1',
      CLAUDE_PROJECT_DIR: dir,
      TMPDIR: tmp,
    };
    const empty = await runHook({ cwd: dir, env, stdin: '' });
    assert.match(empty.stdout, /not run \(empty hook payload\)/);
    const broken = await runHook({ cwd: dir, env, stdin: 'not json' });
    assert.match(broken.stdout, /not run \(tool name unreadable in payload\)/);
    const noTool = await runHook({ cwd: dir, env, stdin: JSON.stringify({ tool_input: {} }) });
    assert.match(noTool.stdout, /not run \(tool name unreadable in payload\)/);
    assert.deepEqual(evidenceIn(tmp), []);
  });

  test('M3: evidence is private and is not written through a planted symlink', async () => {
    const dir = await makeRepo();
    const tmp = makeTempDir('river-afterchange-tmp-');
    const elsewhere = makeTempDir('river-afterchange-elsewhere-');
    // Another local user gets there first with a symlink into their own dir.
    fs.symlinkSync(elsewhere, path.join(tmp, 'river-review-after-change'));
    const result = await runHook({
      cwd: dir,
      env: {
        ...process.env,
        RIVER_AFTER_CHANGE_OBSERVE: '1',
        CLAUDE_PROJECT_DIR: dir,
        TMPDIR: tmp,
      },
      stdin: payload('Write'),
    });
    assert.equal(result.code, 0);
    assert.match(result.stdout, /not run \(evidence directory is a symlink\)/);
    assert.deepEqual(fs.readdirSync(elsewhere), [], 'evidence followed the symlink');
  });

  test('M3: the evidence directory and file are private (0700 / 0600)', async () => {
    const dir = await makeRepo();
    const tmp = makeTempDir('river-afterchange-tmp-');
    await runHook({
      cwd: dir,
      env: {
        ...process.env,
        RIVER_AFTER_CHANGE_OBSERVE: '1',
        CLAUDE_PROJECT_DIR: dir,
        TMPDIR: tmp,
      },
      stdin: payload('Write'),
    });
    const outDir = path.join(tmp, 'river-review-after-change');
    assert.equal(fs.statSync(outDir).mode & 0o777, 0o700);
    const file = path.join(outDir, evidenceIn(tmp)[0]);
    assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  });

  test('Minor 1: an unborn HEAD is reported, not recorded as the literal "HEAD"', async () => {
    const dir = makeTempDir('river-afterchange-unborn-');
    await run(['git', 'init', '-q'], { cwd: dir });
    await fsp.writeFile(path.join(dir, 'a.txt'), 'a\n', 'utf8');
    const tmp = makeTempDir('river-afterchange-tmp-');
    const result = await runHook({
      cwd: dir,
      env: {
        ...process.env,
        RIVER_AFTER_CHANGE_OBSERVE: '1',
        CLAUDE_PROJECT_DIR: dir,
        TMPDIR: tmp,
      },
      stdin: payload('Write'),
    });
    assert.equal(result.code, 0);
    assert.match(result.stdout, /not run \(subject revision unreadable\)/);
    assert.deepEqual(evidenceIn(tmp), []);
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
