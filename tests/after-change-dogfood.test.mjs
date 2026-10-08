// #2275 PR-3D: the after-change dogfood measurement and its 0-LLM-call guard.
//
// The guard is only evidence if it can fail, so the positive controls run
// first: a process that resolves a model SDK, and one that attempts a fetch or
// a TCP connection, must each be recorded. Then the real hook is driven over
// one real commit of this repository and the guard must record zero.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  CONFIGS,
  DEFAULT_POPULATION,
  EVENTS,
  llmGuardHolds,
  measure,
  percentile,
  summarize,
} from '../scripts/measure-after-change-checkpoint.mjs';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const GUARD = path.join(repoRoot, 'scripts/lib/llm-call-guard.mjs');

function runUnderGuard(source, { preload } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'river-llm-guard-'));
  try {
    const log = path.join(dir, 'guard.jsonl');
    const imports = [pathToFileURL(GUARD).href];
    if (preload) {
      const preloadPath = path.join(dir, 'preload.mjs');
      fs.writeFileSync(preloadPath, preload);
      imports.unshift(pathToFileURL(preloadPath).href);
    }
    const child = spawnSync(process.execPath, ['--input-type=module', '-'], {
      cwd: repoRoot,
      input: source,
      encoding: 'utf8',
      env: {
        PATH: process.env.PATH,
        NODE_OPTIONS: imports.map((href) => `--import=${href}`).join(' '),
        RIVER_LLM_GUARD_LOG: log,
      },
    });
    const events = fs.existsSync(log)
      ? fs
          .readFileSync(log, 'utf8')
          .split('\n')
          .filter(Boolean)
          .map((line) => JSON.parse(line).event)
      : [];
    return { events, status: child.status, stdout: child.stdout, stderr: child.stderr };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('guard positive control: a model SDK import is recorded', () => {
  const { events } = runUnderGuard("await import('openai');");
  assert.ok(events.includes('guard-loaded'));
  assert.ok(events.includes('provider-module'), `events: ${events.join(',')}`);
});

test('guard positive control: a repo-internal model module is recorded', () => {
  const { events } = runUnderGuard("await import('./src/ai/factory.mjs');");
  assert.ok(events.filter((event) => event === 'provider-module').length >= 1);
});

test('guard positive control: fetch, http and a TCP connect are recorded and refused', () => {
  const { events, stdout } = runUnderGuard(`
    import http from 'node:http';
    import net from 'node:net';
    const outcomes = [];
    try { await fetch('http://127.0.0.1:9/'); outcomes.push('fetch-ok'); } catch { outcomes.push('fetch-refused'); }
    try { http.get('http://127.0.0.1:9/'); outcomes.push('http-ok'); } catch { outcomes.push('http-refused'); }
    try { net.connect(9, '127.0.0.1'); outcomes.push('net-ok'); } catch { outcomes.push('net-refused'); }
    try { new net.Socket().connect(9, '127.0.0.1'); outcomes.push('socket-ok'); } catch { outcomes.push('socket-refused'); }
    process.stdout.write(outcomes.join(','));
  `);
  assert.equal(stdout, 'fetch-refused,http-refused,net-refused,socket-refused');
  assert.equal(events.filter((event) => event === 'network').length, 4);
});

test('guard negative control: a process that calls nothing records only its own load', () => {
  const { events } = runUnderGuard('const x = 1;');
  assert.deepEqual(events, ['guard-loaded']);
});

test('guard without module.registerHooks says so and does not record guard-loaded', () => {
  const { events, status, stderr } = runUnderGuard('const x = 1;', {
    preload: "import module from 'node:module';\ndelete module.registerHooks;\n",
  });
  assert.equal(status, 0);
  assert.match(stderr, /llm-call-guard: not loaded: module\.registerHooks is missing/);
  assert.deepEqual(events, []);
});

test('percentile is nearest-rank', () => {
  const values = Array.from({ length: 20 }, (_, i) => i + 1);
  assert.equal(percentile(values, 50), 10);
  assert.equal(percentile(values, 95), 19);
  assert.equal(percentile([7], 95), 7);
  assert.equal(percentile([], 50), null);
});

const row = ({ key = 'k', digest = 'd', status = 'pass', guard = {} } = {}) => ({
  wallMs: 1,
  digest,
  evidence:
    status == null
      ? null
      : {
          status,
          reasonCode: 'r',
          occurrenceKey: key,
          totalDurationMs: 1,
          checks: [{ status }],
        },
  guard: { loaded: true, providerModules: 0, network: 0, ...guard },
});

test('summarize separates duplicate executions from occurrence-key collisions', () => {
  const summary = summarize([
    row({ digest: 'a' }),
    row({ digest: 'b' }), // same key, different content: collision, not a duplicate
    row({ digest: 'b' }), // same key, same content: duplicate
    row({ status: null }), // the hook said "not run"
  ]);
  assert.equal(summary.rates.duplicateExecution, 1 / 3);
  assert.equal(summary.rates.occurrenceKeyCollision, 1 / 3);
  assert.equal(summary.rates.notRun, 1 / 4);
});

test('llmGuardHolds fails on a provider load, a network attempt, or evidence without the guard', () => {
  assert.equal(llmGuardHolds(summarize([row()])), true);
  assert.equal(llmGuardHolds(summarize([row({ guard: { providerModules: 1 } })])), false);
  assert.equal(llmGuardHolds(summarize([row({ guard: { network: 1 } })])), false);
  assert.equal(llmGuardHolds(summarize([row({ guard: { loaded: false } })])), false);
  // A run that never loaded the guard and produced no evidence is not a proof of 0 calls.
  const notRunWithoutGuard = row({ status: null, guard: { loaded: false } });
  assert.equal(llmGuardHolds(summarize([notRunWithoutGuard])), false);
  assert.equal(llmGuardHolds(summarize([row(), notRunWithoutGuard])), false);
  assert.equal(llmGuardHolds(summarize([])), false);
});

const SCRIPT = path.join(repoRoot, 'scripts/measure-after-change-checkpoint.mjs');

test('--base rejects a missing value and an option-like value with a usage error', () => {
  for (const args of [['--base'], ['--base', '--all'], ['--base', '-n'], ['--base', '--json']]) {
    const child = spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf8' });
    assert.equal(child.status, 2, `args: ${args.join(' ')}`);
    assert.match(child.stderr, /--base requires a commit/);
  }
});

test('measure refuses a base that does not resolve to a commit instead of measuring HEAD', () => {
  for (const base of ['--all', 'no-such-ref']) {
    assert.throws(() => measure({ base, count: 1 }), /--base does not name a commit/);
  }
});

test('the real hook over a real commit makes 0 LLM calls and never reports a silent skip', () => {
  assert.deepEqual(EVENTS, ['partial', 'full', 'repeat']);
  assert.deepEqual(CONFIGS, ['repo-default', 'trusted-true']);
  const result = measure({ base: DEFAULT_POPULATION.base, count: 1 });
  assert.equal(result.population.commits, 1);
  assert.equal(result.runs.length, EVENTS.length * CONFIGS.length);
  for (const run of result.runs) {
    assert.equal(run.exitCode, 0, 'the hook never blocks');
    assert.ok(run.evidence != null, `no evidence for ${run.event}/${run.config}: ${run.stdout}`);
    assert.ok(run.guard.loaded, 'the guard must have been loaded into the adapter process');
  }
  for (const config of CONFIGS) {
    assert.ok(llmGuardHolds(result.summaries[config]), `0-LLM guard failed for ${config}`);
  }
  // Not vacuous: with a trusted allowlist the checks really executed ...
  assert.equal(result.summaries['trusted-true'].executedRuns, EVENTS.length);
  // ... and the shipped configuration says why it ran nothing, instead of passing.
  assert.deepEqual(result.summaries['repo-default'].reasonCounts, {
    'no-deterministic-check-selected': EVENTS.length,
  });
});
