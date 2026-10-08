/**
 * #2585 synthetic Stage A fixtures: structural preflight only.
 * No human golden labels, model calls, or quality/recall claims.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { selectReviewConcernIntegrationPreflight } from '../src/lib/review-concern-integration-preflight.mjs';

function pair(ref, left, right) {
  return {
    interactionRef: ref,
    concernRefs: [left, right],
    integrationCheckCandidate: true,
    coverage: { status: 'unavailable', concerns: [] },
  };
}

function observed(interactions, status = 'observed', limitations = []) {
  return {
    kind: 'review-concern-interaction-observation',
    schemaVersion: '1',
    status,
    source: {
      concernMapStatus: status === 'partial' ? 'partial' : 'completed',
      limitations,
    },
    interactions,
    applied: false,
  };
}

function preflight(interactionObservation) {
  // Synthetic readiness booleans, not real authorization or credentials.
  return selectReviewConcernIntegrationPreflight({
    enabled: true,
    apiKeyAvailable: true,
    reviewContractResolved: true,
    redactionReady: true,
    criticAvailable: true,
    interactionObservation,
  });
}

function assertObservationOnly(result) {
  assert.equal(result.executed, false);
  assert.equal(result.applied, false);
  assert.equal('findings' in result, false);
  assert.equal('decision' in result, false);
  assert.equal('gate' in result, false);
}

describe('#2585 synthetic Phase 5B offline fixtures', () => {
  const examples = [
    ['cross-file API contract', 'api-contract', 'client-call'],
    ['authorization and API behavior', 'authorization', 'api-handler'],
    ['migration and application', 'schema-migration', 'app-reader'],
  ];

  for (const [name, left, right] of examples) {
    it(name, () => {
      const source = observed([pair('interaction-1', left, right)]);
      const before = structuredClone(source);
      const result = preflight(source);
      assert.equal(result.status, 'eligible-not-executed');
      assert.equal(result.selectedCount, 1);
      assertObservationOnly(result);
      assert.deepEqual(source, before);
    });
  }

  it('unrelated Concerns do not invent an interaction', () => {
    const result = preflight(observed([]));
    assert.equal(result.status, 'eligible-not-executed');
    assert.equal(result.reason, 'no-explicit-interactions');
    assert.equal(result.selectedCount, 0);
    assertObservationOnly(result);
  });

  it('reciprocal duplicate edges fail closed', () => {
    const source = observed([pair('interaction-1', 'a', 'b'), pair('interaction-2', 'b', 'a')]);
    const result = preflight(source);
    assert.equal(result.status, 'unavailable');
    assert.equal(result.reason, 'duplicate-interaction-pair');
    assertObservationOnly(result);
  });

  it('unknown coverage is never a verified finding or clean Gate result', () => {
    const result = preflight(observed([pair('interaction-1', 'producer', 'consumer')]));
    assert.equal(result.status, 'eligible-not-executed');
    assertObservationOnly(result);
  });

  it('partial Concern Map limitations survive unchanged', () => {
    const source = observed([pair('interaction-1', 'producer', 'consumer')], 'partial');
    source.source.limitations = ['diff-input-truncated'];
    const result = preflight(source);
    assert.equal(result.status, 'eligible-not-executed');
    assert.deepEqual(result.sourceLimitations, ['diff-input-truncated']);
    assertObservationOnly(result);
  });

  it('failed Concern Map is unavailable, not all clear', () => {
    const source = observed([], 'unavailable');
    source.source.concernMapStatus = 'failed';
    const result = preflight(source);
    assert.equal(result.status, 'unavailable');
    assert.equal(result.selectedCount, 0);
    assertObservationOnly(result);
  });

  it('default-off and missing authorization never select interactions', () => {
    const source = observed([pair('interaction-1', 'a', 'b')]);
    const off = selectReviewConcernIntegrationPreflight({ interactionObservation: source });
    const unauthorized = selectReviewConcernIntegrationPreflight({
      enabled: true,
      interactionObservation: source,
    });
    assert.equal(off.status, 'not-executed');
    assert.equal(unauthorized.status, 'not-executed');
    assert.equal(off.selectedCount, 0);
    assert.equal(unauthorized.selectedCount, 0);
    assertObservationOnly(off);
    assertObservationOnly(unauthorized);
  });
});
