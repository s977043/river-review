// scripts/revert-pr.sh: refusal, dry-run, conflict and bundle-warning paths
// against a temp repo with a local bare origin and a stubbed `gh`.

import assert from 'node:assert/strict';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { createGhStub } from './helpers/gh-stub.mjs';
import { spawnSyncGuarded } from './helpers/spawn-guard.mjs';
import { cleanupTempDir, createTempDir } from './helpers/temp-dir.mjs';

const SCRIPT_PATH = resolve(fileURLToPath(new URL('..', import.meta.url)), 'scripts/revert-pr.sh');
const PR_VIEW = /^pr view 7 --repo owner\/repo --json mergeCommit,state,title$/;

function git(cwd, ...args) {
  const r = spawnSyncGuarded('git', args, { cwd, encoding: 'utf8' });
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

function commitFiles(cwd, files, message) {
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(join(cwd, path, '..'), { recursive: true });
    writeFileSync(join(cwd, path), body);
  }
  git(cwd, 'add', '-A');
  git(cwd, 'commit', '-q', '-m', message);
  return git(cwd, 'rev-parse', 'HEAD');
}

// origin/main: base -> target (the "merged PR") [-> later edit of the same line].
function setup(t, { targetFiles = { 'a.txt': 'changed\n' }, laterFiles } = {}) {
  const tmp = createTempDir({ prefix: 'revert-pr-' });
  t.after(() => cleanupTempDir(tmp));
  const bare = join(tmp, 'origin.git');
  const clone = join(tmp, 'clone');
  const work = join(tmp, 'work');
  mkdirSync(work);
  git(tmp, 'init', '-q', '--bare', '-b', 'main', bare);
  git(tmp, 'clone', '-q', bare, clone);
  git(clone, 'config', 'user.email', 'test@example.com');
  git(clone, 'config', 'user.name', 'test');
  commitFiles(clone, { 'a.txt': 'base\n' }, 'base');
  const sha = commitFiles(clone, targetFiles, 'target (#7)');
  if (laterFiles) commitFiles(clone, laterFiles, 'later');
  git(clone, 'push', '-q', 'origin', 'HEAD:refs/heads/main');
  return { bare, clone, work, sha };
}

function run(repo, stub, args) {
  const r = spawnSyncGuarded('bash', [SCRIPT_PATH, ...args], {
    cwd: repo.clone,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${stub.dir}:${process.env.PATH}`,
      GH_STUB: stub.dir,
      REPO: 'owner/repo',
      TMPDIR: repo.work,
    },
  });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

const view = (sha, state = 'MERGED') =>
  JSON.stringify({ state, title: 'feat: x', mergeCommit: sha ? { oid: sha } : null });

for (const args of [[], ['abc'], ['7', '8'], ['--push', '7']]) {
  test(`usage error for ${JSON.stringify(args)} exits 64 without calling gh`, (t) => {
    const repo = setup(t);
    const stub = createGhStub([]);
    const r = run(repo, stub, args);
    assert.equal(r.status, 64, r.stderr);
    assert.deepEqual(stub.calls(), []);
  });
}

test('refuses (exit 3) a PR that is not MERGED and creates no branch', (t) => {
  const repo = setup(t);
  const stub = createGhStub([{ match: PR_VIEW, body: view(null, 'OPEN') }]);
  const r = run(repo, stub, ['7']);
  assert.equal(r.status, 3, r.stderr);
  assert.match(r.stderr, /is OPEN, not MERGED/);
  assert.equal(git(repo.clone, 'branch', '--list', 'revert/pr-7'), '');
});

test('refuses (exit 3) a merge commit that is not on origin/main', (t) => {
  const repo = setup(t);
  git(repo.clone, 'switch', '-q', '-c', 'side');
  const side = commitFiles(repo.clone, { 'b.txt': 'side\n' }, 'side');
  git(repo.clone, 'switch', '-q', 'main');
  const stub = createGhStub([{ match: PR_VIEW, body: view(side) }]);
  const r = run(repo, stub, ['7']);
  assert.equal(r.status, 3, r.stderr);
  assert.match(r.stderr, /is not on origin\/main/);
});

const PR_CREATE =
  /^pr create --repo owner\/repo --base main --head revert\/pr-7 --title revert: feat: x \(#7\) --body Reverts #7.*$/;

function snapshot(repo) {
  return {
    head: git(repo.clone, 'rev-parse', 'HEAD'),
    branch: git(repo.clone, 'rev-parse', '--abbrev-ref', 'HEAD'),
    worktrees: git(repo.clone, 'worktree', 'list', '--porcelain'),
    branches: git(repo.clone, 'branch', '--list'),
  };
}

test('dry-run creates nothing: no branch, no worktree, no push, no gh write', (t) => {
  const repo = setup(t);
  const stub = createGhStub([{ match: PR_VIEW, body: view(repo.sha) }]);
  const before = snapshot(repo);
  const remoteBefore = git(repo.bare, 'for-each-ref', '--format=%(refname)');
  const r = run(repo, stub, ['7']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /reverts cleanly onto origin\/main; nothing created/);
  assert.match(r.stdout, /PR title would be: revert: feat: x \(#7\)/);
  assert.deepEqual(snapshot(repo), before);
  assert.deepEqual(readdirSync(repo.work), []);
  assert.equal(git(repo.bare, 'for-each-ref', '--format=%(refname)'), remoteBefore);
  assert.deepEqual(stub.calls(), ['pr view 7 --repo owner/repo --json mergeCommit,state,title']);
  assert.doesNotMatch(r.stderr, /WARNING/);
});

test('--execute pushes the revert from a temp worktree and leaves the checkout untouched', (t) => {
  const repo = setup(t);
  writeFileSync(join(repo.clone, 'a.txt'), 'dirty local edit\n');
  const stub = createGhStub([
    { match: PR_VIEW, body: view(repo.sha) },
    { match: /^api user$/, body: JSON.stringify({ login: 'owner' }) },
    { match: PR_CREATE, body: 'https://github.com/owner/repo/pull/8\n' },
  ]);
  const before = snapshot(repo);
  const r = run(repo, stub, ['7', '--execute']);
  assert.equal(r.status, 0, r.stderr);
  const after = snapshot(repo);
  assert.equal(after.head, before.head);
  assert.equal(after.branch, before.branch);
  assert.equal(after.worktrees, before.worktrees, 'a worktree remains');
  assert.deepEqual(readdirSync(repo.work), [], 'temp dir remains');
  assert.equal(git(repo.clone, 'status', '--porcelain'), 'M a.txt');
  const pushed = git(repo.bare, 'rev-parse', 'refs/heads/revert/pr-7');
  assert.equal(git(repo.bare, 'show', `${pushed}:a.txt`), 'base');
  assert.equal(git(repo.bare, 'rev-parse', `${pushed}^`), repo.sha);
  assert.ok(
    stub
      .calls()
      .includes(
        'pr create --repo owner/repo --base main --head revert/pr-7 --title revert: feat: x (#7) --body Reverts #7'
      ),
    stub.calls().join('\n')
  );
});

test('push ok but gh pr create fails -> exit 2 with the recovery command', (t) => {
  const repo = setup(t);
  const stub = createGhStub([
    { match: PR_VIEW, body: view(repo.sha) },
    { match: /^api user$/, body: JSON.stringify({ login: 'owner' }) },
    { match: PR_CREATE, body: 'boom', exit: 1 },
  ]);
  const r = run(repo, stub, ['7', '--execute']);
  assert.equal(r.status, 2, r.stderr);
  git(repo.bare, 'rev-parse', 'refs/heads/revert/pr-7');
  assert.match(r.stderr, /was pushed but gh pr create failed/);
  assert.ok(
    r.stderr.includes(
      'gh pr create --repo owner/repo --base main --head revert/pr-7 --title revert:\\ feat:\\ x\\ \\(#7\\) --body Reverts\\ #7'
    ),
    r.stderr
  );
});

test('refuses (exit 3) when revert/pr-<N> already exists locally', (t) => {
  const repo = setup(t);
  git(repo.clone, 'branch', 'revert/pr-7');
  const stub = createGhStub([{ match: PR_VIEW, body: view(repo.sha) }]);
  const r = run(repo, stub, ['7', '--execute']);
  assert.equal(r.status, 3, r.stderr);
  assert.match(r.stderr, /already exists locally/);
});

test('refuses (exit 3) when revert/pr-<N> already exists on origin', (t) => {
  const repo = setup(t);
  git(repo.clone, 'push', '-q', 'origin', 'HEAD:refs/heads/revert/pr-7');
  const stub = createGhStub([{ match: PR_VIEW, body: view(repo.sha) }]);
  const r = run(repo, stub, ['7', '--execute']);
  assert.equal(r.status, 3, r.stderr);
  assert.match(r.stderr, /already exists on origin/);
});

test('conflict stops with exit 1 before creating a worktree, branch or push', (t) => {
  const repo = setup(t, { laterFiles: { 'a.txt': 'later\n' } });
  const stub = createGhStub([{ match: PR_VIEW, body: view(repo.sha) }]);
  const before = snapshot(repo);
  const r = run(repo, stub, ['7', '--execute']);
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, /conflict while reverting/);
  assert.match(r.stderr, /^ {2}a\.txt$/m);
  assert.deepEqual(snapshot(repo), before);
  assert.deepEqual(readdirSync(repo.work), []);
  assert.equal(git(repo.bare, 'branch', '--list', 'revert/pr-7'), '');
  assert.deepEqual(stub.calls(), ['pr view 7 --repo owner/repo --json mergeCommit,state,title']);
});

for (const path of ['runners/github-action/dist/index.mjs', 'src/lib/x.mjs']) {
  test(`warns when the reverted commit touches ${path}`, (t) => {
    const repo = setup(t, { targetFiles: { [path]: 'x\n' } });
    const stub = createGhStub([{ match: PR_VIEW, body: view(repo.sha) }]);
    const r = run(repo, stub, ['7']);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stderr, /WARNING: the reverted commit touches the Action bundle/);
    assert.ok(r.stderr.includes(`  ${path}`), r.stderr);
    assert.match(r.stderr, /scripts\/pr-unstall\.sh/);
  });
}
