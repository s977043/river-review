// scripts/plugin-task-checkpoint-hook.sh (#2054 PR-5): the Claude Code Stop
// adapter for the neutral `task-checkpoint` trigger. It writes a file (the
// Review Artifact under the temp dir), so its failure modes are injected here
// rather than assumed: every prerequisite that is missing must exit 0 without
// writing anything (fail-soft, never blocks the host session), and the happy
// path must produce an artifact pinned to `review-task`.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createTempGitRepo } from './helpers/temp-repo.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'plugin-task-checkpoint-hook.sh');

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

const artifactsIn = (tmp) => {
  const dir = path.join(tmp, 'river-review-task-checkpoint');
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')) : [];
};

describe('plugin-task-checkpoint-hook.sh (#2054 PR-5)', () => {
  test('happy path: emits a Review Artifact pinned to review-task and exits 0', async (t) => {
    const { dir, cleanup } = await createTempGitRepo({
      prefix: 'river-hook-checkpoint-',
      initialFiles: { 'src/app.js': 'export const value = 1;\n' },
      changedFiles: { 'src/app.js': 'export const value = 2;\n' },
    });
    t.after(cleanup);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'river-hook-tmp-'));
    t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));

    const result = await runHook({
      cwd: dir,
      env: { ...process.env, CLAUDE_PROJECT_DIR: dir, CLAUDE_PLUGIN_ROOT: REPO_ROOT, TMPDIR: tmp },
      stdin: JSON.stringify({ stop_hook_active: false }),
    });
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /pinned to entry review-task: /);
    const files = artifactsIn(tmp);
    assert.equal(files.length, 1, `expected one artifact, got ${files}`);
    const artifact = JSON.parse(
      fs.readFileSync(path.join(tmp, 'river-review-task-checkpoint', files[0]), 'utf8')
    );
    assert.equal(artifact.flow?.entry, 'review-task');
    assert.equal(artifact.flow?.id, 'task-completion-review');
    // The artifact stays out of the consumer's working tree.
    assert.ok(!fs.existsSync(path.join(dir, '.river')), 'hook wrote into the project tree');
  });

  test('RIVER_TASK_CHECKPOINT_HOOK=0 opts out: exits 0, no output, writes nothing', async (t) => {
    const { dir, cleanup } = await createTempGitRepo({
      prefix: 'river-hook-optout-',
      initialFiles: { 'src/app.js': 'export const value = 1;\n' },
      changedFiles: { 'src/app.js': 'export const value = 2;\n' },
    });
    t.after(cleanup);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'river-hook-tmp-'));
    t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
    const result = await runHook({
      cwd: dir,
      env: {
        ...process.env,
        CLAUDE_PROJECT_DIR: dir,
        CLAUDE_PLUGIN_ROOT: REPO_ROOT,
        TMPDIR: tmp,
        RIVER_TASK_CHECKPOINT_HOOK: '0',
      },
      stdin: '{}',
    });
    assert.equal(result.code, 0, result.stderr);
    assert.equal(result.stdout, '');
    assert.ok(
      !fs.existsSync(path.join(tmp, 'river-review-task-checkpoint')),
      'opt-out created the temp dir'
    );
  });

  test('temp dir is bounded: only the newest RIVER_TASK_CHECKPOINT_KEEP artifacts (and their logs) survive', async (t) => {
    const { dir, cleanup } = await createTempGitRepo({
      prefix: 'river-hook-keep-',
      initialFiles: { 'src/app.js': 'export const value = 1;\n' },
      changedFiles: { 'src/app.js': 'export const value = 2;\n' },
    });
    t.after(cleanup);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'river-hook-tmp-'));
    t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
    const outDir = path.join(tmp, 'river-review-task-checkpoint');
    fs.mkdirSync(outDir);
    // Five pre-existing runs, oldest first by timestamp-prefixed name, each with a log.
    const olds = [
      '20260101T000000Z-1',
      '20260102T000000Z-2',
      '20260103T000000Z-3',
      '20260104T000000Z-4',
      '20260105T000000Z-5',
    ];
    for (const name of olds) {
      fs.writeFileSync(path.join(outDir, `${name}.json`), '{}\n');
      fs.writeFileSync(path.join(outDir, `${name}.json.log`), '');
    }
    const result = await runHook({
      cwd: dir,
      env: {
        ...process.env,
        CLAUDE_PROJECT_DIR: dir,
        CLAUDE_PLUGIN_ROOT: REPO_ROOT,
        TMPDIR: tmp,
        RIVER_TASK_CHECKPOINT_KEEP: '3',
      },
      stdin: '{}',
    });
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /pinned to entry review-task/);
    const jsons = artifactsIn(tmp).sort();
    // 5 old - (5 - 3) dropped = 3 old kept, plus the one just written = 4.
    assert.equal(jsons.length, 4, jsons.join(','));
    assert.deepEqual(
      jsons.slice(0, 3),
      olds.slice(2).map((n) => `${n}.json`)
    );
    const logs = fs
      .readdirSync(outDir)
      .filter((f) => f.endsWith('.log'))
      .sort();
    assert.deepEqual(
      logs.slice(0, 3),
      olds.slice(2).map((n) => `${n}.json.log`)
    );
    assert.ok(
      !logs.some((f) => f.startsWith('20260101') || f.startsWith('20260102')),
      'old logs survived'
    );
  });

  test('RIVER_TASK_CHECKPOINT_KEEP that is not a non-negative integer falls back to 20 and never exits 1 (#2119)', async (t) => {
    const { dir, cleanup } = await createTempGitRepo({
      prefix: 'river-hook-keep-bad-',
      initialFiles: { 'src/app.js': 'export const value = 1;\n' },
      changedFiles: { 'src/app.js': 'export const value = 2;\n' },
    });
    t.after(cleanup);
    // `abc` / `1.5` used to abort with `unbound variable` (exit 1) under
    // `set -u`; `-1` used to drop every artifact; `0` and '' are legal forms
    // that must keep working. All five are exercised so the fail-soft contract
    // of the Stop hook holds for any KEEP value.
    for (const keep of ['abc', '1.5', '-1', '0', '']) {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'river-hook-tmp-'));
      t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
      const outDir = path.join(tmp, 'river-review-task-checkpoint');
      fs.mkdirSync(outDir);
      // 25 pre-existing artifacts: with the default of 20, 5 are dropped and
      // 20 + the one just written = 21 remain.
      const olds = Array.from(
        { length: 25 },
        (_, i) => `202601${String(i + 1).padStart(2, '0')}T000000Z-${i}`
      );
      for (const name of olds) fs.writeFileSync(path.join(outDir, `${name}.json`), '{}\n');
      const result = await runHook({
        cwd: dir,
        env: {
          ...process.env,
          CLAUDE_PROJECT_DIR: dir,
          CLAUDE_PLUGIN_ROOT: REPO_ROOT,
          TMPDIR: tmp,
          RIVER_TASK_CHECKPOINT_KEEP: keep,
        },
        stdin: '{}',
      });
      assert.equal(result.code, 0, `KEEP=${JSON.stringify(keep)}: ${result.stderr}`);
      assert.match(result.stdout, /pinned to entry review-task/, `KEEP=${JSON.stringify(keep)}`);
      const jsons = artifactsIn(tmp).sort();
      if (keep === '0') {
        assert.equal(
          jsons.length,
          1,
          `KEEP=0 must keep only the new artifact, got ${jsons.length}`
        );
      } else {
        assert.equal(
          jsons.length,
          21,
          `KEEP=${JSON.stringify(keep)}: expected 20 old + 1 new, got ${jsons.length}`
        );
        assert.deepEqual(
          jsons.slice(0, 20),
          olds.slice(5).map((n) => `${n}.json`)
        );
      }
    }
  });

  test('stop_hook_active=true: exits 0 immediately and writes nothing', async (t) => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'river-hook-tmp-'));
    t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
    const result = await runHook({
      cwd: REPO_ROOT,
      env: {
        ...process.env,
        CLAUDE_PROJECT_DIR: REPO_ROOT,
        CLAUDE_PLUGIN_ROOT: REPO_ROOT,
        TMPDIR: tmp,
      },
      stdin: JSON.stringify({ stop_hook_active: true }),
    });
    assert.equal(result.code, 0);
    assert.equal(result.stdout, '');
    assert.deepEqual(artifactsIn(tmp), []);
  });

  test('CLI unavailable (no plugin node_modules, no npm install): exits 0 with a notice, writes nothing', async (t) => {
    const { dir, cleanup } = await createTempGitRepo({
      prefix: 'river-hook-nocli-',
      initialFiles: { 'src/app.js': 'export const value = 1;\n' },
    });
    t.after(cleanup);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'river-hook-tmp-'));
    t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
    // A plugin root that has src/cli.mjs but no node_modules.
    const pluginRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'river-hook-plugin-'));
    t.after(() => fs.rmSync(pluginRoot, { recursive: true, force: true }));
    fs.mkdirSync(path.join(pluginRoot, 'src'));
    fs.writeFileSync(path.join(pluginRoot, 'src', 'cli.mjs'), '');

    const result = await runHook({
      cwd: dir,
      env: { ...process.env, CLAUDE_PROJECT_DIR: dir, CLAUDE_PLUGIN_ROOT: pluginRoot, TMPDIR: tmp },
      stdin: '{}',
    });
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /CLI not available/);
    assert.deepEqual(artifactsIn(tmp), []);
  });

  test('not a git repository: exits 0 with a notice, writes nothing', async (t) => {
    const plain = fs.mkdtempSync(path.join(os.tmpdir(), 'river-hook-nogit-'));
    t.after(() => fs.rmSync(plain, { recursive: true, force: true }));
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'river-hook-tmp-'));
    t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
    const result = await runHook({
      cwd: plain,
      env: {
        ...process.env,
        CLAUDE_PROJECT_DIR: plain,
        CLAUDE_PLUGIN_ROOT: REPO_ROOT,
        TMPDIR: tmp,
      },
      stdin: '{}',
    });
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /not a git repository/);
    assert.deepEqual(artifactsIn(tmp), []);
  });

  test('CLI failure is fail-soft: exits 0, reports, keeps the log, never blocks', async (t) => {
    const { dir, cleanup } = await createTempGitRepo({
      prefix: 'river-hook-clifail-',
      initialFiles: { 'src/app.js': 'export const value = 1;\n' },
    });
    t.after(cleanup);
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'river-hook-tmp-'));
    t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
    // Injected failure: point the loader at a flows directory that does not
    // exist, so `review plan --entry` exits 1 with `flows directory not found`.
    const result = await runHook({
      cwd: dir,
      env: {
        ...process.env,
        CLAUDE_PROJECT_DIR: dir,
        CLAUDE_PLUGIN_ROOT: REPO_ROOT,
        TMPDIR: tmp,
        RIVER_FLOWS_DIR: path.join(tmp, 'no-such-flows'),
      },
      stdin: '{}',
    });
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /did not complete \(see .*\.log\), continuing/);
    assert.deepEqual(artifactsIn(tmp), [], 'a failed run must not leave an artifact');
    const logs = fs
      .readdirSync(path.join(tmp, 'river-review-task-checkpoint'))
      .filter((f) => f.endsWith('.log'));
    assert.equal(logs.length, 1);
    assert.match(
      fs.readFileSync(path.join(tmp, 'river-review-task-checkpoint', logs[0]), 'utf8'),
      /flows directory not found/
    );
  });
});
