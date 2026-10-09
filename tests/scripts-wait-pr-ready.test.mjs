// scripts/wait-pr-ready.sh: a bot-push stall surfaces the pr-unstall.sh
// dry-run verdict and the escape command (#2605), with `gh` stubbed.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createGhStub, fixture, runScriptWithStub } from './helpers/gh-stub.mjs';

const SCRIPT = 'scripts/wait-pr-ready.sh';

function stalledRoutes(pullRoute) {
  return [
    pullRoute,
    {
      match:
        /^api repos\/owner\/repo\/commits\/e1cb880e6c27b8ec61127af899cccfb7fef7cf9a\/check-runs\?per_page=100$/,
      body: '{"check_runs":[]}',
    },
    {
      match:
        /^api repos\/owner\/repo\/actions\/runs\?head_sha=e1cb880e6c27b8ec61127af899cccfb7fef7cf9a&per_page=100$/,
      file: fixture('runs-all-action-required.json'),
    },
  ];
}

test('stalled head: prints the pr-unstall dry-run verdict and the --execute command, exit 1', () => {
  const stub = createGhStub(
    stalledRoutes({
      match: /^api repos\/owner\/repo\/pulls\/101$/,
      file: fixture('pull-open.json'),
    })
  );
  const r = runScriptWithStub(SCRIPT, ['101'], stub);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /pr-unstall\.sh dry-run for #101:/);
  assert.match(r.stderr, /#101\tfix\/100-example\te1cb880e/);
  assert.match(r.stderr, /pr-unstall\.sh --execute 101\n/);
  assert.doesNotMatch(r.stderr, /pr-unstall\.sh exited/);
  assert.ok(
    !stub.calls().some((c) => c.includes('--method') || c.startsWith('api user')),
    'the escape was not executed'
  );
});

test('pr-unstall failing still reports the stall and keeps exit 1', () => {
  // The first PR read (wait-pr-ready) succeeds; the second (pr-unstall) fails.
  const stub = createGhStub([
    {
      match: /^api repos\/owner\/repo\/pulls\/101$/,
      body: 'gh: Not Found (HTTP 404)\n',
      exit: 1,
      after: 1,
    },
    ...stalledRoutes({
      match: /^api repos\/owner\/repo\/pulls\/101$/,
      file: fixture('pull-open.json'),
    }),
  ]);
  const r = runScriptWithStub(SCRIPT, ['101'], stub);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stdout, /#101\t[0-9a-f]{40}\tclean\t-\t[^-]/);
  assert.match(r.stderr, /pr-unstall\.sh exited 2 for #101/);
  assert.match(r.stderr, /pr-unstall\.sh --execute 101\n/);
});

test('no stall: pr-unstall is not invoked', () => {
  const stub = createGhStub([
    { match: /^api repos\/owner\/repo\/pulls\/101$/, file: fixture('pull-open.json') },
    {
      match: /^api repos\/owner\/repo\/commits\/e1cb880e[0-9a-f]*\/check-runs\?per_page=100$/,
      body: '{"check_runs":[]}',
    },
    {
      match: /^api repos\/owner\/repo\/actions\/runs\?head_sha=e1cb880e[0-9a-f]*&per_page=100$/,
      file: fixture('runs-executed.json'),
    },
  ]);
  const r = runScriptWithStub(SCRIPT, ['101'], stub);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.doesNotMatch(r.stderr, /pr-unstall/);
  assert.equal(stub.calls().length, 3);
});
