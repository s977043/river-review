import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import {
  REVIEW_COVERAGE_STATUSES,
  REVIEW_UNIT_STATUSES,
  deriveReviewCoverage,
  deriveSingleReviewerLlmCoverage,
} from '../src/lib/review-coverage.mjs';
import { compileReviewCoverageValidator } from './helpers/schema-validator.mjs';

const validateCoverage = compileReviewCoverageValidator();
const validationErrors = () => JSON.stringify(validateCoverage.errors, null, 2);

function unit(id, status = 'completed', required = true, extra = {}) {
  return {
    id,
    kind: 'diff-chunk',
    subjects: [`src/${id}.js`],
    reviewerRole: 'bug-hunter',
    required,
    status,
    reasonCode: status === 'completed' ? null : 'reviewer_error',
    findingsCount: 0,
    ...extra,
  };
}

describe('deriveReviewCoverage', () => {
  it('reports complete when every required unit completed, even with zero findings', () => {
    const result = deriveReviewCoverage([unit('a'), unit('b')]);

    assert.equal(result.status, 'complete');
    assert.equal(result.expectedUnits, 2);
    assert.equal(result.completedUnits, 2);
    assert.equal(result.completedRequiredUnits, 2);
    assert.deepEqual(result.incompleteRequiredUnitIds, []);
    assert.equal(validateCoverage(result), true, validationErrors());
  });

  it('reports partial when one required unit completed and another timed out', () => {
    const result = deriveReviewCoverage([
      unit('a'),
      unit('b', 'timed_out', true, { reasonCode: 'reviewer_timeout' }),
    ]);

    assert.equal(result.status, 'partial');
    assert.equal(result.completedRequiredUnits, 1);
    assert.deepEqual(result.incompleteRequiredUnitIds, ['b']);
    assert.equal(validateCoverage(result), true, validationErrors());
  });

  it('reports not_executed when no required unit completed', () => {
    const result = deriveReviewCoverage([
      unit('a', 'failed'),
      unit('b', 'timed_out', true, { reasonCode: 'reviewer_timeout' }),
    ]);

    assert.equal(result.status, 'not_executed');
    assert.equal(result.completedUnits, 0);
    assert.equal(result.completedRequiredUnits, 0);
    assert.equal(validateCoverage(result), true, validationErrors());
  });

  it('does not weaken required coverage when optional work fails', () => {
    const result = deriveReviewCoverage([unit('required-a'), unit('optional-b', 'failed', false)]);

    assert.equal(result.status, 'complete');
    assert.equal(result.requiredUnits, 1);
    assert.equal(result.completedRequiredUnits, 1);
    assert.equal(result.completedUnits, 1);
    assert.equal(validateCoverage(result), true, validationErrors());
  });

  it('treats missing required metadata as required and materializes the default', () => {
    const result = deriveReviewCoverage([
      {
        id: 'unknown-policy',
        kind: 'diff-chunk',
        subjects: ['src/a.js'],
        reviewerRole: 'bug-hunter',
        status: 'failed',
        reasonCode: 'reviewer_error',
        findingsCount: 0,
      },
    ]);

    assert.equal(result.requiredUnits, 1);
    assert.equal(result.status, 'not_executed');
    assert.equal(result.units[0].required, true);
    assert.equal(validateCoverage(result), true, validationErrors());
  });

  it('reports not_executed for an empty execution plan', () => {
    const result = deriveReviewCoverage([]);

    assert.equal(result.status, 'not_executed');
    assert.equal(result.expectedUnits, 0);
    assert.equal(result.requiredUnits, 0);
    assert.equal(validateCoverage(result), true, validationErrors());
  });
});

describe('deriveSingleReviewerLlmCoverage', () => {
  it('marks a successful semantic LLM review complete, including zero findings', () => {
    const result = deriveSingleReviewerLlmCoverage({
      debug: { llmUsed: true },
      subjects: ['src/a.js', 'src/a.js'],
      findingsCount: 0,
    });

    assert.equal(result.status, 'complete');
    assert.equal(result.expectedUnits, 1);
    assert.equal(result.units[0].status, 'completed');
    assert.deepEqual(result.units[0].subjects, ['src/a.js']);
    assert.equal(result.units[0].findingsCount, 0);
    assert.equal(validateCoverage(result), true, validationErrors());
  });

  it('marks a transport or response parse failure not_executed', () => {
    const result = deriveSingleReviewerLlmCoverage({
      debug: { llmUsed: false, llmError: 'Unexpected token O in JSON' },
      subjects: ['src/a.js'],
    });

    assert.equal(result.status, 'not_executed');
    assert.equal(result.completedRequiredUnits, 0);
    assert.equal(result.units[0].status, 'failed');
    assert.equal(result.units[0].reasonCode, 'reviewer_error');
    assert.equal(result.units[0].findingsCount, 0);
    assert.equal(validateCoverage(result), true, validationErrors());
  });

  it('keeps intentional skips unobserved for backward compatibility', () => {
    assert.equal(
      deriveSingleReviewerLlmCoverage({
        debug: { llmUsed: false, llmSkipped: 'dry-run enabled' },
        subjects: ['src/a.js'],
      }),
      null
    );
    assert.equal(
      deriveSingleReviewerLlmCoverage({
        debug: { llmUsed: false, llmSkipped: 'LLM API key not set' },
        subjects: ['src/a.js'],
      }),
      null
    );
  });

  it('treats llmUsed=true as completed even when debug also carries a partial-batch warning', () => {
    const result = deriveSingleReviewerLlmCoverage({
      debug: { llmUsed: true, llmError: 'dropped 1 malformed finding' },
      subjects: [],
      findingsCount: 2,
    });

    assert.equal(result.status, 'complete');
    assert.deepEqual(result.units[0].subjects, ['<unknown-diff>']);
    assert.equal(result.units[0].findingsCount, 2);
    assert.equal(validateCoverage(result), true, validationErrors());
  });
});
describe('review coverage schema', () => {
  const validCoverage = () => deriveReviewCoverage([unit('a')]);

  it('stays aligned with the runtime status vocabularies', () => {
    const schema = JSON.parse(
      readFileSync(new URL('../schemas/review-coverage.schema.json', import.meta.url), 'utf8')
    );

    assert.deepEqual(schema.properties.status.enum, [...REVIEW_COVERAGE_STATUSES]);
    assert.deepEqual(schema.$defs.reviewUnit.properties.status.enum, [...REVIEW_UNIT_STATUSES]);
  });

  it('rejects an unknown unit status', () => {
    const coverage = validCoverage();
    coverage.units[0].status = 'cancelled';
    assert.equal(validateCoverage(coverage), false);
  });

  it('rejects an unknown top-level field', () => {
    const coverage = validCoverage();
    coverage.runtime = 'claude-code';
    assert.equal(validateCoverage(coverage), false);
  });

  it('rejects negative coverage counters', () => {
    const coverage = validCoverage();
    coverage.completedUnits = -1;
    assert.equal(validateCoverage(coverage), false);
  });

  it('rejects an empty subject list', () => {
    const coverage = validCoverage();
    coverage.units[0].subjects = [];
    assert.equal(validateCoverage(coverage), false);
  });

  it('rejects a completed unit carrying an error reason', () => {
    const coverage = validCoverage();
    coverage.units[0].reasonCode = 'reviewer_error';
    assert.equal(validateCoverage(coverage), false);
  });

  it('rejects a timed-out unit without the timeout reason', () => {
    const coverage = validCoverage();
    coverage.units[0].status = 'timed_out';
    coverage.units[0].reasonCode = 'reviewer_error';
    assert.equal(validateCoverage(coverage), false);
  });
});
