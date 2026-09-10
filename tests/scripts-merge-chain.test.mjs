// scripts/merge-chain.sh: disposition judgement and the dry-run / stop paths,
// with `gh` stubbed. Fixtures mirror shapes measured on 2026-09-03..05.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { test } from 'node:test';

import {
  callFunction,
  createGhStub,
  fixture,
  mutateScript,
  runGh,
  runScriptWithStub,
  SCRIPTS_DIR,
} from './helpers/gh-stub.mjs';

const SCRIPT = 'scripts/merge-chain.sh';
const read = (name) => readFileSync(fixture(name), 'utf8');

test('count_human_comments: bots and vercel* are ignored', () => {
  assert.equal(
    callFunction(SCRIPT, 'count_human_comments', [
      read('issue-comments-bots-only.json'),
    ]).stdout.trim(),
    '0'
  );
  assert.equal(
    callFunction(SCRIPT, 'count_human_comments', [
      read('issue-comments-one-human.json'),
    ]).stdout.trim(),
    '1'
  );
});

test('count_human_comments: paginated output (two concatenated arrays) is summed', () => {
  const two = read('issue-comments-one-human.json') + read('issue-comments-one-human.json');
  assert.equal(callFunction(SCRIPT, 'count_human_comments', [two]).stdout.trim(), '2');
});

test('has_blocked_label', () => {
  assert.equal(
    callFunction(SCRIPT, 'has_blocked_label', ['[{"name":"blocked"}]']).stdout.trim(),
    'yes'
  );
  assert.equal(
    callFunction(SCRIPT, 'has_blocked_label', ['[{"name":"enhancement"}]']).stdout.trim(),
    'no'
  );
  assert.equal(callFunction(SCRIPT, 'has_blocked_label', ['[]']).stdout.trim(), 'no');
});

test('failing_required_checks: an older cancelled run beside a newer pass of the same name is green', () => {
  const r = callFunction(SCRIPT, 'failing_required_checks', [
    read('checks-cancelled-then-pass.json'),
  ]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), '');
});

test('failing_required_checks: a queued run at 0001-01-01 is pending, not hidden by max_by', () => {
  const r = callFunction(SCRIPT, 'failing_required_checks', [read('checks-queued-zero-time.json')]);
  assert.equal(r.stdout.trim(), 'Unit tests (22.x)\tpending');
});

test('failing_required_checks: all pass / skipping is green', () => {
  assert.equal(
    callFunction(SCRIPT, 'failing_required_checks', [read('checks-all-pass.json')]).stdout.trim(),
    ''
  );
});

function cleanRoutes(pr, pullFile) {
  return [
    { match: new RegExp(`^api repos/owner/repo/pulls/${pr}$`), file: fixture(pullFile) },
    {
      match: new RegExp(`^api --paginate repos/owner/repo/pulls/${pr}/comments\\?per_page=100$`),
      file: fixture('empty-array.json'),
    },
    {
      match: new RegExp(`^api --paginate repos/owner/repo/issues/${pr}/comments\\?per_page=100$`),
      file: fixture('issue-comments-bots-only.json'),
    },
    {
      match: new RegExp(`^pr checks ${pr} --repo owner/repo --json name,bucket,startedAt$`),
      file: fixture('checks-all-pass.json'),
    },
  ];
}

test('dry-run: a clean PR is verdict merge, exit 0, and no write op is called', () => {
  const stub = createGhStub(cleanRoutes(101, 'pull-open.json'));
  const r = runScriptWithStub(SCRIPT, ['101'], stub);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /^#101\topen\t0\t0\tno\t-\tmerge\t/m);
  assert.match(r.stdout, /gh api --method PUT repos\/owner\/repo\/pulls\/101\/update-branch/);
  assert.ok(
    !stub.calls().some((c) => /--method PUT|pr merge|auth switch/.test(c)),
    `dry-run wrote: ${stub.calls()}`
  );
});

test('dry-run: a blocked label stops with exit 3 and names the item', () => {
  const stub = createGhStub(cleanRoutes(102, 'pull-open-blocked.json'));
  const r = runScriptWithStub(SCRIPT, ['102'], stub);
  assert.equal(r.status, 3, r.stdout + r.stderr);
  assert.match(r.stdout, /#102\topen\t0\t0\tyes\t-\tSTOP:label=blocked\t/);
});

test('dry-run: one human issue comment stops with exit 3', () => {
  const routes = cleanRoutes(101, 'pull-open.json');
  routes[2] = {
    match: /^api --paginate repos\/owner\/repo\/issues\/101\/comments\?per_page=100$/,
    file: fixture('issue-comments-one-human.json'),
  };
  const r = runScriptWithStub(SCRIPT, ['101'], createGhStub(routes));
  assert.equal(r.status, 3);
  assert.match(r.stdout, /STOP:human-comments=1/);
});

test('dry-run: one line comment stops with exit 3', () => {
  const routes = cleanRoutes(101, 'pull-open.json');
  routes[1] = {
    match: /^api --paginate repos\/owner\/repo\/pulls\/101\/comments\?per_page=100$/,
    file: fixture('issue-comments-one-human.json'),
  };
  const r = runScriptWithStub(SCRIPT, ['101'], createGhStub(routes));
  assert.equal(r.status, 3);
  assert.match(r.stdout, /STOP:line-comments=3/);
});

test('dry-run: a pending required check stops with exit 3', () => {
  const routes = cleanRoutes(101, 'pull-open.json');
  routes[3] = {
    match: /^pr checks 101 --repo owner\/repo --json name,bucket,startedAt$/,
    file: fixture('checks-queued-zero-time.json'),
    exit: 8,
  };
  const r = runScriptWithStub(SCRIPT, ['101'], createGhStub(routes));
  assert.equal(r.status, 3);
  assert.match(r.stdout, /STOP:checks=Unit tests \(22\.x\)=pending/);
});

test('dry-run: a non-object element in gh pr checks output is a read failure (exit 2), never merge', () => {
  const routes = cleanRoutes(101, 'pull-open.json');
  routes[3] = {
    match: /^pr checks 101 --repo owner\/repo --json name,bucket,startedAt$/,
    file: fixture('checks-non-object.json'),
  };
  const r = runScriptWithStub(SCRIPT, ['101'], createGhStub(routes));
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.doesNotMatch(r.stdout, /\tmerge\t/);
});

test('count_human_comments: a ghost user without login does not break the count', () => {
  const r = callFunction(SCRIPT, 'count_human_comments', [
    '[{"user":null},{"user":{"login":"s977043"}}]',
  ]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), '2');
});

test('dry-run: an already merged PR is skipped; nothing left means exit 0', () => {
  const stub = createGhStub([
    { match: /^api repos\/owner\/repo\/pulls\/2086$/, file: fixture('pull-merged.json') },
  ]);
  const r = runScriptWithStub(SCRIPT, ['2086'], stub);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /#2086 is already merged; skipped/);
  assert.match(r.stdout, /Nothing to merge/);
});

test('a failed API read exits 2', () => {
  const stub = createGhStub([
    { match: /^api repos\/owner\/repo\/pulls\/101$/, body: 'gh: Not Found (HTTP 404)\n', exit: 1 },
  ]);
  assert.equal(runScriptWithStub(SCRIPT, ['101'], stub).status, 2);
});

test('--execute: a stalled head reported by wait-pr-ready exits 1 before any merge', () => {
  const stub = createGhStub([
    { match: /^api user$/, body: '{"login":"s977043"}\n' },
    ...cleanRoutes(101, 'pull-open.json'),
    {
      match: /^api --method PUT repos\/owner\/repo\/pulls\/101\/update-branch$/,
      body: '{"message":"Updating pull request branch."}\n',
    },
    {
      match: /^api repos\/owner\/repo\/commits\/e1cb880e[0-9a-f]*\/check-runs\?per_page=100$/,
      body: '{"check_runs":[]}',
    },
    {
      match: /^api repos\/owner\/repo\/actions\/runs\?head_sha=e1cb880e[0-9a-f]*&per_page=100$/,
      file: fixture('runs-all-action-required.json'),
    },
  ]);
  const r = runScriptWithStub(SCRIPT, ['--execute', '101'], stub, {
    UPDATE_BRANCH_WAIT_SECONDS: '0',
  });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.ok(!stub.calls().some((c) => c.startsWith('pr merge')), 'no merge was attempted');
});

test('--execute: wait-pr-ready timeout exits 4', () => {
  const routes = cleanRoutes(101, 'pull-open.json');
  routes[0] = {
    match: /^api repos\/owner\/repo\/pulls\/101$/,
    body: read('pull-open.json').replace('"clean"', '"unknown"'),
  };
  const stub = createGhStub([
    { match: /^api user$/, body: '{"login":"s977043"}\n' },
    ...routes,
    {
      match: /^api --method PUT repos\/owner\/repo\/pulls\/101\/update-branch$/,
      body: 'gh: There are no new commits on the base branch. (HTTP 422)\n',
      exit: 1,
    },
    {
      match: /^api repos\/owner\/repo\/commits\/e1cb880e[0-9a-f]*\/check-runs\?per_page=100$/,
      body: '{"check_runs":[]}',
    },
    {
      match: /^api repos\/owner\/repo\/actions\/runs\?head_sha=e1cb880e[0-9a-f]*&per_page=100$/,
      file: fixture('runs-executed.json'),
    },
  ]);
  const r = runScriptWithStub(SCRIPT, ['--execute', '101'], stub, { TIMEOUT_SECONDS: '1' });
  assert.equal(r.status, 4, r.stdout + r.stderr);
  assert.ok(!stub.calls().some((c) => c.startsWith('pr merge')));
});

test('--execute: an accepted update-branch whose head never moves exits 1', () => {
  const stub = createGhStub([
    { match: /^api user$/, body: '{"login":"s977043"}\n' },
    ...cleanRoutes(101, 'pull-open.json'),
    {
      match: /^api --method PUT repos\/owner\/repo\/pulls\/101\/update-branch$/,
      body: '{"message":"Updating pull request branch."}\n',
    },
  ]);
  const r = runScriptWithStub(SCRIPT, ['--execute', '101'], stub, {
    UPDATE_BRANCH_WAIT_SECONDS: '1',
    INTERVAL_SECONDS: '1',
  });
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /head did not move/);
  assert.ok(!stub.calls().some((c) => c.startsWith('pr merge')));
});

test('--execute: a merge-conflict 422 on update-branch exits 1 and prints the procedure', () => {
  const stub = createGhStub([
    { match: /^api user$/, body: '{"login":"s977043"}\n' },
    ...cleanRoutes(101, 'pull-open.json'),
    {
      match: /^api --method PUT repos\/owner\/repo\/pulls\/101\/update-branch$/,
      body: 'gh: merge conflict between base and head (HTTP 422)\n',
      exit: 1,
    },
    {
      match: /^api repos\/owner\/repo\/actions\/runs\?head_sha=e1cb880e[0-9a-f]*&per_page=100$/,
      file: fixture('runs-all-action-required.json'),
    },
  ]);
  const r = runScriptWithStub(SCRIPT, ['--execute', '101'], stub);
  assert.equal(r.status, 1, r.stdout + r.stderr);
  assert.match(r.stderr, /pr-unstall\.sh/);
});

test('--execute: a clean PR is merged with the PR title as the squash subject', () => {
  const stub = createGhStub([
    { match: /^api user$/, body: '{"login":"s977043"}\n' },
    ...cleanRoutes(101, 'pull-open.json'),
    {
      match: /^api --method PUT repos\/owner\/repo\/pulls\/101\/update-branch$/,
      body: 'gh: There are no new commits on the base branch. (HTTP 422)\n',
      exit: 1,
    },
    {
      match: /^api repos\/owner\/repo\/commits\/e1cb880e[0-9a-f]*\/check-runs\?per_page=100$/,
      body: '{"check_runs":[{"name":"Lint","conclusion":"success"}]}',
    },
    {
      match: /^api repos\/owner\/repo\/actions\/runs\?head_sha=e1cb880e[0-9a-f]*&per_page=100$/,
      file: fixture('runs-executed.json'),
    },
    {
      match:
        /^pr merge 101 --repo owner\/repo --squash --delete-branch --subject fix\(x\): #100 example \(#101\)$/,
      body: '',
    },
  ]);
  const r = runScriptWithStub(SCRIPT, ['--execute', '101'], stub);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /merged #101/);
  assert.match(r.stdout, /All PRs merged/);
  assert.ok(
    stub.calls().some((c) => c.startsWith('pr merge')),
    'gh pr merge was called'
  );
});

test('--execute: disposition stop exits 3 and merges nothing', () => {
  const stub = createGhStub([
    { match: /^api user$/, body: '{"login":"s977043"}\n' },
    ...cleanRoutes(102, 'pull-open-blocked.json'),
    {
      match: /^api --method PUT repos\/owner\/repo\/pulls\/102\/update-branch$/,
      body: '{"message":"Updating pull request branch."}\n',
    },
    {
      match: /^api repos\/owner\/repo\/commits\/aaaa[0-9a-f]*\/check-runs\?per_page=100$/,
      body: '{"check_runs":[]}',
    },
    {
      match: /^api repos\/owner\/repo\/actions\/runs\?head_sha=aaaa[0-9a-f]*&per_page=100$/,
      file: fixture('runs-executed.json'),
    },
  ]);
  const r = runScriptWithStub(SCRIPT, ['--execute', '102'], stub, {
    UPDATE_BRANCH_WAIT_SECONDS: '0',
  });
  assert.equal(r.status, 3, r.stdout + r.stderr);
  assert.match(r.stderr, /stopped at #102: label=blocked/);
  assert.match(r.stderr, /merged so far: \(none\)/);
  assert.ok(!stub.calls().some((c) => c.startsWith('pr merge')));
});

test('usage errors exit 64', () => {
  const stub = createGhStub([]);
  assert.equal(runScriptWithStub(SCRIPT, [], stub).status, 64);
  assert.equal(runScriptWithStub(SCRIPT, ['--execute'], stub).status, 64);
  assert.equal(runScriptWithStub(SCRIPT, ['12x'], stub).status, 64);
});

// #2095: the stub must reject the argument typos the real `gh` rejects, or a
// typo in the script passes every test above. Each mutation runs on a temp
// copy of the script; `scripts/` itself is untouched.

test('gh-stub: a --json field the fixture does not carry is "Unknown JSON field", exit 1', () => {
  const stub = createGhStub([
    { match: /^pr checks 101 --repo owner\/repo --json /, file: fixture('checks-all-pass.json') },
  ]);
  const ok = runGh(stub, [
    'pr',
    'checks',
    '101',
    '--repo',
    'owner/repo',
    '--json',
    'name,bucket,startedAt',
  ]);
  assert.equal(ok.status, 0, ok.stderr);
  const typo = runGh(stub, [
    'pr',
    'checks',
    '101',
    '--repo',
    'owner/repo',
    '--json',
    'name,bucket,startedat',
  ]);
  assert.equal(typo.status, 1, typo.stdout + typo.stderr);
  assert.match(typo.stderr, /Unknown JSON field/);
});

// #2106: the stub validates --json against the fixture's keys, so a typo shared
// by the script and the fixture would pass. This literal is the field list of
// the real `gh pr checks --json` (gh 2.x, measured 2026-09-06); every object
// key in the checks fixtures must be a member of it.
const REAL_GH_PR_CHECKS_JSON_FIELDS = [
  'bucket',
  'completedAt',
  'description',
  'event',
  'link',
  'name',
  'startedAt',
  'state',
  'workflow',
];

test('gh-stub: every key in the checks-*.json fixtures is a real gh pr checks --json field', () => {
  const names = readdirSync(dirname(fixture('checks-all-pass.json'))).filter((f) =>
    /^checks-.*\.json$/.test(f)
  );
  assert.ok(names.length >= 3, names.join(','));
  for (const name of names) {
    const doc = JSON.parse(read(name));
    const objs = (Array.isArray(doc) ? doc : [doc]).filter(
      (v) => v !== null && typeof v === 'object' && !Array.isArray(v)
    );
    for (const obj of objs) {
      for (const key of Object.keys(obj)) {
        assert.ok(
          REAL_GH_PR_CHECKS_JSON_FIELDS.includes(key),
          `${name}: "${key}" is not a gh pr checks --json field`
        );
      }
    }
  }
});

test('gh-stub: --method outside GET/POST/PUT/PATCH/DELETE and -f without key=value exit 1', () => {
  const stub = createGhStub([{ match: /^api /, body: '{}' }]);
  assert.equal(runGh(stub, ['api', '--method', 'PUT', 'repos/x']).status, 0);
  assert.equal(runGh(stub, ['api', '--method', 'PUSH', 'repos/x']).status, 1);
  assert.equal(runGh(stub, ['api', '-f', 'state=open', 'repos/x']).status, 0);
  assert.equal(runGh(stub, ['api', '-F', 'state', 'repos/x']).status, 1);
});

// #2102: `judge_pr` runs with `set -e` suspended (its return value is
// captured), so a read failure must be propagated by an explicit return, or
// the dry-run ends in verdict merge / exit 0.

test('mutation: a --json field typo in read_checks is a read failure: exit 2, never merge', () => {
  const mutant = mutateScript(
    SCRIPT,
    '--json name,bucket,startedAt',
    '--json name,bucket,startedat'
  );
  const r = runScriptWithStub(mutant, ['101'], createGhStub(cleanRoutes(101, 'pull-open.json')));
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /gh-stub: no route for: pr checks 101 .*--json name,bucket,startedat/);
  assert.match(r.stderr, /gh pr checks #101 did not return a JSON array/);
  assert.doesNotMatch(r.stdout, /\tmerge\t/);
});

test('mutation: a per_page typo in the comment reads is a read failure: exit 2, never merge', () => {
  const mutant = mutateScript(SCRIPT, 'per_page=100', 'perpage=100');
  const r = runScriptWithStub(mutant, ['101'], createGhStub(cleanRoutes(101, 'pull-open.json')));
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(
    r.stderr,
    /gh-stub: no route for: api --paginate repos\/owner\/repo\/pulls\/101\/comments\?perpage=100/
  );
  assert.match(r.stderr, /GitHub API read failed \(line comments of #101\)/);
  assert.doesNotMatch(r.stdout, /\tmerge\t/);
});

// Routes that would carry a clean PR #101 all the way to `gh pr merge`; each
// read-failure case below breaks exactly one read and asserts that the merge
// is never reached.
function executeRoutes() {
  return [
    { match: /^api user$/, body: '{"login":"s977043"}\n' },
    ...cleanRoutes(101, 'pull-open.json'),
    {
      match: /^api --method PUT repos\/owner\/repo\/pulls\/101\/update-branch$/,
      body: 'gh: There are no new commits on the base branch. (HTTP 422)\n',
      exit: 1,
    },
    {
      match: /^api repos\/owner\/repo\/commits\/e1cb880e[0-9a-f]*\/check-runs\?per_page=100$/,
      body: '{"check_runs":[{"name":"Lint","conclusion":"success"}]}',
    },
    {
      match: /^api repos\/owner\/repo\/actions\/runs\?head_sha=e1cb880e[0-9a-f]*&per_page=100$/,
      file: fixture('runs-executed.json'),
    },
    { match: /^pr merge 101 /, body: '' },
  ];
}

function assertReadFailureStopsBeforeMerge(r, stub) {
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.doesNotMatch(r.stdout, /\tmerge\t/);
  assert.ok(
    !stub.calls().some((c) => c.startsWith('pr merge')),
    `gh pr merge was reached: ${stub.calls()}`
  );
}

test('--execute: a non-object element in gh pr checks output exits 2 before gh pr merge', () => {
  const routes = executeRoutes();
  routes[4] = {
    match: /^pr checks 101 --repo owner\/repo --json name,bucket,startedAt$/,
    file: fixture('checks-non-object.json'),
  };
  const stub = createGhStub(routes);
  const r = runScriptWithStub(SCRIPT, ['--execute', '101'], stub);
  assertReadFailureStopsBeforeMerge(r, stub);
  assert.match(r.stderr, /could not judge the checks of #101/);
});

test('--execute: a failed gh api read of the issue comments exits 2 before gh pr merge', () => {
  const routes = executeRoutes();
  routes[3] = {
    match: /^api --paginate repos\/owner\/repo\/issues\/101\/comments\?per_page=100$/,
    body: 'gh: Not Found (HTTP 404)\n',
    exit: 1,
  };
  const stub = createGhStub(routes);
  const r = runScriptWithStub(SCRIPT, ['--execute', '101'], stub);
  assertReadFailureStopsBeforeMerge(r, stub);
  assert.match(r.stderr, /GitHub API read failed \(issue comments of #101\)/);
});

test('--execute: a --json field typo in read_checks exits 2 before gh pr merge', () => {
  // The copy has no wait-pr-ready.sh beside it; point SCRIPT_DIR at scripts/.
  const mutant = mutateScript(
    mutateScript(SCRIPT, '--json name,bucket,startedAt', '--json name,bucket,startedat'),
    'SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)',
    `SCRIPT_DIR='${SCRIPTS_DIR}'`
  );
  const stub = createGhStub(executeRoutes());
  const r = runScriptWithStub(mutant, ['--execute', '101'], stub);
  assertReadFailureStopsBeforeMerge(r, stub);
  assert.match(r.stderr, /gh pr checks #101 did not return a JSON array/);
});

// #2109: the pull read at the top of `judge_pr` (`pr_json=... || return 2`)
// and the `before` read in `update_branch` are the second call to
// `repos/<repo>/pulls/<N>`; the first is main()'s merged check, which has to
// succeed for the script to get that far. A route that fails from the second
// call on (`after: 1`) is what reaches these two lines; every other read stays
// healthy, so dropping the `|| return 2` would carry on to a verdict.

function pullsFailAfterFirst(pr) {
  return {
    match: new RegExp(`^api repos/owner/repo/pulls/${pr}$`),
    body: 'gh: Not Found (HTTP 404)\n',
    exit: 1,
    after: 1,
  };
}

test('dry-run: a pull read that fails at judge_pr (after the merged check passed) exits 2, never merge', () => {
  const stub = createGhStub([pullsFailAfterFirst(101), ...cleanRoutes(101, 'pull-open.json')]);
  const r = runScriptWithStub(SCRIPT, ['101'], stub);
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /GitHub API read failed \(PR #101 in owner\/repo\)/);
  assert.match(r.stderr, /could not judge #101 \(read failed\)/);
  assert.doesNotMatch(r.stdout, /\tmerge\t/);
  // calls.log keeps the --jq filter, so the merged check reads as a longer line.
  assert.equal(
    stub.calls().filter((c) => /^api repos\/owner\/repo\/pulls\/101( |$)/.test(c)).length,
    2
  );
});

test('--execute: a pull read that fails at update_branch (after the merged check passed) exits 2 before any write', () => {
  const stub = createGhStub([pullsFailAfterFirst(101), ...executeRoutes()]);
  const r = runScriptWithStub(SCRIPT, ['--execute', '101'], stub);
  assert.equal(r.status, 2, r.stdout + r.stderr);
  assert.match(r.stderr, /GitHub API read failed \(PR #101 in owner\/repo\)/);
  assert.ok(
    !stub.calls().some((c) => /--method PUT|pr merge/.test(c)),
    `a write was reached: ${stub.calls()}`
  );
});

test('gh-stub: an `after: N` route falls through N times, then answers', () => {
  const stub = createGhStub([
    { match: /^api x$/, body: 'late\n', exit: 1, after: 2 },
    { match: /^api x$/, body: 'early\n' },
  ]);
  const seen = [1, 2, 3, 4].map(() => runGh(stub, ['api', 'x']));
  assert.deepEqual(
    seen.map((r) => [r.status, r.stdout.trim()]),
    [
      [0, 'early'],
      [0, 'early'],
      [1, 'late'],
      [1, 'late'],
    ]
  );
});
