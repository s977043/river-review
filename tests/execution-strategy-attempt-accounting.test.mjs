import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildHostAttemptAccountingObservation,
} from '../src/lib/execution-strategy-attempt-accounting.mjs';

function completeHostEvidence() {
  return {
    hostExecution: {
      source: 'host-execution-log',
      actualStrategy: 'cascade',
      inventoryScope: 'complete',
      clockSource: 'host-run-clock',
      startedAtMs: 1000,
      endedAtMs: 1750,
    },
    legs: [{ legId: 'solver' }, { legId: 'escalation' }],
    expectedAttemptIds: ['a1', 'a2', 'a3'],
    attempts: [
      {
        attemptId: 'a1',
        legId: 'solver',
        estimatedCostUsd: 0.02,
        currency: 'USD',
        pricingSource: 'host-price-v1',
      },
      {
        attemptId: 'a2',
        legId: 'solver',
        estimatedCostUsd: 0.03,
        currency: 'USD',
        pricingSource: 'host-price-v1',
      },
      {
        attemptId: 'a3',
        legId: 'escalation',
        estimatedCostUsd: 0.04,
        currency: 'USD',
        pricingSource: 'host-price-v1',
      },
    ],
  };
}

describe('#2564 Phase 3 Host attempt accounting preflight', () => {
  it('fails closed when no Host witness exists', () => {
    const result = buildHostAttemptAccountingObservation();
    assert.equal(result.status, 'incomplete');
    assert.equal(result.actualStrategy, null);
    assert.equal(result.totalEstimatedCostUsd, null);
    assert.equal(result.wallClockMs, null);
    assert.equal(result.attemptCount, null);
    assert.equal(result.eligibleForAdoption, false);
    assert.equal(result.inventoryTrust, 'unverified');
  });

  it('accounts once per provider attempt, not once per logical leg', () => {
    const result = buildHostAttemptAccountingObservation(completeHostEvidence());
    assert.equal(result.status, 'host-declared-complete');
    assert.equal(result.actualStrategy, 'cascade');
    assert.equal(result.legCount, 2);
    assert.equal(result.attemptCount, 3);
    assert.ok(Math.abs(result.totalEstimatedCostUsd - 0.09) < 1e-10);
    assert.equal(result.wallClockMs, 750);
    assert.equal(result.inventoryTrust, 'unverified');
    assert.equal(result.costTrust, 'host-estimate-unverified');
    assert.equal(result.wallClockTrust, 'host-declared-unverified');
    assert.equal(result.eligibleForAdoption, false);
    assert.equal(result.recommendationApplied, false);
  });

  it('invalidates duplicates, missing and unplanned attempts without summing cost', () => {
    for (const mutate of [
      (data) => data.attempts.push({ ...data.attempts[0] }),
      (data) => data.attempts.pop(),
      (data) => (data.attempts[2].attemptId = 'unplanned'),
      (data) => (data.attempts[0].legId = 'missing-leg'),
      (data) => data.expectedAttemptIds.push('a2'),
      (data) => data.legs.push({ legId: 'solver' }),
    ]) {
      const data = completeHostEvidence();
      mutate(data);
      const result = buildHostAttemptAccountingObservation(data);
      assert.equal(result.status, 'incomplete');
      assert.equal(result.totalEstimatedCostUsd, null);
      assert.equal(result.eligibleForAdoption, false);
      assert.ok(result.reasons.includes('transport-attempt-inventory-mismatch'));
    }
  });

  it('does not turn missing prices, negative prices, or absent provenance into zero', () => {
    for (const mutate of [
      (data) => delete data.attempts[0].estimatedCostUsd,
      (data) => (data.attempts[0].estimatedCostUsd = -0.01),
      (data) => (data.attempts[0].estimatedCostUsd = Number.NaN),
      (data) => delete data.attempts[0].pricingSource,
      (data) => (data.attempts[0].currency = 'JPY'),
    ]) {
      const data = completeHostEvidence();
      mutate(data);
      const result = buildHostAttemptAccountingObservation(data);
      assert.equal(result.totalEstimatedCostUsd, null);
      assert.ok(result.reasons.includes('complete-priced-cost-unavailable'));
    }
  });

  it('keeps a genuine Host-declared zero distinct from missing usage', () => {
    const data = completeHostEvidence();
    data.attempts.forEach((attempt) => (attempt.estimatedCostUsd = 0));
    const result = buildHostAttemptAccountingObservation(data);
    assert.equal(result.totalEstimatedCostUsd, 0);
    assert.equal(result.costTrust, 'host-estimate-unverified');
    assert.equal(result.eligibleForAdoption, false);
  });

  it('rejects incomplete scope, invented strategy provenance and malformed wall clocks', () => {
    const incomplete = completeHostEvidence();
    incomplete.hostExecution.inventoryScope = 'partial';
    assert.equal(buildHostAttemptAccountingObservation(incomplete).totalEstimatedCostUsd, null);

    const invented = completeHostEvidence();
    invented.hostExecution.source = 'inferred-from-reviewer-count';
    const badSource = buildHostAttemptAccountingObservation(invented);
    assert.equal(badSource.actualStrategy, null);
    assert.equal(badSource.wallClockMs, null);
    assert.equal(badSource.eligibleForAdoption, false);

    const backwards = completeHostEvidence();
    backwards.hostExecution.endedAtMs = 900;
    const badTime = buildHostAttemptAccountingObservation(backwards);
    assert.equal(badTime.wallClockMs, null);
    assert.ok(badTime.reasons.includes('host-run-wall-clock-unavailable'));
  });

  it('does not leak Host attempt IDs or provider fields through result', () => {
    const data = completeHostEvidence();
    data.attempts[0].secretPrompt = 'private prompt';
    data.attempts[0].provider = 'private provider';
    const result = buildHostAttemptAccountingObservation(data);
    const serialized = JSON.stringify(result);
    assert.equal(serialized.includes('private prompt'), false);
    assert.equal(serialized.includes('private provider'), false);
    assert.equal(serialized.includes('a1'), false);
  });

  it('never claims completeness from an empty expected-attempt inventory', () => {
    const data = completeHostEvidence();
    data.expectedAttemptIds = [];
    data.attempts = [];
    const result = buildHostAttemptAccountingObservation(data);
    assert.equal(result.status, 'incomplete');
    assert.equal(result.totalEstimatedCostUsd, null);
    assert.equal(result.attemptCount, null);
  });
});
