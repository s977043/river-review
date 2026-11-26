// LLM の所見は選ばれた全 skill をまとめた 1 本のプロンプトから出るので、特定の skill に
// 紐づかない。verifier が先頭 skill（この差分では minor の a11y-accessible-name）の severity を
// 上限にすると warning / blocker が棄却され、Gate が GO になっていた。`river run` の本番経路で固定する。
//
// LLM 呼び出しは globalThis.fetch の stub で置き換える。キーは偽の文字列で、network へは出ない。

import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { runCliInProcess } from './helpers/cli.mjs';
import { createTempGitRepo, runGit } from './helpers/temp-repo.mjs';

const LLM_ENV_KEYS = [
  'RIVER_OPENAI_API_KEY',
  'RIVER_OPENAI_BASE_URL',
  'ANTHROPIC_API_KEY',
  'GOOGLE_API_KEY',
  'RIVER_OFFLINE',
  'RIVER_GATE_REQUIRE_LLM',
  'RIVER_GATE_COVERAGE',
  'RIVER_AUTO_SAVE',
  'RIVER_PHASE',
  'RIVER_PLANNER_MODE',
  'RIVER_FINDING_CRITIC',
  'RIVER_DEPENDENCY_STUBS',
  'RIVER_AVAILABLE_CONTEXTS',
  'RIVER_AVAILABLE_DEPENDENCIES',
  'RIVER_PR_LABELS',
  'RIVER_PR_BODY',
  'GITHUB_EVENT_PATH',
];
const ENV = {
  ...Object.fromEntries(LLM_ENV_KEYS.map((key) => [key, undefined])),
  RIVER_REVIEW_DISABLE_GLOBAL_CONFIG: '1',
  OPENAI_API_KEY: 'test-key-not-a-real-credential',
};

const llmFinding = (severity) =>
  `src/app.js:2: Finding: 入力をそのまま eval している Evidence: src/app.js の eval(input) が追加された Impact: 任意コードが実行される Fix: eval をやめて JSON.parse で読む Severity: ${severity} Confidence: high`;

let originalFetch;
beforeEach(() => {
  originalFetch = globalThis.fetch;
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

// The first call is the review; later calls (the Finding Critic) get `criticReply`.
async function runWithLlm(t, reply, { env = {}, criticReply = 'NO_REPLY' } = {}) {
  let calls = 0;
  globalThis.fetch = async () => {
    const content = calls++ === 0 ? reply : criticReply;
    return {
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content } }] }),
      text: async () => '',
    };
  };
  const { dir, cleanup } = await createTempGitRepo({
    prefix: 'river-review-severity-attribution-',
    initialFiles: { 'src/app.js': 'export const value = 1;\n' },
    changedFiles: {
      'src/app.js': 'export const value = 1;\nexport const run = (input) => eval(input);\n',
    },
  });
  t.after(cleanup);
  await runGit(['add', '.'], dir);
  const { code, stdout } = await runCliInProcess(['run', '.', '--gate', '--output', 'json'], {
    cwd: dir,
    env: { ...ENV, ...env },
  });
  return { exit: code, output: JSON.parse(stdout) };
}

describe('LLM findings are not capped by the first selected skill severity', () => {
  it('a blocker and a warning reach issues and escalate the gate', async (t) => {
    const { exit, output } = await runWithLlm(
      t,
      `${llmFinding('blocker')}\n${llmFinding('warning')}`
    );
    assert.deepEqual(
      output.issues.map((issue) => issue.severity),
      ['critical', 'major']
    );
    assert.equal(output.decision, 'human-review-required');
    assert.equal(output.gate.decision, 'ESCALATE');
    assert.equal(exit, 3);
  });

  it('a warning alone blocks the gate', async (t) => {
    const { exit, output } = await runWithLlm(t, llmFinding('warning'));
    assert.deepEqual(
      output.issues.map((issue) => issue.severity),
      ['major']
    );
    assert.equal(output.gate.decision, 'NO_GO');
    assert.equal(output.gate.reasonCode, 'BLOCKING_FINDINGS');
    assert.equal(exit, 1);
  });

  // The Finding Critic's deterministic pre-check runs the same verifier; enabling the Critic must
  // not drop the blocker again and loosen the gate.
  it('with the Finding Critic on, an agreed blocker still escalates the gate', async (t) => {
    const agree = JSON.stringify({
      finding_id: 'rr-1',
      verdict: 'AGREE',
      reason: 'eval runs the input',
      ask_relevance: 'in-ask',
      evidence: [
        { artifact: 'src/app.js', line_start: 2, line_end: 2, observation: 'eval(input)' },
      ],
    });
    const { exit, output } = await runWithLlm(t, llmFinding('blocker'), {
      env: { RIVER_FINDING_CRITIC: '1' },
      criticReply: agree,
    });
    assert.deepEqual(
      output.issues.map((issue) => issue.severity),
      ['critical']
    );
    assert.equal(output.gate.decision, 'ESCALATE');
    assert.equal(exit, 3);
  });
});
