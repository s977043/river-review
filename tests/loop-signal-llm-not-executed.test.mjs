import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { runRunsCommand } from '../src/cli/commands/runs.mjs';
import { planLocalReview, runLocalReview } from '../src/lib/local-runner.mjs';
import { deriveLoopSignalFromRunsDiff } from '../src/lib/loop-signal.mjs';
import { buildRunRecord, resolveStoreDir, saveRunRecord } from '../src/lib/result-store.mjs';
import { deriveRunGate } from '../src/lib/run-gate.mjs';
import { createTempGitRepo, runGit } from './helpers/temp-repo.mjs';

// #2441 PR-B: `runs diff` reports NO_SIGNAL instead of CONVERGED when the
// latest run never reached the LLM. Driven from runLocalReview through the
// saved record and the `runs diff` handler, so the test fails if the record
// stops carrying `llmNotExecuted` or the handler stops passing the record on.
const ROLES = ['bug-hunter', 'security-scanner'];
const KEY_VARS = [
  'RIVER_OPENAI_API_KEY',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'GOOGLE_API_KEY',
  'RIVER_OFFLINE',
  'RIVER_GATE_REQUIRE_LLM',
  'RIVER_GATE_COVERAGE',
];

const noIssues = async () => ({
  ok: true,
  json: async () => ({ choices: [{ message: { content: 'NO_ISSUES' } }] }),
});

function isolateEnv(t, overrides) {
  const saved = {};
  for (const key of KEY_VARS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  Object.assign(process.env, overrides);
  t.after(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
}

async function captureStdout(fn) {
  const lines = [];
  const original = console.log;
  console.log = (...args) => lines.push(args.join(' '));
  try {
    await fn();
  } finally {
    console.log = original;
  }
  return lines.join('\n');
}

/**
 * Run two reviews of the same change, save both records the way `river run
 * --save` does, and return the `runs diff` signal plus the in-run gate.
 */
async function runTwiceAndDiff(t, { reviewers, apiKey, env = {} }) {
  isolateEnv(t, env);
  const { dir, cleanup } = await createTempGitRepo({
    prefix: 'river-review-loop-llm-',
    initialFiles: { 'src/app.js': 'export const value = 1;\n' },
    changedFiles: { 'src/app.js': 'export const value = 2;\n' },
  });
  t.after(cleanup);
  await runGit(['add', '.'], dir);

  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });
  global.fetch = noIssues;

  const storeDir = resolveStoreDir(dir);
  const gates = [];
  const records = [];
  for (const [i, runId] of ['run-1', 'run-2'].entries()) {
    const context = await planLocalReview({ cwd: dir, dryRun: true });
    const result = await runLocalReview({
      cwd: dir,
      context,
      apiKey,
      quiet: true,
      ...(reviewers ? { reviewers } : {}),
    });
    const { decision, gate } = deriveRunGate(result);
    const record = {
      ...buildRunRecord(result, { phase: 'midstream', runId, gate, decision }),
      timestamp: `2026-01-0${i + 1}T00:00:00Z`,
    };
    await saveRunRecord(record, { storeDir });
    gates.push(gate);
    records.push(record);
  }

  const out = await captureStdout(async () => {
    const code = await runRunsCommand(
      {
        runsSubcommand: 'diff',
        runsId1: 'run-1',
        runsId2: 'run-2',
        runsIds: ['run-1', 'run-2'],
        output: 'json',
      },
      dir
    );
    assert.equal(code, 0);
  });
  return { signal: JSON.parse(out).suggestedLoopSignal, gates, records };
}

for (const [pathName, reviewers] of [
  ['single reviewer', undefined],
  ['--reviewers', ROLES],
]) {
  describe(`runs diff loop signal on the ${pathName} path (#2441)`, () => {
    it('no key: NO_SIGNAL, while the default in-run gate stays GO', async (t) => {
      const { signal, gates, records } = await runTwiceAndDiff(t, { reviewers });

      assert.equal(records[1].llmNotExecuted, true);
      assert.equal(records[1].decision, 'auto-approve');
      assert.equal(signal, 'NO_SIGNAL');
      for (const gate of gates) {
        assert.equal(gate.decision, 'GO');
        assert.equal(gate.reasonCode, 'CONVERGED_CLEAN');
        assert.equal(gate.inputs.loopSignal, 'CONVERGED');
      }
    });

    it('offline with a key: NO_SIGNAL', async (t) => {
      const { signal } = await runTwiceAndDiff(t, {
        reviewers,
        apiKey: 'test-key',
        env: { RIVER_OFFLINE: '1' },
      });
      assert.equal(signal, 'NO_SIGNAL');
    });

    it('a run that reached the LLM keeps CONVERGED', async (t) => {
      const { signal, records } = await runTwiceAndDiff(t, { reviewers, apiKey: 'test-key' });

      assert.equal('llmNotExecuted' in records[1], false);
      assert.equal(signal, 'CONVERGED');
    });
  });
}

describe('deriveLoopSignalFromRunsDiff llmNotExecuted qualification (#2441)', () => {
  const clean = { decision: 'auto-approve', findings: [] };
  const blocking = {
    decision: 'human-review-required',
    findings: [{ severity: 'major' }],
  };

  it('only CONVERGED is demoted', () => {
    assert.equal(deriveLoopSignalFromRunsDiff({}, { ...clean, llmNotExecuted: true }), 'NO_SIGNAL');
    assert.equal(
      deriveLoopSignalFromRunsDiff(
        {},
        { decision: 'auto-approve', findings: blocking.findings, llmNotExecuted: true }
      ),
      'REVISE_REQUIRED'
    );
    assert.equal(
      deriveLoopSignalFromRunsDiff({}, { ...blocking, llmNotExecuted: true }),
      'ESCALATE_HUMAN'
    );
  });

  it('a record without the field or with a non-true value keeps CONVERGED', () => {
    for (const value of [undefined, false, null, 'true', 1]) {
      const record = value === undefined ? clean : { ...clean, llmNotExecuted: value };
      assert.equal(deriveLoopSignalFromRunsDiff({}, record), 'CONVERGED', `${value}`);
    }
  });

  it('the embedded runs[] fallback is qualified too', () => {
    const diff = { runs: [{ artifact: clean }, { artifact: { ...clean, llmNotExecuted: true } }] };
    assert.equal(deriveLoopSignalFromRunsDiff(diff), 'NO_SIGNAL');
    const outer = { runs: [{ artifact: clean, llmNotExecuted: true }] };
    assert.equal(deriveLoopSignalFromRunsDiff(outer), 'NO_SIGNAL');
  });
});
