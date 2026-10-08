import assert from 'node:assert/strict';
import test from 'node:test';

import { planLocalReview, runLocalReview } from '../src/lib/local-runner.mjs';
import { createTempGitRepo, runGit } from './helpers/temp-repo.mjs';

async function withEnv(name, value, fn) {
  const previous = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  try {
    return await fn();
  } finally {
    if (previous === undefined) delete process.env[name];
    else process.env[name] = previous;
  }
}

test('#2564 shadow strategy is opt-in and never changes review execution', async (t) => {
  const { dir, cleanup } = await createTempGitRepo({
    prefix: 'river-execution-shadow-',
    initialFiles: { 'src/app.js': 'export const value = 1;\n' },
    changedFiles: { 'src/app.js': 'export const value = 2;\n' },
  });
  t.after(cleanup);
  await runGit(['add', '.'], dir);
  const context = await planLocalReview({ cwd: dir, dryRun: true });
  assert.equal(context.status, 'ok');

  const off = await withEnv('RIVER_EXECUTION_STRATEGY_SHADOW', undefined, () =>
    runLocalReview({ cwd: dir, context, dryRun: true, quiet: true })
  );
  assert.equal(off.reviewDebug.executionStrategyShadow, undefined);

  const on = await withEnv('RIVER_EXECUTION_STRATEGY_SHADOW', '1', () =>
    runLocalReview({ cwd: dir, context, dryRun: true, quiet: true })
  );
  const observation = on.reviewDebug.executionStrategyShadow;
  assert.equal(observation.kind, 'execution-strategy-shadow-observation');
  assert.equal(observation.recommendationApplied, false);
  assert.equal(observation.actualStrategy, null);
  assert.equal(observation.comparison, null);
  assert.ok(['single', 'cascade', 'critique'].includes(observation.recommendedStrategy));
  assert.ok(observation.limitations.includes('provider-attempt-accounting-not-measured'));

  const withoutShadow = structuredClone(on);
  delete withoutShadow.reviewDebug.executionStrategyShadow;
  assert.deepEqual(withoutShadow, off);
});
