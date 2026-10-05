// scripts/resolve-dist-conflict.sh: refusal paths and an offline end-to-end
// run against a local bare remote, with `gh`, `node` and `npm` stubbed.

import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { callFunction, createGhStub, runScriptWithStub } from './helpers/gh-stub.mjs';
import { spawnSyncGuarded } from './helpers/spawn-guard.mjs';
import { cleanupTempDir, createTempDir } from './helpers/temp-dir.mjs';

const SCRIPT = 'scripts/resolve-dist-conflict.sh';
const SCRIPT_PATH = resolve(fileURLToPath(new URL('..', import.meta.url)), SCRIPT);
const PR_VIEW =
  /^pr view 101 --repo owner\/repo --json headRefName,headRepositoryOwner,isCrossRepository,baseRefName,state$/;
const MAP = 'runners/github-action/dist/index.mjs.map';

const prBody = (over = {}) =>
  JSON.stringify({
    headRefName: 'feat/x',
    baseRefName: 'main',
    state: 'OPEN',
    isCrossRepository: false,
    headRepositoryOwner: { login: 'owner' },
    ...over,
  });

function writeExe(path, body) {
  writeFileSync(path, body);
  chmodSync(path, 0o755);
}

// A stub dir with `gh` plus a `node` that reports `version`.
function stubWithNode(routes, version = '22.1.0') {
  const stub = createGhStub(routes);
  writeExe(join(stub.dir, 'node'), `#!/bin/sh\necho ${version}\n`);
  return stub;
}

test('non_dist_paths keeps only paths outside runners/github-action/dist/', () => {
  const input = [
    'runners/github-action/dist/index.mjs.map',
    'runners/github-action/dist/12.index.mjs',
    'runners/github-action/distx/a.js',
    'runners/github-action/src/index.mjs',
    'package-lock.json',
    '',
  ].join('\n');
  const r = spawnSyncGuarded(
    'bash',
    ['-c', `source '${SCRIPT_PATH}' && printf '%s' "$1" | non_dist_paths`, '_', input],
    { encoding: 'utf8' }
  );
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.stdout.trim().split('\n'), [
    'runners/github-action/distx/a.js',
    'runners/github-action/src/index.mjs',
    'package-lock.json',
  ]);
});

test('major_of strips a leading v and the minor/patch', () => {
  for (const [input, want] of [
    ['v22.22.2', '22'],
    ['22.22.2', '22'],
    ['22', '22'],
  ]) {
    assert.equal(callFunction(SCRIPT, 'major_of', [input]).stdout, want);
  }
});

for (const args of [[], ['abc'], ['--force', '101'], ['101', '102'], ['-1']]) {
  test(`usage error for ${JSON.stringify(args)} exits 64 without calling gh`, () => {
    const stub = stubWithNode([]);
    const r = runScriptWithStub(SCRIPT, args, stub);
    assert.equal(r.status, 64, r.stderr);
    assert.match(r.stderr, /usage: scripts\/resolve-dist-conflict.sh \[--push\] <pr-number>/);
    assert.deepEqual(stub.calls(), []);
  });
}

test('refuses (exit 3) when the Node major differs from .nvmrc, before any gh call', () => {
  const stub = stubWithNode([], '20.11.0');
  const r = runScriptWithStub(SCRIPT, ['101'], stub);
  assert.equal(r.status, 3, r.stderr);
  assert.match(r.stderr, /Node major 20 does not match \.nvmrc major 22/);
  assert.deepEqual(stub.calls(), []);
});

for (const [name, over, pattern] of [
  ['a cross-repository PR', { isCrossRepository: true }, /comes from a fork/],
  ['a PR whose head owner differs', { headRepositoryOwner: { login: 'someone' } }, /fork/],
  ['a closed PR', { state: 'CLOSED' }, /is CLOSED, not OPEN/],
  ['a merged PR', { state: 'MERGED' }, /is MERGED, not OPEN/],
]) {
  test(`refuses (exit 3) ${name}`, () => {
    const stub = stubWithNode([{ match: PR_VIEW, body: prBody(over) }]);
    const r = runScriptWithStub(SCRIPT, ['--push', '101'], stub);
    assert.equal(r.status, 3, r.stderr);
    assert.match(r.stderr, pattern);
  });
}

test('a failed gh read exits 2 with the account hint', () => {
  const stub = stubWithNode([{ match: PR_VIEW, body: 'HTTP 404', exit: 1 }]);
  const r = runScriptWithStub(SCRIPT, ['101'], stub);
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /gh api user --jq \.login/);
});

for (const [name, over] of [
  ['the head branch is main', { headRefName: 'main', baseRefName: 'release' }],
  ['the head branch equals the base', { headRefName: 'dev', baseRefName: 'dev' }],
]) {
  test(`refuses (exit 3) when ${name}`, () => {
    const stub = stubWithNode([{ match: PR_VIEW, body: prBody(over) }]);
    const r = runScriptWithStub(SCRIPT, ['--push', '101'], stub);
    assert.equal(r.status, 3, r.stderr);
    assert.match(r.stderr, /never pushes to main or to the base branch/);
  });
}

test('an unparsable gh pr view answer exits 2', () => {
  const stub = stubWithNode([{ match: PR_VIEW, body: 'not json' }]);
  const r = runScriptWithStub(SCRIPT, ['101'], stub);
  assert.equal(r.status, 2, r.stderr);
  assert.match(r.stderr, /could not parse the gh pr view answer/);
});

test('refuses (exit 3) while another run holds the lock, and leaves that lock alone', (t) => {
  const tmp = createTempDir({ prefix: 'rdc-lock-' });
  t.after(() => cleanupTempDir(tmp));
  const lock = join(tmp, 'resolve-dist-conflict-owner-repo-101.lock');
  mkdirSync(lock);
  writeFileSync(join(lock, 'pid'), '4242\n');
  const stub = stubWithNode([{ match: PR_VIEW, body: prBody() }]);
  const r = runScriptWithStub(SCRIPT, ['101'], stub, { TMPDIR: tmp });
  assert.equal(r.status, 3, r.stderr);
  assert.match(r.stderr, /another run holds .*101\.lock \(pid 4242\)/);
  assert.equal(readFileSync(join(lock, 'pid'), 'utf8'), '4242\n');
});

// --- offline end-to-end ------------------------------------------------------
//
// A bare `origin`, a clone to run from, and a fake `npm` whose `build:action`
// writes the dist map from the sources, so the rebuild is deterministic.

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
}

// base and head both touch the dist map; `headSrc` decides whether they also
// collide in a source file.
function makeRepos(t, { headSrc, baseMoves = true }) {
  const tmp = createTempDir({ prefix: 'rdc-e2e-' });
  t.after(() => cleanupTempDir(tmp));
  const bare = join(tmp, 'origin.git');
  const clone = join(tmp, 'clone');
  const work = join(tmp, 'tmpdir');
  mkdirSync(work);
  git(tmp, 'init', '-q', '--bare', '-b', 'main', bare);
  git(tmp, 'clone', '-q', bare, clone);
  git(clone, 'config', 'user.email', 'test@example.com');
  git(clone, 'config', 'user.name', 'test');
  commitFiles(
    clone,
    {
      '.nvmrc': '22\n',
      'package.json': '{"name":"demo"}\n',
      'package-lock.json': '{}\n',
      'a.txt': 'a0\n',
      [MAP]: 'a0\n',
    },
    'init'
  );
  git(clone, 'push', '-q', 'origin', 'HEAD:refs/heads/main');
  git(clone, 'switch', '-q', '-c', 'feat/x');
  commitFiles(clone, { ...headSrc, [MAP]: 'head\n' }, 'head change');
  git(clone, 'push', '-q', 'origin', 'feat/x');
  git(clone, 'switch', '-q', 'main');
  if (baseMoves) {
    commitFiles(clone, { 'a.txt': 'a1\n', [MAP]: 'base\n' }, 'base change');
    git(clone, 'push', '-q', 'origin', 'main');
  }

  const stub = stubWithNode([{ match: PR_VIEW, body: prBody() }]);
  // `npm run build:action` regenerates the map from every *.txt source.
  // RDC_ON_CI runs a command during `npm ci`; RDC_DRIFT makes every build after
  // the first one write a different map.
  writeExe(
    join(stub.dir, 'npm'),
    [
      '#!/bin/sh',
      'if [ "$1" = ci ] && [ -n "${RDC_ON_CI:-}" ]; then',
      '  sh -c "${RDC_ON_CI}" || exit 1',
      'fi',
      'if [ "$1" = run ] && [ "$2" = build:action ]; then',
      `  mkdir -p runners/github-action/dist && cat *.txt > ${MAP}`,
      '  n=$(cat "${GH_STUB}/builds" 2>/dev/null || echo 0)',
      '  n=$((n + 1))',
      '  echo "${n}" > "${GH_STUB}/builds"',
      `  if [ "\${n}" -ge 2 ] && [ -n "\${RDC_DRIFT:-}" ]; then echo drift >> ${MAP}; fi`,
      'fi',
      'exit 0',
      '',
    ].join('\n')
  );
  return { bare, clone, work, stub };
}

function run(repos, args, extraEnv = {}) {
  const r = spawnSyncGuarded('bash', [SCRIPT_PATH, ...args], {
    cwd: repos.clone,
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${repos.stub.dir}:${process.env.PATH}`,
      GH_STUB: repos.stub.dir,
      REPO: 'owner/repo',
      TMPDIR: repos.work,
      GIT_AUTHOR_NAME: 'test',
      GIT_AUTHOR_EMAIL: 'test@example.com',
      GIT_COMMITTER_NAME: 'test',
      GIT_COMMITTER_EMAIL: 'test@example.com',
      CO_AUTHORED_BY: 'Bot <bot@example.com>',
      ...extraEnv,
    },
  });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

test('dist-only conflict: dry-run resolves, rebuilds twice, pushes nothing, cleans up', (t) => {
  const repos = makeRepos(t, { headSrc: { 'b.txt': 'b1\n' } });
  const before = git(repos.bare, 'rev-parse', 'refs/heads/feat/x');
  const r = run(repos, ['101']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, new RegExp(`conflicted \\(dist only\\):\\n  ${MAP}`));
  assert.match(r.stdout, /second rebuild: runners\/ unchanged/);
  const sha = r.stdout.match(/merge commit ([0-9a-f]{40})/)[1];
  assert.match(r.stdout, new RegExp(`git push origin ${sha}:refs/heads/feat/x`));
  assert.equal(git(repos.bare, 'rev-parse', 'refs/heads/feat/x'), before, 'dry-run pushed');
  assert.equal(git(repos.clone, 'show', `${sha}:${MAP}`), 'a1\nb1');
  assert.match(git(repos.clone, 'log', '-1', '--format=%B', sha), /Co-Authored-By: Bot/);
  assert.equal(git(repos.clone, 'rev-list', '--parents', '-n', '1', sha).split(' ').length, 3);
  assert.equal(git(repos.clone, 'worktree', 'list').split('\n').length, 1);
  assert.equal(existsSync(join(repos.work, 'resolve-dist-conflict-owner-repo-101.lock')), false);
});

test('--push fast-forwards the PR branch and verifies the remote SHA', (t) => {
  const repos = makeRepos(t, { headSrc: { 'b.txt': 'b1\n' } });
  const r = run(repos, ['--push', '101']);
  assert.equal(r.status, 0, r.stderr);
  const sha = r.stdout.match(/merge commit ([0-9a-f]{40})/)[1];
  assert.match(r.stdout, new RegExp(`pushed: origin/feat/x = ${sha}`));
  assert.equal(git(repos.bare, 'rev-parse', 'refs/heads/feat/x'), sha);
});

test('a conflict outside the dist stops (exit 1), keeps the worktree, pushes nothing', (t) => {
  const repos = makeRepos(t, { headSrc: { 'a.txt': 'a-head\n' } });
  const before = git(repos.bare, 'rev-parse', 'refs/heads/feat/x');
  const r = run(repos, ['--push', '101']);
  assert.equal(r.status, 1, r.stderr);
  assert.match(
    r.stderr,
    /conflicts outside runners\/github-action\/dist\/ need a human:\n  a\.txt\n/
  );
  const kept = r.stderr.match(/worktree kept for inspection: (\S+)/)[1];
  assert.ok(existsSync(kept));
  assert.equal(git(repos.bare, 'rev-parse', 'refs/heads/feat/x'), before);
  git(repos.clone, 'worktree', 'remove', '--force', kept);
});

test('a head that already contains the base exits 0 without a worktree', (t) => {
  const repos = makeRepos(t, { headSrc: { 'b.txt': 'b1\n' }, baseMoves: false });
  const r = run(repos, ['101']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /already contains main; nothing to resolve/);
  assert.doesNotMatch(r.stdout, /worktree /);
});

// Exit 1 with the worktree kept, and the remote PR branch at `expected`.
function assertStopped(repos, r, expected, pattern) {
  assert.equal(r.status, 1, r.stderr);
  assert.match(r.stderr, pattern);
  assert.equal(git(repos.bare, 'rev-parse', 'refs/heads/feat/x'), expected);
  const kept = r.stderr.match(/worktree kept for inspection: (\S+)/)[1];
  assert.ok(existsSync(kept));
  git(repos.clone, 'worktree', 'remove', '--force', kept);
}

// A pre-commit hook for the sandbox clone (and so for the script's worktree).
function installPreCommit(repos, body) {
  const hooks = join(repos.work, 'hooks');
  mkdirSync(hooks);
  writeExe(join(hooks, 'pre-commit'), `#!/bin/sh\n${body}\n`);
  git(repos.clone, 'config', 'core.hooksPath', hooks);
}

test('a PR branch that moves after the fetch is not overwritten (exit 1)', (t) => {
  const repos = makeRepos(t, { headSrc: { 'b.txt': 'b1\n' } });
  git(repos.clone, 'switch', '-q', 'feat/x');
  git(repos.clone, 'switch', '-q', '-c', 'adv');
  commitFiles(repos.clone, { 'c.txt': 'c1\n' }, 'pushed by someone else');
  const moved = git(repos.clone, 'rev-parse', 'HEAD');
  git(repos.clone, 'switch', '-q', 'main');
  const r = run(repos, ['--push', '101'], {
    RDC_ON_CI: `git -C '${repos.clone}' push -q origin adv:refs/heads/feat/x`,
  });
  assertStopped(repos, r, moved, /push to origin\/feat\/x was rejected/);
});

test('npm ci rewriting package-lock.json stops before the commit (exit 1)', (t) => {
  const repos = makeRepos(t, { headSrc: { 'b.txt': 'b1\n' } });
  const before = git(repos.bare, 'rev-parse', 'refs/heads/feat/x');
  const r = run(repos, ['--push', '101'], { RDC_ON_CI: 'echo changed > package-lock.json' });
  assertStopped(
    repos,
    r,
    before,
    /non-dist changes remain after the rebuild:\n {2}package-lock\.json/
  );
  assert.doesNotMatch(r.stdout, /merge commit/);
});

test('a second build that changes the dist stops (exit 1)', (t) => {
  const repos = makeRepos(t, { headSrc: { 'b.txt': 'b1\n' } });
  const before = git(repos.bare, 'rev-parse', 'refs/heads/feat/x');
  const r = run(repos, ['--push', '101'], { RDC_DRIFT: '1' });
  assertStopped(
    repos,
    r,
    before,
    /a second rebuild changed runners\/; the dist is not reproducible/
  );
});

test('a commit hook that adds a non-dist file stops (exit 1) and pushes nothing', (t) => {
  const repos = makeRepos(t, { headSrc: { 'b.txt': 'b1\n' } });
  installPreCommit(repos, 'echo note > notes.md && git add notes.md');
  const before = git(repos.bare, 'rev-parse', 'refs/heads/feat/x');
  const r = run(repos, ['--push', '101']);
  assertStopped(
    repos,
    r,
    before,
    /a commit hook changed the committed tree; not pushed:\n {2}notes\.md/
  );
});

test('a failing commit hook exits 1 with the worktree kept', (t) => {
  const repos = makeRepos(t, { headSrc: { 'b.txt': 'b1\n' } });
  installPreCommit(repos, 'exit 1');
  const before = git(repos.bare, 'rev-parse', 'refs/heads/feat/x');
  const r = run(repos, ['--push', '101']);
  assertStopped(repos, r, before, /git commit failed/);
});
