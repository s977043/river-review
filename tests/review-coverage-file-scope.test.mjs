import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import {
  LLM_DIFF_EXCLUSION_REASONS,
  buildLlmDiffView,
  buildLlmReviewScope,
  optimizeDiff,
  renderDiffText,
} from '../src/lib/diff-processor.mjs';
import { attachReviewFileCoverage, deriveReviewCoverage } from '../src/lib/review-coverage.mjs';
import { runReviewerOrchestration } from '../src/lib/reviewer-orchestrator.mjs';
import { compileReviewCoverageValidator } from './helpers/schema-validator.mjs';

const validateCoverage = compileReviewCoverageValidator();

function file(path, lines = ['-const before = 1;', '+const after = 2;']) {
  return {
    path,
    hunks: [{ header: '@@ -1 +1 @@', lines }],
  };
}

function unit({
  id,
  subjects = ['src/app.js'],
  required = true,
  status = 'completed',
  reasonCode = null,
}) {
  return {
    id,
    kind: 'diff-chunk',
    subjects,
    reviewerRole: id.split('/')[0].replace('reviewer:', ''),
    required,
    status,
    reasonCode,
    findingsCount: 0,
  };
}

describe('Review Coverage file scope', () => {
  it('records deterministic selected and excluded file reasons', () => {
    const rawFiles = [
      file('src/app.js'),
      file('docs/guide.md'),
      file('package-lock.json'),
      file('runners/github-action/dist/index.js'),
      file('src/comment-only.js', ['-// before', '+// after']),
    ];
    const optimized = optimizeDiff({ files: rawFiles, diffText: renderDiffText(rawFiles) });
    const scope = buildLlmReviewScope({
      changedFiles: rawFiles.map((entry) => entry.path),
      files: rawFiles,
      filesForReview: optimized.files,
      diffText: optimized.diffText,
    });

    assert.deepEqual(scope.selected, ['src/app.js']);
    assert.deepEqual(scope.excluded, [
      { path: 'docs/guide.md', reasonCode: 'markdown' },
      { path: 'package-lock.json', reasonCode: 'lockfile' },
      { path: 'runners/github-action/dist/index.js', reasonCode: 'generated_artifact' },
      { path: 'src/comment-only.js', reasonCode: 'non_reviewable_hunks' },
    ]);
  });

  it('re-applies the optimizer when filesForReview contains raw chunk files', () => {
    const rawChunk = [file('src/app.js'), file('docs/guide.md')];
    const view = buildLlmDiffView({
      filesForReview: rawChunk,
      diffText: renderDiffText(rawChunk),
    });

    assert.deepEqual(
      view.files.map((entry) => entry.path),
      ['src/app.js']
    );
    assert.doesNotMatch(view.diffText, /docs\/guide\.md/);
  });

  it('keeps a selected file uncovered when any required unit for it is incomplete', () => {
    const coverage = deriveReviewCoverage([
      unit({ id: 'reviewer:bug-hunter/chunk:1' }),
      unit({
        id: 'reviewer:security-scanner/chunk:1',
        status: 'timed_out',
        reasonCode: 'reviewer_timeout',
      }),
    ]);
    const withFiles = attachReviewFileCoverage(coverage, {
      selected: ['src/app.js'],
      excluded: [],
    });

    assert.equal(withFiles.status, 'partial');
    assert.deepEqual(withFiles.files.selected, ['src/app.js']);
    assert.deepEqual(withFiles.files.covered, []);
  });

  it('does not let an optional reviewer failure weaken required file coverage', () => {
    const coverage = deriveReviewCoverage([
      unit({ id: 'reviewer:bug-hunter/chunk:1' }),
      unit({
        id: 'reviewer:test-gap/chunk:1',
        required: false,
        status: 'failed',
        reasonCode: 'reviewer_error',
      }),
    ]);
    const withFiles = attachReviewFileCoverage(coverage, {
      selected: ['src/app.js'],
      excluded: [],
    });

    assert.equal(withFiles.status, 'complete');
    assert.deepEqual(withFiles.files.covered, ['src/app.js']);
  });

  it('keeps legacy coverage schema-valid while accepting the additive files ledger', () => {
    const legacy = deriveReviewCoverage([unit({ id: 'reviewer:bug-hunter/chunk:1' })]);
    assert.equal(validateCoverage(legacy), true, JSON.stringify(validateCoverage.errors));

    const current = attachReviewFileCoverage(legacy, {
      selected: ['src/app.js'],
      excluded: [{ path: 'README.md', reasonCode: 'markdown' }],
    });
    assert.equal(validateCoverage(current), true, JSON.stringify(validateCoverage.errors));

    const invalid = structuredClone(current);
    invalid.files.excluded[0].reasonCode = 'mystery';
    assert.equal(validateCoverage(invalid), false);
  });

  it('keeps code and schema exclusion vocabularies aligned', () => {
    const schema = JSON.parse(
      readFileSync(new URL('../schemas/review-coverage.schema.json', import.meta.url), 'utf8')
    );
    assert.deepEqual(
      schema.$defs.excludedFile.properties.reasonCode.enum,
      LLM_DIFF_EXCLUSION_REASONS
    );
  });

  it('wires file scope into runtime Review Coverage', async () => {
    const rawFiles = [file('src/app.js'), file('docs/guide.md')];
    const optimized = optimizeDiff({ files: rawFiles, diffText: renderDiffText(rawFiles) });
    const result = await runReviewerOrchestration({
      diff: {
        changedFiles: rawFiles.map((entry) => entry.path),
        files: rawFiles,
        filesForReview: optimized.files,
        diffText: optimized.diffText,
      },
      reviewers: ['bug-hunter'],
      quiet: true,
      generateReviewImpl: async () => ({ findings: [], comments: [] }),
    });

    assert.deepEqual(result.reviewCoverage.files, {
      selected: ['src/app.js'],
      covered: ['src/app.js'],
      excluded: [{ path: 'docs/guide.md', reasonCode: 'markdown' }],
    });
    assert.equal(
      validateCoverage(result.reviewCoverage),
      true,
      JSON.stringify(validateCoverage.errors)
    );
  });
});
