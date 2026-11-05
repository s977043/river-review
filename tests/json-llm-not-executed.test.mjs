import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { formatJsonOutput, getOutputSchemaValidator } from '../src/cli/render.mjs';
import { planLocalReview, runLocalReview } from '../src/lib/local-runner.mjs';
import { createTempGitRepo, runGit } from './helpers/temp-repo.mjs';

// #2812 案 A: `--output json` exposes whether any unit reached the LLM, with
// decision and gate unchanged. Checked through formatJsonOutput on the output
// of runLocalReview.
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

async function jsonRun(t, { reviewers, apiKey, dryRun = false, env = {} }) {
  const saved = {};
  for (const key of KEY_VARS) {
    saved[key] = process.env[key];
    delete process.env[key];
  }
  Object.assign(process.env, env);
  t.after(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  const { dir, cleanup } = await createTempGitRepo({
    prefix: 'river-review-json-llm-not-executed-',
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
    apiKey,
    dryRun,
    quiet: true,
    ...(reviewers ? { reviewers } : {}),
  });
  const output = formatJsonOutput(result, 'midstream');
  const validate = getOutputSchemaValidator();
  assert.ok(validate, 'output schema validator must load');
  assert.ok(validate(output), JSON.stringify(validate.errors));
  return output;
}

function assertGateUnchanged(output) {
  assert.equal(output.gate.decision, 'GO');
  assert.equal(output.gate.reasonCode, 'CONVERGED_CLEAN');
  assert.equal(output.gate.inputs.reviewExecuted, true);
  assert.equal('llmNotExecuted' in output.gate.inputs, false);
}

describe('--output json exposes llmNotExecuted (#2812)', () => {
  it('no key: llmNotExecuted true, gate unchanged', async (t) => {
    const output = await jsonRun(t, {});
    assert.equal(output.llmNotExecuted, true);
    assertGateUnchanged(output);
  });

  it('--reviewers auto, no key: llmNotExecuted true, gate unchanged', async (t) => {
    const output = await jsonRun(t, { reviewers: ['auto'] });
    assert.equal(output.llmNotExecuted, true);
    assertGateUnchanged(output);
  });

  it('offline: llmNotExecuted true, gate unchanged', async (t) => {
    const output = await jsonRun(t, { apiKey: 'test-key', env: { RIVER_OFFLINE: '1' } });
    assert.equal(output.llmNotExecuted, true);
    assertGateUnchanged(output);
  });

  it('dry-run with key: llmNotExecuted true', async (t) => {
    const output = await jsonRun(t, { apiKey: 'test-key', dryRun: true });
    assert.equal(output.llmNotExecuted, true);
  });

  it('key and NO_ISSUES: llmNotExecuted false, gate unchanged', async (t) => {
    const output = await jsonRun(t, { apiKey: 'test-key' });
    assert.equal(output.llmNotExecuted, false);
    assertGateUnchanged(output);
  });
});
