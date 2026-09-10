// scripts/pr-unstall.sh: stall judgement and routing, with `gh` stubbed.
// Fixtures mirror shapes measured on 2026-09-03..05 (see tests/fixtures/scripts-gh).

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  callFunction,
  createGhStub,
  fixture,
  mutateScript,
  runScriptWithStub,
} from './helpers/gh-stub.mjs';

const SCRIPT = 'scripts/pr-unstall.sh';
const read = (name) => readFileSync(fixture(name), 'utf8');

test('judge_stall: every run action_required -> stalled', () => {
  const r = callFunction(SCRIPT, 'judge_stall', [read('runs-all-action-required.json')]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), 'stalled');
});

test('judge_stall: a skipped / failure / in-progress run means the head executed -> clear', () => {
  const r = callFunction(SCRIPT, 'judge_stall', [read('runs-executed.json')]);
  assert.equal(r.stdout.trim(), 'clear');
});

test('judge_stall: action_required beside a queued run is clear (still moving), not stalled', () => {
  const r = callFunction(SCRIPT, 'judge_stall', [read('runs-mixed.json')]);
  assert.equal(r.stdout.trim(), 'clear');
});

test('judge_stall: action_required beside completed runs only is stalled (partial stall)', () => {
  const r = callFunction(SCRIPT, 'judge_stall', [read('runs-partial-stalled.json')]);
  assert.equal(r.stdout.trim(), 'stalled');
});

test('judge_stall: zero runs is reported as no-runs, never as stalled', () => {
  const r = callFunction(SCRIPT, 'judge_stall', [read('runs-empty.json')]);
  assert.equal(r.stdout.trim(), 'no-runs');
});

test('choose_route: release-please head -> kick, anything else -> update-branch', () => {
  assert.equal(
    callFunction(SCRIPT, 'choose_route', [
      'release-please--branches--main--components--river-review',
    ]).stdout.trim(),
    'kick'
  );
  assert.equal(
    callFunction(SCRIPT, 'choose_route', ['fix/2033-redactor-patterns']).stdout.trim(),
    'update-branch'
  );
});

test('dry-run on a stalled feature PR prints update-branch and writes nothing', () => {
  const stub = createGhStub([
    { match: /^api repos\/owner\/repo\/pulls\/101$/, file: fixture('pull-open.json') },
    {
      match: /^api repos\/owner\/repo\/actions\/runs\?head_sha=e1cb880e[0-9a-f]*&per_page=100$/,
      file: fixture('runs-all-action-required.json'),
    },
  ]);
  const r = runScriptWithStub(SCRIPT, ['101'], stub);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /#101 is STALLED/);
  assert.match(r.stdout, /route: update-branch/);
  assert.match(r.stdout, /gh api --method PUT repos\/owner\/repo\/pulls\/101\/update-branch/);
  assert.match(r.stdout, /gh auth switch -u s977043/);
  assert.ok(
    !stub.calls().some((c) => /--method PUT|auth switch/.test(c)),
    `dry-run wrote: ${stub.calls()}`
  );
});

test('dry-run on a stalled release-please PR routes to release-please-kick.sh', () => {
  const stub = createGhStub([
    { match: /^api repos\/owner\/repo\/pulls\/103$/, file: fixture('pull-open-release.json') },
    {
      match: /^api repos\/owner\/repo\/actions\/runs\?head_sha=bbbb[0-9a-f]*&per_page=100$/,
      file: fixture('runs-all-action-required.json'),
    },
  ]);
  const r = runScriptWithStub(SCRIPT, ['103'], stub);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /route: kick/);
  assert.match(
    r.stdout,
    /release-please-kick\.sh release-please--branches--main--components--river-review/
  );
});

test('a head whose runs executed exits 0 as not stalled', () => {
  const stub = createGhStub([
    { match: /^api repos\/owner\/repo\/pulls\/101$/, file: fixture('pull-open.json') },
    {
      match: /^api repos\/owner\/repo\/actions\/runs\?head_sha=[0-9a-f]{40}&per_page=100$/,
      file: fixture('runs-executed.json'),
    },
  ]);
  const r = runScriptWithStub(SCRIPT, ['101'], stub);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /is not stalled/);
});

test('an already merged PR exits 0 without reading its runs', () => {
  const stub = createGhStub([
    { match: /^api repos\/owner\/repo\/pulls\/2086$/, file: fixture('pull-merged.json') },
  ]);
  const r = runScriptWithStub(SCRIPT, ['2086'], stub);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /already merged/);
  assert.equal(stub.calls().length, 1);
});

test('a failed API read exits 2, never 0', () => {
  const stub = createGhStub([
    { match: /^api repos\/owner\/repo\/pulls\/101$/, body: 'gh: Not Found (HTTP 404)\n', exit: 1 },
  ]);
  const r = runScriptWithStub(SCRIPT, ['101'], stub);
  assert.equal(r.status, 2);
  assert.match(r.stderr, /GitHub API read failed/);
});

test('--execute: update-branch 422 (conflict) prints the local merge procedure and exits 1', () => {
  const stub = createGhStub([
    { match: /^api user$/, body: '{"login":"s977043"}\n' },
    { match: /^api repos\/owner\/repo\/pulls\/101$/, file: fixture('pull-open.json') },
    {
      match: /^api repos\/owner\/repo\/actions\/runs\?head_sha=[0-9a-f]{40}&per_page=100$/,
      file: fixture('runs-all-action-required.json'),
    },
    {
      match: /^api --method PUT repos\/owner\/repo\/pulls\/101\/update-branch$/,
      body: 'gh: merge conflict between base and head (HTTP 422)\n',
      exit: 1,
    },
  ]);
  const r = runScriptWithStub(SCRIPT, ['--execute', '101'], stub);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /git merge origin\/main/);
  assert.match(r.stderr, /npm run build:action/);
  assert.ok(
    stub.calls().some((c) => c.startsWith('api user')),
    'account guard ran before the write'
  );
});

test('--execute: update-branch 422 (no new commits) points at the kick and exits 1', () => {
  const stub = createGhStub([
    { match: /^api user$/, body: '{"login":"s977043"}\n' },
    { match: /^api repos\/owner\/repo\/pulls\/101$/, file: fixture('pull-open.json') },
    {
      match: /^api repos\/owner\/repo\/actions\/runs\?head_sha=[0-9a-f]{40}&per_page=100$/,
      file: fixture('runs-all-action-required.json'),
    },
    {
      match: /^api --method PUT repos\/owner\/repo\/pulls\/101\/update-branch$/,
      body: 'gh: There are no new commits on the base branch. (HTTP 422)\n',
      exit: 1,
    },
  ]);
  const r = runScriptWithStub(SCRIPT, ['--execute', '101'], stub);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /release-please-kick\.sh fix\/100-example/);
});

test('--execute: accepted update-branch exits 0', () => {
  const stub = createGhStub([
    { match: /^api user$/, body: '{"login":"s977043"}\n' },
    { match: /^api repos\/owner\/repo\/pulls\/101$/, file: fixture('pull-open.json') },
    {
      match: /^api repos\/owner\/repo\/actions\/runs\?head_sha=[0-9a-f]{40}&per_page=100$/,
      file: fixture('runs-all-action-required.json'),
    },
    {
      match: /^api --method PUT repos\/owner\/repo\/pulls\/101\/update-branch$/,
      body: '{"message":"Updating pull request branch."}\n',
    },
  ]);
  const r = runScriptWithStub(SCRIPT, ['--execute', '101'], stub);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /update-branch accepted/);
});

test('usage errors exit 64', () => {
  const stub = createGhStub([]);
  assert.equal(runScriptWithStub(SCRIPT, [], stub).status, 64);
  assert.equal(runScriptWithStub(SCRIPT, ['abc'], stub).status, 64);
  assert.equal(runScriptWithStub(SCRIPT, ['1', '2'], stub).status, 64);
});

// #2095: a per_page typo must not slip past an unanchored route. The mutation
// runs on a temp copy; `scripts/` itself is untouched.
test('mutation: a per_page typo in the runs read exits 2 instead of a verdict', () => {
  const mutant = mutateScript(SCRIPT, 'per_page=100', 'perpage=100');
  const stub = createGhStub([
    { match: /^api repos\/owner\/repo\/pulls\/101$/, file: fixture('pull-open.json') },
    {
      match: /^api repos\/owner\/repo\/actions\/runs\?head_sha=[0-9a-f]{40}&per_page=100$/,
      file: fixture('runs-all-action-required.json'),
    },
  ]);
  const r = runScriptWithStub(mutant, ['101'], stub);
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(
    r.stderr,
    /gh-stub: no route for: api repos\/owner\/repo\/actions\/runs\?head_sha=[0-9a-f]{40}&perpage=100/
  );
  assert.doesNotMatch(r.stdout, /STALLED|not stalled/);
});
