/**
 * #2585 Stage A: synthetic, structural Phase 5B fixture scenarios.
 *
 * These are NOT human-labeled correctness examples, do not invoke a provider,
 * and do not measure recall, false positives, precision, or Critic quality.
 * They pin only the boundary between explicit Phase 5A interaction evidence
 * and the non-executing Phase 5B preflight.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { selectReviewConcernIntegrationPreflight } from '../src/lib/review-concern-integration-preflight.mjs';

const pair = (ref, left, right, coverageStatus = 'unavailable') => ({
  interactionRef: ref,
  concernRefs: [left, right],
  integrationCheckCandidate: true,
  coverage: { status: coverageStatus, concerns: [] },
});

function source(interactions, status = 'observed', limitations = []) {
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

// The readiness booleans simulate a pure-function input. They are NOT actual
// credentials, authorization, provider availability, or a runtime permission.
const simulatedReady = {
  enabled: true,
  apiKeyAvailable: true,
  reviewContractResolved: true,
  redactionReady: true,
  criticAvailable: true,
};

const scenarios = [
  {
    id: 'cross-file-contract',
    description: 'producer API signature and client call site changed separately',
    observation: source([pair('interaction-1', 'api-contract', 'client-call')]),
    expectedStatus: 'eligible-not-executed',
    expectedCount: 1,
  },
  {
    id: 'auth-api',
    description: 'authorization policy and API handler interact',
    observation: source([pair('interaction-1', 'authorization', 'api-handler')]),
    expectedStatus: 'eligible-not-executed',
    expectedCount: 1,
  },
  {
    id: 'migration-app',
    description: 'schema migration and application reader interact',
    observation: source([pair('interaction-1', 'schema-migration', 'app-reader')]),
    expectedStatus: 'eligible-not-executed',
    expectedCount: 1,
  },
  {
    id: 'unrelated',
    description: 'without an explicit interaction, no semantic relationship is invented',
    observation: source([]),
    expectedStatus: 'eligible-not-executed',
    expectedCount: 0,
    expectedReason: 'no-explicit-interactions',
  },
  {
    id: 'reciprocal-duplicate',
    description: 'malformed Phase 5A input that repeats one undirected interaction',
    observation: source([
      pair('interaction-1', 'auth', 'handler'),
      pair('interaction-2', 'handler', 'auth'),
    ]),
    expectedStatus: 'unavailable',
    expectedCount: 0,
    expectedReason: 'duplicate-interaction-pair',
  },
  {
    id: 'unknown-evidence',
    description: 'missing coverage is context only and not proof of a clean review',
    observation: source([pair('interaction-1', 'producer', 'consumer', 'unavailable')]),
    expectedStatus: 'eligible-not-executed',
    expectedCount: 1,
  },
  {
    id: 'partial-map',
    description: 'limited semantic map retains its limitation, not a pass verdict',
    observation: source(
      [pair('interaction-1', 'producer', 'consumer', 'partial')],
      'partial',
      ['diff-input-truncated']
    ),
    expectedStatus: 'eligible-not-executed',
    expectedCount: 1,
    expectedLimitations: ['diff-input-truncated'],
  },
  {
    id: 'failed-map',
    description: 'failed map may not be presented as an eligible integration review',
    observation: {
      ...source([]),
      status: 'unavailable',
      source: { concernMapStatus: 'failed', limitations: ['analyzer-failed'] },
    },
    expectedStatus: 'unavailable',
    expectedCount: 0,
    expectedReason: 'interaction-observation-not-usable',
  },
];

describe('#2585 Phase 5B synthetic offline scenario fixtures', () => {
  it('has unique scenario IDs and explicit simulation-only scope', () => {
    assert.equal(new Set(scenarios.map((entry) => entry.id)).size, scenarios.length);
    assert.equal(scenarios.length, 8);
    assert.equal('providerKey' in simulatedReady, false);
  });

  for (const scenario of scenarios) {
    it(`${scenario.id}: ${scenario.description}`, () => {
      const before = structuredClone(scenario.observation);
      const result = selectReviewConcernIntegrationPreflight({
        ...simulatedReady,
        interactionObservation: scenario.observation,
      });

      assert.equal(result.status, scenario.expectedStatus);
      assert.equal(result.selectedCount, scenario.expectedCount);
      if (scenario.expectedReason) {
        assert.equal(result.reason, scenario.expectedReason);
      }
      if (scenario.expectedLimitations) {
        assert.deepEqual(result.sourceLimitations, scenario.expectedLimitations);
      }
      assert.equal(result.executed, false);
      assert.equal(result.applied, false);
      assert.equal('findings' in result, false);
      assert.equal('decision' in result, false);
      assert.equal('gate' in result, false);
      assert.deepEqual(scenario.observation, before);
    });
  }

  it('default-off prevents even structurally eligible scenarios from selecting pairs', () => {
    for (const scenario of scenarios) {
      const result = selectReviewConcernIntegrationPreflight({
        interactionObservation: scenario.observation,
      });
      assert.equal(result.status, 'not-executed');
      assert.equal(result.reason, 'default-off');
      assert.equal(result.selectedCount, 0);
      assert.equal(result.executed, false);
    }
  });

  it('missing provider authorization always prevents pair selection', () => {
    for (const scenario of scenarios.filter((entry) => entry.expectedCount > 0)) {
      const result = selectReviewConcernIntegrationPreflight({
        ...simulatedReady,
        apiKeyAvailable: false,
        interactionObservation: scenario.observation,
      });
      assert.equal(result.status, 'not-executed');
      assert.equal(result.reason, 'missing-provider-authorization');
      assert.equal(result.selectedCount, 0);
    }
  });
});
