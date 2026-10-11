// scripts/verify-agent-report.sh: claims checked against a temp git remote, with `gh` stubbed.

import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { before, test } from 'node:test';

import { callFunction, createGhStub, runScriptWithStub } from './helpers/gh-stub.mjs';
import { spawnSyncGuarded } from './helpers/spawn-guard.mjs';
import { createTempDir } from './helpers/temp-dir.mjs';

const SCRIPT = 'scripts/verify-agent-report.sh';
const BRANCH = 'feat/agent-work';
let clone;
let head;

function git(cwd, ...args) {
  const r = spawnSyncGuarded('git', args, { cwd, encoding: 'utf8' });
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

before(() => {
  const root = createTempDir({ prefix: 'verify-agent-report-' });
  const remote = join(root, 'remote.git');
  clone = join(root, 'clone');
  git(root, 'init', '--quiet', '--bare', remote);
  git(root, 'clone', '--quiet', remote, clone);
  git(clone, 'config', 'user.email', 'test@example.com');
  git(clone, 'config', 'user.name', 'test');
  git(clone, 'switch', '--quiet', '-c', BRANCH);
  mkdirSync(join(clone, 'scripts'));
  writeFileSync(join(clone, 'scripts', 'new.sh'), 'echo hi\n');
  git(clone, 'add', '.');
  git(clone, 'commit', '--quiet', '-m', 'feat: new');
  git(clone, 'push', '--quiet', 'origin', BRANCH);
  head = git(clone, 'rev-parse', 'HEAD');
});

const prStub = (pr, headRefOid, repo = 'owner/repo') =>
  createGhStub([
    {
      match: `^pr view ${pr} --repo owner/repo --json url,headRefOid,state$`,
      body: JSON.stringify({
        url: `https://github.com/${repo}/pull/${pr}`,
        headRefOid,
        state: 'OPEN',
      }),
    },
  ]);

const run = (args, stub = createGhStub([])) =>
  runScriptWithStub(SCRIPT, ['--repo-dir', clone, ...args], stub);

test('every claim real -> exit 0 and PASS', () => {
  const r = run(
    ['--worktree', clone, BRANCH, '101', head.slice(0, 7), 'scripts/new.sh'],
    prStub(101, head)
  );
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /VERDICT: PASS/);
  assert.doesNotMatch(r.stdout, /^FAIL/m);
});

test('missing branch -> ls-remote exit 2 is reported and exit 1', () => {
  const r = run(['feat/never-pushed']);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /^FAIL\tbranch\t.*ls-remote exit 2/m);
  assert.match(r.stdout, /VERDICT: FABRICATION_SUSPECTED/);
});

test('claimed SHA differs from branch head -> exit 1', () => {
  const r = run([BRANCH, '-', 'deadbeefcafe']);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /^FAIL\tbranch-head\t/m);
  assert.match(r.stdout, /^FAIL\tcommit\t/m);
});

test('PR that gh cannot read -> exit 1', () => {
  const stub = createGhStub([{ match: '^pr view 999 .*$', body: 'not found', exit: 1 }]);
  const r = run([BRANCH, '999'], stub);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /^FAIL\tpr\t#999 not readable/m);
});

test('PR whose head is another SHA -> exit 1', () => {
  const r = run([BRANCH, '101', head], prStub(101, 'a'.repeat(40)));
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /^FAIL\tpr\t/m);
});

test('claimed file absent from the commit -> exit 1', () => {
  const r = run([BRANCH, '-', head, 'scripts/new.sh', 'scripts/ghost.sh']);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /^PASS\tfile\tscripts\/new.sh/m);
  assert.match(r.stdout, /^FAIL\tfile\tscripts\/ghost.sh/m);
});

test('judge_pr rejects a real PR number from another repository', () => {
  const json = JSON.stringify({ url: 'https://github.com/other/repo/pull/1', headRefOid: 'x' });
  const r = callFunction(SCRIPT, 'judge_pr', [json, 'owner/repo', '-']);
  assert.match(r.stdout, /^FAIL url/);
});

test('judge_sha requires at least 7 hex chars', () => {
  assert.match(callFunction(SCRIPT, 'judge_sha', ['abc', 'abcdef0123']).stdout, /^FAIL/);
  assert.equal(callFunction(SCRIPT, 'judge_sha', ['abcdef0', 'abcdef0123']).stdout.trim(), 'PASS');
});

test('no arguments -> usage exit 64', () => {
  const r = runScriptWithStub(SCRIPT, [], createGhStub([]));
  assert.equal(r.status, 64);
});
