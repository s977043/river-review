import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  REVIEWER_INDEPENDENCE_REASON,
  REVIEWER_INDEPENDENCE_STATUS,
  evaluateReviewerIndependence,
} from '../src/lib/reviewer-independence.mjs';

describe('reviewer execution independence', () => {
  it('accepts distinct non-empty run ids as logically independent', () => {
    assert.deepEqual(
      evaluateReviewerIndependence({ finderRunId: 'finder-001', verifierRunId: 'verifier-001' }),
      {
        status: REVIEWER_INDEPENDENCE_STATUS.INDEPENDENT,
        independent: true,
        finderRunId: 'finder-001',
        verifierRunId: 'verifier-001',
        reasonCode: REVIEWER_INDEPENDENCE_REASON.DISTINCT_RUN_IDS,
      }
    );
  });

  it('rejects the same run id as the same execution', () => {
    const result = evaluateReviewerIndependence({
      finderRunId: 'run-123',
      verifierRunId: 'run-123',
    });

    assert.equal(result.status, REVIEWER_INDEPENDENCE_STATUS.SAME_EXECUTION);
    assert.equal(result.independent, false);
    assert.equal(result.reasonCode, REVIEWER_INDEPENDENCE_REASON.SAME_RUN_ID);
  });

  it('treats a missing finder id as unknown rather than independent', () => {
    const result = evaluateReviewerIndependence({ verifierRunId: 'verifier-001' });

    assert.deepEqual(result, {
      status: REVIEWER_INDEPENDENCE_STATUS.UNKNOWN,
      independent: false,
      finderRunId: null,
      verifierRunId: 'verifier-001',
      reasonCode: REVIEWER_INDEPENDENCE_REASON.FINDER_RUN_ID_MISSING,
    });
  });

  it('treats a missing verifier id as unknown rather than independent', () => {
    const result = evaluateReviewerIndependence({ finderRunId: 'finder-001' });

    assert.deepEqual(result, {
      status: REVIEWER_INDEPENDENCE_STATUS.UNKNOWN,
      independent: false,
      finderRunId: 'finder-001',
      verifierRunId: null,
      reasonCode: REVIEWER_INDEPENDENCE_REASON.VERIFIER_RUN_ID_MISSING,
    });
  });

  it('treats both missing ids as unknown', () => {
    const result = evaluateReviewerIndependence();

    assert.deepEqual(result, {
      status: REVIEWER_INDEPENDENCE_STATUS.UNKNOWN,
      independent: false,
      finderRunId: null,
      verifierRunId: null,
      reasonCode: REVIEWER_INDEPENDENCE_REASON.BOTH_RUN_IDS_MISSING,
    });
  });

  it('treats a missing or malformed input object as unknown', () => {
    for (const input of [null, 42, false, 'not-provenance']) {
      assert.deepEqual(evaluateReviewerIndependence(input), {
        status: REVIEWER_INDEPENDENCE_STATUS.UNKNOWN,
        independent: false,
        finderRunId: null,
        verifierRunId: null,
        reasonCode: REVIEWER_INDEPENDENCE_REASON.BOTH_RUN_IDS_MISSING,
      });
    }
  });

  it('treats whitespace-only and non-string ids as missing instead of coercing them', () => {
    assert.equal(
      evaluateReviewerIndependence({ finderRunId: '   ', verifierRunId: 42 }).reasonCode,
      REVIEWER_INDEPENDENCE_REASON.BOTH_RUN_IDS_MISSING
    );
    assert.equal(
      evaluateReviewerIndependence({ finderRunId: {}, verifierRunId: false }).independent,
      false
    );
  });

  it('trims surrounding whitespace before comparing run ids', () => {
    const same = evaluateReviewerIndependence({
      finderRunId: '  run-123 ',
      verifierRunId: 'run-123',
    });
    const different = evaluateReviewerIndependence({
      finderRunId: ' finder-001 ',
      verifierRunId: ' verifier-001 ',
    });

    assert.equal(same.status, REVIEWER_INDEPENDENCE_STATUS.SAME_EXECUTION);
    assert.equal(different.status, REVIEWER_INDEPENDENCE_STATUS.INDEPENDENT);
    assert.equal(different.finderRunId, 'finder-001');
    assert.equal(different.verifierRunId, 'verifier-001');
  });

  it('keeps run ids opaque and does not use provider/model metadata as a correctness signal', () => {
    const sameModel = evaluateReviewerIndependence({
      finderRunId: 'run-a',
      verifierRunId: 'run-b',
      provider: 'same-provider',
      model: 'same-model',
    });
    const caseVariant = evaluateReviewerIndependence({
      finderRunId: 'Run-A',
      verifierRunId: 'run-a',
    });

    assert.equal(sameModel.independent, true);
    assert.equal(caseVariant.independent, true);
  });
});
