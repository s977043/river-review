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

function withoutConcernObservation(result) {
  const cloned = structuredClone(result);
  if (cloned.reviewDebug) delete cloned.reviewDebug.reviewConcernMap;
  return cloned;
}

test('local runner keeps Concern Analyzer observe-only and default off', async (t) => {
  const { dir, cleanup } = await createTempGitRepo({
    prefix: 'river-concern-wiring-',
    initialFiles: {
      '.river-review.json': JSON.stringify({ exclude: { files: ['generated/**'] } }, null, 2),
      'src/app.js': 'export const value = 1;\n',
      'docs/notes.md': '# Before\n',
      'generated/data.json': '{"value":1}\n',
    },
    changedFiles: {
      'src/app.js': 'export const value = 2;\n',
      'docs/notes.md': '# After\n',
      'generated/data.json': '{"value":2}\n',
    },
    rules: 'Review persistent behavior changes.',
  });
  t.after(cleanup);
  await runGit(['add', '.'], dir);

  const context = await withEnv('RIVER_CONCERN_ANALYZER', undefined, () =>
    planLocalReview({ cwd: dir, dryRun: true })
  );

  assert.equal(context.status, 'ok');
  assert.equal(context.rawChangedFiles.length, 4);
  for (const expected of [
    '.river/rules.md',
    'docs/notes.md',
    'generated/data.json',
    'src/app.js',
  ]) {
    assert.ok(context.rawChangedFiles.includes(expected), expected);
  }

  const off = await withEnv('RIVER_CONCERN_ANALYZER', undefined, () =>
    runLocalReview({ cwd: dir, context, dryRun: true, quiet: true })
  );
  assert.equal(off.reviewDebug.reviewConcernMap, undefined);

  const observed = await withEnv('RIVER_CONCERN_ANALYZER', '1', () =>
    runLocalReview({ cwd: dir, context, dryRun: true, quiet: true })
  );

  assert.equal(observed.reviewDebug.reviewConcernMap.kind, 'review-concern-map');
  assert.equal(observed.reviewDebug.reviewConcernMap.analysis.status, 'failed');
  assert.deepEqual(observed.reviewDebug.reviewConcernMap.analysis.limitations, [
    'analyzer-not-executed:dry-run',
  ]);
  assert.equal(
    observed.reviewDebug.reviewConcernMap.analysis.input.rawChangedFileCount,
    context.rawChangedFiles.length
  );

  // Phase 1 invariant: the opt-in observation cannot modify findings, comments,
  // coverage, routing, or any other runner output.
  assert.deepEqual(withoutConcernObservation(observed), off);
});

test('raw manifest survives optimizer and configured exclusions in plan context', async (t) => {
  const { dir, cleanup } = await createTempGitRepo({
    prefix: 'river-concern-raw-manifest-',
    initialFiles: {
      '.river-review.json': JSON.stringify({ exclude: { files: ['generated/**'] } }, null, 2),
      'src/app.js': 'export const value = 1;\n',
      'docs/notes.md': '# Before\n',
      'generated/data.json': '{"value":1}\n',
    },
    changedFiles: {
      'src/app.js': 'export const value = 2;\n',
      'docs/notes.md': '# After\n',
      'generated/data.json': '{"value":2}\n',
    },
  });
  t.after(cleanup);
  await runGit(['add', '.'], dir);

  const context = await planLocalReview({ cwd: dir, dryRun: true });

  assert.ok(context.rawChangedFiles.includes('src/app.js'));
  assert.ok(context.rawChangedFiles.includes('docs/notes.md'));
  assert.ok(context.rawChangedFiles.includes('generated/data.json'));
  assert.deepEqual(context.reviewFileScope, {
    selected: ['src/app.js'],
    excluded: [
      { path: 'docs/notes.md', reasonCode: 'diff_optimization' },
      { path: 'generated/data.json', reasonCode: 'configured_exclusion' },
    ],
  });
});


test('optimized-away raw changes still produce an observe-only map on no-changes', async (t) => {
  const { dir, cleanup } = await createTempGitRepo({
    prefix: 'river-concern-no-changes-',
    initialFiles: {
      'docs/notes.md': '# Before\n',
    },
    changedFiles: {
      'docs/notes.md': '# After\n',
    },
  });
  t.after(cleanup);
  await runGit(['add', '.'], dir);

  const context = await planLocalReview({ cwd: dir, phase: 'midstream', dryRun: true });
  assert.equal(context.status, 'no-changes');
  assert.deepEqual(context.rawChangedFiles, ['docs/notes.md']);
  assert.deepEqual(context.reviewFileScope, {
    selected: [],
    excluded: [{ path: 'docs/notes.md', reasonCode: 'diff_optimization' }],
  });

  const off = await withEnv('RIVER_CONCERN_ANALYZER', undefined, () =>
    runLocalReview({ cwd: dir, context, phase: 'midstream', dryRun: true, quiet: true })
  );
  assert.equal(off.status, 'no-changes');
  assert.equal(off.reviewDebug, undefined);

  const observed = await withEnv('RIVER_CONCERN_ANALYZER', '1', () =>
    runLocalReview({ cwd: dir, context, phase: 'midstream', dryRun: true, quiet: true })
  );
  assert.equal(observed.status, 'no-changes');
  assert.equal(observed.reviewDebug.reviewConcernMap.analysis.status, 'failed');
  assert.equal(observed.reviewDebug.reviewConcernMap.analysis.input.rawChangedFileCount, 1);
  assert.deepEqual(observed.reviewDebug.reviewConcernMap.analysis.limitations, [
    'analyzer-not-executed:dry-run',
  ]);

  assert.deepEqual(withoutConcernObservation(observed), off);
});

test('true empty repository diff does not fabricate a concern observation', async (t) => {
  const { dir, cleanup } = await createTempGitRepo({
    prefix: 'river-concern-true-empty-',
    initialFiles: {
      'src/app.js': 'export const value = 1;\n',
    },
  });
  t.after(cleanup);

  const result = await withEnv('RIVER_CONCERN_ANALYZER', '1', () =>
    runLocalReview({ cwd: dir, phase: 'midstream', dryRun: true, quiet: true })
  );

  assert.equal(result.status, 'no-changes');
  assert.equal(result.reviewDebug, undefined);
});
