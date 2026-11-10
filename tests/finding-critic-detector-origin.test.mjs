// #2871 — Finding Critic active + key でも detector の finding が gate に届く。
//
// review-engine は comment / finding に内部属性 `origin`（detector / llm /
// fallback）を載せ、Critic 段は detector の finding を落とさない。Critic が
// 反対しても needs-human-judgment / humanReview で残す。加えて strict_block の
// 判定は Critic を通す前の findings も見る。
//
// LLM 呼び出しは globalThis.fetch の stub で置き換える。キーは偽の文字列で、
// network へは出ない。

import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { generateReview } from '../src/lib/review-engine.mjs';
import { parseUnifiedDiff } from '../src/lib/diff-processor.mjs';
import { runFindingCriticStage } from '../src/lib/finding-critic-stage.mjs';
import { runFindingCritic } from '../src/lib/finding-critic-runner.mjs';
import { FINAL_STATUS } from '../src/lib/finding-critic.mjs';
import { mergeFindings, runReviewerOrchestration } from '../src/lib/reviewer-orchestrator.mjs';
import { runReviewPlan } from '../src/lib/review-plan.mjs';
import { runLocalReview } from '../src/lib/local-runner.mjs';

const CONFLICT_DIFF_TEXT = `diff --git a/src/app.js b/src/app.js
index 1111111..2222222 100644
--- a/src/app.js
+++ b/src/app.js
@@ -1,2 +1,5 @@
 const a = 1;
+<<<<<<< HEAD
+const b = 2;
+>>>>>>> feature
 export { a };
`;

const STRICT_SKILL = {
  metadata: {
    id: 'logging-observability',
    name: 'logging-observability',
    phase: 'midstream',
    // The real skill declares a lower severity than the detector's blocker, so
    // the verifier rejects the blocker unless it knows the finding's origin.
    severity: 'major',
    evaluationType: 'deterministic',
    deterministicGate: { failSeverity: 'strict_block' },
  },
};
const PLAN = { selected: [STRICT_SKILL] };
const ACTIVE = { review: { findingCritic: { mode: 'active' } } };
const FAKE_KEY = 'test-key-not-a-real-credential';

const DISAGREE = JSON.stringify({
  finding_id: 'rr-1',
  verdict: 'DISAGREE_EVIDENCE',
  reason: 'the markers are intentional',
  ask_relevance: 'in-ask',
  evidence: [{ artifact: 'src/app.js', line_start: 2, line_end: 4, observation: 'markers' }],
});
const WITHDRAW = JSON.stringify({
  finding_id: 'rr-1',
  action: 'WITHDRAW',
  response_to: 'DISAGREE_EVIDENCE',
});

let originalFetch;
let originalOffline;
let originalCritic;

beforeEach(() => {
  originalFetch = globalThis.fetch;
  originalOffline = process.env.RIVER_OFFLINE;
  originalCritic = process.env.RIVER_FINDING_CRITIC;
  delete process.env.RIVER_OFFLINE;
  delete process.env.RIVER_FINDING_CRITIC;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalOffline === undefined) delete process.env.RIVER_OFFLINE;
  else process.env.RIVER_OFFLINE = originalOffline;
  if (originalCritic === undefined) delete process.env.RIVER_FINDING_CRITIC;
  else process.env.RIVER_FINDING_CRITIC = originalCritic;
});

/**
 * fetch stub. 1 本目はレビュー本体、2 本目以降は Critic / Reviewer の順に
 * `replies` を返す。呼ばれた回数を `calls` に積む。
 */
function stubLlm(reviewOutput, replies = []) {
  const calls = [];
  globalThis.fetch = async () => {
    const content = calls.length === 0 ? reviewOutput : (replies[calls.length - 1] ?? 'NO_REPLY');
    calls.push(content);
    return {
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content } }] }),
      text: async () => '',
    };
  };
  return calls;
}

function review({ diffText = CONFLICT_DIFF_TEXT, config = ACTIVE, apiKey = FAKE_KEY } = {}) {
  return generateReview({
    diff: { ...parseUnifiedDiff(diffText), diffText },
    plan: PLAN,
    phase: 'midstream',
    apiKey,
    includeFallback: true,
    config,
  });
}

const detectorBlockers = (findings) =>
  findings.filter((f) => f.ruleId === 'logging-observability' && f.severity === 'critical');

describe('#2871 detector findings survive the active Critic', () => {
  it('TC1 — active + key: the detector blocker stays and is sent to the stubbed Critic only', async () => {
    const calls = stubLlm('NO_ISSUES', ['not a verdict']);
    const result = await review();
    const kept = detectorBlockers(result.findings);
    assert.ok(kept.length > 0, 'the detector blocker must reach the findings');
    for (const f of kept) {
      assert.equal(f.origin, 'detector');
      assert.equal(f.validation.humanReview, true);
    }
    assert.equal(result.debug.execution.findingCritic.dropped, 0);
    // Every LLM call went to the stub (review + one Critic turn per finding);
    // nothing reached the real fetch.
    assert.equal(calls.length, 1 + result.findings.length);
  });

  it('TC4 — Critic disagrees and the Reviewer withdraws: kept as needs-human-judgment', async () => {
    stubLlm('NO_ISSUES', [DISAGREE, WITHDRAW, DISAGREE, WITHDRAW, DISAGREE, WITHDRAW]);
    const result = await review();
    const kept = detectorBlockers(result.findings);
    assert.ok(kept.length > 0);
    for (const f of kept) {
      assert.equal(f.validation.finalStatus, FINAL_STATUS.NEEDS_HUMAN_JUDGMENT);
      assert.equal(f.validation.humanReview, true);
    }
    assert.equal(result.debug.execution.findingCritic.dropped, 0);
  });

  it('TC6 — Critic off and no-key keep their current results', async () => {
    stubLlm('NO_ISSUES');
    const off = await review({ config: {} });
    assert.ok(detectorBlockers(off.findings).length > 0);
    assert.equal(off.debug.execution?.findingCritic, undefined);
    for (const f of off.findings) assert.equal(Object.hasOwn(f, 'validation'), false);

    const savedKeys = {
      RIVER_OPENAI_API_KEY: process.env.RIVER_OPENAI_API_KEY,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      GOOGLE_API_KEY: process.env.GOOGLE_API_KEY,
    };
    for (const k of Object.keys(savedKeys)) delete process.env[k];
    try {
      const calls = stubLlm('NO_ISSUES');
      const noKey = await review({ apiKey: null });
      assert.equal(calls.length, 0, 'no-key must not call the LLM');
      const kept = detectorBlockers(noKey.findings);
      assert.ok(kept.length > 0);
      for (const f of kept) assert.equal(f.validation.finalStatus, FINAL_STATUS.CRITIC_TIMEOUT);
    } finally {
      for (const [k, v] of Object.entries(savedKeys)) if (v !== undefined) process.env[k] = v;
    }
  });
});

const VERIFIABLE_LLM =
  'src/app.js:2: Finding: b が未使用のまま残っている Evidence: src/app.js の const b = 2 が追加された Impact: 不要なコードが残る Fix: b を削除する Severity: warning Confidence: high';

describe('#2871 non-detector findings keep the existing Critic behavior', () => {
  const CLEAN_DIFF = `diff --git a/src/app.js b/src/app.js
index 1111111..2222222 100644
--- a/src/app.js
+++ b/src/app.js
@@ -1,2 +1,3 @@
 const a = 1;
+const b = 2;
 export { a };
`;

  it('TC2 — an LLM finding withdrawn after DISAGREE is still dismissed', async () => {
    stubLlm(VERIFIABLE_LLM, [DISAGREE, WITHDRAW]);
    const result = await review({ diffText: CLEAN_DIFF });
    assert.equal(result.debug.verifierStats.verified, 1, 'precondition: the LLM finding verified');
    assert.equal(result.preCriticFindings[0].origin, 'llm');
    assert.equal(result.findings.length, 0, 'the LLM finding must be dropped as before');
    assert.equal(result.debug.execution.findingCritic.dropped, 1);
  });

  it('TC3 — a fallback finding gets no detector exemption', async () => {
    const finding = {
      id: 'rr-1',
      ruleId: 'logging-observability',
      file: 'src/app.js',
      lineStart: 2,
      severity: 'major',
      origin: 'fallback',
      message: 'スキルの観点で自動指摘を生成できなかった Severity: warning Confidence: low',
    };
    const stage = await runFindingCriticStage({
      findings: [finding],
      diff: CONFLICT_DIFF_TEXT,
      plan: PLAN,
      reviewConfig: ACTIVE.review,
      env: {},
      runImpl: (args) => runFindingCritic({ ...args, callImpl: async () => DISAGREE }),
    });
    assert.equal(stage.findings.length, 0, 'fallback must stay dismissable');
    assert.equal(stage.observation.dropped, 1);
  });
});

describe('#2871 strict_block sees the pre-Critic findings', () => {
  const runExec = (review) =>
    runReviewPlan({
      planOnly: true,
      executeReview: true,
      now: () => '2026-01-01T00:00:00.000Z',
      loadConfigImpl: async () => ({}),
      resolveAllArtifactsImpl: () => ({
        diff: { exists: true, path: '/repo/diff.patch', source: 'cwd' },
      }),
      readFileImpl: async () => CONFLICT_DIFF_TEXT,
      buildExecutionPlanImpl: async () => ({ selected: [STRICT_SKILL], skipped: [] }),
      loadRiskMapImpl: async () => null,
      humanApprovalAdjudicator: null,
      generateReviewImpl: async () => review,
    });

  it('TC5 — a detector finding removed by the Critic still forces STRICT_BLOCK', async () => {
    const detector = {
      id: 'rr-1',
      ruleId: 'logging-observability',
      title: 'conflict',
      message: 'conflict',
      severity: 'critical',
      file: 'src/app.js',
      lineStart: 2,
      origin: 'detector',
    };
    const artifact = await runExec({ findings: [], preCriticFindings: [detector], debug: {} });
    assert.equal(artifact.findings.length, 0, 'precondition: the Critic output is empty');
    assert.equal(artifact.gate.reasonCode, 'STRICT_BLOCK');
  });
});

describe('#2871 orchestrator path', () => {
  it('TC7 — the merged detector finding survives the post-merge Critic', async () => {
    // DISAGREE_CONCERN: the orchestrator's rendered diff does not ground the
    // DISAGREE_EVIDENCE citation, which would already retain the finding.
    const concern = JSON.stringify({
      finding_id: 'rr-1',
      verdict: 'DISAGREE_CONCERN',
      reason: 'the markers are intentional',
      ask_relevance: 'in-ask',
    });
    const withdraw = JSON.stringify({
      finding_id: 'rr-1',
      action: 'WITHDRAW',
      response_to: 'DISAGREE_CONCERN',
    });
    stubLlm('NO_ISSUES', [concern, withdraw]);
    const result = await runReviewerOrchestration({
      diff: { ...parseUnifiedDiff(CONFLICT_DIFF_TEXT), diffText: CONFLICT_DIFF_TEXT },
      plan: PLAN,
      phase: 'midstream',
      apiKey: FAKE_KEY,
      reviewers: ['bug-hunter'],
      quiet: true,
      config: ACTIVE,
    });
    const kept = detectorBlockers(result.findings);
    assert.ok(kept.length > 0, 'the detector blocker must survive the orchestrator Critic');
    for (const f of kept) {
      assert.equal(f.validation.finalStatus, FINAL_STATUS.NEEDS_HUMAN_JUDGMENT);
      assert.equal(f.validation.humanReview, true);
    }
    assert.equal(result.debug.findingCritic.dropped, 0);
  });
});

describe('#2871 review follow-up: provenance is per representative, not per cluster', () => {
  it('an LLM-represented cluster with a detector member is still dropped on WITHDRAW', async () => {
    const llm = {
      id: 'rr-1',
      ruleId: 'logging-observability',
      file: 'src/app.js',
      lineStart: 2,
      lineEnd: 2,
      title: 'conflict marker',
      message: 'conflict marker Severity: blocker Confidence: high',
      severity: 'critical',
      origin: 'llm',
      reviewerRole: 'bug-hunter',
    };
    const detector = { ...llm, id: 'rr-2', origin: 'detector', reviewerRole: 'security-scanner' };
    const merged = mergeFindings([llm, detector]);
    assert.equal(merged.length, 1, 'precondition: the two findings form one cluster');
    assert.equal(merged[0].origin, 'llm', 'the representative keeps its own origin');

    const stage = await runFindingCriticStage({
      findings: merged,
      diff: CONFLICT_DIFF_TEXT,
      plan: PLAN,
      reviewConfig: ACTIVE.review,
      env: {},
      runImpl: async () => ({
        result: {
          status: FINAL_STATUS.WITHDRAWN_BY_REVIEWER,
          terminal: true,
          humanReview: false,
          retainFinding: false,
          reasons: [],
          rounds: 1,
        },
      }),
    });
    assert.equal(stage.findings.length, 0);
    assert.equal(stage.observation.dropped, 1);
  });
});

describe('#2871 review follow-up: the strict_block safety net joins detector findings only', () => {
  const runExec = (review) =>
    runReviewPlan({
      planOnly: true,
      executeReview: true,
      now: () => '2026-01-01T00:00:00.000Z',
      loadConfigImpl: async () => ({}),
      resolveAllArtifactsImpl: () => ({
        diff: { exists: true, path: '/repo/diff.patch', source: 'cwd' },
      }),
      readFileImpl: async () => CONFLICT_DIFF_TEXT,
      buildExecutionPlanImpl: async () => ({ selected: [STRICT_SKILL], skipped: [] }),
      loadRiskMapImpl: async () => null,
      humanApprovalAdjudicator: null,
      generateReviewImpl: async () => review,
    });

  it('review-plan: a withdrawn LLM finding with a strict skill id raises no STRICT_BLOCK', async () => {
    const llm = {
      id: 'rr-1',
      ruleId: 'logging-observability',
      title: 'conflict',
      message: 'conflict',
      severity: 'critical',
      file: 'src/app.js',
      lineStart: 2,
      origin: 'llm',
    };
    const artifact = await runExec({ findings: [], preCriticFindings: [llm], debug: {} });
    assert.notEqual(artifact.gate.reasonCode, 'STRICT_BLOCK');
  });

  it('local-runner: the detector blocker still sets strictBlock with the Critic active', async () => {
    // One CONCERN + WITHDRAW pair per detector finding, so the Critic would
    // drop every one of them without the detector exemption.
    const pair = (id) => [
      JSON.stringify({
        finding_id: id,
        verdict: 'DISAGREE_CONCERN',
        reason: 'x',
        ask_relevance: 'in-ask',
      }),
      JSON.stringify({ finding_id: id, action: 'WITHDRAW', response_to: 'DISAGREE_CONCERN' }),
    ];
    stubLlm('NO_ISSUES', [...pair('rr-1'), ...pair('rr-2'), ...pair('rr-3')]);
    const repoRoot = await mkdtemp(path.join(tmpdir(), 'rr-2871-'));
    const result = await runLocalReview({
      apiKey: FAKE_KEY,
      context: {
        status: 'ok',
        repoRoot,
        defaultBranch: 'main',
        mergeBase: null,
        changedFiles: ['src/app.js'],
        diff: { ...parseUnifiedDiff(CONFLICT_DIFF_TEXT), diffText: CONFLICT_DIFF_TEXT },
        plan: { selected: [STRICT_SKILL], skipped: [] },
        config: ACTIVE,
      },
    });
    assert.equal(result.strictBlock, true);
  });
});
