import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { formatJsonOutput } from '../src/cli/render.mjs';
import {
  deriveGateDecision,
  isRequireLlmGateEnabled,
  llmNotExecutedForGate,
} from '../src/lib/gate-decision.mjs';
import { resolveGateExitCode } from '../src/lib/gate-exit.mjs';
import { planLocalReview, runLocalReview } from '../src/lib/local-runner.mjs';
import { buildRunRecord } from '../src/lib/result-store.mjs';
import { allLlmAttemptsSkipped } from '../src/lib/review-coverage.mjs';
import { deriveRunGate } from '../src/lib/run-gate.mjs';
import { createTempGitRepo, runGit } from './helpers/temp-repo.mjs';

// #2441 PR-A: RIVER_GATE_REQUIRE_LLM=1 escalates a run in which no unit
// reached the LLM. Checked from runLocalReview through deriveRunGate and the
// --gate exit code, on both the single-reviewer and --reviewers paths.
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

async function runGated(t, { reviewers, apiKey, dryRun = false, env = {} }) {
  isolateEnv(t, env);
  const { dir, cleanup } = await createTempGitRepo({
    prefix: 'river-review-require-llm-',
    initialFiles: { 'src/app.js': 'export const value = 1;\n' },
    changedFiles: { 'src/app.js': 'export const value = 2;\n' },
  });
  t.after(cleanup);
  await runGit(['add', '.'], dir);

  const context = await planLocalReview({ cwd: dir, dryRun: true });
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });
  global.fetch = noIssues;

  const result = await runLocalReview({
    cwd: dir,
    context,
    dryRun,
    apiKey,
    quiet: true,
    ...(reviewers ? { reviewers } : {}),
  });
  const { decision, gate } = deriveRunGate(result);
  const exitCode = await resolveGateExitCode({
    gate: true,
    getGateInput: () => ({ findings: formatJsonOutput(result, 'midstream').issues }),
    getGateObject: () => gate,
  });
  const record = buildRunRecord(result, { phase: 'midstream', runId: 'r1', gate, decision });
  return { result, decision, gate, exitCode, record };
}

const ON = { RIVER_GATE_REQUIRE_LLM: '1' };

for (const [pathName, reviewers] of [
  ['single reviewer', undefined],
  ['--reviewers', ROLES],
]) {
  describe(`RIVER_GATE_REQUIRE_LLM on the ${pathName} path (#2441)`, () => {
    it('no key, opt-in off: unchanged GO / exit 0 and no llmNotExecuted gate input', async (t) => {
      const { result, gate, exitCode, record } = await runGated(t, { reviewers });

      assert.equal(result.llmNotExecuted, true);
      assert.equal(record.llmNotExecuted, true);
      assert.equal(gate.decision, 'GO');
      assert.equal(gate.reasonCode, 'CONVERGED_CLEAN');
      assert.equal('llmNotExecuted' in gate.inputs, false);
      assert.equal(exitCode, 0);
    });

    it('no key, opt-in on: ESCALATE LLM_NOT_EXECUTED / exit 3', async (t) => {
      const { gate, exitCode } = await runGated(t, { reviewers, env: ON });

      assert.equal(gate.decision, 'ESCALATE');
      assert.equal(gate.reasonCode, 'LLM_NOT_EXECUTED');
      assert.equal(gate.inputs.llmNotExecuted, true);
      assert.equal(exitCode, 3);
    });

    it('offline, opt-in on: ESCALATE / exit 3', async (t) => {
      const { gate, exitCode } = await runGated(t, {
        reviewers,
        apiKey: 'test-key',
        env: { ...ON, RIVER_OFFLINE: '1' },
      });

      assert.equal(gate.reasonCode, 'LLM_NOT_EXECUTED');
      assert.equal(exitCode, 3);
    });

    it('key and completed LLM, opt-in on: unchanged GO / exit 0', async (t) => {
      const { result, gate, exitCode, record } = await runGated(t, {
        reviewers,
        apiKey: 'test-key',
        env: ON,
      });

      assert.equal(result.llmNotExecuted, false);
      assert.equal('llmNotExecuted' in record, false);
      assert.equal(gate.decision, 'GO');
      assert.equal('llmNotExecuted' in gate.inputs, false);
      assert.equal(exitCode, 0);
    });

    it('dry-run, opt-in on: the existing NO_GO NOT_EXECUTED wins / exit 1', async (t) => {
      const { result, gate, exitCode } = await runGated(t, { reviewers, dryRun: true, env: ON });

      assert.equal(result.llmNotExecuted, true);
      assert.equal(gate.decision, 'NO_GO');
      assert.equal(gate.reasonCode, 'NOT_EXECUTED');
      assert.equal(exitCode, 1);
    });
  });
}

describe('require-LLM gate contract (#2441)', () => {
  const clean = {
    loopSignal: 'CONVERGED',
    decision: 'auto-approve',
    riskAction: 'comment_only',
    reviewExecuted: true,
    artifactStatus: 'ok',
  };

  it('llmNotExecuted: false is byte-identical to omitting it, with the pinned hash', () => {
    const omitted = deriveGateDecision(clean);
    assert.equal(omitted.inputsHash, '6a8782d067d92821');
    assert.equal(
      JSON.stringify(deriveGateDecision({ ...clean, llmNotExecuted: false })),
      JSON.stringify(omitted)
    );
  });

  it('the opt-in is strict: only the exact string "1" turns it on', () => {
    for (const value of ['true', '0', ' 1', '', 'yes', undefined]) {
      assert.equal(isRequireLlmGateEnabled({ RIVER_GATE_REQUIRE_LLM: value }), false, `${value}`);
    }
    assert.equal(isRequireLlmGateEnabled(undefined), false);
    assert.equal(llmNotExecutedForGate(true, {}), false);
    assert.equal(llmNotExecutedForGate(true, ON), true);
    assert.equal(llmNotExecutedForGate(false, ON), false);
  });

  it('coverage incomplete keeps NO_GO ahead of the require-LLM rule', () => {
    const gate = deriveGateDecision({ ...clean, coverageIncomplete: true, llmNotExecuted: true });
    assert.equal(gate.reasonCode, 'COVERAGE_INCOMPLETE');
  });

  it('blocking findings keep NO_GO BLOCKING_FINDINGS ahead of the require-LLM rule', () => {
    const gate = deriveGateDecision({
      ...clean,
      loopSignal: 'REVISE_REQUIRED',
      decision: 'human-review-required',
      blockingFindings: 1,
      llmNotExecuted: true,
    });
    assert.equal(gate.decision, 'NO_GO');
    assert.equal(gate.reasonCode, 'BLOCKING_FINDINGS');
  });

  for (const loopSignal of ['CONVERGED', 'NO_SIGNAL']) {
    it(`${loopSignal} + human-review-recommended escalates instead of a GO-family outcome`, () => {
      const gate = deriveGateDecision({
        ...clean,
        loopSignal,
        decision: 'human-review-recommended',
        llmNotExecuted: true,
      });
      assert.equal(gate.decision, 'ESCALATE');
      assert.equal(gate.reasonCode, 'LLM_NOT_EXECUTED');
    });
  }

  it('only an all-skip list counts as "not executed"', () => {
    const skip = { llmUsed: false, llmSkipped: 'offline (rules-only) mode enabled' };
    assert.equal(allLlmAttemptsSkipped([skip, skip]), true);
    assert.equal(allLlmAttemptsSkipped([]), false);
    assert.equal(allLlmAttemptsSkipped([skip, undefined]), false);
    assert.equal(allLlmAttemptsSkipped([skip, { llmUsed: true }]), false);
    assert.equal(allLlmAttemptsSkipped([skip, { llmUsed: false, llmError: 'x' }]), false);
    assert.equal(allLlmAttemptsSkipped([skip, {}]), false);
  });
});
