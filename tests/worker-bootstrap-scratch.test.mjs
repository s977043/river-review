import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSyncGuarded } from './helpers/spawn-guard.mjs';

// scripts/worker-bootstrap.sh の scratch dir を実プロセスで固定する。
// 使い捨て repo には .nvmrc を置かず、node と npm は stub にして実の npm ci を走らせない。
const SCRIPT = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'scripts',
  'worker-bootstrap.sh'
);

function git(cwd, ...args) {
  const res = spawnSyncGuarded('git', args, { cwd, encoding: 'utf8' });
  assert.equal(res.status, 0, `git ${args.join(' ')} failed: ${res.stderr}`);
}

function stub(bin, name, body) {
  writeFileSync(join(bin, name), `#!/usr/bin/env bash\n${body}\n`);
  chmodSync(join(bin, name), 0o755);
}

function setup(t, { npmExit = 0 } = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'rr-bootstrap-scratch-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const repo = join(root, 'repo');
  const bin = join(root, 'bin');
  const tmp = join(root, 'tmp');
  for (const dir of [repo, bin, tmp]) mkdirSync(dir);
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, 'config', 'user.email', 'test@example.com');
  git(repo, 'config', 'user.name', 'test');
  git(repo, 'commit', '-q', '--allow-empty', '-m', 'init');
  stub(bin, 'node', 'echo v22.22.2');
  stub(bin, 'npm', `exit ${npmExit}`);
  return { bin, repo, root, tmp };
}

function run(ctx, args, tmpValue = ctx.tmp) {
  return spawnSyncGuarded('bash', [SCRIPT, ...args], {
    cwd: ctx.repo,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${ctx.bin}:${process.env.PATH}`,
      RIVER_WORKER_STATE_DIR: join(ctx.root, 'state'),
      RIVER_WORKER_SCRATCH_ROOT: tmpValue,
    },
  });
}

function scratchPath(stdout) {
  const match = stdout.match(/^scratch: (.+)$/m);
  assert.ok(match, `scratch の行が標準出力に無い:\n${stdout}`);
  return match[1];
}

describe('scripts/worker-bootstrap.sh の scratch dir', () => {
  test('別ブランチの 2 回で別のパスになり、どちらも実在して worktree の外にある', (t) => {
    const ctx = setup(t);
    const first = run(ctx, ['feat/one', '--base', 'main']);
    const second = run(ctx, ['feat/two', '--base', 'main']);
    assert.equal(first.status, 0, first.stdout + first.stderr);
    assert.equal(second.status, 0, second.stdout + second.stderr);

    const paths = [scratchPath(first.stdout), scratchPath(second.stdout)];
    assert.notEqual(paths[0], paths[1]);
    const worktrees = ['feat-one', 'feat-two'].map((slug) =>
      join(ctx.repo, '.claude', 'worktrees', slug)
    );
    paths.forEach((path, i) => {
      assert.ok(existsSync(path), `${path} が作られていない`);
      const fromWorktree = relative(worktrees[i], path);
      assert.ok(
        fromWorktree.startsWith('..') || isAbsolute(fromWorktree),
        `${path} が worktree の中にある`
      );
    });
  });

  test('scratch の場所の末尾スラッシュでパスが崩れない', (t) => {
    const ctx = setup(t);
    const res = run(ctx, ['feat/one', '--base', 'main'], `${ctx.tmp}/`);
    assert.equal(res.status, 0, res.stdout + res.stderr);
    assert.doesNotMatch(scratchPath(res.stdout), /\/\//);
  });

  test('同じブランチの再実行は同じパスを使い、中身を消さない', (t) => {
    const ctx = setup(t);
    const first = run(ctx, ['feat/one', '--base', 'main']);
    const path = scratchPath(first.stdout);
    writeFileSync(join(path, 'keep.txt'), 'x');
    const second = run(ctx, ['feat/one', '--base', 'main']);
    assert.equal(second.status, 0, second.stdout + second.stderr);
    assert.equal(scratchPath(second.stdout), path);
    assert.ok(existsSync(join(path, 'keep.txt')));
  });

  test('既存の exit code を保つ: usage は 64、npm ci の失敗は 1', (t) => {
    const usage = run(setup(t), []);
    assert.equal(usage.status, 64, usage.stdout + usage.stderr);
    const npmFailure = run(setup(t, { npmExit: 1 }), ['feat/one', '--base', 'main']);
    assert.equal(npmFailure.status, 1, npmFailure.stdout + npmFailure.stderr);
  });

  test('scratch dir を作れないときは exit 1', (t) => {
    const ctx = setup(t);
    const notDir = join(ctx.root, 'not-a-dir');
    writeFileSync(notDir, 'x');
    const res = run(ctx, ['feat/one', '--base', 'main'], notDir);
    assert.equal(res.status, 1, res.stdout + res.stderr);
    assert.match(res.stderr, /could not create scratch dir/);
  });

  test('別の repo の同名ブランチは別のパスになり、同じ repo では安定する', (t) => {
    const a = setup(t);
    const b = setup(t);
    const pathA = scratchPath(run(a, ['feat/one', '--base', 'main'], a.tmp).stdout);
    const pathB = scratchPath(run(b, ['feat/one', '--base', 'main'], a.tmp).stdout);
    assert.notEqual(pathA, pathB);
    assert.equal(scratchPath(run(a, ['feat/one', '--base', 'main'], a.tmp).stdout), pathA);
  });

  test('既定の場所は TMPDIR ではなく /tmp で、repo 単位の dir は本人だけが読める', (t) => {
    const ctx = setup(t);
    const env = { ...process.env, PATH: `${ctx.bin}:${process.env.PATH}`, TMPDIR: ctx.tmp };
    env.RIVER_WORKER_STATE_DIR = join(ctx.root, 'state');
    delete env.RIVER_WORKER_SCRATCH_ROOT;
    const res = spawnSyncGuarded('bash', [SCRIPT, 'feat/one', '--base', 'main'], {
      cwd: ctx.repo,
      encoding: 'utf8',
      env,
    });
    assert.equal(res.status, 0, res.stdout + res.stderr);
    const path = scratchPath(res.stdout);
    const repoDir = dirname(path);
    t.after(() => rmSync(repoDir, { recursive: true, force: true }));
    const expectedRoot = `/tmp/river-review-workers-${process.getuid()}/`; // code-hygiene-ignore
    assert.ok(path.startsWith(expectedRoot), path);
    assert.ok(existsSync(path));
    assert.equal(statSync(repoDir).mode & 0o777, 0o700);
  });
});
