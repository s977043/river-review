import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { runReviewerOrchestration } from '../src/lib/reviewer-orchestrator.mjs';
import { compileReviewCoverageValidator } from './helpers/schema-validator.mjs';

const validateCoverage = compileReviewCoverageValidator();
const validationErrors = () => JSON.stringify(validateCoverage.errors, null, 2);

// Files carry a real hunk: `reviewUnitSubjects` derives subjects from the LLM
// diff view (#2233), and a file with no surviving hunk is not part of that view.
function file(path) {
  return {
    path,
    hunks: [{ header: '@@ -1,1 +1,2 @@', lines: [' const a = 1;', `+const touched = '${path}';`] }],
  };
}

function diffFor(paths) {
  const files = paths.map(file);
  return {
    files,
    filesForReview: files,
    changedFiles: [...paths],
    diffText: '',
  };
}

function okReview(overrides = {}) {
  return {
    findings: [],
    comments: [],
    prompt: 'test',
    promptTruncated: false,
    llmModel: 'test-model',
    ...overrides,
  };
}

function baseArgs(overrides = {}) {
  return {
    diff: diffFor(['src/a.js']),
    reviewers: ['bug-hunter'],
    progress: false,
    env: {},
    generateReviewImpl: async () => okReview(),
    ...overrides,
  };
}

function chunkedDiff() {
  return diffFor([
    ...Array.from({ length: 6 }, (_, i) => `slow/file-${i}.js`),
    ...Array.from({ length: 5 }, (_, i) => `fast/file-${i}.js`),
  ]);
}

function coveredSubjects(reviewCoverage) {
  return [...new Set(reviewCoverage.units.flatMap((unit) => unit.subjects))].sort();
}

describe('reviewCoverage runtime wiring', () => {
  it('reports complete for a successful non-chunked required review', async () => {
    const result = await runReviewerOrchestration(baseArgs());

    assert.equal(result.reviewCoverage.status, 'complete');
    assert.equal(result.reviewCoverage.expectedUnits, 1);
    assert.equal(result.reviewCoverage.completedRequiredUnits, 1);
    assert.equal(result.reviewCoverage.units[0].id, 'reviewer:bug-hunter/chunk:1');
    assert.deepEqual(result.reviewCoverage.units[0].subjects, ['src/a.js']);
    assert.equal(validateCoverage(result.reviewCoverage), true, validationErrors());
  });

  it('reports complete when every chunk of a required review completes', async () => {
    const diff = chunkedDiff();
    const result = await runReviewerOrchestration(baseArgs({ diff }));

    assert.equal(result.reviewCoverage.status, 'complete');
    assert.equal(result.reviewCoverage.expectedUnits, 2);
    assert.equal(result.reviewCoverage.completedUnits, 2);
    assert.equal(result.reviewCoverage.completedRequiredUnits, 2);
    assert.deepEqual(result.reviewCoverage.incompleteRequiredUnitIds, []);
    assert.deepEqual(coveredSubjects(result.reviewCoverage), [...diff.changedFiles].sort());
    assert.equal(validateCoverage(result.reviewCoverage), true, validationErrors());
  });

  it('keeps non-chunked subject accounting reconstructible from Review Units', async () => {
    const diff = diffFor(['src/a.js', 'src/b.js', 'test/a.test.js']);
    const result = await runReviewerOrchestration(baseArgs({ diff }));

    assert.equal(result.reviewCoverage.expectedUnits, 1);
    assert.deepEqual(coveredSubjects(result.reviewCoverage), [...diff.changedFiles].sort());
    assert.equal(validateCoverage(result.reviewCoverage), true, validationErrors());
  });

  it('reports partial when one required chunk succeeds and another times out', async () => {
    const result = await runReviewerOrchestration(
      baseArgs({
        diff: chunkedDiff(),
        timeoutMs: 5,
        generateReviewImpl: async ({ diff }) => {
          if (diff.files.some((entry) => entry.path.startsWith('slow/'))) {
            await new Promise((resolve) => setTimeout(resolve, 30));
          }
          return okReview();
        },
      })
    );

    assert.equal(result.reviewCoverage.status, 'partial');
    assert.equal(result.reviewCoverage.expectedUnits, 2);
    assert.equal(result.reviewCoverage.completedRequiredUnits, 1);
    assert.equal(result.reviewCoverage.incompleteRequiredUnitIds.length, 1);
    assert.equal(
      result.reviewCoverage.units.filter((unit) => unit.status === 'timed_out').length,
      1
    );
    assert.equal(validateCoverage(result.reviewCoverage), true, validationErrors());
  });

  it('reports partial when one required chunk succeeds and another fails', async () => {
    const result = await runReviewerOrchestration(
      baseArgs({
        diff: chunkedDiff(),
        generateReviewImpl: async ({ diff }) => {
          if (diff.files.some((entry) => entry.path.startsWith('slow/'))) {
            throw new Error('reviewer failed');
          }
          return okReview();
        },
      })
    );

    assert.equal(result.reviewCoverage.status, 'partial');
    assert.equal(result.reviewCoverage.units.filter((unit) => unit.status === 'failed').length, 1);
    assert.equal(validateCoverage(result.reviewCoverage), true, validationErrors());
  });

  it('reports not_executed when all required work fails', async () => {
    const result = await runReviewerOrchestration(
      baseArgs({
        generateReviewImpl: async () => {
          throw new Error('reviewer failed');
        },
      })
    );

    assert.equal(result.reviewCoverage.status, 'not_executed');
    assert.equal(result.reviewCoverage.completedRequiredUnits, 0);
    assert.deepEqual(result.reviewCoverage.incompleteRequiredUnitIds, [
      'reviewer:bug-hunter/chunk:1',
    ]);
    assert.equal(validateCoverage(result.reviewCoverage), true, validationErrors());
  });

  it('keeps auto-selected optional reviewer failure from weakening required coverage', async () => {
    const result = await runReviewerOrchestration(
      baseArgs({
        reviewers: ['auto'],
        fileTypes: { infra: ['infra/main.tf'] },
        generateReviewImpl: async ({ projectRules }) => {
          if (projectRules.includes('Security Scanner reviewer')) {
            throw new Error('optional security review failed');
          }
          return okReview();
        },
      })
    );

    assert.deepEqual(result.autoSelection.required, ['bug-hunter']);
    assert.equal(result.reviewCoverage.status, 'complete');
    assert.equal(result.reviewCoverage.expectedUnits, 2);
    assert.equal(result.reviewCoverage.requiredUnits, 1);
    assert.equal(result.reviewCoverage.completedRequiredUnits, 1);
    assert.equal(validateCoverage(result.reviewCoverage), true, validationErrors());
  });

  it('keeps a failed required reviewer incomplete even when optional work succeeds', async () => {
    const result = await runReviewerOrchestration(
      baseArgs({
        reviewers: ['auto'],
        fileTypes: { infra: ['infra/main.tf'] },
        generateReviewImpl: async ({ projectRules }) => {
          if (projectRules.includes('Bug Hunter reviewer')) {
            throw new Error('required bug review failed');
          }
          return okReview();
        },
      })
    );

    assert.deepEqual(result.autoSelection.required, ['bug-hunter']);
    assert.equal(result.reviewCoverage.status, 'not_executed');
    assert.equal(result.reviewCoverage.expectedUnits, 2);
    assert.equal(result.reviewCoverage.completedUnits, 1);
    assert.equal(result.reviewCoverage.requiredUnits, 1);
    assert.equal(result.reviewCoverage.completedRequiredUnits, 0);
    assert.deepEqual(result.reviewCoverage.incompleteRequiredUnitIds, [
      'reviewer:bug-hunter/chunk:1',
    ]);
    assert.equal(validateCoverage(result.reviewCoverage), true, validationErrors());
  });

  it('forwards the caller repoContext unchanged to an orchestrated reviewer', async () => {
    const repoContext = {
      supplied: [{ path: 'src/context.js' }],
      skipped: [],
    };
    const seen = [];
    const result = await runReviewerOrchestration(
      baseArgs({
        repoContext,
        generateReviewImpl: async (args) => {
          seen.push(args.repoContext);
          return okReview();
        },
      })
    );

    assert.equal(seen.length, 1);
    assert.equal(seen[0], repoContext);
    assert.equal(result.reviewCoverage.status, 'complete');
    assert.equal(validateCoverage(result.reviewCoverage), true, validationErrors());
  });

  it('forwards the same repoContext to every chunk without weakening execution coverage', async () => {
    const repoContext = {
      supplied: [],
      skipped: [{ path: 'src/context.js', reason: 'budget-exhausted' }],
    };
    const seen = [];
    const result = await runReviewerOrchestration(
      baseArgs({
        diff: chunkedDiff(),
        repoContext,
        generateReviewImpl: async (args) => {
          seen.push(args.repoContext);
          return okReview();
        },
      })
    );

    assert.equal(seen.length, 2);
    assert.ok(seen.every((value) => value === repoContext));
    assert.equal(result.reviewCoverage.status, 'complete');
    assert.equal(result.reviewCoverage.completedRequiredUnits, 2);
    assert.equal(validateCoverage(result.reviewCoverage), true, validationErrors());
  });
});
