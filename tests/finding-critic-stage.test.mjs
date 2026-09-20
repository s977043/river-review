// #2334 — Finding Critic の主経路配線。
//
// この suite が守るもの:
//   1. 既定（opt-in なし）で挙動が完全に不変であること。最重要。
//      注入口ではなく **既定値経路** を通す検査を含める（PR #2304 のレビューで
//      「全テストが注入口を使っており既定値の変異が生存した」と指摘された形）。
//   2. opt-in が閾値として働くこと（`'1'` ちょうどのときだけ有効）。
//   3. fail-safe の 3 形（未実行 / timeout / parse failure）が clean にならないこと。
//   4. schema が `validation` あり / なしの両方を ajv で受理すること。
//
// LLM 呼び出しは `runImpl` / `callImpl` で差し替える。API キーは要らない。

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import {
  FINDING_CRITIC_MODE,
  FINDING_CRITIC_OPT_IN_ENV,
  resolveFindingCriticMode,
  runFindingCriticStage,
} from '../src/lib/finding-critic-stage.mjs';
import { runFindingCritic } from '../src/lib/finding-critic-runner.mjs';
import { ASK_RELEVANCE, FAILSAFE_REASON, FINAL_STATUS } from '../src/lib/finding-critic.mjs';
import { generateReview } from '../src/lib/review-engine.mjs';
import { runReviewerOrchestration } from '../src/lib/reviewer-orchestrator.mjs';
import { compileReviewArtifactValidator } from './helpers/schema-validator.mjs';

const DIFF_TEXT = [
  'diff --git a/src/lib/fetch-url.mjs b/src/lib/fetch-url.mjs',
  '--- a/src/lib/fetch-url.mjs',
  '+++ b/src/lib/fetch-url.mjs',
  '@@ -1,3 +1,6 @@',
  '+export async function fetchUrl(url) {',
  '+  if (!ALLOWED_HOSTS.has(new URL(url).host)) throw new Error("blocked");',
  '+  return fetch(url);',
  '+}',
].join('\n');

const FINDING = {
  id: 'rr-1',
  ruleId: 'security',
  file: 'src/lib/fetch-url.mjs',
  lineStart: 2,
  lineEnd: 2,
  title: 'allowlist bypassed on redirect',
  message:
    'Finding: the host allowlist is bypassed on a redirect\n' +
    'Evidence: src/lib/fetch-url.mjs checks url.host once and then calls fetch(url), which follows 3xx redirects by default\n' +
    'Severity: warning\n' +
    "Fix: pass redirect: 'manual' and re-check the Location host before following it",
  severity: 'major',
  confidence: 'high',
  status: 'open',
  evidence: ['src/lib/fetch-url.mjs checks url.host once'],
  suggestion: "pass redirect: 'manual'",
  scope: 'in-diff',
};

const baseStageArgs = () => ({
  findings: [{ ...FINDING }],
  diff: DIFF_TEXT,
  plan: { selected: [{ metadata: { id: 'security' } }] },
  diffFiles: [{ path: 'src/lib/fetch-url.mjs', addedLines: [1, 2, 3, 4] }],
  originalAsk: 'fetchUrl() must reject hosts outside the allowlist.',
});

describe('#2334 opt-in gate', () => {
  it('is off with no config and no env', () => {
    assert.equal(resolveFindingCriticMode({ env: {} }), FINDING_CRITIC_MODE.OFF);
  });

  it('is off for truthy-but-not-"1" env values', () => {
    // Mutation (a) guard: a truthiness test would turn every one of these on.
    for (const value of ['true', 'yes', 'on', '0', '2', ' 1', '1 ', 'active']) {
      assert.equal(
        resolveFindingCriticMode({ env: { [FINDING_CRITIC_OPT_IN_ENV]: value } }),
        FINDING_CRITIC_MODE.OFF,
        `env value ${JSON.stringify(value)} must not enable the critic`
      );
    }
  });

  it('is active for exactly "1"', () => {
    assert.equal(
      resolveFindingCriticMode({ env: { [FINDING_CRITIC_OPT_IN_ENV]: '1' } }),
      FINDING_CRITIC_MODE.ACTIVE
    );
  });

  it('is active for review.findingCritic.mode = active', () => {
    assert.equal(
      resolveFindingCriticMode({ reviewConfig: { findingCritic: { mode: 'active' } }, env: {} }),
      FINDING_CRITIC_MODE.ACTIVE
    );
  });

  it('is off for an unrecognized config mode', () => {
    assert.equal(
      resolveFindingCriticMode({ reviewConfig: { findingCritic: { mode: 'observe' } }, env: {} }),
      FINDING_CRITIC_MODE.OFF
    );
  });

  it('env "1" overrides a config that says off', () => {
    assert.equal(
      resolveFindingCriticMode({
        reviewConfig: { findingCritic: { mode: 'off' } },
        env: { [FINDING_CRITIC_OPT_IN_ENV]: '1' },
      }),
      FINDING_CRITIC_MODE.ACTIVE
    );
  });

  it('returns null and never touches runImpl when off', async () => {
    let called = 0;
    const out = await runFindingCriticStage({
      ...baseStageArgs(),
      env: {},
      runImpl: async () => {
        called += 1;
        throw new Error('must not be called');
      },
    });
    assert.equal(out, null);
    assert.equal(called, 0);
  });
});

describe('#2334 fail-safe: no degraded path reads as clean', () => {
  const enabled = { env: { [FINDING_CRITIC_OPT_IN_ENV]: '1' } };

  it('critic never ran (stage threw): retained, human review, critic-timeout', async () => {
    const out = await runFindingCriticStage({
      ...baseStageArgs(),
      ...enabled,
      runImpl: async () => {
        throw new Error('boom');
      },
    });
    assert.equal(out.findings.length, 1, 'the finding must not be dropped');
    const v = out.findings[0].validation;
    assert.equal(v.finalStatus, FINAL_STATUS.CRITIC_TIMEOUT);
    assert.equal(v.humanReview, true);
    assert.ok(v.reasons.includes(FAILSAFE_REASON.CRITIC_TIMEOUT));
    assert.ok(v.reasons.some((r) => r.includes('boom')));
    assert.equal(out.observation.dropped, 0);
  });

  it('llm unavailable: retained, human review, critic-timeout', async () => {
    const out = await runFindingCriticStage({
      ...baseStageArgs(),
      ...enabled,
      llmAvailable: false,
      runImpl: async () => {
        throw new Error('must not be called when the llm is unavailable');
      },
    });
    assert.equal(out.findings.length, 1);
    assert.equal(out.findings[0].validation.finalStatus, FINAL_STATUS.CRITIC_TIMEOUT);
    assert.equal(out.findings[0].validation.humanReview, true);
  });

  // The next two go through the REAL runner (only the LLM call is stubbed), so
  // the terminal state comes from the production state machine, not from a
  // hand-written result object.
  it('critic call times out: retained, human review, critic-timeout', async () => {
    const out = await runFindingCriticStage({
      ...baseStageArgs(),
      ...enabled,
      runImpl: (args) =>
        runFindingCritic({
          ...args,
          callImpl: async () => {
            const err = new Error('timed out');
            err.name = 'TimeoutError';
            throw err;
          },
        }),
    });
    assert.equal(out.findings.length, 1);
    const v = out.findings[0].validation;
    assert.equal(v.finalStatus, FINAL_STATUS.CRITIC_TIMEOUT);
    assert.equal(v.humanReview, true);
    assert.ok(v.reasons.includes(FAILSAFE_REASON.CRITIC_TIMEOUT));
  });

  it('critic response is unparseable: retained, human review, needs-human-judgment', async () => {
    const out = await runFindingCriticStage({
      ...baseStageArgs(),
      ...enabled,
      runImpl: (args) => runFindingCritic({ ...args, callImpl: async () => '???? not a verdict' }),
    });
    assert.equal(out.findings.length, 1);
    const v = out.findings[0].validation;
    assert.equal(v.finalStatus, FINAL_STATUS.NEEDS_HUMAN_JUDGMENT);
    assert.equal(v.humanReview, true);
    assert.ok(v.reasons.includes(FAILSAFE_REASON.CRITIC_PARSE_FAILURE));
  });

  it('a finding is dropped only when retainFinding is explicitly false', async () => {
    const out = await runFindingCriticStage({
      ...baseStageArgs(),
      ...enabled,
      // Mutation (b) guard: anything other than an explicit false keeps it.
      runImpl: async () => ({
        result: {
          status: FINAL_STATUS.NEEDS_HUMAN_JUDGMENT,
          humanReview: true,
          reasons: [],
          rounds: 1,
          askRelevance: ASK_RELEVANCE.UNCERTAIN,
        },
      }),
    });
    assert.equal(out.findings.length, 1);
  });

  it('carries the protocol id and leaves the original finding fields intact', async () => {
    const out = await runFindingCriticStage({
      ...baseStageArgs(),
      ...enabled,
      runImpl: async () => ({
        result: {
          status: FINAL_STATUS.CONFIRMED,
          humanReview: false,
          retainFinding: true,
          reasons: [],
          rounds: 1,
          askRelevance: ASK_RELEVANCE.IN_ASK,
        },
      }),
    });
    const f = out.findings[0];
    assert.equal(f.validation.protocol, 'evidence-grounded-adversarial-v1');
    assert.equal(f.id, FINDING.id);
    assert.equal(f.severity, FINDING.severity);
    assert.equal(f.message, FINDING.message);
  });
});

describe('#2334 default path is unchanged (no injection point used)', () => {
  // These call generateReview / runReviewerOrchestration with their DEFAULT
  // arguments — no runImpl, no env override, no config. `env: {}` is not passed
  // to the stage anywhere here; process.env is what the production code reads.
  const reviewArgs = () => ({
    diff: {
      diffText: DIFF_TEXT,
      files: [{ path: 'src/lib/fetch-url.mjs', addedLines: [1, 2], hunks: [] }],
    },
    plan: { selected: [{ metadata: { id: 'security' }, name: 'security' }] },
    phase: 'midstream',
    dryRun: true,
  });

  it('generateReview emits no debug.execution.findingCritic by default', async () => {
    delete process.env[FINDING_CRITIC_OPT_IN_ENV];
    const result = await generateReview(reviewArgs());
    assert.equal(result.debug.execution?.findingCritic, undefined);
    for (const f of result.findings) {
      assert.equal(
        Object.hasOwn(f, 'validation'),
        false,
        'no finding may carry validation on a default run'
      );
    }
  });

  it('generateReview output is byte-identical with the critic off vs. absent', async () => {
    // Mutation (c) guard: deleting the wiring line must not change this, but
    // flipping the DEFAULT to on must — the two runs below differ only in an
    // explicit `off`, so an on-by-default wiring makes them disagree.
    delete process.env[FINDING_CRITIC_OPT_IN_ENV];
    const implicit = await generateReview(reviewArgs());
    const explicitOff = await generateReview({
      ...reviewArgs(),
      config: { review: { findingCritic: { mode: 'off' } } },
    });
    assert.deepEqual(explicitOff.findings, implicit.findings);
    assert.deepEqual(explicitOff.classified, implicit.classified);
  });

  it('runReviewerOrchestration emits no debug.findingCritic by default', async () => {
    delete process.env[FINDING_CRITIC_OPT_IN_ENV];
    const result = await runReviewerOrchestration({
      diff: {
        diffText: DIFF_TEXT,
        files: [{ path: 'src/lib/fetch-url.mjs', addedLines: [1, 2], hunks: [] }],
      },
      plan: { selected: [{ metadata: { id: 'security' }, name: 'security' }] },
      phase: 'midstream',
      dryRun: true,
      reviewers: ['bug-hunter'],
      quiet: true,
    });
    assert.equal(result.debug.findingCritic, undefined);
    for (const f of result.findings) assert.equal(Object.hasOwn(f, 'validation'), false);
  });
});

describe('#2334 the production wiring in generateReview (no runImpl injected)', () => {
  // Mutation (c) guard for src/lib/review-engine.mjs: this test reaches the
  // stage through generateReview's own call, not through an injection point,
  // so deleting either the call or the `findings = criticStage.findings`
  // assignment makes it fail. The Critic is enabled through the real config
  // path and no API key is needed — dryRun makes the LLM unavailable, which
  // the stage must read as a fail-safe rather than as "no objection".
  const reviewArgs = () => ({
    diff: {
      diffText: DIFF_TEXT,
      files: [{ path: 'src/lib/fetch-url.mjs', addedLines: [1, 2], hunks: [] }],
    },
    plan: { selected: [{ metadata: { id: 'security' }, name: 'security' }] },
    phase: 'midstream',
    dryRun: true,
  });

  it('attaches validation to every finding and records the observation', async () => {
    delete process.env[FINDING_CRITIC_OPT_IN_ENV];
    const result = await generateReview({
      ...reviewArgs(),
      config: { review: { findingCritic: { mode: 'active' } } },
    });
    assert.ok(result.findings.length > 0, 'the fixture diff must yield at least one finding');
    for (const f of result.findings) {
      assert.equal(f.validation.protocol, 'evidence-grounded-adversarial-v1');
      assert.equal(f.validation.finalStatus, FINAL_STATUS.CRITIC_TIMEOUT);
      assert.equal(f.validation.humanReview, true);
    }
    const observation = result.debug.execution?.findingCritic;
    assert.ok(observation, 'debug.execution.findingCritic must be recorded when enabled');
    assert.equal(observation.evaluated, result.findings.length);
    assert.equal(observation.dropped, 0);
  });

  it('is enabled by the env var alone, with no config', async () => {
    process.env[FINDING_CRITIC_OPT_IN_ENV] = '1';
    try {
      const result = await generateReview(reviewArgs());
      assert.ok(result.debug.execution?.findingCritic);
      for (const f of result.findings) assert.ok(f.validation);
    } finally {
      delete process.env[FINDING_CRITIC_OPT_IN_ENV];
    }
  });

  it('stays off for an env value that is not exactly "1"', async () => {
    process.env[FINDING_CRITIC_OPT_IN_ENV] = 'true';
    try {
      const result = await generateReview(reviewArgs());
      assert.equal(result.debug.execution?.findingCritic, undefined);
      for (const f of result.findings) assert.equal(Object.hasOwn(f, 'validation'), false);
    } finally {
      delete process.env[FINDING_CRITIC_OPT_IN_ENV];
    }
  });
});

describe('#2334 the orchestrator runs the critic once, after merge', () => {
  it('per-reviewer generateReview is told to defer', async () => {
    delete process.env[FINDING_CRITIC_OPT_IN_ENV];
    /** @type {boolean[]} */
    const deferred = [];
    await runReviewerOrchestration({
      diff: {
        diffText: DIFF_TEXT,
        files: [{ path: 'src/lib/fetch-url.mjs', addedLines: [1, 2], hunks: [] }],
      },
      plan: { selected: [{ metadata: { id: 'security' }, name: 'security' }] },
      phase: 'midstream',
      dryRun: true,
      reviewers: ['bug-hunter', 'security-scanner'],
      quiet: true,
      generateReviewImpl: async (args) => {
        deferred.push(args.deferFindingCritic);
        return {
          comments: [],
          findings: [],
          classified: { overview: [], overflow: [] },
          debug: {},
        };
      },
    });
    assert.ok(deferred.length >= 2);
    assert.ok(
      deferred.every((d) => d === true),
      'every per-reviewer generateReview must defer the critic to the merge point'
    );
  });

  it('runs once over the merged set when enabled', async () => {
    /** @type {object[][]} */
    const batches = [];
    const result = await runReviewerOrchestration({
      diff: {
        diffText: DIFF_TEXT,
        files: [{ path: 'src/lib/fetch-url.mjs', addedLines: [1, 2], hunks: [] }],
      },
      plan: { selected: [{ metadata: { id: 'security' }, name: 'security' }] },
      phase: 'midstream',
      dryRun: true,
      reviewers: ['bug-hunter', 'security-scanner'],
      quiet: true,
      config: { review: { findingCritic: { mode: 'active' } } },
      env: { [FINDING_CRITIC_OPT_IN_ENV]: '1' },
      generateReviewImpl: async () => ({
        comments: [],
        findings: [{ ...FINDING, id: undefined }],
        classified: { overview: [], overflow: [] },
        debug: {},
      }),
    });
    // dryRun ⇒ llmAvailable false ⇒ every finding lands on the critic-timeout
    // fail-safe rather than being dropped.
    assert.ok(result.debug.findingCritic, 'the observation must be recorded when enabled');
    assert.equal(result.debug.findingCritic.mode, 'active');
    assert.equal(result.debug.findingCritic.dropped, 0);
    assert.ok(result.findings.length > 0);
    for (const f of result.findings) {
      assert.equal(f.validation.finalStatus, FINAL_STATUS.CRITIC_TIMEOUT);
      assert.equal(f.validation.humanReview, true);
    }
    assert.equal(batches.length, 0);
  });
});

describe('#2334 schema accepts findings with and without validation', () => {
  const validate = compileReviewArtifactValidator();
  const artifact = (finding) => ({
    version: '1',
    timestamp: '2026-09-20T00:00:00.000Z',
    phase: 'midstream',
    status: 'ok',
    findings: [finding],
  });
  const baseFinding = {
    id: 'rr-1',
    ruleId: 'security',
    title: 'allowlist bypassed on redirect',
    message: FINDING.message,
    severity: 'major',
    phase: 'midstream',
    file: 'src/lib/fetch-url.mjs',
  };

  it('accepts a finding with no validation (today’s shape)', () => {
    assert.equal(validate(artifact(baseFinding)), true, JSON.stringify(validate.errors));
  });

  it('accepts every FINAL_STATUS value under validation.finalStatus', () => {
    for (const status of Object.values(FINAL_STATUS)) {
      const ok = validate(
        artifact({
          ...baseFinding,
          validation: {
            protocol: 'evidence-grounded-adversarial-v1',
            rounds: 1,
            finalStatus: status,
            askRelevance: 'uncertain',
            humanReview: true,
            reasons: [FAILSAFE_REASON.CRITIC_TIMEOUT],
          },
        })
      );
      assert.equal(ok, true, `${status}: ${JSON.stringify(validate.errors)}`);
    }
  });

  it('rejects a finalStatus outside FINAL_STATUS', () => {
    assert.equal(
      validate(
        artifact({
          ...baseFinding,
          validation: { protocol: 'evidence-grounded-adversarial-v1', finalStatus: 'clean' },
        })
      ),
      false
    );
  });

  it('rejects a foreign protocol id', () => {
    assert.equal(
      validate(
        artifact({
          ...baseFinding,
          validation: { protocol: 'something-else', finalStatus: 'confirmed' },
        })
      ),
      false
    );
  });

  it('rejects an askRelevance outside ASK_RELEVANCE', () => {
    assert.equal(
      validate(
        artifact({
          ...baseFinding,
          validation: {
            protocol: 'evidence-grounded-adversarial-v1',
            finalStatus: 'confirmed',
            askRelevance: 'in-scope',
          },
        })
      ),
      false
    );
  });

  it('pins the schema enums to the module SSoT rather than a hand-kept copy', () => {
    const schema = JSON.parse(
      readFileSync(new URL('../schemas/review-artifact.schema.json', import.meta.url), 'utf8')
    );
    const validation = schema.$defs.finding.properties.validation;
    assert.deepEqual(
      [...validation.properties.finalStatus.enum].sort(),
      [...Object.values(FINAL_STATUS)].sort(),
      'schema finalStatus enum must equal Object.values(FINAL_STATUS)'
    );
    assert.deepEqual(
      [...validation.properties.askRelevance.enum].sort(),
      [...Object.values(ASK_RELEVANCE)].sort(),
      'schema askRelevance enum must equal Object.values(ASK_RELEVANCE)'
    );
  });
});
