import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import {
  ReviewConcernEvalError,
  buildPairedReviewConcernEvaluation,
  evaluateReviewConcernMap,
  normalizeReviewConcernFixture,
} from '../src/lib/review-concern-eval.mjs';

const manifest = JSON.parse(
  readFileSync('tests/fixtures/review-concern/phase2-eval-cases.json', 'utf8')
);

function fixture(overrides = {}) {
  return {
    schemaVersion: '1',
    id: 'RC-test',
    category: 'test',
    description: 'test fixture',
    oracle: {
      obligations: [
        { id: 'OB-a', description: 'obligation A' },
        { id: 'OB-b', description: 'obligation B' },
      ],
      knownInteractions: [{ from: 'OB-a', to: 'OB-b' }],
      acceptableGrouping: { minConcerns: 1, maxConcerns: 3 },
    },
    ...overrides,
  };
}

function concern(id, { interactions = [] } = {}) {
  return {
    id,
    summary: id,
    changedSubjects: ['src/app.ts'],
    affectedSubjects: [],
    evidenceRefs: [{ path: 'src/app.ts', lineStart: 1 }],
    interactionRefs: interactions,
  };
}

function map(concerns, analysis = { status: 'completed', limitations: [] }) {
  return {
    schemaVersion: '1',
    kind: 'review-concern-map',
    subject: {
      mergeBase: 'base',
      revisionRef: 'head',
      workingTreeDirty: false,
    },
    concerns,
    analysis,
  };
}

describe('#2507 Review Concern Phase 2 evaluation contract', () => {
  it('freezes the initial 15 human-labeled fixture categories from #2455', () => {
    assert.equal(manifest.schemaVersion, '1');
    assert.equal(manifest.evaluationId, 'rr-review-concern-phase2-v1');
    assert.deepEqual(manifest.freezePolicy, {
      fixtureSet: 'freeze-before-run',
      oracle: 'freeze-before-run',
      baselineRef: 'freeze-at-run-start',
      candidateRef: 'freeze-at-run-start',
    });
    assert.equal(manifest.cases.length, 15);

    const ids = manifest.cases.map((item) => item.id);
    assert.equal(new Set(ids).size, ids.length);

    const categories = new Set(manifest.cases.map((item) => item.category));
    for (const required of [
      'single-concern-many-files',
      'one-file-multiple-concerns',
      'independent-concerns',
      'cross-concern-interaction',
      'migration-plus-application',
      'auth-plus-api-contract',
      'refactor-plus-behavior-fix',
      'docs-tests-only-support',
      'generated-vendor-noise',
      'affected-unchanged-caller',
      'dynamic-dispatch-incomplete',
      'missed-required-obligation',
      'over-split-concern',
      'analyzer-timeout',
      'malformed-analyzer-output',
    ]) {
      assert.ok(categories.has(required), required);
    }
  });

  it('keeps each fixture executable and obligation-oriented', () => {
    for (const item of manifest.cases) {
      assert.ok(Array.isArray(item.input?.rawChangedFiles), `${item.id}: changed files`);
      assert.ok(item.input.rawChangedFiles.length > 0, `${item.id}: changed files non-empty`);
      assert.equal(typeof item.input.rawDiffText, 'string', `${item.id}: raw diff`);

      const normalized = normalizeReviewConcernFixture(item);
      assert.equal(normalized.id, item.id);
      assert.ok(normalized.oracle.obligations.length > 0, `${item.id}: obligations`);
      assert.ok(
        normalized.oracle.acceptableGrouping.maxConcerns >=
          normalized.oracle.acceptableGrouping.minConcerns,
        `${item.id}: grouping range`
      );
    }
  });

  it('scores obligation recall from human-owned concern assignments', () => {
    const result = evaluateReviewConcernMap({
      fixture: fixture(),
      map: map([concern('concern-1'), concern('concern-2')]),
      adjudication: {
        obligationMatches: {
          'OB-a': ['concern-1'],
          'OB-b': ['concern-2'],
        },
        nonActionableConcernIds: [],
        humanCorrectionCount: 0,
      },
    });

    assert.equal(result.evaluationStatus, 'scored');
    assert.equal(result.metrics.obligationDetected, 2);
    assert.equal(result.metrics.obligationRecall, 1);
    assert.deepEqual(result.metrics.missedObligationIds, []);
    assert.equal(result.metrics.groupingWithinRange, true);
    assert.equal(result.metrics.unmappedConcernCount, 0);
  });

  it('accepts an interaction represented either inside one concern or by an explicit edge', () => {
    const grouped = evaluateReviewConcernMap({
      fixture: fixture(),
      map: map([concern('concern-1')]),
      adjudication: {
        obligationMatches: {
          'OB-a': ['concern-1'],
          'OB-b': ['concern-1'],
        },
        humanCorrectionCount: 0,
      },
    });
    assert.equal(grouped.metrics.interactionRecall, 1);

    const linked = evaluateReviewConcernMap({
      fixture: fixture(),
      map: map([
        concern('concern-1', { interactions: ['concern-2'] }),
        concern('concern-2'),
      ]),
      adjudication: {
        obligationMatches: {
          'OB-a': ['concern-1'],
          'OB-b': ['concern-2'],
        },
        humanCorrectionCount: 0,
      },
    });
    assert.equal(linked.metrics.interactionRecall, 1);
  });

  it('surfaces missed obligations and missed interactions without inventing a verdict', () => {
    const result = buildPairedReviewConcernEvaluation({
      fixture: fixture(),
      baseline: {
        map: map([concern('concern-1')]),
        adjudication: {
          obligationMatches: {
            'OB-a': ['concern-1'],
            'OB-b': [],
          },
          humanCorrectionCount: 2,
        },
      },
      candidate: {
        map: map([
          concern('concern-1', { interactions: ['concern-2'] }),
          concern('concern-2'),
        ]),
        adjudication: {
          obligationMatches: {
            'OB-a': ['concern-1'],
            'OB-b': ['concern-2'],
          },
          humanCorrectionCount: 0,
        },
      },
    });

    assert.deepEqual(result.baseline.metrics.missedObligationIds, ['OB-b']);
    assert.deepEqual(result.baseline.metrics.missedInteractions, ['OB-a->OB-b']);
    assert.equal(result.delta.obligationRecall, 0.5);
    assert.equal(result.delta.interactionRecall, 1);
    assert.equal(result.delta.humanCorrectionCount, -2);
    assert.equal(result.decision, null);
    assert.equal(result.applied, false);
  });

  it('reports human-labeled non-actionable concerns separately from unmapped concerns', () => {
    const result = evaluateReviewConcernMap({
      fixture: fixture(),
      map: map([concern('concern-1'), concern('concern-2'), concern('concern-3')]),
      adjudication: {
        obligationMatches: {
          'OB-a': ['concern-1'],
          'OB-b': ['concern-2'],
        },
        nonActionableConcernIds: ['concern-3'],
        humanCorrectionCount: 1,
      },
    });

    assert.equal(result.metrics.nonActionableConcernCount, 1);
    assert.equal(result.metrics.nonActionableConcernRatio, 1 / 3);
    assert.equal(result.metrics.unmappedConcernCount, 1);
    assert.equal(result.metrics.humanCorrectionCount, 1);
  });

  it('keeps zero-denominator metrics unavailable instead of reporting a perfect score', () => {
    const noInteractionFixture = fixture({
      oracle: {
        obligations: [{ id: 'OB-a', description: 'obligation A' }],
        knownInteractions: [],
        acceptableGrouping: { minConcerns: 1, maxConcerns: 2 },
      },
    });
    const result = evaluateReviewConcernMap({
      fixture: noInteractionFixture,
      map: map([], { status: 'failed', limitations: ['analyzer-failed:runtime-error'] }),
      adjudication: {
        obligationMatches: { 'OB-a': [] },
        nonActionableConcernIds: [],
        humanCorrectionCount: 0,
      },
    });

    assert.equal(result.metrics.obligationRecall, 0);
    assert.equal(result.metrics.interactionRecall, null);
    assert.equal(result.metrics.nonActionableConcernRatio, null);
    assert.equal(result.metrics.groupingWithinRange, false);
    assert.equal(result.analysisStatus, 'failed');
  });

  it('treats an absent observation as unavailable rather than zero recall', () => {
    const result = evaluateReviewConcernMap({
      fixture: fixture(),
      map: null,
      adjudication: null,
    });

    assert.equal(result.evaluationStatus, 'not-observed');
    assert.equal(result.metrics.obligationRecall, null);
    assert.equal(result.metrics.interactionRecall, null);
    assert.equal(result.metrics.concernCount, null);
  });

  it('fails closed when human adjudication references unknown concerns or obligations', () => {
    assert.throws(
      () =>
        evaluateReviewConcernMap({
          fixture: fixture(),
          map: map([concern('concern-1')]),
          adjudication: {
            obligationMatches: {
              'OB-a': ['concern-404'],
              'OB-b': [],
            },
            humanCorrectionCount: 0,
          },
        }),
      (error) =>
        error instanceof ReviewConcernEvalError &&
        /unknown concern/.test(error.message)
    );

    assert.throws(
      () =>
        evaluateReviewConcernMap({
          fixture: fixture(),
          map: map([concern('concern-1')]),
          adjudication: {
            obligationMatches: {
              'OB-a': ['concern-1'],
              'OB-b': [],
              'OB-unknown': ['concern-1'],
            },
            humanCorrectionCount: 0,
          },
        }),
      /unknown obligation/
    );
  });

  it('fails closed on malformed map interactions and non-actionable labels', () => {
    assert.throws(
      () =>
        evaluateReviewConcernMap({
          fixture: fixture(),
          map: map([concern('concern-1', { interactions: ['concern-404'] })]),
          adjudication: {
            obligationMatches: {
              'OB-a': ['concern-1'],
              'OB-b': [],
            },
            humanCorrectionCount: 0,
          },
        }),
      /unknown interaction concern/
    );

    assert.throws(
      () =>
        evaluateReviewConcernMap({
          fixture: fixture(),
          map: map([concern('concern-1')]),
          adjudication: {
            obligationMatches: {
              'OB-a': ['concern-1'],
              'OB-b': [],
            },
            nonActionableConcernIds: 'concern-1',
            humanCorrectionCount: 0,
          },
        }),
      /nonActionableConcernIds must be an array/
    );
  });

  it('rejects contradictory human labels', () => {
    assert.throws(
      () =>
        evaluateReviewConcernMap({
          fixture: fixture(),
          map: map([concern('concern-1')]),
          adjudication: {
            obligationMatches: {
              'OB-a': ['concern-1'],
              'OB-b': [],
            },
            nonActionableConcernIds: ['concern-1'],
            humanCorrectionCount: 0,
          },
        }),
      /cannot be both obligation-matched and non-actionable/
    );
  });

  it('rejects malformed oracle interactions before scoring', () => {
    assert.throws(
      () =>
        normalizeReviewConcernFixture(
          fixture({
            oracle: {
              obligations: [{ id: 'OB-a', description: 'A' }],
              knownInteractions: [{ from: 'OB-a', to: 'OB-b' }],
              acceptableGrouping: { minConcerns: 1, maxConcerns: 2 },
            },
          })
        ),
      /known obligations/
    );
  });
});
