import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeDashboard, formatDashboard } from '../src/lib/result-store.mjs';

function makeCoverage({
  status,
  requiredUnits,
  completedRequiredUnits,
  units = [],
} = {}) {
  return {
    schemaVersion: '1',
    status,
    expectedUnits: units.length,
    completedUnits: units.filter((unit) => unit.status === 'completed').length,
    requiredUnits,
    completedRequiredUnits,
    incompleteRequiredUnitIds: units
      .filter((unit) => unit.required && unit.status !== 'completed')
      .map((unit) => unit.id),
    units,
  };
}

function unit(id, status, { required = true } = {}) {
  return {
    id,
    kind: 'diff-chunk',
    subjects: [`src/${id}.mjs`],
    reviewerRole: 'bug-hunter',
    required,
    status,
    reasonCode:
      status === 'completed'
        ? null
        : status === 'timed_out'
          ? 'reviewer_timeout'
          : 'reviewer_error',
    findingsCount: 0,
  };
}

function run({ findings = [], reviewCoverage } = {}) {
  return {
    findings,
    suppressedFindings: [],
    ...(reviewCoverage ? { reviewCoverage } : {}),
  };
}

describe('Review Coverage dogfood dashboard (#2212)', () => {
  it('does not interpret coverage absence as incomplete', () => {
    const complete = makeCoverage({
      status: 'complete',
      requiredUnits: 1,
      completedRequiredUnits: 1,
      units: [unit('complete-1', 'completed')],
    });

    const dashboard = computeDashboard([run(), run({ reviewCoverage: complete })]);

    assert.equal(dashboard.totalRuns, 2);
    assert.equal(dashboard.reviewCoverage.observedRuns, 1);
    assert.equal(dashboard.reviewCoverage.statusDistribution.complete, 1);
    assert.equal(dashboard.reviewCoverage.statusDistribution.partial ?? 0, 0);
    assert.equal(dashboard.reviewCoverage.partialReviewRate, 0);
  });

  it('aggregates completion, partial, failure, timeout, and zero-finding signals', () => {
    const complete = makeCoverage({
      status: 'complete',
      requiredUnits: 2,
      completedRequiredUnits: 2,
      units: [unit('complete-1', 'completed'), unit('complete-2', 'completed')],
    });
    const partial = makeCoverage({
      status: 'partial',
      requiredUnits: 2,
      completedRequiredUnits: 1,
      units: [unit('partial-1', 'completed'), unit('partial-2', 'timed_out')],
    });
    const notExecuted = makeCoverage({
      status: 'not_executed',
      requiredUnits: 1,
      completedRequiredUnits: 0,
      units: [unit('not-executed-1', 'failed')],
    });

    const dashboard = computeDashboard([
      run({ findings: [{ id: 'finding-1' }], reviewCoverage: complete }),
      run({ findings: [], reviewCoverage: partial }),
      run({ findings: [], reviewCoverage: notExecuted }),
    ]);
    const coverage = dashboard.reviewCoverage;

    assert.equal(coverage.observedRuns, 3);
    assert.deepEqual(coverage.statusDistribution, {
      complete: 1,
      partial: 1,
      not_executed: 1,
    });
    assert.equal(coverage.requiredUnits, 5);
    assert.equal(coverage.completedRequiredUnits, 3);
    assert.equal(coverage.requiredUnitCompletionRate, 3 / 5);
    assert.equal(coverage.requiredFailedUnits, 1);
    assert.equal(coverage.requiredTimedOutUnits, 1);
    assert.equal(coverage.requiredFailureOrTimeoutRate, 2 / 5);
    assert.equal(coverage.partialReviewRate, 1 / 3);
    assert.equal(coverage.zeroFindingsPartialRuns, 1);
  });

  it('keeps optional failures out of required failure metrics', () => {
    const coverage = makeCoverage({
      status: 'complete',
      requiredUnits: 1,
      completedRequiredUnits: 1,
      units: [unit('required', 'completed'), unit('optional', 'failed', { required: false })],
    });

    const dashboard = computeDashboard([run({ reviewCoverage: coverage })]);

    assert.equal(dashboard.reviewCoverage.requiredFailedUnits, 0);
    assert.equal(dashboard.reviewCoverage.requiredFailureOrTimeoutRate, 0);
  });

  it('uses null/N/A when no required units exist', () => {
    const coverage = makeCoverage({
      status: 'complete',
      requiredUnits: 0,
      completedRequiredUnits: 0,
      units: [unit('optional', 'completed', { required: false })],
    });

    const dashboard = computeDashboard([run({ reviewCoverage: coverage })]);
    const markdown = formatDashboard(dashboard);

    assert.equal(dashboard.reviewCoverage.requiredUnitCompletionRate, null);
    assert.equal(dashboard.reviewCoverage.requiredFailureOrTimeoutRate, null);
    assert.match(markdown, /Required unit completion rate \| N\/A/);
    assert.match(markdown, /Required failure\/timeout rate \| N\/A/);
  });

  it('renders Review Coverage only when observations exist', () => {
    const withoutCoverage = formatDashboard(computeDashboard([run()]));
    assert.doesNotMatch(withoutCoverage, /Review Coverage \(observe-only\)/);

    const coverage = makeCoverage({
      status: 'partial',
      requiredUnits: 1,
      completedRequiredUnits: 0,
      units: [unit('timed-out', 'timed_out')],
    });
    const withCoverage = formatDashboard(computeDashboard([run({ reviewCoverage: coverage })]));

    assert.match(withCoverage, /Review Coverage \(observe-only\)/);
    assert.match(withCoverage, /Observed runs \| 1/);
    assert.match(withCoverage, /Partial runs \| 1/);
    assert.match(withCoverage, /Zero findings \+ partial runs \| 1/);
  });
});
