import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { defaultConfig } from '../src/config/default.mjs';
import { reviewConfigSchema } from '../src/config/schema.mjs';
import { parseUnifiedDiff } from '../src/lib/diff-processor.mjs';
import { generateReview } from '../src/lib/review-engine.mjs';
import { buildReviewRequest } from '../src/prompt/review-request.mjs';
import { compileReviewPrompt } from '../src/prompt/compiler.mjs';
import { buildReviewObligationsSection } from '../src/prompt/sections.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const apiCompatibilitySkillPath = path.join(
  repoRoot,
  'skills',
  'midstream',
  'api-compatibility',
  'SKILL.md'
);

const sampleObligation = {
  id: 'api-compatibility/backward-compatibility',
  skillId: 'api-compatibility',
  viewpointId: 'backward-compatibility',
  title: 'Backward compatibility',
  question: '既存consumerとの後方互換性が維持されているか。',
  requiredEvidence: ['changed-contract', 'affected-consumers'],
  evidenceHints: ['versioning', 'migration-path'],
  falsePositiveGuards: ['new-endpoint-only'],
  activation: {
    matchedKinds: ['dto-field-removed'],
    matchedSignals: [{ kind: 'dto-field-removed', file: 'src/api/user.ts', line: 3 }],
  },
};

function reviewDiff() {
  const diffText = `diff --git a/src/api/user.ts b/src/api/user.ts
--- a/src/api/user.ts
+++ b/src/api/user.ts
@@ -1,5 +1,4 @@
 interface UserResponse {
   id: string;
-  legacyName: string;
   name: string;
 }
`;
  return { ...parseUnifiedDiff(diffText), diffText };
}

function reviewPlan() {
  return {
    selected: [
      {
        metadata: {
          id: 'api-compatibility',
          name: 'API Compatibility and Test Gap Review',
          phase: 'midstream',
          severity: 'major',
          modelHint: 'high-accuracy',
        },
        path: apiCompatibilitySkillPath,
      },
    ],
  };
}

function baseGenerateArgs(config) {
  return {
    diff: reviewDiff(),
    plan: reviewPlan(),
    phase: 'midstream',
    dryRun: true,
    includeFallback: false,
    config,
  };
}

test('review.viewpoints mode defaults to off and rejects shadow', () => {
  assert.equal(defaultConfig.review.viewpoints.mode, 'off');
  assert.equal(reviewConfigSchema.parse({ viewpoints: { mode: 'observe' } }).viewpoints.mode, 'observe');
  assert.equal(reviewConfigSchema.parse({ viewpoints: { mode: 'active' } }).viewpoints.mode, 'active');
  assert.throws(() => reviewConfigSchema.parse({ viewpoints: { mode: 'shadow' } }));
});

test('review obligation section states that obligations are not findings', () => {
  const section = buildReviewObligationsSection([sampleObligation], 'ja');

  assert.match(section, /### Review Obligations/);
  assert.match(section, /問題の存在を示す Finding ではありません/);
  assert.match(section, /api-compatibility\/backward-compatibility/);
  assert.match(section, /Required evidence: changed-contract, affected-consumers/);
  assert.match(section, /False-positive guards: new-endpoint-only/);
  assert.doesNotMatch(section, /matchedSignals/);
  assert.doesNotMatch(section, /src\/api\/user\.ts/);
});

test('observe mode preserves the exact legacy prompt while recording activation', async () => {
  const off = await generateReview(
    baseGenerateArgs({ review: { viewpoints: { mode: 'off' } } })
  );
  const observe = await generateReview(
    baseGenerateArgs({ review: { viewpoints: { mode: 'observe' } } })
  );

  assert.equal(observe.prompt, off.prompt);
  assert.equal(observe.debug.execution.reviewViewpoints.mode, 'observe');
  assert.equal(observe.debug.execution.reviewViewpoints.obligationCount, 2);
  assert.equal(observe.debug.execution.reviewViewpoints.activeObligationCount, 0);
  assert.doesNotMatch(observe.prompt, /### Review Obligations/);
});

test('active mode injects matched obligations into the legacy prompt', async () => {
  const active = await generateReview(
    baseGenerateArgs({ review: { viewpoints: { mode: 'active' } } })
  );

  assert.match(active.prompt, /### Review Obligations/);
  assert.match(active.prompt, /api-compatibility\/backward-compatibility/);
  assert.match(active.prompt, /api-compatibility\/api-test-coverage/);
  assert.doesNotMatch(active.prompt, /optional-field-consumer-handling/);
  assert.equal(active.debug.execution.reviewViewpoints.activeObligationCount, 2);
});

test('Prompt Compiler renderers consume the same Review Obligation context', () => {
  const ir = buildReviewRequest({
    subject: { phase: 'midstream', changedFiles: [] },
    judgment: { skillIds: ['api-compatibility'], severity: 'normal', plan: { selected: [] } },
    context: { diff: '', reviewObligations: [sampleObligation] },
    constraints: { maxFindings: 5, focusHint: 'focus' },
    outputContract: { language: 'ja' },
    execution: { provider: 'openai', model: 'gpt-4o-mini' },
  });

  const generic = compileReviewPrompt(ir, { rendererId: 'generic' });
  const openai = compileReviewPrompt(ir, { rendererId: 'openai' });

  assert.match(`${generic.systemMessage}\n${generic.prompt}`, /### Review Obligations/);
  assert.match(`${openai.systemMessage}\n${openai.prompt}`, /### Review Obligations/);
  assert.equal(
    (`${generic.systemMessage}\n${generic.prompt}`.match(/api-compatibility\/backward-compatibility/g) ?? [])
      .length,
    1
  );
  assert.equal(
    (`${openai.systemMessage}\n${openai.prompt}`.match(/api-compatibility\/backward-compatibility/g) ?? [])
      .length,
    1
  );
});
