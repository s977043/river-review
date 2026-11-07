import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSyncGuarded } from './helpers/spawn-guard.mjs';

// scripts/preflight.sh を実プロセスで固定する。git は使い捨ての origin と clone の実物を使い、
// gh だけを stub にする。stub は実 API と同じ形の JSON を返すので、jq の読み取りも検査対象に入る。
const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'preflight.sh');

const GH_STUB = `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "\${GH_STUB_LOG}"
route=""
case "$1 $2" in
  "api repos/{owner}/{repo}/pulls/"*) route="pull-\${2##*/}" ;;
  "api repos/{owner}/{repo}/issues/"*) route="issue-\${2##*/}" ;;
  "pr list") route="list-$4" ;;
esac
if [ -z "\${route}" ] || [ "\${GH_STUB_FAIL:-}" = "\${route}" ]; then
  echo "stub gh failure: $*" >&2
  exit 1
fi
if [ -f "\${GH_STUB_DIR}/\${route}" ]; then
  cat "\${GH_STUB_DIR}/\${route}"
elif [ "\${route#list-}" != "\${route}" ]; then
  echo '[]'
else
  echo "stub gh: no fixture for \${route}" >&2
  exit 1
fi
`;

function git(cwd, ...args) {
  const res = spawnSyncGuarded('git', args, { cwd, encoding: 'utf8' });
  assert.equal(res.status, 0, `git ${args.join(' ')} failed: ${res.stderr}`);
  return res.stdout.trim();
}

function commit(repo, subject) {
  git(repo, 'commit', '-q', '--allow-empty', '-m', subject);
}

function setup(t) {
  const root = mkdtempSync(join(tmpdir(), 'rr-preflight-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const origin = join(root, 'origin.git');
  const seed = join(root, 'seed');
  const clone = join(root, 'clone');
  const bin = join(root, 'bin');
  const fixtures = join(root, 'fixtures');
  mkdirSync(seed);
  mkdirSync(bin);
  mkdirSync(fixtures);
  git(root, 'init', '-q', '--bare', '-b', 'main', origin);
  git(seed, 'init', '-q', '-b', 'main');
  git(seed, 'config', 'user.email', 'test@example.com');
  git(seed, 'config', 'user.name', 'test');
  commit(seed, 'chore: initial commit');
  git(seed, 'remote', 'add', 'origin', origin);
  git(seed, 'push', '-q', 'origin', 'main');
  git(root, 'clone', '-q', origin, clone);
  writeFileSync(join(bin, 'gh'), GH_STUB);
  chmodSync(join(bin, 'gh'), 0o755);
  const log = join(root, 'gh.log');
  writeFileSync(log, '');
  return { bin, clone, fixtures, log, seed };
}

function fixture(ctx, route, value) {
  const body = typeof value === 'string' ? value : JSON.stringify(value);
  writeFileSync(join(ctx.fixtures, route), body);
}

function run(ctx, args, env = {}) {
  return spawnSyncGuarded('bash', [SCRIPT, ...args], {
    cwd: ctx.clone,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${ctx.bin}:${process.env.PATH}`,
      GH_STUB_DIR: ctx.fixtures,
      GH_STUB_LOG: ctx.log,
      ...env,
    },
  });
}

function ghCalls(ctx) {
  return readFileSync(ctx.log, 'utf8').split('\n').filter(Boolean);
}

const OPEN_PR = { state: 'open', merged: false };
const MERGED_PR = { state: 'closed', merged: true };
const CLOSED_PR = { state: 'closed', merged: false };
const hit = (number) => ({
  number,
  title: `feat: similar work ${number}`,
  headRefName: `feat/similar-${number}`,
  author: { login: 'someone' },
});

describe('scripts/preflight.sh', () => {
  test('全 open で類似なしは exit 0 / SAFE', (t) => {
    const ctx = setup(t);
    fixture(ctx, 'pull-1', OPEN_PR);
    const res = run(ctx, ['1', 'no-such-keyword']);
    assert.equal(res.status, 0, res.stdout + res.stderr);
    assert.match(res.stdout, /verdict: SAFE/);
  });

  test('merged の PR は exit 1 / OBSOLETE で、state は REST から読む', (t) => {
    const ctx = setup(t);
    fixture(ctx, 'pull-7', MERGED_PR);
    const res = run(ctx, ['7']);
    assert.equal(res.status, 1, res.stdout + res.stderr);
    assert.match(res.stdout, /verdict: OBSOLETE/);
    assert.deepEqual(ghCalls(ctx), ['api repos/{owner}/{repo}/pulls/7']);
  });

  test('#N 形式の PR 番号も受け付ける', (t) => {
    const ctx = setup(t);
    fixture(ctx, 'pull-7', OPEN_PR);
    const res = run(ctx, ['#7']);
    assert.equal(res.status, 0, res.stdout + res.stderr);
    assert.deepEqual(ghCalls(ctx), ['api repos/{owner}/{repo}/pulls/7']);
  });

  test('merge されず close された PR は SAFE にしない', (t) => {
    const ctx = setup(t);
    fixture(ctx, 'pull-7', CLOSED_PR);
    const res = run(ctx, ['7']);
    assert.equal(res.status, 1, res.stdout + res.stderr);
    assert.match(res.stdout, /verdict: OBSOLETE/);
  });

  test('類似 open PR は exit 1 / PARALLEL で、REST で裏取りする', (t) => {
    const ctx = setup(t);
    fixture(ctx, 'list-open', [hit(5)]);
    fixture(ctx, 'pull-5', OPEN_PR);
    const res = run(ctx, ['husky']);
    assert.equal(res.status, 1, res.stdout + res.stderr);
    assert.match(res.stdout, /verdict: PARALLEL_WORK_DETECTED/);
    assert.match(res.stdout, /#5 .*feat: similar work 5.*someone/);
    assert.ok(ghCalls(ctx).includes('api repos/{owner}/{repo}/pulls/5'));
  });

  test('直近 close 済みの類似 PR も exit 1 / PARALLEL', (t) => {
    const ctx = setup(t);
    fixture(ctx, 'list-closed', [hit(6)]);
    fixture(ctx, 'pull-6', MERGED_PR);
    const res = run(ctx, ['husky']);
    assert.equal(res.status, 1, res.stdout + res.stderr);
    assert.match(res.stdout, /verdict: PARALLEL_WORK_DETECTED/);
  });

  test('fetch で届いた main のコミットが大文字小文字を問わず一致すると OBSOLETE', (t) => {
    const ctx = setup(t);
    commit(ctx.seed, 'fix: handle HUSKY chmod');
    git(ctx.seed, 'push', '-q', 'origin', 'main');
    const res = run(ctx, ['husky']);
    assert.equal(res.status, 1, res.stdout + res.stderr);
    assert.match(res.stdout, /verdict: OBSOLETE/);
    assert.match(res.stdout, /handle HUSKY chmod/);
  });

  test('--issue は open なら SAFE、closed なら OBSOLETE', (t) => {
    const ctx = setup(t);
    fixture(ctx, 'issue-3', { state: 'open' });
    fixture(ctx, 'issue-4', { state: 'closed' });
    const open = run(ctx, ['--issue', '3']);
    assert.equal(open.status, 0, open.stdout + open.stderr);
    const closed = run(ctx, ['--issue', '4']);
    assert.equal(closed.status, 1, closed.stdout + closed.stderr);
    assert.match(closed.stdout, /verdict: OBSOLETE/);
  });

  test('一部の PR だけ obsolete なら PARTIAL で、対象ごとに結果を出す', (t) => {
    const ctx = setup(t);
    fixture(ctx, 'pull-1', OPEN_PR);
    fixture(ctx, 'pull-2', MERGED_PR);
    const res = run(ctx, ['1', '2']);
    assert.equal(res.status, 1, res.stdout + res.stderr);
    assert.match(res.stdout, /verdict: PARTIAL/);
    assert.match(res.stdout, /PR #1: open/);
    assert.match(res.stdout, /PR #2: merged/);
  });

  for (const [name, route] of [
    ['PR の state', 'pull-1'],
    ['issue の state', 'issue-3'],
    ['open の検索', 'list-open'],
    ['closed の検索', 'list-closed'],
    ['類似 PR の裏取り', 'pull-5'],
  ]) {
    test(`gh の失敗（${name}）は exit 2 で SAFE を出さない`, (t) => {
      const ctx = setup(t);
      fixture(ctx, 'pull-1', OPEN_PR);
      fixture(ctx, 'issue-3', { state: 'open' });
      fixture(ctx, 'pull-5', OPEN_PR);
      fixture(
        ctx,
        route === 'list-closed' ? 'list-open' : 'list-closed',
        route === 'pull-5' ? [hit(5)] : []
      );
      const res = run(ctx, ['1', '--issue', '3', 'husky'], { GH_STUB_FAIL: route });
      assert.equal(res.status, 2, res.stdout + res.stderr);
      assert.doesNotMatch(res.stdout, /SAFE/);
    });
  }

  for (const [name, route, body, args] of [
    ['空の応答', 'pull-1', '', ['1']],
    ['JSON でない応答', 'pull-1', 'not json', ['1']],
    ['未知の state', 'pull-1', '{"state":"weird"}', ['1']],
    ['state の欠落', 'pull-1', '{}', ['1']],
    ['検索の空の応答', 'list-open', '', ['husky']],
    ['検索が配列でない', 'list-open', '{"number":1}', ['husky']],
    ['検索の番号が不正', 'list-open', '[{"title":"x"}]', ['husky']],
  ]) {
    test(`${name}は exit 2 で SAFE を出さない`, (t) => {
      const ctx = setup(t);
      fixture(ctx, route, body);
      const res = run(ctx, args);
      assert.equal(res.status, 2, res.stdout + res.stderr);
      assert.doesNotMatch(res.stdout, /SAFE/);
    });
  }

  test('git fetch の失敗は exit 2', (t) => {
    const ctx = setup(t);
    git(ctx.clone, 'remote', 'remove', 'origin');
    const res = run(ctx, ['husky']);
    assert.equal(res.status, 2, res.stdout + res.stderr);
    assert.doesNotMatch(res.stdout, /SAFE/);
  });

  for (const args of [[], [''], ['--unknown'], ['--issue'], ['--issue', 'abc']]) {
    test(`usage エラーは exit 64 で gh を呼ばない: ${JSON.stringify(args)}`, (t) => {
      const ctx = setup(t);
      const res = run(ctx, args);
      assert.equal(res.status, 64, res.stdout + res.stderr);
      assert.deepEqual(ghCalls(ctx), []);
    });
  }

  test('gh の呼び出しは読み取りだけで、ブランチも origin も動かさない', (t) => {
    const ctx = setup(t);
    fixture(ctx, 'pull-1', OPEN_PR);
    fixture(ctx, 'pull-2', MERGED_PR);
    fixture(ctx, 'pull-5', OPEN_PR);
    fixture(ctx, 'issue-3', { state: 'closed' });
    fixture(ctx, 'list-open', [hit(5)]);
    const originBefore = git(ctx.seed, 'ls-remote', 'origin');
    const headBefore = git(ctx.clone, 'rev-parse', 'HEAD');

    const res = run(ctx, ['1', '2', '--issue', '3', 'husky']);

    assert.equal(res.status, 1, res.stdout + res.stderr);
    const calls = ghCalls(ctx);
    assert.ok(calls.length >= 6, calls.join('\n'));
    for (const call of calls) {
      assert.match(
        call,
        /^(api repos\/\{owner\}\/\{repo\}\/(pulls|issues)\/\d+|pr list --state (open|closed) --search husky .*--json \S+)$/,
        `読み取り以外の呼び出し: ${call}`
      );
    }
    assert.equal(git(ctx.seed, 'ls-remote', 'origin'), originBefore);
    assert.equal(git(ctx.clone, 'rev-parse', 'HEAD'), headBefore);
  });
});
