import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { selectReviewConcernIntegrationPreflight } from '../src/lib/review-concern-integration-preflight.mjs';

const validInteraction = (id, left, right) => ({
  interactionRef: id,
  concernRefs: [left, right],
  integrationCheckCandidate: true,
  coverage: { status: 'unavailable', concerns: [] },
});

const input = (interactions, status = 'observed', limitations = []) => ({
  schemaVersion: '1',
  kind: 'review-concern-interaction-observation',
  status,
  source: {
    concernMapStatus: status === 'partial' ? 'partial' : 'completed',
    limitations,
  },
  interactions,
  applied: false,
});

const active = (interactionObservation, options = {}) => ({
  enabled: true,
  apiKeyAvailable: true,
  reviewContractResolved: true,
  redactionReady: true,
  criticAvailable: true,
  interactionObservation,
  ...options,
});

describe('Phase 5B opt-in preflight — #2585', () => {
  it('defaults off without evaluating the source or invoking a model', () => {
    const result = selectReviewConcernIntegrationPreflight();
    assert.equal(result.status, 'not-executed');
    assert.equal(result.reason, 'default-off');
    assert.equal(result.executed, false);
    assert.equal(result.applied, false);
    assert.deepEqual(result.selectedPairs, []);
  });

  it('accepts only explicit, run-scoped Phase 5A interaction pairs', () => {
    const result = selectReviewConcernIntegrationPreflight(
      active(input([
        validInteraction('interaction-1', 'concern-1', 'concern-2'),
      ]))
    );
    assert.equal(result.status, 'eligible-not-executed');
    assert.equal(result.selectedCount, 1);
    assert.deepEqual(result.selectedPairs[0], {
      interactionRef: 'interaction-1',
      concernRefs: ['concern-1', 'concern-2'],
    });
    assert.equal(result.executed, false);
    assert.equal(result.applied, false);
    assert.equal('finding' in result, false);
    assert.equal('gate' in result, false);
  });

  it('does not claim a clean verdict when the source lists zero interactions', () => {
    const result = selectReviewConcernIntegrationPreflight(active(input([])));
    assert.equal(result.status, 'eligible-not-executed');
    assert.equal(result.reason, 'no-explicit-interactions');
    assert.equal(result.executed, false);
    assert.deepEqual(result.selectedPairs, []);
  });

  it('fails closed for missing, failed or changed source authority', () => {
    for (const source of [
      null,
      {},
      input([], 'unavailable'),
      { ...input([]), applied: true },
      { ...input([]), schemaVersion: '2' },
    ]) {
      const result = selectReviewConcernIntegrationPreflight(active(source));
      assert.equal(result.status, 'unavailable');
      assert.equal(result.applied, false);
      assert.equal(result.selectedCount, 0);
    }
  });

  it('rejects contradictory Phase 5A and Concern Map states', () => {
    for (const source of [
      { ...input([]), source: { concernMapStatus: 'failed', limitations: [] } },
      { ...input([], 'partial'), source: { concernMapStatus: 'completed', limitations: [] } },
    ]) {
      const result = selectReviewConcernIntegrationPreflight(active(source));
      assert.equal(result.status, 'unavailable');
      assert.equal(result.reason, 'inconsistent-concern-map-state');
    }
  });

  it('rejects malformed, self-referential and duplicate interaction pairs', () => {
    const cases = [
      [validInteraction('same', 'a', 'b'), validInteraction('same', 'c', 'd')],
      [validInteraction('one', 'a', 'b'), validInteraction('two', 'b', 'a')],
      [validInteraction('one', 'a', 'a')],
      [{ ...validInteraction('one', 'a', 'b'), integrationCheckCandidate: false }],
      [{ ...validInteraction('one', 'a', 'b'), concernRefs: ['a'] }],
    ];
    for (const pairs of cases) {
      const result = selectReviewConcernIntegrationPreflight(active(input(pairs)));
      assert.equal(result.status, 'unavailable');
      assert.equal(result.selectedCount, 0);
    }
  });

  it('marks all non-authorized execution situations not-executed', () => {
    const obs = input([validInteraction('interaction-1', 'a', 'b')]);
    const cases = [
      [{ dryRun: true }, 'dry-run'],
      [{ offline: true }, 'offline'],
      [{ provider: 'custom' }, 'unsupported-provider'],
      [{ apiKeyAvailable: false }, 'missing-provider-authorization'],
      [{ reviewContractResolved: false }, 'review-contract-unresolved'],
      [{ redactionReady: false }, 'redaction-unavailable'],
      [{ criticAvailable: false }, 'critic-validation-unavailable'],
    ];
    for (const [override, reason] of cases) {
      const result = selectReviewConcernIntegrationPreflight(active(obs, override));
      assert.equal(result.status, 'not-executed');
      assert.equal(result.reason, reason);
      assert.equal(result.executed, false);
      assert.deepEqual(result.selectedPairs, []);
    }
  });

  it('caps selected pairs, records omitted pair ids, and preserves source order', () => {
    const result = selectReviewConcernIntegrationPreflight(
      active(input([
        validInteraction('interaction-9', 'a', 'b'),
        validInteraction('interaction-2', 'c', 'd'),
        validInteraction('interaction-1', 'e', 'f'),
      ]), { maxPairs: 2 })
    );
    assert.deepEqual(result.selectedPairs.map((pair) => pair.interactionRef), [
      'interaction-9', 'interaction-2',
    ]);
    assert.deepEqual(result.skippedPairs, [{
      interactionRef: 'interaction-1',
      reason: 'pair-budget',
    }]);
    assert.equal(result.skippedCount, 1);
    assert.equal(result.executed, false);
  });

  it('rejects invalid or unbounded pair budgets', () => {
    const obs = input([validInteraction('interaction-1', 'a', 'b')]);
    for (const maxPairs of [0, -1, 1.5, Infinity, NaN, 21, '10']) {
      const result = selectReviewConcernIntegrationPreflight(active(obs, { maxPairs }));
      assert.equal(result.status, 'unavailable');
      assert.equal(result.reason, 'invalid-pair-budget');
    }
  });

  it('preserves partial input limitations without mistaking them for validation', () => {
    const result = selectReviewConcernIntegrationPreflight(
      active(input([validInteraction('interaction-1', 'a', 'b')],
        'partial', ['diff-input-truncated']))
    );
    assert.equal(result.status, 'eligible-not-executed');
    assert.equal(result.sourceStatus, 'partial');
    assert.deepEqual(result.sourceLimitations, ['diff-input-truncated']);
    assert.equal(result.executed, false);
  });

  it('does not mutate the original Phase 5A observation', () => {
    const source = input([validInteraction('interaction-1', 'a', 'b')]);
    const before = structuredClone(source);
    selectReviewConcernIntegrationPreflight(active(source));
    assert.deepEqual(source, before);
  });
});
