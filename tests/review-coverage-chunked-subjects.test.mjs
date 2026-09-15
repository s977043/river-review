// Regression guard for #2233: in a chunked run, `reviewCoverage.units[].subjects`
// must never claim a path that the same ledger's `fileScope.excluded` says was
// dropped. `splitDiffIntoChunks` aliases the RAW chunk files into both `files`
// and `filesForReview`, so a subjects derivation that reads those fields
// directly re-introduces optimizer-dropped paths (lockfiles, `dist/`, Markdown)
// as covered subjects.
//
// The assertion is the INTERSECTION of the two sets, taken from one run of the
// real production paths (`deriveReviewFileScope` + `runReviewerOrchestration`),
// not from a re-implementation of either.
import assert from 'node:assert/strict';
import test from 'node:test';

import { optimizeDiff, renderDiffText } from '../src/lib/diff-processor.mjs';
import { deriveReviewFileScope } from '../src/lib/local-runner.mjs';
import { runReviewerOrchestration } from '../src/lib/reviewer-orchestrator.mjs';

/** Paths the LLM diff optimizer drops (Markdown, lock files, `dist/` output). */
const OPTIMIZER_DROPPED = [
  'docs/notes.md',
  'package-lock.json',
  'runners/github-action/dist/index.mjs',
];

function fileEntry(path, index) {
  return {
    path,
    oldPath: path,
    newPath: path,
    hunks: [
      {
        header: `@@ -1,2 +1,3 @@`,
        lines: [' const start = 1;', `+const added${index} = ${index};`, ' const end = 2;'],
      },
    ],
  };
}

/**
 * Build the diff shape `collectRepoDiff` hands to orchestration: raw `files`
 * plus the optimizer's `filesForReview`, and the raw counterpart used as the
 * file-scope ledger's "before configured exclusions" input.
 */
function buildDiffPair(paths) {
  const files = paths.map((path, index) => fileEntry(path, index));
  const rawDiffText = renderDiffText(files);
  const optimized = optimizeDiff({ files, diffText: rawDiffText });
  const rawDiff = { changedFiles: [...paths], files, diffText: rawDiffText };
  const filteredDiff = {
    ...rawDiff,
    filesForReview: optimized.files,
    rawDiffText,
    diffText: optimized.diffText,
  };
  return { rawDiff, filteredDiff };
}

async function runCoverage(paths) {
  const { rawDiff, filteredDiff } = buildDiffPair(paths);
  const fileScope = deriveReviewFileScope(rawDiff, filteredDiff, []);
  const result = await runReviewerOrchestration({
    diff: filteredDiff,
    phase: 'midstream',
    dryRun: true,
    reviewers: ['bug-hunter'],
    quiet: true,
    progressSink: () => {},
    env: {},
    generateReviewImpl: async () => ({ findings: [] }),
  });
  const units = result.reviewCoverage?.units ?? [];
  const excluded = fileScope.excluded.map((entry) => entry.path);
  const subjects = new Set(units.flatMap((unit) => unit.subjects));
  return {
    units,
    excluded,
    subjects,
    intersection: excluded.filter((path) => subjects.has(path)),
  };
}

// 12 files across 5 top-level groups: over SPLIT_FILE_THRESHOLD (10), so the
// orchestrator splits, and the optimizer-dropped paths land in a chunk together
// with a reviewable file.
const CHUNKED_PATHS = [
  'src/a.mjs',
  'src/b.mjs',
  'src/c.mjs',
  'src/d.mjs',
  'src/e.mjs',
  'src/f.mjs',
  'src/g.mjs',
  'src/h.mjs',
  'web/app.mjs',
  ...OPTIMIZER_DROPPED,
];

test('chunked run: fileScope.excluded and units[].subjects do not intersect (#2233)', async () => {
  const { units, excluded, subjects, intersection } = await runCoverage(CHUNKED_PATHS);

  // Guard the premises: without a split, or without dropped files, the test
  // would pass for the wrong reason.
  assert.ok(units.length > 1, `expected a chunked run, got ${units.length} unit(s)`);
  assert.deepEqual([...excluded].sort(), [...OPTIMIZER_DROPPED].sort());

  assert.deepEqual(intersection, [], `subjects claim excluded path(s): ${intersection.join(', ')}`);
  // Reviewable files must still be covered — the fix must not empty subjects.
  assert.ok(subjects.has('src/a.mjs'));
  assert.ok(subjects.has('web/app.mjs'));
});

test('unchunked run: subjects still cover every reviewable file (#2233)', async () => {
  const { units, excluded, subjects, intersection } = await runCoverage([
    'src/a.mjs',
    'src/b.mjs',
    'docs/notes.md',
    'package-lock.json',
  ]);

  assert.equal(units.length, 1, 'small diff must not be split');
  assert.deepEqual([...excluded].sort(), ['docs/notes.md', 'package-lock.json']);
  assert.deepEqual(intersection, []);
  assert.deepEqual([...subjects].sort(), ['src/a.mjs', 'src/b.mjs']);
});
