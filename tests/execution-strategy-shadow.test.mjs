import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildExecutionStrategyShadowObservation } from '../src/lib/execution-strategy-shadow.mjs';

function concerns(count, status = 'completed') {
  return {
    kind: 'review-concern-map',
    schemaVersion: '1',
    analysis: { status },
    concerns: Array.from({ length: count }, (_, i) => ({
      id: `concern-${i + 1}`,
      changedSubjects: ['src/sensitive.ts'],
    })),
  };
}

describe('#2564 Phase 3 shadow execution strategy', () => {
  it('stays no-recommendation with no observed evidence', () => {
    const result = buildExecutionStrategyShadowObservation();
    assert.equal(result.status, 'no-recommendation');
    assert.equal(result.recommendedStrategy, null);
    assert.equal(result.actualStrategy, null);
    assert.equal(result.comparison, null);
    assert.equal(result.recommendationApplied, false);
    assert.equal(result.signals.changedFileCount, null);
    assert.equal(result.signals.maxCostUsd, null);
    assert.ok(result.limitations.includes('actual-host-strategy-unobserved'));
  });

  it('proposes single only as non-authoritative advice for a small observed diff', () => {
    const result = buildExecutionStrategyShadowObservation({
      changedFiles: ['src/secret/customer.ts'],
      tokenEstimate: 300,
      riskAssessment: { aggregateAction: 'comment_only' },
    });
    assert.equal(result.recommendedStrategy, 'single');
    assert.equal(result.status, 'provisional');
    assert.equal(result.recommendationApplied, false);
    assert.equal(result.comparison, null);
    assert.equal(JSON.stringify(result).includes('src/secret/customer.ts'), false);
    assert.equal(result.signals.riskAction, 'comment_only');
    assert.equal(result.signals.maxCostUsd, null);
  });

  it('never turns a require-human-review boundary into a critique recommendation', () => {
    const result = buildExecutionStrategyShadowObservation({
      changedFiles: Array.from({ length: 10 }, (_, i) => `src/file-${i}.js`),
      riskAssessment: { aggregateAction: 'require_human_review' },
      reviewSignals: { independentReviewRequired: true },
    });
    assert.equal(result.recommendedStrategy, null);
    assert.equal(result.humanReviewRequired, true);
    assert.deepEqual(result.reasons, ['human-risk-boundary']);
  });

  it('does not label a small diff safe when risk evidence is absent', () => {
    const observation = buildExecutionStrategyShadowObservation({
      changedFiles: ['src/important.js'],
    });
    assert.equal(observation.recommendedStrategy, null);
    assert.ok(observation.limitations.includes('risk-not-classified'));

    const invalidStatus = buildExecutionStrategyShadowObservation({
      changedFiles: ['src/important.js'],
      reviewConcernMap: {
        kind: 'review-concern-map',
        schemaVersion: '1',
        analysis: { status: 'arbitrary-untrusted-status' },
        concerns: [],
      },
    });
    assert.equal(invalidStatus.signals.concernStatus, null);
  });

  it('does not recommend single if a supplied Concern Map failed or is malformed', () => {
    for (const reviewConcernMap of [
      concerns(0, 'failed'),
      {
        kind: 'review-concern-map',
        schemaVersion: '1',
        analysis: { status: 'unknown' },
        concerns: [],
      },
      {
        kind: 'review-concern-map',
        schemaVersion: '2',
        analysis: { status: 'completed' },
        concerns: [],
      },
    ]) {
      const observation = buildExecutionStrategyShadowObservation({
        changedFiles: ['src/app.js'],
        riskAssessment: { aggregateAction: 'comment_only' },
        reviewConcernMap,
      });
      assert.equal(observation.recommendedStrategy, null);
      assert.equal(observation.status, 'no-recommendation');
      assert.ok(observation.limitations.includes('concern-map-unavailable'));
      assert.equal(observation.recommendationApplied, false);
    }
  });

  it('proposes critique for explicit independence need or escalated risk', () => {
    const independence = buildExecutionStrategyShadowObservation({
      changedFiles: ['src/a.js'],
      reviewSignals: { independentReviewRequired: true },
    });
    assert.equal(independence.recommendedStrategy, 'critique');

    const escalated = buildExecutionStrategyShadowObservation({
      changedFiles: ['src/a.js'],
      riskAssessment: { aggregateAction: 'escalate' },
    });
    assert.equal(escalated.recommendedStrategy, 'critique');
  });

  it('proposes cascade for complexity or uncertainty without executing it', () => {
    const complexity = buildExecutionStrategyShadowObservation({
      changedFiles: ['a', 'b', 'c', 'd', 'e'],
    });
    assert.equal(complexity.recommendedStrategy, 'cascade');
    const uncertainty = buildExecutionStrategyShadowObservation({
      changedFiles: ['src/app.js'],
      reviewConcernMap: concerns(1, 'partial'),
    });
    assert.equal(uncertainty.recommendedStrategy, 'cascade');
    assert.equal(uncertainty.recommendationApplied, false);
  });

  it('uses completed concern count but refuses failed maps as negative evidence', () => {
    const multiple = buildExecutionStrategyShadowObservation({
      changedFiles: ['src/app.js'],
      reviewConcernMap: concerns(3),
    });
    assert.equal(multiple.recommendedStrategy, 'critique');
    assert.equal(multiple.signals.concernCount, 3);

    const failed = buildExecutionStrategyShadowObservation({
      changedFiles: ['src/app.js'],
      reviewConcernMap: concerns(0, 'failed'),
    });
    assert.equal(failed.signals.concernCount, null);
    assert.equal(failed.signals.concernStatus, 'failed');
  });

  it('records actual vs recommended only when Host actually supplies a valid strategy', () => {
    const matching = buildExecutionStrategyShadowObservation({
      changedFiles: ['src/app.js'],
      riskAssessment: { aggregateAction: 'comment_only' },
      actualStrategy: 'single',
      actualStrategySource: 'host-execution-log',
      hostBudget: { maxCostUsd: 0, maxLatencyMs: 4500 },
    });
    assert.equal(matching.actualStrategy, 'single');
    assert.deepEqual(matching.comparison, { matches: true, evidenceStatus: 'exploratory' });
    assert.deepEqual(matching.actualStrategyEvidence, {
      source: 'host-execution-log',
      trust: 'unverified',
    });
    assert.equal(matching.signals.maxCostUsd, 0);
    assert.equal(matching.signals.maxLatencyMs, 4500);
    assert.equal(matching.recommendationApplied, false);

    const unknown = buildExecutionStrategyShadowObservation({
      changedFiles: ['src/app.js'],
      actualStrategy: 'auto',
      actualStrategySource: 'host-execution-log',
      hostBudget: { maxCostUsd: -1, maxLatencyMs: Number.NaN },
    });
    assert.equal(unknown.actualStrategy, null);
    assert.equal(unknown.comparison, null);
    assert.equal(unknown.signals.maxCostUsd, null);
    assert.equal(unknown.signals.maxLatencyMs, null);

    const withoutProvenance = buildExecutionStrategyShadowObservation({
      changedFiles: ['src/app.js'],
      actualStrategy: 'single',
    });
    assert.equal(withoutProvenance.actualStrategy, null);
    assert.equal(withoutProvenance.comparison, null);
  });
});
