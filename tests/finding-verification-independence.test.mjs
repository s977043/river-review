import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  FRESH_VERIFIER_REASON,
  assessFindingVerifierFreshRun,
} from '../src/lib/finding-verification-independence.mjs';

describe('assessFindingVerifierFreshRun', () => {
  it('accepts distinct reviewRunIds as the minimum fresh-run condition', () => {
    const result = assessFindingVerifierFreshRun({
      finderProvenance: { reviewRunId: 'run-finder', provider: 'openai', model: 'model-a' },
      verifierProvenance: { reviewRunId: 'run-verifier', provider: 'openai', model: 'model-a' },
    });

    assert.deepEqual(result, {
      minimumFreshRunSatisfied: true,
      reasonCode: FRESH_VERIFIER_REASON.DISTINCT_RUNS,
      finderRunId: 'run-finder',
      verifierRunId: 'run-verifier',
    });
  });

  it('rejects the same reviewRunId even when provider or model metadata differs', () => {
    const result = assessFindingVerifierFreshRun({
      finderProvenance: { reviewRunId: 'run-shared', provider: 'openai', model: 'model-a' },
      verifierProvenance: { reviewRunId: 'run-shared', provider: 'anthropic', model: 'model-b' },
    });

    assert.equal(result.minimumFreshRunSatisfied, false);
    assert.equal(result.reasonCode, FRESH_VERIFIER_REASON.SAME_RUN);
  });

  it('does not require provider diversity when reviewRunIds are distinct', () => {
    const result = assessFindingVerifierFreshRun({
      finderProvenance: { reviewRunId: 'run-a', provider: 'openai', model: 'model-a' },
      verifierProvenance: { reviewRunId: 'run-b', provider: 'openai', model: 'model-a' },
    });

    assert.equal(result.minimumFreshRunSatisfied, true);
    assert.equal(result.reasonCode, FRESH_VERIFIER_REASON.DISTINCT_RUNS);
  });

  it('fails closed when the finder reviewRunId is missing', () => {
    const result = assessFindingVerifierFreshRun({
      finderProvenance: { reviewRunId: '   ' },
      verifierProvenance: { reviewRunId: 'run-verifier' },
    });

    assert.deepEqual(result, {
      minimumFreshRunSatisfied: false,
      reasonCode: FRESH_VERIFIER_REASON.FINDER_RUN_ID_MISSING,
      finderRunId: null,
      verifierRunId: 'run-verifier',
    });
  });

  it('fails closed when the verifier reviewRunId is missing', () => {
    const result = assessFindingVerifierFreshRun({
      finderProvenance: { reviewRunId: 'run-finder' },
      verifierProvenance: null,
    });

    assert.deepEqual(result, {
      minimumFreshRunSatisfied: false,
      reasonCode: FRESH_VERIFIER_REASON.VERIFIER_RUN_ID_MISSING,
      finderRunId: 'run-finder',
      verifierRunId: null,
    });
  });

  it('distinguishes both missing reviewRunIds from one-sided provenance loss', () => {
    const result = assessFindingVerifierFreshRun();

    assert.deepEqual(result, {
      minimumFreshRunSatisfied: false,
      reasonCode: FRESH_VERIFIER_REASON.BOTH_RUN_IDS_MISSING,
      finderRunId: null,
      verifierRunId: null,
    });
  });
});
