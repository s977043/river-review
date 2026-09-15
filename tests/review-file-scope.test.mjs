import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  deriveReviewFileScope,
  planLocalReview,
  runLocalReview,
} from '../src/lib/local-runner.mjs';
import { deriveReviewCoverage } from '../src/lib/review-coverage.mjs';
import { compileReviewCoverageValidator } from './helpers/schema-validator.mjs';
import { createTempGitRepo, runGit } from './helpers/temp-repo.mjs';

const validateCoverage = compileReviewCoverageValidator();
const validationErrors = () => JSON.stringify(validateCoverage.errors, null, 2);

function file(path) {
  return { path, hunks: [] };
}

function unit() {
  return {
    id: 'reviewer:bug-hunter/chunk:1',
    kind: 'diff-chunk',
    subjects: ['src/app.js'],
    reviewerRole: 'bug-hunter',
    required: true,
    status: 'completed',
    reasonCode: null,
    findingsCount: 0,
  };
}

describe('Review Coverage file scope ledger (#2212 Slice C)', () => {
  it('partitions raw changed files into selected and deterministically excluded paths', () => {
    const rawDiff = {
      changedFiles: ['src/app.js', 'docs/notes.md', 'generated/data.json', 'src/app.js'],
      files: [file('src/app.js'), file('docs/notes.md'), file('generated/data.json')],
      filesForReview: [file('src/app.js')],
    };
    const filteredDiff = {
      ...rawDiff,
      changedFiles: ['src/app.js', 'docs/notes.md', 'src/app.js'],
      files: [file('src/app.js'), file('docs/notes.md')],
      filesForReview: [file('src/app.js')],
    };

    assert.deepEqual(deriveReviewFileScope(rawDiff, filteredDiff, ['generated/**']), {
      selected: ['src/app.js'],
      excluded: [
        { path: 'docs/notes.md', reasonCode: 'diff_optimization' },
        { path: 'generated/data.json', reasonCode: 'configured_exclusion' },
      ],
    });
  });

  it('keeps selected/excluded disjoint and preserves first-seen raw change order', () => {
    const rawDiff = {
      changedFiles: ['b.js', 'a.js', 'b.js', 'docs/readme.md'],
    };
    const filteredDiff = {
      filesForReview: [file('a.js'), file('b.js')],
    };

    const scope = deriveReviewFileScope(rawDiff, filteredDiff, []);
    assert.deepEqual(scope.selected, ['b.js', 'a.js']);
    assert.deepEqual(scope.excluded, [{ path: 'docs/readme.md', reasonCode: 'diff_optimization' }]);
    assert.equal(
      scope.selected.some((path) => scope.excluded.some((entry) => entry.path === path)),
      false
    );
  });

  it('accepts fileScope in the Review Coverage schema and rejects unknown reasons', () => {
    const coverage = deriveReviewCoverage([unit()]);
    coverage.fileScope = {
      selected: ['src/app.js'],
      excluded: [{ path: 'docs/notes.md', reasonCode: 'diff_optimization' }],
    };

    assert.equal(validateCoverage(coverage), true, validationErrors());

    coverage.fileScope.excluded[0].reasonCode = 'unknown_reason';
    assert.equal(validateCoverage(coverage), false);
  });

  it('keeps legacy Review Coverage without fileScope valid', () => {
    const coverage = deriveReviewCoverage([unit()]);
    assert.equal('fileScope' in coverage, false);
    assert.equal(validateCoverage(coverage), true, validationErrors());
  });

  it('derives scope at the local selection boundary and propagates it into orchestrated coverage', async (t) => {
    const { dir, cleanup } = await createTempGitRepo({
      prefix: 'river-review-file-scope-',
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
    assert.equal(context.status, 'ok');
    assert.deepEqual(context.reviewFileScope, {
      selected: ['src/app.js'],
      excluded: [
        { path: 'docs/notes.md', reasonCode: 'diff_optimization' },
        { path: 'generated/data.json', reasonCode: 'configured_exclusion' },
      ],
    });

    const result = await runLocalReview({
      cwd: dir,
      context,
      dryRun: true,
      reviewers: ['bug-hunter'],
      quiet: true,
    });

    assert.equal(result.status, 'ok');
    assert.deepEqual(result.reviewCoverage?.fileScope, context.reviewFileScope);
    assert.equal(validateCoverage(result.reviewCoverage), true, validationErrors());
  });
});
