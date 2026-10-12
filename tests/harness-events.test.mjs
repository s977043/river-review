import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, test } from 'node:test';

import {
  EXCERPT_MAX,
  loadKnownRuleIds,
  main,
  truncateExcerpt,
} from '../scripts/harness/record-event.mjs';
import { spawnSyncGuarded } from './helpers/spawn-guard.mjs';

// agent harness のイベントログ（docs/development/agent-harness-design.md「追加する signal」）を、
// hook の実プロセス実行と CLI の両方から検証する。記録先は必ず HARNESS_EVENTS_PATH で一時領域へ向け、
// 実 home の ~/.claude/state には触れない。
const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const HOOKS = path.join(REPO_ROOT, '.claude', 'hooks');
const EVENT_KEYS = ['cwd', 'detail', 'kind', 'ruleId', 'session_id', 'source', 'ts'];
const TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

const GH_STUB = `#!/usr/bin/env bash
if [ "$1" = "api" ] && [ "$2" = "user" ]; then
  printf '%s\\n' "\${FAKE_GH_LOGIN:-s977043}"
  exit 0
fi
if [ "$1" = "auth" ] && [ "$2" = "switch" ]; then
  exit "\${FAKE_GH_SWITCH_EXIT:-0}"
fi
exit 0
`;

function readEvents(file) {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter((l) => l !== '')
    .map((l) => JSON.parse(l));
}

describe('harness event log', () => {
  let tmp;
  let ghDir;
  let unwritable;
  let counter = 0;

  before(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-harness-events-'));
    ghDir = path.join(tmp, 'bin');
    fs.mkdirSync(ghDir);
    fs.writeFileSync(path.join(ghDir, 'gh'), GH_STUB, { mode: 0o755 });
    // 通常ファイルの配下は mkdir も追記もできない。
    const blocker = path.join(tmp, 'not-a-dir');
    fs.writeFileSync(blocker, '');
    unwritable = path.join(blocker, 'state', 'harness-events.jsonl');
  });

  after(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  function freshLog() {
    counter += 1;
    return path.join(tmp, `events-${counter}`, 'harness-events.jsonl');
  }

  function runHook(name, command, { eventsPath, login = 's977043', switchExit = 0 } = {}) {
    const res = spawnSyncGuarded('bash', [path.join(HOOKS, name)], {
      input: JSON.stringify({
        session_id: 'sess-1',
        cwd: REPO_ROOT,
        tool_name: 'Bash',
        tool_input: { command },
      }),
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${ghDir}${path.delimiter}${process.env.PATH}`,
        FAKE_GH_LOGIN: login,
        FAKE_GH_SWITCH_EXIT: String(switchExit),
        GH_ACCOUNT_GUARD_EXPECTED: 's977043',
        HARNESS_EVENTS_PATH: eventsPath,
      },
    });
    return { status: res.status, stdout: res.stdout, stderr: res.stderr };
  }

  describe('no-force-push.sh', () => {
    test('a block appends one event in the common format', () => {
      const log = freshLog();
      const r = runHook('no-force-push.sh', 'git push --force origin feat/x', { eventsPath: log });
      assert.equal(r.status, 2);
      const events = readEvents(log);
      assert.equal(events.length, 1);
      const [e] = events;
      assert.deepEqual(Object.keys(e).sort(), EVENT_KEYS);
      assert.match(e.ts, TS_RE);
      assert.equal(e.source, 'hook:no-force-push');
      assert.equal(e.kind, 'block');
      assert.equal(e.ruleId, '');
      assert.equal(e.cwd, REPO_ROOT);
      assert.equal(e.session_id, 'sess-1');
      assert.equal(e.detail.tool_name, 'Bash');
      assert.match(e.detail.excerpt, /git push --force/);
    });

    test('the excerpt is the matched segment, not the quoted text around it', () => {
      const log = freshLog();
      const r = runHook(
        'no-force-push.sh',
        'git commit -m "token ghp_SECRETVALUE" && git push origin feat/x --force',
        { eventsPath: log }
      );
      assert.equal(r.status, 2);
      const [e] = readEvents(log);
      assert.match(e.detail.excerpt, /push origin feat\/x --force/);
      assert.doesNotMatch(e.detail.excerpt, /SECRETVALUE|commit/);
    });

    test('an allowed command writes nothing', () => {
      const log = freshLog();
      assert.equal(
        runHook('no-force-push.sh', 'git push origin feat/x', { eventsPath: log }).status,
        0
      );
      assert.deepEqual(readEvents(log), []);
    });

    test('an unwritable log changes neither exit code nor stdout/stderr', () => {
      for (const cmd of ['git push --force origin feat/x', 'git reset --hard', 'git status -sb']) {
        const ok = runHook('no-force-push.sh', cmd, { eventsPath: freshLog() });
        const bad = runHook('no-force-push.sh', cmd, { eventsPath: unwritable });
        assert.deepEqual(bad, ok, cmd);
      }
      assert.equal(fs.existsSync(unwritable), false);
    });
  });

  describe('gh-account-guard.sh', () => {
    test('a blocked write appends a block event tied to the ledger id', async () => {
      const log = freshLog();
      const r = runHook(
        'gh-account-guard.sh',
        'gh pr create --title t --body "contains a secret value"',
        { eventsPath: log, login: 'kominem-unilabo', switchExit: 1 }
      );
      assert.equal(r.status, 2);
      const events = readEvents(log);
      assert.equal(events.length, 1);
      const [e] = events;
      assert.deepEqual(Object.keys(e).sort(), EVENT_KEYS);
      assert.equal(e.source, 'hook:gh-account-guard');
      assert.equal(e.kind, 'block');
      assert.equal(e.ruleId, 'verify-gh-active-account');
      assert.ok((await loadKnownRuleIds()).has(e.ruleId));
      assert.equal(e.detail.excerpt, 'gh pr create --title');
    });

    test('the excerpt names the write when a read comes first', () => {
      const log = freshLog();
      runHook('gh-account-guard.sh', 'gh pr view 1 && gh pr merge 2 --squash', {
        eventsPath: log,
        login: 'kominem-unilabo',
        switchExit: 1,
      });
      assert.equal(readEvents(log)[0].detail.excerpt, 'gh pr merge 2');
    });

    test('a read whose switch fails appends a warn event', () => {
      const log = freshLog();
      const r = runHook('gh-account-guard.sh', 'gh pr view 123 --json url', {
        eventsPath: log,
        login: 'kominem-unilabo',
        switchExit: 1,
      });
      assert.equal(r.status, 0);
      const events = readEvents(log);
      assert.equal(events.length, 1);
      assert.equal(events[0].kind, 'warn');
      assert.equal(events[0].detail.excerpt, 'gh pr view 123');
    });

    test('a successful switch or the expected account writes nothing', () => {
      const log = freshLog();
      runHook('gh-account-guard.sh', 'gh pr merge 1', {
        eventsPath: log,
        login: 'kominem-unilabo',
      });
      runHook('gh-account-guard.sh', 'gh pr merge 1', { eventsPath: log });
      assert.deepEqual(readEvents(log), []);
    });

    test('an unwritable log changes neither exit code nor stdout/stderr', () => {
      for (const [cmd, opts] of [
        ['gh pr merge 1', { login: 'kominem-unilabo', switchExit: 1 }],
        ['gh pr view 1', { login: 'kominem-unilabo', switchExit: 1 }],
        ['gh pr view 1', { login: 'kominem-unilabo' }],
      ]) {
        const ok = runHook('gh-account-guard.sh', cmd, { ...opts, eventsPath: freshLog() });
        const bad = runHook('gh-account-guard.sh', cmd, { ...opts, eventsPath: unwritable });
        assert.deepEqual(bad, ok, cmd);
      }
    });
  });

  describe('harness-event.sh writer', () => {
    function callWriter(args, eventsPath) {
      return spawnSyncGuarded(
        'bash',
        [
          '-c',
          '. "$1"; shift; harness_event "$@"; echo "rc=$?"',
          'x',
          path.join(HOOKS, 'harness-event.sh'),
          ...args,
        ],
        { encoding: 'utf8', env: { ...process.env, HARNESS_EVENTS_PATH: eventsPath } }
      );
    }

    test('truncates the excerpt to EXCERPT_MAX code points and flattens newlines', () => {
      const log = freshLog();
      const long = `a\nb${'あ'.repeat(200)}`;
      const r = callWriter(['script:test', 'self-report', '', long], log);
      assert.equal(r.stdout, 'rc=0\n');
      assert.equal(r.stderr, '');
      const [e] = readEvents(log);
      assert.equal(e.detail.excerpt, truncateExcerpt(long));
      assert.equal(Array.from(e.detail.excerpt).length, EXCERPT_MAX);
      assert.ok(e.detail.excerpt.startsWith('a b'));
    });

    test('rejects an unknown kind or a malformed source silently', () => {
      const log = freshLog();
      for (const args of [
        ['hook:x', 'error', '', 'e'],
        ['x', 'block', '', 'e'],
        ['hook:Bad_Name', 'block', '', 'e'],
      ]) {
        const r = callWriter(args, log);
        assert.equal(r.stdout, 'rc=0\n', JSON.stringify(args));
        assert.equal(r.stderr, '', JSON.stringify(args));
      }
      assert.deepEqual(readEvents(log), []);
    });
  });

  describe('record-event.mjs', () => {
    const base = ['--source', 'command:range-review', '--kind', 'self-report'];

    test('appends a self-report in the same shape as the hook writer', async () => {
      const log = freshLog();
      const code = await main(
        [...base, '--rule-id', 'no-cd-in-bash', '--excerpt', 'ran cd in Bash', '--session-id', 's'],
        { HARNESS_EVENTS_PATH: log }
      );
      assert.equal(code, 0);
      const [e] = readEvents(log);
      assert.deepEqual(Object.keys(e).sort(), EVENT_KEYS);
      assert.deepEqual(Object.keys(e.detail).sort(), ['excerpt', 'tool_name']);
      assert.match(e.ts, TS_RE);
      assert.equal(e.source, 'command:range-review');
      assert.equal(e.kind, 'self-report');
      assert.equal(e.ruleId, 'no-cd-in-bash');
      assert.equal(e.cwd, process.cwd());
      assert.equal(e.detail.excerpt, 'ran cd in Bash');
    });

    test('accepts guard-ledger ids and an empty rule id', async () => {
      const log = freshLog();
      assert.equal(
        await main([...base, '--rule-id', 'verify-gh-active-account'], {
          HARNESS_EVENTS_PATH: log,
        }),
        0
      );
      assert.equal(await main(base, { HARNESS_EVENTS_PATH: log }), 0);
      assert.deepEqual(
        readEvents(log).map((e) => e.ruleId),
        ['verify-gh-active-account', '']
      );
    });

    test('truncates the excerpt', async () => {
      const log = freshLog();
      await main([...base, '--excerpt', '🙂'.repeat(500)], { HARNESS_EVENTS_PATH: log });
      assert.equal(Array.from(readEvents(log)[0].detail.excerpt).length, EXCERPT_MAX);
    });

    test('rejects a bad kind, source or rule id with exit 2 and writes nothing', async () => {
      const log = freshLog();
      for (const argv of [
        ['--source', 'command:range-review', '--kind', 'error'],
        ['--source', 'range-review', '--kind', 'self-report'],
        ['--kind', 'self-report'],
        [...base, '--rule-id', 'no-such-rule'],
        [...base, '--unknown-flag'],
      ]) {
        assert.equal(await main(argv, { HARNESS_EVENTS_PATH: log }), 2, JSON.stringify(argv));
      }
      assert.deepEqual(readEvents(log), []);
    });

    test('an unwritable log exits 1', async () => {
      assert.equal(await main(base, { HARNESS_EVENTS_PATH: unwritable }), 1);
    });

    test('runs as a CLI', () => {
      const log = freshLog();
      const r = spawnSyncGuarded(
        process.execPath,
        [path.join(REPO_ROOT, 'scripts/harness/record-event.mjs'), ...base],
        { encoding: 'utf8', env: { ...process.env, HARNESS_EVENTS_PATH: log } }
      );
      assert.equal(r.status, 0, r.stderr);
      assert.equal(readEvents(log).length, 1);
    });
  });
});
