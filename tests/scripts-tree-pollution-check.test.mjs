import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSyncGuarded } from './helpers/spawn-guard.mjs';

// scripts/tree-pollution-check.sh を実プロセス実行で固定する。
// 使い捨ての git repo と使い捨ての manifest（基準線）を組み合わせ、
// (a) 基準線に載った npm ci 由来 / (b) CLI 書き込み先として既知 / (c) その他 の分類と
// exit code（0 = clean / 1 = (b)(c) あり / 64 = usage）を検査する。
// 分類パターンの根拠: docs/development/retrospectives/2026-09-04-05.md 改善 #1。
const SCRIPT = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'scripts',
  'tree-pollution-check.sh'
);

function git(cwd, ...args) {
  const res = spawnSyncGuarded('git', args, { cwd, encoding: 'utf8' });
  assert.equal(res.status, 0, `git ${args.join(' ')} failed: ${res.stderr}`);
  return res.stdout.trim();
}

// 追跡済み 1 件だけを持つ repo。.river/feedback と .river/memory は本リポジトリと
// 同じく gitignore し、「ignored でも (b) は拾う」経路を通す。
function makeRepo(t) {
  const repo = mkdtempSync(join(tmpdir(), 'rr-pollution-test-'));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  git(repo, 'init', '-q', '-b', 'main');
  git(repo, 'config', 'user.email', 'test@example.com');
  git(repo, 'config', 'user.name', 'test');
  writeFileSync(join(repo, '.gitignore'), '.river/feedback/*\n.river/memory/*\n');
  writeFileSync(join(repo, 'tracked.md'), 'x\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'init');
  return repo;
}

function touch(repo, rel) {
  mkdirSync(join(repo, dirname(rel)), { recursive: true });
  writeFileSync(join(repo, rel), 'x\n');
}

// manifest は worktree の外に置く（bootstrap と同じ規約: worktree 内だと gitignore 対象外で
// それ自体が汚染として数えられる）。RIVER_BOOTSTRAP_MANIFEST で場所を固定する。
function makeManifest(t, lines) {
  const dir = mkdtempSync(join(tmpdir(), 'rr-pollution-manifest-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = join(dir, 'manifest.txt');
  writeFileSync(file, ['# worker-bootstrap manifest', ...lines, ''].join('\n'));
  return file;
}

function run(repo, manifest, args = [repo]) {
  return spawnSyncGuarded('bash', [SCRIPT, ...args], {
    cwd: repo,
    encoding: 'utf8',
    env: {
      ...process.env,
      // HOME 配下の実 manifest を拾わないよう、基準線の場所を明示する。
      RIVER_WORKER_STATE_DIR: join(tmpdir(), 'rr-pollution-no-such-state-dir'),
      ...(manifest ? { RIVER_BOOTSTRAP_MANIFEST: manifest } : {}),
    },
  });
}

test('クリーンな worktree は exit 0', (t) => {
  const repo = makeRepo(t);
  const res = run(repo, makeManifest(t, []));
  assert.equal(res.status, 0, res.stdout + res.stderr);
  assert.match(res.stdout, /result: clean/);
});

test('(a) 基準線に載った skills/agent-skills/as-* は情報表示のみで exit 0', (t) => {
  const repo = makeRepo(t);
  touch(repo, 'skills/agent-skills/as-foo/SKILL.md');
  const res = run(repo, makeManifest(t, ['skills/agent-skills/as-foo/SKILL.md']));
  assert.equal(res.status, 0, res.stdout + res.stderr);
  assert.match(res.stdout, /\(a\) baseline generated output still present: 1/);
  assert.match(res.stdout, /\(b\) known CLI write targets, not in baseline: 0/);
});

for (const rel of [
  '.river/feedback/2026-09.jsonl',
  '.river/memory/index.json',
  '.agents/skills/x.md',
  'skills/agent-skills/as-new/SKILL.md',
]) {
  test(`(b) 基準線に無い CLI 書き込み先 ${rel} は exit 1`, (t) => {
    const repo = makeRepo(t);
    touch(repo, rel);
    const res = run(repo, makeManifest(t, []));
    assert.equal(res.status, 1, res.stdout + res.stderr);
    assert.match(res.stdout, /\(b\) known CLI write targets, not in baseline: 1/);
    assert.ok(res.stdout.includes(`    ${rel}`), `(b) 一覧に ${rel} が出ること`);
    assert.match(res.stdout, /\(c\) other untracked, not in baseline: 0/);
    // 削除はせず mv の案内だけを出す。script 側は `git rev-parse --show-toplevel` の実パス
    // （macOS では /var → /private/var）で出すので、こちらも realpath で比べる。
    assert.ok(
      res.stdout.includes(`mv "${join(realpathSync(repo), rel)}"`),
      'mv コマンドが提示されること'
    );
    assert.doesNotMatch(res.stdout, /\brm\b/);
  });
}

test('スペースを含むパスも引用されずに分類・mv 案内される', (t) => {
  const repo = makeRepo(t);
  // git は既定（core.quotePath=true）でスペース入りパスを "..." で囲む。
  // 囲まれたままだと case パターンに一致せず mv コマンドも壊れる。
  touch(repo, '.agents/my skill/x.md');
  touch(repo, 'scratch/no te.txt');
  const res = run(repo, makeManifest(t, []));
  assert.equal(res.status, 1, res.stdout + res.stderr);
  assert.match(res.stdout, /\(b\) known CLI write targets, not in baseline: 1/);
  assert.match(res.stdout, /\(c\) other untracked, not in baseline: 1/);
  assert.ok(res.stdout.includes('    .agents/my skill/x.md'));
  assert.ok(res.stdout.includes(`mv "${join(realpathSync(repo), 'scratch/no te.txt')}"`));
  assert.doesNotMatch(res.stdout, /\\"/, '引用エスケープが混入しないこと');
});

test('(c) その他の untracked は exit 1 で (c) に分類される', (t) => {
  const repo = makeRepo(t);
  touch(repo, 'scratch/notes.txt');
  const res = run(repo, makeManifest(t, []));
  assert.equal(res.status, 1, res.stdout + res.stderr);
  assert.match(res.stdout, /\(b\) known CLI write targets, not in baseline: 0/);
  assert.match(res.stdout, /\(c\) other untracked, not in baseline: 1/);
  assert.ok(res.stdout.includes('    scratch/notes.txt'));
});

test('基準線なしでは全 untracked を報告し、(a) は成立しない', (t) => {
  const repo = makeRepo(t);
  touch(repo, 'skills/agent-skills/as-foo/SKILL.md');
  touch(repo, 'scratch/notes.txt');
  const res = run(repo, null);
  assert.equal(res.status, 1, res.stdout + res.stderr);
  assert.match(res.stdout, /baseline: none/);
  assert.match(res.stdout, /\(a\) baseline generated output still present: 0/);
  assert.match(res.stdout, /\(b\) known CLI write targets, not in baseline: 1/);
  assert.match(res.stdout, /\(c\) other untracked, not in baseline: 1/);
});

test('基準線なしでもクリーンなら exit 0', (t) => {
  const repo = makeRepo(t);
  const res = run(repo, null);
  assert.equal(res.status, 0, res.stdout + res.stderr);
});

test('git worktree でないパスは exit 64', (t) => {
  const repo = makeRepo(t);
  const notRepo = mkdtempSync(join(tmpdir(), 'rr-pollution-notrepo-'));
  t.after(() => rmSync(notRepo, { recursive: true, force: true }));
  const res = run(repo, null, [notRepo]);
  assert.equal(res.status, 64, res.stdout + res.stderr);
  const tooMany = run(repo, null, [repo, repo]);
  assert.equal(tooMany.status, 64, tooMany.stdout + tooMany.stderr);
});
