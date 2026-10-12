import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, chmodSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';

// .claude/hooks/gh-account-guard.sh (PreToolUse hook) を実プロセス実行で検証する。
// 実際の gh keyring に触れないよう、PATH 先頭に stub gh を注入する。
const HOOK = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '.claude',
  'hooks',
  'gh-account-guard.sh'
);

const GH_STUB = `#!/usr/bin/env bash
echo "gh $*" >> "$FAKE_GH_LOG"
if [ "$1" = "api" ] && [ "$2" = "user" ]; then
  printf '%s\\n' "\${FAKE_GH_LOGIN:-s977043}"
  exit 0
fi
if [ "$1" = "auth" ] && [ "$2" = "switch" ]; then
  exit "\${FAKE_GH_SWITCH_EXIT:-0}"
fi
exit 0
`;

function makeStub() {
  const dir = mkdtempSync(join(tmpdir(), 'rr-gh-guard-'));
  const gh = join(dir, 'gh');
  writeFileSync(gh, GH_STUB);
  chmodSync(gh, 0o755);
  const log = join(dir, 'gh-calls.log');
  return { dir, log };
}

function runHook(command, { login = 's977043', switchExit = 0, cwd } = {}) {
  const { dir, log } = makeStub();
  try {
    const input = JSON.stringify({ tool_input: { command }, ...(cwd ? { cwd } : {}) });
    const res = spawnSync('bash', [HOOK], {
      input,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${dir}${delimiter}${process.env.PATH}`,
        FAKE_GH_LOG: log,
        FAKE_GH_LOGIN: login,
        FAKE_GH_SWITCH_EXIT: String(switchExit),
        GH_ACCOUNT_GUARD_EXPECTED: 's977043',
      },
    });
    const calls = existsSync(log) ? readFileSync(log, 'utf8').trim() : '';
    return { status: res.status, stderr: res.stderr, calls };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('non-gh command passes without invoking gh', () => {
  const r = runHook('git push origin feat/x');
  assert.equal(r.status, 0);
  assert.equal(r.calls, '');
});

const READ_OPS = [
  'gh pr view 123 --json url',
  'gh pr checks 1368',
  'gh api repos/s977043/river-review/pulls/1',
  'gh api user --jq .login',
  'gh release list',
];

test('gh read op with expected account passes (login checked, no switch)', () => {
  for (const cmd of READ_OPS) {
    const r = runHook(cmd, { login: 's977043' });
    assert.equal(r.status, 0, cmd);
    assert.match(r.calls, /api user --jq \.login/, cmd);
    assert.doesNotMatch(r.calls, /auth switch/, cmd);
  }
});

test('gh read op with wrong account switches and proceeds', () => {
  for (const cmd of READ_OPS) {
    const r = runHook(cmd, { login: 'kominem-unilabo' });
    assert.equal(r.status, 0, cmd);
    assert.match(r.calls, /auth switch -u s977043/, cmd);
    assert.match(r.stderr, /switched to 's977043' before gh read op/, cmd);
  }
});

test('gh read op only warns (exit 0) when switch fails', () => {
  const r = runHook('gh pr view 123', { login: 'kominem-unilabo', switchExit: 1 });
  assert.equal(r.status, 0);
  assert.match(r.stderr, /WARNING/);
  assert.doesNotMatch(r.stderr, /BLOCKED/);
});

test('gh auth commands are not guarded', () => {
  for (const cmd of [
    'gh auth status',
    'gh auth switch -u s977043',
    'gh auth token -u s977043',
    'gh --hostname github.com auth status',
  ]) {
    const r = runHook(cmd, { login: 'kominem-unilabo' });
    assert.equal(r.status, 0, cmd);
    assert.equal(r.calls, '', cmd);
  }
});

test('gh auth in a compound command does not exempt the other gh call', () => {
  for (const cmd of [
    'gh auth status && gh pr view 1',
    'gh pr create --title t --body "run gh auth status first"',
  ]) {
    const r = runHook(cmd, { login: 'kominem-unilabo' });
    assert.equal(r.status, 0, cmd);
    assert.match(r.calls, /auth switch -u s977043/, cmd);
  }
});

test('gh calls that name another owner are not guarded (read and write)', () => {
  for (const cmd of [
    'gh pr view 12 -R kominem-unilabo/app',
    'gh -Rwork-org/app issue list',
    'gh --repo=work-org/app pr create --fill',
    'gh --repo "work-org/app" pr merge 3 --squash',
    'gh api repos/work-org/app/pulls/1',
    'gh api /repos/Work-Org/app/issues -X PATCH -f state=closed',
    'gh api "repos/work-org/app/pulls?per_page=100"',
    'gh api --paginate repos/work-org/app/pulls',
  ]) {
    const r = runHook(cmd, { login: 'kominem-unilabo', switchExit: 1 });
    assert.equal(r.status, 0, cmd);
    assert.equal(r.calls, '', cmd);
  }
});

test('explicit expected owner (any case) and placeholders stay guarded', () => {
  for (const cmd of [
    'gh -R S977043/river-review pr view 1',
    'gh api repos/{owner}/{repo}/pulls/1',
    'gh pr view https://github.com/s977043/river-review/pull/3',
  ]) {
    const r = runHook(cmd, { login: 'kominem-unilabo' });
    assert.equal(r.status, 0, cmd);
    assert.match(r.calls, /auth switch -u s977043/, cmd);
  }
});

test('another owner in title/body/comment text does not bypass the write guard', () => {
  for (const cmd of [
    'gh pr create --title t --body https://github.com/other/x',
    'gh pr create --title t -b repos/other/x/',
    'gh pr create --title t --body "https://github.com/other/x/pull/1"',
    'gh pr create --title t --body "see https://github.com/work-org/app/pull/1"',
    "gh issue comment 9 --body 'compare with -R work-org/app and repos/work-org/app/'",
    'gh pr merge 1 --squash # see repos/other/x/',
    'gh pr merge 1 --squash # -R other/x',
  ]) {
    const r = runHook(cmd, { login: 'kominem-unilabo', switchExit: 1 });
    assert.equal(r.status, 2, cmd);
    assert.match(r.stderr, /BLOCKED/, cmd);
  }
});

test('a github.com URL argument does not exempt a read', () => {
  const r = runHook('gh pr view https://github.com/work-org/app/pull/3', {
    login: 'kominem-unilabo',
    switchExit: 1,
  });
  assert.equal(r.status, 0);
  assert.match(r.stderr, /WARNING/);
});

test('only the segment naming another owner is exempt in a compound command', () => {
  for (const cmd of [
    'gh pr merge 1 && gh pr view 2 -R proni/foo',
    'gh pr merge 1 --squash; gh api repos/proni/foo/pulls',
    'gh pr view 2 -R proni/foo && gh pr create --fill',
  ]) {
    const r = runHook(cmd, { login: 'kominem-unilabo', switchExit: 1 });
    assert.equal(r.status, 2, cmd);
    assert.match(r.stderr, /BLOCKED/, cmd);
  }
  const r = runHook('gh pr view 1 -R s977043/river-review && gh pr view 2 -R work-org/app', {
    login: 'kominem-unilabo',
    switchExit: 1,
  });
  assert.equal(r.status, 0);
  assert.match(r.stderr, /WARNING/);
});

test('reads that may target another repo implicitly are not guarded', () => {
  for (const cmd of [
    'cd ../work-app && gh pr view 1',
    'pushd /tmp/work && gh pr list',
    'GH_REPO=work-org/app gh pr view 1',
  ]) {
    const r = runHook(cmd, { login: 'kominem-unilabo' });
    assert.equal(r.status, 0, cmd);
    assert.equal(r.calls, '', cmd);
  }
});

test('writes are guarded even after cd or with GH_REPO', () => {
  for (const cmd of ['cd ../work-app && gh pr create --fill', 'GH_REPO=s977043/x gh pr merge 1']) {
    const r = runHook(cmd, { login: 'kominem-unilabo', switchExit: 1 });
    assert.equal(r.status, 2, cmd);
    assert.match(r.stderr, /BLOCKED/, cmd);
  }
});

test('payload cwd outside this repository skips reads but not writes', () => {
  const outside = mkdtempSync(join(tmpdir(), 'rr-gh-guard-cwd-'));
  try {
    spawnSync('git', ['init', '-q', outside]);
    for (const cwd of [outside, join(outside, 'missing')]) {
      const read = runHook('gh pr view 1', { login: 'kominem-unilabo', cwd });
      assert.equal(read.status, 0, cwd);
      assert.equal(read.calls, '', cwd);
      const write = runHook('gh pr merge 1', { login: 'kominem-unilabo', switchExit: 1, cwd });
      assert.equal(write.status, 2, cwd);
    }
  } finally {
    rmSync(outside, { recursive: true, force: true });
  }
});

test('payload cwd inside this repository keeps reads guarded', () => {
  const r = runHook('gh pr view 1', { login: 'kominem-unilabo', cwd: join(dirname(HOOK), '..') });
  assert.equal(r.status, 0);
  assert.match(r.calls, /auth switch -u s977043/);
});

test('gh write op with expected account passes (login checked, no switch)', () => {
  const r = runHook('gh pr create --title x --body y', { login: 's977043' });
  assert.equal(r.status, 0);
  assert.match(r.calls, /api user --jq \.login/);
  assert.doesNotMatch(r.calls, /auth switch/);
});

test('gh write op with wrong account switches and proceeds', () => {
  const r = runHook('gh pr merge 42 --squash', { login: 'kominem-unilabo' });
  assert.equal(r.status, 0);
  assert.match(r.calls, /auth switch -u s977043/);
  assert.match(r.stderr, /switched to 's977043'/);
});

test('gh write op blocks (exit 2) when switch also fails', () => {
  const r = runHook('gh issue create --title t', {
    login: 'kominem-unilabo',
    switchExit: 1,
  });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /BLOCKED/);
});

test('write-op detection covers api methods, body fields, and compound commands', () => {
  for (const cmd of [
    'gh api repos/s977043/river-review/pulls/1/update-branch -X PUT',
    'gh api repos/s977043/river-review/issues -f title=hi',
    'git push origin HEAD && gh pr create --fill',
    'gh workflow run release-please.yml',
    'gh release create v1.0.0',
  ]) {
    const r = runHook(cmd, { login: 'kominem-unilabo', switchExit: 1 });
    assert.equal(r.status, 2, cmd);
    assert.match(r.stderr, /BLOCKED/, cmd);
  }
});

test('write op with global options between gh and subcommand is detected', () => {
  for (const cmd of [
    'gh -R s977043/river-review pr create --fill',
    'gh --repo s977043/river-review pr merge 1 --squash',
    'gh --repo=s977043/river-review issue close 9',
    'gh -R s977043/river-review api repos/{owner}/{repo}/issues -f title=hi',
  ]) {
    const r = runHook(cmd, { login: 'kominem-unilabo', switchExit: 1 });
    assert.equal(r.status, 2, cmd);
    assert.match(r.stderr, /BLOCKED/, cmd);
  }
});

test('quoted -X / --method values are detected as write', () => {
  for (const cmd of [
    'gh api repos/s977043/river-review/pulls/1/update-branch -X "PUT"',
    "gh api repos/s977043/river-review/issues --method='POST' --input body.json",
    'gh api graphql --method "post"',
  ]) {
    const r = runHook(cmd, { login: 'kominem-unilabo', switchExit: 1 });
    assert.equal(r.status, 2, cmd);
    assert.match(r.stderr, /BLOCKED/, cmd);
  }
});

// read と write の区別は「switch 失敗時に止めるか」で観測する（read は警告のみ、write は exit 2）。
test('read ops with global options are not misdetected as write', () => {
  for (const cmd of [
    'gh -R s977043/river-review pr view 1375',
    'gh --repo s977043/river-review pr list --search "create"',
    'gh -R s977043/river-review api repos/{owner}/{repo}/pulls/1',
  ]) {
    const r = runHook(cmd, { login: 'kominem-unilabo', switchExit: 1 });
    assert.equal(r.status, 0, cmd);
    assert.match(r.stderr, /WARNING/, cmd);
  }
});

test('gh api with explicit GET is treated as read', () => {
  const r = runHook('gh api repos/s977043/river-review/pulls -X GET | jq .[0]', {
    login: 'kominem-unilabo',
    switchExit: 1,
  });
  assert.equal(r.status, 0);
  assert.match(r.stderr, /WARNING/);
});

test('empty or malformed stdin payload passes', () => {
  for (const input of ['', '{not json']) {
    const res = spawnSync('bash', [HOOK], { input, encoding: 'utf8' });
    assert.equal(res.status, 0, JSON.stringify(input));
  }
});
