import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildReviewConcernCoverageObservation } from '../src/lib/review-concern-coverage.mjs';

function map(ids, analysis = { status: 'completed', limitations: [] }) {
  return {
    schemaVersion: '1',
    kind: 'review-concern-map',
    concerns: ids.map((id) => ({
      id,
      summary: id,
      changedSubjects: [`src/${id}.ts`],
      affectedSubjects: [],
      evidenceRefs: [{ path: `src/${id}.ts`, lineStart: 1 }],
      interactionRefs: [],
    })),
    analysis,
  };
}

function unit({
  id,
  concernRefs,
  reviewerRole = 'bug-hunter',
  required = true,
  status = 'completed',
  findingsCount = 0,
}) {
  return {
    id,
    kind: 'diff-chunk',
    subjects: ['src/app.ts'],
    concernRefs,
    reviewerRole,
    required,
    status,
    reasonCode:
      status === 'completed'
        ? null
        : status === 'timed_out'
          ? 'reviewer_timeout'
          : 'reviewer_error',
    findingsCount,
  };
}

function coverage(units, status = null) {
  const requiredUnits = units.filter((entry) => entry.required !== false);
  const completedUnits = units.filter((entry) => entry.status === 'completed');
  const completedRequiredUnits = requiredUnits.filter((entry) => entry.status === 'completed');
  const resolvedStatus =
    status ??
    (units.length === 0
      ? 'not_executed'
      : completedRequiredUnits.length === requiredUnits.length
        ? 'complete'
        : completedRequiredUnits.length === 0
          ? 'not_executed'
          : 'partial');

  return {
    schemaVersion: '1',
    status: resolvedStatus,
    expectedUnits: units.length,
    completedUnits: completedUnits.length,
    requiredUnits: requiredUnits.length,
    completedRequiredUnits: completedRequiredUnits.length,
    incompleteRequiredUnitIds: requiredUnits
      .filter((entry) => entry.status !== 'completed')
      .map((entry) => entry.id),
    units,
  };
}

describe('#2541 Concern Coverage projection', () => {
  it('returns null when no Concern Map exists', () => {
    assert.equal(
      buildReviewConcernCoverageObservation({
        reviewConcernMap: null,
        reviewCoverage: coverage([]),
      }),
      null
    );
  });

  it('keeps a failed Concern Map unavailable before interpreting coverage', () => {
    const observation = buildReviewConcernCoverageObservation({
      reviewConcernMap: map([], {
        status: 'failed',
        limitations: ['analyzer-failed:runtime-error'],
      }),
      reviewCoverage: null,
    });

    assert.equal(observation.status, 'unavailable');
    assert.equal(observation.source.reason, 'concern-map-failed');
    assert.equal(observation.source.reviewCoverageStatus, 'unknown');
    assert.deepEqual(observation.blindSpotConcernRefs, []);
    assert.equal(observation.applied, false);
  });

  it('fails closed when Concern Map status is missing or unknown', () => {
    const missingStatus = map(['concern-1'], {});
    const unknownStatus = map(['concern-1'], {
      status: 'mystery',
      limitations: [],
    });

    for (const reviewConcernMap of [missingStatus, unknownStatus]) {
      const observation = buildReviewConcernCoverageObservation({
        reviewConcernMap,
        reviewCoverage: coverage([]),
      });

      assert.equal(observation.status, 'unavailable');
      assert.equal(observation.source.reason, 'invalid-concern-map-status');
      assert.deepEqual(observation.blindSpotConcernRefs, []);
    }
  });

  it('does not treat missing Review Coverage as unmapped or covered', () => {
    const observation = buildReviewConcernCoverageObservation({
      reviewConcernMap: map(['concern-1']),
      reviewCoverage: null,
    });

    assert.equal(observation.status, 'unavailable');
    assert.equal(observation.source.reason, 'review-coverage-unavailable');
    assert.deepEqual(observation.concerns, []);
    assert.equal(observation.summary, null);
  });

  it('reuses normalizeCoverageStatus demotion for an inconsistent complete label', () => {
    const reviewCoverage = coverage(
      [
        unit({
          id: 'reviewer:bug-hunter/chunk:1',
          concernRefs: ['concern-1'],
          status: 'failed',
        }),
      ],
      'complete'
    );

    const observation = buildReviewConcernCoverageObservation({
      reviewConcernMap: map(['concern-1']),
      reviewCoverage,
    });

    assert.equal(observation.status, 'observed');
    assert.equal(observation.source.reviewCoverageStatus, 'not_executed');
    assert.equal(observation.concerns[0].executionCoverage, 'not_executed');
    assert.equal(observation.summary.incompleteMappedConcerns, 1);
  });

  it('keeps an unknown Review Coverage status unavailable', () => {
    const reviewCoverage = {
      ...coverage([]),
      status: 'mystery',
    };

    const observation = buildReviewConcernCoverageObservation({
      reviewConcernMap: map(['concern-1']),
      reviewCoverage,
    });

    assert.equal(observation.status, 'unavailable');
    assert.equal(observation.source.reason, 'review-coverage-invalid');
    assert.equal(observation.source.reviewCoverageStatus, 'unknown');
  });

  it('observes mapped execution and an unmapped blind-spot candidate', () => {
    const reviewCoverage = coverage([
      unit({
        id: 'reviewer:bug-hunter/chunk:1',
        concernRefs: ['concern-1'],
      }),
    ]);

    const observation = buildReviewConcernCoverageObservation({
      reviewConcernMap: map(['concern-1', 'concern-2']),
      reviewCoverage,
    });

    assert.equal(observation.status, 'observed');
    assert.deepEqual(observation.summary, {
      observedConcerns: 2,
      mappedConcerns: 1,
      unmappedConcerns: 1,
      incompleteMappedConcerns: 0,
    });
    assert.deepEqual(observation.blindSpotConcernRefs, ['concern-2']);
    assert.deepEqual(observation.concerns[0], {
      concernRef: 'concern-1',
      mappingStatus: 'mapped',
      mappedReviewUnitIds: ['reviewer:bug-hunter/chunk:1'],
      mappedReviewerRoles: ['bug-hunter'],
      executionCoverage: 'complete',
      requiredMappedUnits: 1,
      completedRequiredMappedUnits: 1,
      incompleteRequiredUnitIds: [],
      blindSpotCandidate: false,
    });
    assert.equal(observation.concerns[1].mappingStatus, 'unmapped');
    assert.equal(observation.concerns[1].executionCoverage, null);
    assert.equal(observation.concerns[1].blindSpotCandidate, true);
    assert.equal(observation.applied, false);
  });

  it('reuses required-unit semantics when projecting mapped coverage', () => {
    const reviewCoverage = coverage([
      unit({
        id: 'reviewer:bug-hunter/chunk:1',
        concernRefs: ['concern-1'],
        required: true,
        status: 'completed',
      }),
      unit({
        id: 'reviewer:test-gap/chunk:1',
        concernRefs: ['concern-1'],
        required: false,
        status: 'failed',
        reviewerRole: 'test-gap',
      }),
    ]);

    const observation = buildReviewConcernCoverageObservation({
      reviewConcernMap: map(['concern-1']),
      reviewCoverage,
    });

    assert.equal(observation.concerns[0].executionCoverage, 'complete');
    assert.equal(observation.concerns[0].requiredMappedUnits, 1);
    assert.equal(observation.concerns[0].completedRequiredMappedUnits, 1);
    assert.equal(observation.summary.incompleteMappedConcerns, 0);
  });

  it('projects partial required execution without mutating Review Coverage', () => {
    const reviewCoverage = coverage([
      unit({
        id: 'reviewer:bug-hunter/chunk:1',
        concernRefs: ['concern-1'],
        status: 'completed',
      }),
      unit({
        id: 'reviewer:security-scanner/chunk:1',
        concernRefs: ['concern-1'],
        reviewerRole: 'security-scanner',
        status: 'timed_out',
      }),
    ]);
    const original = structuredClone(reviewCoverage);

    const observation = buildReviewConcernCoverageObservation({
      reviewConcernMap: map(['concern-1']),
      reviewCoverage,
    });

    assert.equal(observation.concerns[0].executionCoverage, 'partial');
    assert.deepEqual(observation.concerns[0].incompleteRequiredUnitIds, [
      'reviewer:security-scanner/chunk:1',
    ]);
    assert.equal(observation.summary.incompleteMappedConcerns, 1);
    assert.deepEqual(reviewCoverage, original);
  });

  it('does not use findingsCount to decide mapped execution coverage', () => {
    const noFindings = coverage([
      unit({
        id: 'reviewer:bug-hunter/chunk:1',
        concernRefs: ['concern-1'],
        findingsCount: 0,
      }),
    ]);
    const manyFindings = coverage([
      unit({
        id: 'reviewer:bug-hunter/chunk:1',
        concernRefs: ['concern-1'],
        findingsCount: 8,
      }),
    ]);

    const first = buildReviewConcernCoverageObservation({
      reviewConcernMap: map(['concern-1']),
      reviewCoverage: noFindings,
    });
    const second = buildReviewConcernCoverageObservation({
      reviewConcernMap: map(['concern-1']),
      reviewCoverage: manyFindings,
    });

    assert.equal(first.concerns[0].executionCoverage, 'complete');
    assert.equal(second.concerns[0].executionCoverage, 'complete');
  });

  it('keeps partial Concern Map limitations while projecting observed concerns', () => {
    const observation = buildReviewConcernCoverageObservation({
      reviewConcernMap: map(['concern-1'], {
        status: 'partial',
        limitations: ['diff-input-truncated'],
      }),
      reviewCoverage: coverage([
        unit({
          id: 'reviewer:bug-hunter/chunk:1',
          concernRefs: ['concern-1'],
        }),
      ]),
    });

    assert.equal(observation.status, 'partial');
    assert.deepEqual(observation.source.limitations, ['diff-input-truncated']);
    assert.equal(observation.concerns[0].executionCoverage, 'complete');
  });

  it('fails closed on duplicate Concern ids', () => {
    const reviewConcernMap = map(['concern-1', 'concern-1']);
    const observation = buildReviewConcernCoverageObservation({
      reviewConcernMap,
      reviewCoverage: coverage([]),
    });

    assert.equal(observation.status, 'unavailable');
    assert.equal(observation.source.reason, 'invalid-concern-id');
  });
});
