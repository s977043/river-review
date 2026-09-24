import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { formatJsonOutput } from '../src/cli/render.mjs';
import { resolveGateExitCode } from '../src/lib/gate-exit.mjs';
import { planLocalReview, runLocalReview } from '../src/lib/local-runner.mjs';
import { deriveRunGate } from '../src/lib/run-gate.mjs';
import { createTempGitRepo, runGit } from './helpers/temp-repo.mjs';

// #2436: a --reviewers role whose LLM call failed is `rejected`, so a run in
// which every role failed stops at ESCALATE (exit 3) instead of GO. Checked
// from runLocalReview through deriveRunGate and the --gate exit code.
const ROLES = ['bug-hunter', 'security-scanner'];

const fail400 = async () => ({ ok: false, status: 400, text: async () => 'bad request' });
const noIssues = async () => ({
  ok: true,
  json: async () => ({ choices: [{ message: { content: 'NO_ISSUES' } }] }),
});

async function runGated(t, fetchImpl, extra = {}) {
  const { dir, cleanup } = await createTempGitRepo({
    prefix: 'river-review-llm-failure-gate-',
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
  global.fetch = fetchImpl;

  const result = await runLocalReview({
    cwd: dir,
    context,
    dryRun: false,
    apiKey: 'test-key',
    quiet: true,
    reviewers: ROLES,
    ...extra,
  });
  const { decision, gate } = deriveRunGate(result);
  const exitCode = await resolveGateExitCode({
    gate: true,
    getGateInput: () => ({ findings: formatJsonOutput(result, 'midstream').issues }),
    getGateObject: () => gate,
  });
  const statuses = Object.fromEntries(result.reviewerResults.map((r) => [r.role, r.status]));
  const blindSpots = result.teamLeadReport.blindSpots.map((b) => b.role);
  return { result, decision, gate, exitCode, statuses, blindSpots };
}

describe('--reviewers LLM failure reaches the gate (#2436)', () => {
  it('escalates (exit 3) when every role fails its LLM call', async (t) => {
    const { result, decision, gate, exitCode, statuses, blindSpots } = await runGated(t, fail400);

    assert.deepEqual(statuses, { 'bug-hunter': 'rejected', 'security-scanner': 'rejected' });
    assert.equal(result.reviewerResults[0].error, 'OpenAI API error 400: bad request');
    assert.equal(decision, 'human-review-required');
    assert.equal(gate.decision, 'ESCALATE');
    assert.equal(exitCode, 3);
    for (const role of ROLES) assert.ok(blindSpots.includes(role), role);
    assert.equal(result.reviewDebug.succeededReviewers, 0);
    assert.equal(result.reviewDebug.failedReviewers, 2);
  });

  it('keeps GO (exit 0) when only one role fails its LLM call', async (t) => {
    const marker = 'You are the Bug Hunter reviewer.';
    const { result, gate, exitCode, statuses, blindSpots } = await runGated(t, async (url, init) =>
      String(init?.body ?? '').includes(marker) ? fail400() : noIssues()
    );

    assert.deepEqual(statuses, { 'bug-hunter': 'rejected', 'security-scanner': 'fulfilled' });
    assert.equal(gate.decision, 'GO');
    assert.equal(exitCode, 0);
    assert.ok(blindSpots.includes('bug-hunter'));
    assert.ok(!blindSpots.includes('security-scanner'));
    assert.equal(result.reviewDebug.succeededReviewers + result.reviewDebug.failedReviewers, 2);
  });

  // Skipped roles stay fulfilled here; the no-key GO is tracked by #2441.
  it('leaves an all-skipped (no API key) run unchanged', async (t) => {
    const saved = {};
    for (const key of ['RIVER_OPENAI_API_KEY', 'OPENAI_API_KEY']) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
    t.after(() => {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    });
    const { gate, exitCode, statuses } = await runGated(t, fail400, { apiKey: undefined });

    assert.deepEqual(statuses, { 'bug-hunter': 'fulfilled', 'security-scanner': 'fulfilled' });
    assert.equal(gate.decision, 'GO');
    assert.equal(exitCode, 0);
  });
});
