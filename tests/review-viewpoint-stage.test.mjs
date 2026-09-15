import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { parseUnifiedDiff } from '../src/lib/diff-processor.mjs';
import {
  ReviewViewpointStageError,
  runReviewViewpointStage,
} from '../src/lib/review-viewpoint-stage.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const apiCompatibilitySkillPath = path.join(
  repoRoot,
  'skills',
  'midstream',
  'api-compatibility',
  'SKILL.md'
);

function apiContractDiff() {
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

function planWithSkillPath(skillPath = apiCompatibilitySkillPath) {
  return {
    selected: [
      {
        metadata: { id: 'api-compatibility' },
        path: skillPath,
      },
    ],
  };
}

function explodingDiff() {
  const diff = {};
  Object.defineProperty(diff, 'files', {
    get() {
      throw new Error('detector boom');
    },
  });
  return diff;
}

test('off mode is a complete no-op', async () => {
  const result = await runReviewViewpointStage({
    reviewConfig: { viewpoints: { mode: 'off' } },
    diff: explodingDiff(),
    plan: planWithSkillPath('/outside/repository/api-compatibility/SKILL.md'),
  });

  assert.equal(result, null);
});

test('observe mode records obligations without activating prompt obligations', async () => {
  const result = await runReviewViewpointStage({
    reviewConfig: { viewpoints: { mode: 'observe' } },
    diff: apiContractDiff(),
    plan: planWithSkillPath(),
  });

  assert.equal(result.mode, 'observe');
  assert.deepEqual(result.activeObligations, []);
  assert.equal(result.observation.catalogSkillCount, 1);
  assert.equal(result.observation.signalCount, 1);
  assert.equal(result.observation.activatedViewpointCount, 2);
  assert.equal(result.observation.obligationCount, 2);
  assert.equal(result.observation.activeObligationCount, 0);
  assert.deepEqual(result.observation.skills[0].obligationIds, [
    'api-compatibility/backward-compatibility',
    'api-compatibility/api-test-coverage',
  ]);
});

test('observe mode records signal failures without changing review success semantics', async () => {
  const result = await runReviewViewpointStage({
    reviewConfig: { viewpoints: { mode: 'observe' } },
    diff: explodingDiff(),
    plan: planWithSkillPath(),
  });

  assert.equal(result.mode, 'observe');
  assert.deepEqual(result.activeObligations, []);
  assert.deepEqual(result.observation.errors, [
    { code: 'heuristic-signal-collection-failed' },
    { skillId: 'api-compatibility', code: 'signal-producer-failed' },
  ]);
});

test('active mode fails closed when signal collection cannot be trusted', async () => {
  await assert.rejects(
    runReviewViewpointStage({
      reviewConfig: { viewpoints: { mode: 'active' } },
      diff: explodingDiff(),
      plan: planWithSkillPath(),
    }),
    (error) => error instanceof ReviewViewpointStageError
  );
});

test('active mode exposes only matched review obligations', async () => {
  const result = await runReviewViewpointStage({
    reviewConfig: { viewpoints: { mode: 'active' } },
    diff: apiContractDiff(),
    plan: planWithSkillPath(),
  });

  assert.equal(result.mode, 'active');
  assert.deepEqual(
    result.activeObligations.map((obligation) => obligation.id),
    ['api-compatibility/backward-compatibility', 'api-compatibility/api-test-coverage']
  );
  assert.equal(result.observation.activeObligationCount, 2);
});

test('repository-owned skill paths cannot load viewpoint knowledge', async () => {
  const outsideSkillPath = path.join(
    os.tmpdir(),
    'target-repository',
    'skills',
    'api-compatibility',
    'SKILL.md'
  );
  const result = await runReviewViewpointStage({
    reviewConfig: { viewpoints: { mode: 'active' } },
    diff: apiContractDiff(),
    plan: planWithSkillPath(outsideSkillPath),
  });

  assert.deepEqual(result.activeObligations, []);
  assert.deepEqual(result.observation.skipped, [
    { skillId: 'api-compatibility', reason: 'outside-built-in-skills' },
  ]);
  assert.equal(result.observation.catalogSkillCount, 0);
});
