// #2342 — review-plan の exec / replay 経路が generateReview へ prBody を渡すこと。
//
// Finding Critic（opt-in、RIVER_FINDING_CRITIC=1）は generateReview の prBody を
// originalAsk として読む（src/lib/review-engine.mjs の runFindingCriticStage 呼び出し）。
// 2 経路が prBody を渡さないと ask が常に空になり、関連性が判定できず
// 全 finding が humanReview へ倒れる（fixture F12）。
//
// prBody の出所は local runner と同じ resolvePullRequestBody
// （RIVER_PR_BODY → GITHUB_EVENT_PATH の pull_request.body）。replay の source plan
// の snapshot は PR 本文を持たないので、replay も実行時の環境から解決する。
//
// 検査は 2 層で行う。
//   1. generateReviewImpl を差し替え、2 経路が受け取る引数を直接見る
//   2. 実 generateReview を通し（fetch だけ差し替え）、Critic を有効にした exec 経路で
//      PR 本文があれば finding が「ask が空だから」という理由で humanReview に
//      ならないことを見る。偽 LLM は prompt に ask が載っているかで ask_relevance を
//      返し分けるので、配線が外れると F12 と同じ uncertain → humanReview に戻る。
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';

import { runReviewPlan, runReviewExecReplay } from '../src/lib/review-plan.mjs';

const PR_BODY = 'fetchUrl() must reject hosts outside the allowlist, including after redirects.';

const DIFF_TEXT = `diff --git a/src/lib/fetch-url.mjs b/src/lib/fetch-url.mjs
index 1111111..2222222 100644
--- a/src/lib/fetch-url.mjs
+++ b/src/lib/fetch-url.mjs
@@ -1,1 +1,5 @@
 // fetch helper
+export async function fetchUrl(url) {
+  if (!ALLOWED_HOSTS.has(new URL(url).host)) throw new Error('blocked');
+  return fetch(url);
+}
`;

const diffPath = '/repo/diff.patch';
const resolveDiff = () => ({ diff: { exists: true, path: diffPath, source: 'cwd' } });
const SKILL = {
  metadata: {
    id: 'security',
    name: 'Security',
    phase: 'midstream',
    applyTo: ['src/**'],
  },
};

const ENV_KEYS = [
  'RIVER_PR_BODY',
  'GITHUB_EVENT_PATH',
  'RIVER_FINDING_CRITIC',
  'RIVER_OPENAI_API_KEY',
  'OPENAI_API_KEY',
  'RIVER_OFFLINE',
];
let savedEnv;
let savedFetch;
let tmpDir;

function writePlanFile() {
  const planFile = path.join(tmpDir, 'plan.json');
  writeFileSync(
    planFile,
    JSON.stringify({
      version: '1',
      timestamp: '2026-01-01T00:00:00.000Z',
      phase: 'midstream',
      status: 'ok',
      plan: {
        plannerMode: 'off',
        selectedSkills: [{ id: 'security', name: 'Security' }],
        skippedSkills: [],
      },
    })
  );
  return planFile;
}

function runExec(generateReviewImpl) {
  return runReviewPlan({
    planOnly: true,
    executeReview: true,
    loadConfigImpl: async () => ({}),
    resolveAllArtifactsImpl: resolveDiff,
    readFileImpl: async () => DIFF_TEXT,
    buildExecutionPlanImpl: async () => ({ selected: [SKILL], skipped: [] }),
    loadRiskMapImpl: async () => null,
    humanApprovalAdjudicator: null,
    ...(generateReviewImpl ? { generateReviewImpl } : {}),
  });
}

function runReplay(generateReviewImpl) {
  const planFile = writePlanFile();
  return runReviewExecReplay({
    planFile,
    executeReview: true,
    loadConfigImpl: async () => ({}),
    resolveAllArtifactsImpl: resolveDiff,
    readFileImpl: async (p) => (p === diffPath ? DIFF_TEXT : readFileSync(p, 'utf8')),
    generateReviewImpl,
  });
}

/** generateReview が受け取った引数を控える stub。 */
function capturingEngine() {
  const calls = [];
  const impl = async (args) => {
    calls.push(args);
    return { findings: [], debug: { llmUsed: false, heuristicsUsed: false } };
  };
  return { calls, impl };
}

const PATHS = [
  ['exec (runReviewPlan executeReview)', runExec],
  ['replay (runReviewExecReplay)', runReplay],
];

// The hooks live inside this describe on purpose: `npm test` runs with
// --experimental-test-isolation=none, where top-level hooks would apply to
// every test file in the process and clear their env / fetch.
describe('#2342 review-plan prBody wiring', () => {
  beforeEach(() => {
    savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
    for (const k of ENV_KEYS) delete process.env[k];
    savedFetch = globalThis.fetch;
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'river-2342-'));
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    globalThis.fetch = savedFetch;
    rmSync(tmpDir, { recursive: true, force: true });
  });

  for (const [label, run] of PATHS) {
    describe(`#2342 ${label} passes prBody to generateReview`, () => {
      it('from RIVER_PR_BODY', async () => {
        process.env.RIVER_PR_BODY = PR_BODY;
        const { calls, impl } = capturingEngine();
        await run(impl);
        assert.equal(calls.length, 1);
        assert.equal(calls[0].prBody, PR_BODY);
      });

      it('from the GitHub event payload when RIVER_PR_BODY is unset', async () => {
        const eventPath = path.join(tmpDir, 'event.json');
        writeFileSync(eventPath, JSON.stringify({ pull_request: { body: PR_BODY } }));
        process.env.GITHUB_EVENT_PATH = eventPath;
        const { calls, impl } = capturingEngine();
        await run(impl);
        assert.equal(calls.length, 1);
        assert.equal(calls[0].prBody, PR_BODY);
      });

      it('as null (not fabricated) when no source carries a PR body', async () => {
        const { calls, impl } = capturingEngine();
        await run(impl);
        assert.equal(calls.length, 1);
        assert.equal(calls[0].prBody, null);
      });
    });
  }

  describe('#2342 Finding Critic on the exec path reads the PR body as the ask', () => {
    const REVIEW_LINE =
      'src/lib/fetch-url.mjs:4: Finding: the host allowlist is bypassed on a redirect ' +
      'Evidence: fetch(url) follows 3xx redirects after the host was checked once ' +
      'Impact: an allowed host can redirect to an internal one ' +
      "Fix: pass redirect: 'manual' and re-check the Location host " +
      'Severity: warning Confidence: high';

    /**
     * 偽 LLM。Critic のターンには、prompt に PR 本文が載っていれば in-ask、
     * 載っていなければ uncertain（F12 と同じ返答）を返す。
     */
    function installFakeLlm(seen) {
      globalThis.fetch = async (_url, init) => {
        const body = String(init?.body ?? '');
        const isCritic = body.includes('ask_relevance');
        seen.push({ isCritic, hasAsk: body.includes(PR_BODY) });
        const content = isCritic
          ? JSON.stringify({
              finding_id: 'any',
              verdict: 'AGREE',
              reason: 'host is checked once, then fetch(url) follows redirects',
              ask_relevance: body.includes(PR_BODY) ? 'in-ask' : 'uncertain',
              evidence: [
                {
                  artifact: 'src/lib/fetch-url.mjs',
                  line_start: 3,
                  line_end: 4,
                  observation: 'host checked once, then fetch(url)',
                },
              ],
            })
          : REVIEW_LINE;
        return {
          ok: true,
          status: 200,
          json: async () => ({ choices: [{ message: { content } }] }),
          text: async () => '',
        };
      };
    }

    it('a finding is not sent to human review just because the ask was empty', async () => {
      process.env.RIVER_FINDING_CRITIC = '1';
      process.env.OPENAI_API_KEY = 'test-key-not-a-real-credential';
      process.env.RIVER_PR_BODY = PR_BODY;
      const seen = [];
      installFakeLlm(seen);

      const artifact = await runExec();

      assert.ok(
        seen.some((c) => c.isCritic),
        'precondition: the Critic must have been called through generateReview'
      );
      assert.ok(artifact.findings.length > 0, 'precondition: the fake review must yield a finding');
      for (const f of artifact.findings) {
        assert.ok(f.validation, 'precondition: the Critic verdict must reach the artifact');
        assert.equal(f.validation.askRelevance, 'in-ask');
        assert.equal(f.validation.humanReview, false);
      }
    });
  });
});
