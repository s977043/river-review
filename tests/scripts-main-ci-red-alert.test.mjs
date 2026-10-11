// scripts/main-ci-red-alert.sh: open / update / close the ci-red issue, with `gh` stubbed.

import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { createGhStub, runScriptWithStub } from './helpers/gh-stub.mjs';
import { createTempDir } from './helpers/temp-dir.mjs';

const SCRIPT = 'scripts/main-ci-red-alert.sh';
const SHA = 'abcdef1234567890abcdef1234567890abcdef12';
const ENV = {
  WORKFLOW_NAME: 'CI',
  HEAD_SHA: SHA,
  RUN_ID: '42',
  RUN_URL: 'https://github.com/owner/repo/actions/runs/42',
};

const ISSUE_LIST =
  /^issue list --repo owner\/repo --label ci-red --state open --json number,title$/;
const JOBS = JSON.stringify({
  jobs: [
    { name: 'Lint', conclusion: 'success' },
    { name: 'Unit tests (22.x)', conclusion: 'failure' },
  ],
});
const PULLS = /^api repos\/owner\/repo\/commits\/abcdef1234567890abcdef1234567890abcdef12\/pulls$/;

test('failure with no open issue creates the label and an issue with jobs, PR and revert hint', () => {
  const stub = createGhStub([
    { match: ISSUE_LIST, body: '[]' },
    { match: /^run view 42 --repo owner\/repo --json jobs$/, body: JOBS },
    { match: PULLS, body: '[{"number":2450}]' },
    { match: /^label create ci-red --repo owner\/repo .* --force$/, body: '' },
    { match: /^issue create --repo owner\/repo --label ci-red --title .*$/, body: 'url' },
  ]);
  const r = runScriptWithStub(SCRIPT, [], stub, { ...ENV, CONCLUSION: 'failure' });
  assert.equal(r.status, 0, r.stderr);
  const log = stub.calls().join('\n');
  const create = log.slice(log.indexOf('issue create'));
  assert.match(create, /--title main CI red: CI @ abcdef1 --body/);
  assert.match(create, /- Unit tests \(22\.x\)/);
  assert.doesNotMatch(create, /- Lint/);
  assert.match(create, /Merged by PR: #2450/);
  assert.match(create, /scripts\/revert-pr\.sh 2450/);
  assert.match(create, /actions\/runs\/42/);
});

test('failure with an open issue for the same workflow comments instead of creating', () => {
  const stub = createGhStub([
    {
      match: ISSUE_LIST,
      body: '[{"number":7,"title":"main CI red: Other @ 1111111"},{"number":9,"title":"main CI red: CI @ 2222222"}]',
    },
    { match: /^run view 42 --repo owner\/repo --json jobs$/, body: JOBS },
    { match: PULLS, body: '[]' },
    { match: /^issue comment 9 --repo owner\/repo --body .*$/, body: '' },
  ]);
  const r = runScriptWithStub(SCRIPT, [], stub, { ...ENV, CONCLUSION: 'failure' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /updated #9/);
  assert.ok(!stub.calls().some((c) => c.startsWith('issue create')));
});

test('success closes the open issue with a recovered comment', () => {
  const stub = createGhStub([
    { match: ISSUE_LIST, body: '[{"number":9,"title":"main CI red: CI @ 2222222"}]' },
    {
      match: /^issue close 9 --repo owner\/repo --comment recovered at abcdef1234567890.*$/,
      body: '',
    },
  ]);
  const r = runScriptWithStub(SCRIPT, [], stub, { ...ENV, CONCLUSION: 'success' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /closed #9/);
});

test('success without an open issue writes nothing', () => {
  const stub = createGhStub([{ match: ISSUE_LIST, body: '[]' }]);
  const r = runScriptWithStub(SCRIPT, [], stub, { ...ENV, CONCLUSION: 'success' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(stub.calls().length, 1);
});

test('cancelled / skipped conclusions call no gh at all', () => {
  for (const conclusion of ['cancelled', 'skipped']) {
    const stub = createGhStub([]);
    const r = runScriptWithStub(SCRIPT, [], stub, { ...ENV, CONCLUSION: conclusion });
    assert.equal(r.status, 0, r.stderr);
    assert.equal(stub.calls().length, 0);
  }
});

test('a failing gh write fails the script instead of being swallowed', () => {
  const stub = createGhStub([
    { match: ISSUE_LIST, body: '[]' },
    { match: /^run view 42 --repo owner\/repo --json jobs$/, body: JOBS },
    { match: PULLS, body: '[]' },
    { match: /^label create ci-red .*$/, body: '' },
    { match: /^issue create .*$/, body: 'HTTP 403', exit: 1 },
  ]);
  const r = runScriptWithStub(SCRIPT, [], stub, { ...ENV, CONCLUSION: 'failure' });
  assert.notEqual(r.status, 0);
});

test('a failing read (issue list) fails the script', () => {
  const stub = createGhStub([{ match: ISSUE_LIST, body: 'HTTP 404', exit: 1 }]);
  const r = runScriptWithStub(SCRIPT, [], stub, { ...ENV, CONCLUSION: 'success' });
  assert.notEqual(r.status, 0);
});

function eventFile(run) {
  const dir = createTempDir({ prefix: 'red-alert-event-' });
  const path = join(dir, 'event.json');
  writeFileSync(path, JSON.stringify({ workflow_run: run }));
  return path;
}

const RUN = {
  name: 'CI',
  conclusion: 'success',
  head_sha: SHA,
  id: 42,
  html_url: 'https://github.com/owner/repo/actions/runs/42',
};

test('workflow_run on a main push reads the run from the event payload', () => {
  const stub = createGhStub([
    { match: ISSUE_LIST, body: '[{"number":9,"title":"main CI red: CI @ 2222222"}]' },
    {
      match:
        /^issue close 9 --repo owner\/repo --comment recovered at abcdef1234567890.*runs\/42\)$/,
      body: '',
    },
  ]);
  const r = runScriptWithStub(SCRIPT, [], stub, {
    EVENT_NAME: 'workflow_run',
    GITHUB_EVENT_PATH: eventFile({ ...RUN, head_branch: 'main', event: 'push' }),
  });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /closed #9/);
});

test('workflow_run on a non-main branch or a pull_request event calls no gh at all', () => {
  for (const [branch, event] of [
    ['feature/x', 'push'],
    ['main', 'pull_request'],
  ]) {
    const stub = createGhStub([]);
    const r = runScriptWithStub(SCRIPT, [], stub, {
      EVENT_NAME: 'workflow_run',
      GITHUB_EVENT_PATH: eventFile({ ...RUN, conclusion: 'failure', head_branch: branch, event }),
    });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /no action/);
    assert.equal(stub.calls().length, 0);
  }
});

test('workflow_run with an unreadable payload fails instead of skipping silently', () => {
  const stub = createGhStub([]);
  const r = runScriptWithStub(SCRIPT, [], stub, {
    EVENT_NAME: 'workflow_run',
    GITHUB_EVENT_PATH: '/nonexistent/event.json',
  });
  assert.notEqual(r.status, 0);
});

test('workflow_dispatch simulates a failure without a run id', () => {
  const stub = createGhStub([
    { match: ISSUE_LIST, body: '[]' },
    { match: PULLS, body: '[]' },
    { match: /^label create ci-red .*$/, body: '' },
    { match: /^issue create .*$/, body: 'url' },
  ]);
  const r = runScriptWithStub(SCRIPT, [], stub, {
    EVENT_NAME: 'workflow_dispatch',
    SIMULATE_CONCLUSION: 'failure',
    SIMULATE_SHA: SHA,
  });
  assert.equal(r.status, 0, r.stderr);
  const log = stub.calls().join('\n');
  assert.match(log, /simulated run: no jobs/);
  assert.ok(!log.includes('run view'));
});
