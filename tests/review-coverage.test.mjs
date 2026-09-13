import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { deriveReviewCoverage } from '../src/lib/review-coverage.mjs';

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
  });

  it('reports partial when one required unit completed and another timed out', () => {
    const result = deriveReviewCoverage([
      unit('a'),
      unit('b', 'timed_out', true, { reasonCode: 'reviewer_timeout' }),
    ]);

    assert.equal(result.status, 'partial');
    assert.equal(result.completedRequiredUnits, 1);
    assert.deepEqual(result.incompleteRequiredUnitIds, ['b']);
  });

  it('reports not_executed when no required unit completed', () => {
    const result = deriveReviewCoverage([
      unit('a', 'failed'),
      unit('b', 'timed_out', true, { reasonCode: 'reviewer_timeout' }),
    ]);

    assert.equal(result.status, 'not_executed');
    assert.equal(result.completedUnits, 0);
    assert.equal(result.completedRequiredUnits, 0);
  });

  it('does not weaken required coverage when optional work fails', () => {
    const result = deriveReviewCoverage([unit('required-a'), unit('optional-b', 'failed', false)]);

    assert.equal(result.status, 'complete');
    assert.equal(result.requiredUnits, 1);
    assert.equal(result.completedRequiredUnits, 1);
    assert.equal(result.completedUnits, 1);
  });

  it('treats missing required metadata as required (fail-safe)', () => {
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
  });

  it('reports not_executed for an empty execution plan', () => {
    const result = deriveReviewCoverage([]);

    assert.equal(result.status, 'not_executed');
    assert.equal(result.expectedUnits, 0);
    assert.equal(result.requiredUnits, 0);
  });
});
