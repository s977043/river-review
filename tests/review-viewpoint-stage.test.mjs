import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
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

function planWithHeuristicSkill(skillPath = apiCompatibilitySkillPath) {
  const plan = planWithSkillPath(skillPath);
  return { selected: [...plan.selected, { metadata: { id: 'security-basic' } }] };
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
    // `security-basic` is what makes the heuristic collection actually touch the
    // diff: collectHeuristicDetections only runs detectors whose skillId is in
    // the plan, and `api-compatibility` owns no heuristic detector. Without a
    // detector-backed Skill here the exploding diff is never read, so the
    // `heuristic-signal-collection-failed` branch would go unexercised.
    // It carries no `path`, so it contributes no catalog work of its own.
    plan: planWithHeuristicSkill(),
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

test(
  'catalog symlinks cannot escape the built-in skills root',
  { skip: process.platform === 'win32' },
  async (t) => {
    const fixturesRoot = path.join(
      repoRoot,
      'skills',
      'midstream',
      'api-compatibility',
      'fixtures'
    );
    const skillDir = await fs.mkdtemp(path.join(fixturesRoot, 'viewpoint-stage-'));
    const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), 'river-review-viewpoints-outside-'));
    t.after(async () => {
      await fs.rm(skillDir, { recursive: true, force: true });
      await fs.rm(outsideDir, { recursive: true, force: true });
    });

    const skillPath = path.join(skillDir, 'SKILL.md');
    await fs.writeFile(skillPath, '# test skill\n', 'utf8');
    await fs.writeFile(
      path.join(outsideDir, 'viewpoints.yaml'),
      'version: 1\nskillId: api-compatibility\nviewpoints: []\n',
      'utf8'
    );
    await fs.symlink(outsideDir, path.join(skillDir, 'references'), 'dir');

    const observe = await runReviewViewpointStage({
      reviewConfig: { viewpoints: { mode: 'observe' } },
      diff: apiContractDiff(),
      plan: planWithSkillPath(skillPath),
    });
    assert.deepEqual(observe.activeObligations, []);
    assert.deepEqual(observe.observation.errors, [
      { skillId: 'api-compatibility', code: 'catalog-path-outside-built-in-skills' },
    ]);

    await assert.rejects(
      runReviewViewpointStage({
        reviewConfig: { viewpoints: { mode: 'active' } },
        diff: apiContractDiff(),
        plan: planWithSkillPath(skillPath),
      }),
      (error) =>
        error instanceof ReviewViewpointStageError &&
        /viewpoints path escapes skills root/.test(error.message)
    );
  }
);
