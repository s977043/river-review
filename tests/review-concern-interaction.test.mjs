import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildReviewConcernInteractionObservation } from '../src/lib/review-concern-interaction.mjs';

function concern(id, interactionRefs = []) {
  return {
    id,
    summary: id,
    changedSubjects: [`src/${id}.ts`],
    affectedSubjects: [],
    evidenceRefs: [{ path: `src/${id}.ts`, lineStart: 1 }],
    interactionRefs,
  };
}

function map(concerns, analysis = { status: 'completed', limitations: [] }) {
  return {
    schemaVersion: '1',
    kind: 'review-concern-map',
    concerns,
    analysis,
  };
}

function coverage(concerns, status = 'observed') {
  return {
    schemaVersion: '1',
    kind: 'review-concern-coverage-observation',
    status,
    source: {
      concernMapStatus: status === 'partial' ? 'partial' : 'completed',
      reviewCoverageStatus: 'complete',
      limitations: status === 'partial' ? ['diff-input-truncated'] : [],
      reason: null,
    },
    concerns,
    summary: {
      observedConcerns: concerns.length,
      mappedConcerns: concerns.filter((entry) => entry.mappingStatus === 'mapped').length,
      unmappedConcerns: concerns.filter((entry) => entry.mappingStatus === 'unmapped').length,
      incompleteMappedConcerns: concerns.filter(
        (entry) => entry.mappingStatus === 'mapped' && entry.executionCoverage !== 'complete'
      ).length,
    },
    blindSpotConcernRefs: concerns
      .filter((entry) => entry.blindSpotCandidate)
      .map((entry) => entry.concernRef),
    applied: false,
  };
}

function coveredConcern(
  concernRef,
  { mappingStatus = 'mapped', executionCoverage = 'complete', blindSpotCandidate = false } = {}
) {
  return {
    concernRef,
    mappingStatus,
    mappedReviewUnitIds: mappingStatus === 'mapped' ? [`reviewer:bug-hunter/${concernRef}`] : [],
    mappedReviewerRoles: mappingStatus === 'mapped' ? ['bug-hunter'] : [],
    executionCoverage,
    requiredMappedUnits: mappingStatus === 'mapped' ? 1 : 0,
    completedRequiredMappedUnits:
      mappingStatus === 'mapped' && executionCoverage === 'complete' ? 1 : 0,
    incompleteRequiredUnitIds: [],
    blindSpotCandidate,
  };
}

describe('#2568 cross-concern interaction planner', () => {
  it('returns null when no Concern Map exists', () => {
    assert.equal(
      buildReviewConcernInteractionObservation({
        reviewConcernMap: null,
        reviewConcernCoverage: null,
      }),
      null
    );
  });

  it('keeps a failed Concern Map unavailable', () => {
    const observation = buildReviewConcernInteractionObservation({
      reviewConcernMap: map([], {
        status: 'failed',
        limitations: ['analyzer-failed:runtime-error'],
      }),
      reviewConcernCoverage: null,
    });

    assert.equal(observation.status, 'unavailable');
    assert.equal(observation.source.reason, 'concern-map-failed');
    assert.deepEqual(observation.interactions, []);
    assert.equal(observation.summary, null);
    assert.equal(observation.applied, false);
  });

  it('fails closed on missing or unknown Concern Map status', () => {
    for (const analysis of [{}, { status: 'mystery', limitations: [] }]) {
      const observation = buildReviewConcernInteractionObservation({
        reviewConcernMap: map([concern('a')], analysis),
        reviewConcernCoverage: null,
      });

      assert.equal(observation.status, 'unavailable');
      assert.equal(observation.source.reason, 'invalid-concern-map-status');
    }
  });

  it('deduplicates reciprocal edges and emits deterministic canonical pairs', () => {
    const observation = buildReviewConcernInteractionObservation({
      reviewConcernMap: map([
        concern('zeta', ['alpha', 'beta']),
        concern('alpha', ['zeta']),
        concern('beta', ['zeta']),
      ]),
      reviewConcernCoverage: null,
    });

    assert.equal(observation.status, 'observed');
    assert.deepEqual(
      observation.interactions.map((entry) => ({
        interactionRef: entry.interactionRef,
        concernRefs: entry.concernRefs,
      })),
      [
        {
          interactionRef: 'interaction-1',
          concernRefs: ['alpha', 'zeta'],
        },
        {
          interactionRef: 'interaction-2',
          concernRefs: ['beta', 'zeta'],
        },
      ]
    );
    assert.equal(observation.summary.observedInteractions, 2);
    assert.equal(observation.applied, false);
  });

  it('fails closed on self interactions', () => {
    const observation = buildReviewConcernInteractionObservation({
      reviewConcernMap: map([concern('a', ['a'])]),
      reviewConcernCoverage: null,
    });

    assert.equal(observation.status, 'unavailable');
    assert.equal(observation.source.reason, 'self-interaction-ref');
  });

  it('fails closed when an interaction target does not exist', () => {
    const observation = buildReviewConcernInteractionObservation({
      reviewConcernMap: map([concern('a', ['missing'])]),
      reviewConcernCoverage: null,
    });

    assert.equal(observation.status, 'unavailable');
    assert.equal(observation.source.reason, 'missing-interaction-target');
  });

  it('fails closed on malformed interactionRefs', () => {
    const reviewConcernMap = map([
      {
        ...concern('a'),
        interactionRefs: 'b',
      },
    ]);

    const observation = buildReviewConcernInteractionObservation({
      reviewConcernMap,
      reviewConcernCoverage: null,
    });

    assert.equal(observation.status, 'unavailable');
    assert.equal(observation.source.reason, 'invalid-interaction-refs');
  });

  it('fails closed on duplicate Concern ids and invalid interaction refs', () => {
    const duplicate = buildReviewConcernInteractionObservation({
      reviewConcernMap: map([concern('a'), concern('a')]),
      reviewConcernCoverage: null,
    });
    assert.equal(duplicate.status, 'unavailable');
    assert.equal(duplicate.source.reason, 'invalid-concern-id');

    const invalidRef = buildReviewConcernInteractionObservation({
      reviewConcernMap: map([concern('a', ['   '])]),
      reviewConcernCoverage: null,
    });
    assert.equal(invalidRef.status, 'unavailable');
    assert.equal(invalidRef.source.reason, 'invalid-interaction-ref');
  });

  it('keeps interaction visible but marks malformed coverage context unavailable', () => {
    const reviewConcernCoverage = coverage([
      {
        ...coveredConcern('a'),
        mappingStatus: 'mystery',
      },
      coveredConcern('b'),
    ]);

    const observation = buildReviewConcernInteractionObservation({
      reviewConcernMap: map([concern('a', ['b']), concern('b')]),
      reviewConcernCoverage,
    });

    assert.equal(observation.status, 'observed');
    assert.equal(observation.interactions[0].integrationCheckCandidate, true);
    assert.equal(observation.interactions[0].coverage.status, 'unavailable');
  });

  it('keeps explicit interactions visible when coverage is missing', () => {
    const observation = buildReviewConcernInteractionObservation({
      reviewConcernMap: map([concern('a', ['b']), concern('b')]),
      reviewConcernCoverage: null,
    });

    assert.equal(observation.status, 'observed');
    assert.equal(observation.interactions.length, 1);
    assert.equal(observation.interactions[0].integrationCheckCandidate, true);
    assert.equal(observation.interactions[0].coverage.status, 'unavailable');
    assert.deepEqual(observation.interactions[0].coverage.concerns, [
      {
        concernRef: 'a',
        mappingStatus: null,
        executionCoverage: null,
        blindSpotCandidate: null,
      },
      {
        concernRef: 'b',
        mappingStatus: null,
        executionCoverage: null,
        blindSpotCandidate: null,
      },
    ]);
    assert.deepEqual(observation.summary, {
      observedInteractions: 1,
      withAvailableCoverageContext: 0,
      withPartialCoverageContext: 0,
      withUnavailableCoverageContext: 1,
    });
  });

  it('joins Phase 4 endpoint coverage without changing interaction eligibility', () => {
    const observation = buildReviewConcernInteractionObservation({
      reviewConcernMap: map([concern('a', ['b']), concern('b')]),
      reviewConcernCoverage: coverage([
        coveredConcern('a'),
        coveredConcern('b', {
          mappingStatus: 'unmapped',
          executionCoverage: null,
          blindSpotCandidate: true,
        }),
      ]),
    });

    assert.equal(observation.interactions[0].integrationCheckCandidate, true);
    assert.equal(observation.interactions[0].coverage.status, 'available');
    assert.deepEqual(observation.interactions[0].coverage.concerns, [
      {
        concernRef: 'a',
        mappingStatus: 'mapped',
        executionCoverage: 'complete',
        blindSpotCandidate: false,
      },
      {
        concernRef: 'b',
        mappingStatus: 'unmapped',
        executionCoverage: null,
        blindSpotCandidate: true,
      },
    ]);
    assert.equal(observation.summary.withAvailableCoverageContext, 1);
  });

  it('preserves partial-map limitations and partial coverage context', () => {
    const observation = buildReviewConcernInteractionObservation({
      reviewConcernMap: map([concern('a', ['b']), concern('b')], {
        status: 'partial',
        limitations: ['diff-input-truncated'],
      }),
      reviewConcernCoverage: coverage([coveredConcern('a'), coveredConcern('b')], 'partial'),
    });

    assert.equal(observation.status, 'partial');
    assert.deepEqual(observation.source.limitations, ['diff-input-truncated']);
    assert.equal(observation.interactions[0].coverage.status, 'partial');
    assert.equal(observation.summary.withPartialCoverageContext, 1);
  });

  it('treats malformed or mismatched coverage as unavailable context only', () => {
    const observation = buildReviewConcernInteractionObservation({
      reviewConcernMap: map([concern('a', ['b']), concern('b')]),
      reviewConcernCoverage: coverage([coveredConcern('a')]),
    });

    assert.equal(observation.status, 'observed');
    assert.equal(observation.interactions[0].coverage.status, 'unavailable');
    assert.equal(observation.interactions[0].integrationCheckCandidate, true);
  });

  it('does not mutate the Concern Map or Concern Coverage input', () => {
    const reviewConcernMap = map([concern('a', ['b']), concern('b', ['a'])]);
    const reviewConcernCoverage = coverage([coveredConcern('a'), coveredConcern('b')]);
    const mapBefore = structuredClone(reviewConcernMap);
    const coverageBefore = structuredClone(reviewConcernCoverage);

    buildReviewConcernInteractionObservation({
      reviewConcernMap,
      reviewConcernCoverage,
    });

    assert.deepEqual(reviewConcernMap, mapBefore);
    assert.deepEqual(reviewConcernCoverage, coverageBefore);
  });
});
