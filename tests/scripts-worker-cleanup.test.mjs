import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSyncGuarded } from './helpers/spawn-guard.mjs';

// scripts/worker-cleanup.sh を実プロセス実行で固定する。
// 使い捨ての bare origin + clone を fixture にし、worktree は scripts/worker-bootstrap.sh
// 本体で作る（#2119）。これで slug 導出（`tr '/' '-'`）が両 script で一致することを、
// `/` を 2 個含む branch 名で突合できる（cleanup が bootstrap の置いた path を消せるか）。
// exit code 契約（0 = 完了 / 1 = 拒否・失敗 / 64 = usage・保護ブランチ）を検査する。
const SCRIPTS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts');
const SCRIPT = join(SCRIPTS_DIR, 'worker-cleanup.sh');
const BOOTSTRAP = join(SCRIPTS_DIR, 'worker-bootstrap.sh');

const BRANCH = 'feat/a/b';
const SLUG = 'feat-a-b';

function git(cwd, ...args) {
  const res = spawnSyncGuarded('git', args, { cwd, encoding: 'utf8' });
  assert.equal(res.status, 0, `git ${args.join(' ')} failed: ${res.stderr}`);
  return res.stdout.trim();
}

// bare origin + main checkout（.claude/ 付き）+ 作業 worktree + 基準線 manifest。
function makeFixture(t) {
  const base = realpathSync(mkdtempSync(join(tmpdir(), 'rr-cleanup-test-')));
  t.after(() => rmSync(base, { recursive: true, force: true }));
  const origin = join(base, 'origin.git');
  const main = join(base, 'main');
  const stateDir = join(base, 'state');
  git(base, 'init', '-q', '--bare', '-b', 'main', origin);
  git(base, 'clone', '-q', origin, main);
  git(main, 'config', 'user.email', 'test@example.com');
  git(main, 'config', 'user.name', 'test');
  writeFileSync(join(main, 'tracked.md'), 'x\n');
  // bootstrap は worktree で `npm ci` を実行するため、依存ゼロの package.json と
  // lockfile を置いて数秒で終わるようにする。
  writeFileSync(
    join(main, 'package.json'),
    JSON.stringify({ name: 'fx', version: '1.0.0', private: true }) + '\n'
  );
  writeFileSync(
    join(main, 'package-lock.json'),
    JSON.stringify({
      name: 'fx',
      version: '1.0.0',
      lockfileVersion: 3,
      requires: true,
      packages: { '': { name: 'fx', version: '1.0.0' } },
    }) + '\n'
  );
  git(main, 'add', '-A');
  git(main, 'commit', '-q', '-m', 'init');
  git(main, 'push', '-q', '-u', 'origin', 'main');
  mkdirSync(join(main, '.claude', 'worktrees'), { recursive: true });
  const boot = spawnSyncGuarded('bash', [BOOTSTRAP, BRANCH], {
    cwd: main,
    encoding: 'utf8',
    env: { ...process.env, RIVER_WORKER_STATE_DIR: stateDir },
    timeout: 120_000,
  });
  assert.equal(boot.status, 0, `bootstrap failed: ${boot.stdout}${boot.stderr}`);
  // bootstrap が置いた場所（slug 化した path）を cleanup 側の導出で参照する。
  const worktree = join(main, '.claude', 'worktrees', SLUG);
  assert.equal(existsSync(worktree), true, `bootstrap did not create ${worktree}: ${boot.stdout}`);
  const manifest = join(stateDir, `worker-bootstrap-${SLUG}.txt`);
  assert.equal(existsSync(manifest), true, `bootstrap did not write ${manifest}`);
  return { base, origin, main, worktree, stateDir, manifest };
}

function run(fx, args = [BRANCH]) {
  return spawnSyncGuarded('bash', [SCRIPT, ...args], {
    cwd: fx.main,
    encoding: 'utf8',
    env: { ...process.env, RIVER_WORKER_STATE_DIR: fx.stateDir },
  });
}

function hasWorktree(fx) {
  return git(fx.main, 'worktree', 'list', '--porcelain').includes(`worktree ${fx.worktree}`);
}

function hasBranch(fx) {
  const res = spawnSyncGuarded('git', ['show-ref', '--verify', '--quiet', `refs/heads/${BRANCH}`], {
    cwd: fx.main,
    encoding: 'utf8',
  });
  return res.status === 0;
}

test('クリーンな worktree は remove + branch -D + manifest 退避で exit 0', (t) => {
  const fx = makeFixture(t);
  const res = run(fx);
  assert.equal(res.status, 0, res.stdout + res.stderr);
  assert.equal(hasWorktree(fx), false, 'worktree should be unregistered');
  assert.equal(existsSync(fx.worktree), false, 'worktree dir should be gone');
  assert.equal(hasBranch(fx), false, 'local branch should be deleted');
  assert.equal(existsSync(fx.manifest), false, 'manifest should be moved out');
  assert.equal(existsSync(join(fx.stateDir, 'archive', `worker-bootstrap-${SLUG}.txt`)), true);
  assert.match(res.stdout, /== 4\. merge --ff-only origin\/main/);
  // bootstrap が置いた path そのものを消している（slug 導出が両 script で一致）。
  assert.match(res.stdout, new RegExp(`removed: .*/\\.claude/worktrees/${SLUG}$`, 'm'));
});

test('origin/main が進んでいれば fetch してから ff し、main が origin/main に揃って exit 0', (t) => {
  const fx = makeFixture(t);
  // 別 clone から origin/main を進める（PR マージ後の典型形）。
  const other = join(fx.base, 'other');
  git(fx.base, 'clone', '-q', fx.origin, other);
  git(other, 'config', 'user.email', 'test@example.com');
  git(other, 'config', 'user.name', 'test');
  writeFileSync(join(other, 'merged.md'), 'm\n');
  git(other, 'add', '-A');
  git(other, 'commit', '-q', '-m', 'merged');
  git(other, 'push', '-q', 'origin', 'main');
  const remoteHead = git(other, 'rev-parse', 'HEAD');
  const res = run(fx);
  assert.equal(res.status, 0, res.stdout + res.stderr);
  assert.equal(
    git(fx.main, 'rev-parse', 'HEAD'),
    remoteHead,
    'local main should fast-forward to origin/main'
  );
  assert.equal(hasWorktree(fx), false, 'worktree should be unregistered');
  assert.equal(hasBranch(fx), false, 'local branch should be deleted');
});

test('local main が origin/main より進んでいれば（ff 不能）何も消さず exit 1（#2119）', (t) => {
  const fx = makeFixture(t);
  // 未 push の commit を local main に置く: merge --ff-only は失敗する。
  writeFileSync(join(fx.main, 'ahead.md'), 'a\n');
  git(fx.main, 'add', '-A');
  git(fx.main, 'commit', '-q', '-m', 'ahead');
  const res = run(fx);
  assert.equal(res.status, 1, res.stdout + res.stderr);
  assert.match(res.stderr, /not an ancestor of origin\/main/);
  assert.match(res.stderr, /Nothing was changed/);
  assert.doesNotMatch(res.stdout, /removed:|deleted:|archived:/);
  assert.equal(hasWorktree(fx), true, 'worktree must survive');
  assert.equal(existsSync(fx.worktree), true, 'worktree dir must survive');
  assert.equal(hasBranch(fx), true, 'branch must survive');
  assert.equal(existsSync(fx.manifest), true, 'manifest must stay');
});

test('locked worktree は remove せず unlock の手順を出して exit 1（#2119）', (t) => {
  const fx = makeFixture(t);
  git(fx.main, 'worktree', 'lock', fx.worktree);
  const res = run(fx);
  assert.equal(res.status, 1, res.stdout + res.stderr);
  assert.match(res.stderr, /git worktree remove failed/);
  assert.match(res.stderr, /worktree unlock/);
  assert.equal(hasWorktree(fx), true, 'worktree must survive');
  assert.equal(hasBranch(fx), true, 'branch must survive');
  assert.equal(existsSync(fx.manifest), true, 'manifest must stay');
});

test('worktree に未 commit 変更があれば remove せず一覧を出して exit 1', (t) => {
  const fx = makeFixture(t);
  writeFileSync(join(fx.worktree, 'dirty.txt'), 'y\n');
  const res = run(fx);
  assert.equal(res.status, 1, res.stdout + res.stderr);
  assert.match(res.stderr, /uncommitted changes/);
  assert.match(res.stderr, /dirty\.txt/);
  assert.equal(hasWorktree(fx), true, 'worktree must survive');
  assert.equal(hasBranch(fx), true, 'branch must survive');
  assert.equal(existsSync(fx.manifest), true, 'manifest must stay');
});

test('main checkout が main 以外にいれば何もせず exit 1', (t) => {
  const fx = makeFixture(t);
  git(fx.main, 'switch', '-q', '-c', 'other');
  const res = run(fx);
  assert.equal(res.status, 1, res.stdout + res.stderr);
  assert.match(res.stderr, /not 'main'/);
  assert.equal(hasWorktree(fx), true, 'worktree must survive');
  assert.equal(hasBranch(fx), true, 'branch must survive');
  assert.equal(existsSync(fx.manifest), true, 'manifest must stay');
});

test('main / master / release-please--* は exit 64 で拒否', (t) => {
  const fx = makeFixture(t);
  for (const name of ['main', 'master', 'release-please--branches--main']) {
    const res = run(fx, [name]);
    assert.equal(res.status, 64, `${name}: ${res.stdout}${res.stderr}`);
    assert.match(res.stderr, /protected branch/);
  }
  assert.equal(hasWorktree(fx), true, 'worktree must survive');
});

test('引数なしは exit 64', (t) => {
  const fx = makeFixture(t);
  const res = run(fx, []);
  assert.equal(res.status, 64, res.stdout + res.stderr);
});
