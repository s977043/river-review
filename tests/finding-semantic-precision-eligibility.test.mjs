import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { evaluateSemanticPrecisionEligibility } from '../src/lib/finding-semantic-precision-eligibility.mjs';
import { EVIDENCE_STATE } from '../src/lib/finding-evidence-state.mjs';
import { FINAL_STATUS } from '../src/lib/finding-critic.mjs';

function evaluate(finalStatus, extra = {}) {
  return evaluateSemanticPrecisionEligibility({
    validation: { finalStatus },
    ...extra,
  });
}

describe('semantic precision eligibility', () => {
  it('allows only established findings to proceed', () => {
    const result = evaluate(FINAL_STATUS.CONFIRMED);

    assert.equal(result.semanticPrecisionEligible, true);
    assert.equal(result.evidence.state, EVIDENCE_STATE.ESTABLISHED);
  });

  it('keeps unresolved findings out of Semantic Precision', () => {
    const result = evaluate(FINAL_STATUS.NEEDS_HUMAN_JUDGMENT, {
      blocker: 'Runtime evidence is unavailable in source-only mode.',
      validationPlan: 'Validate in a bounded sandbox when available.',
    });

    assert.equal(result.semanticPrecisionEligible, false);
    assert.equal(result.evidence.state, EVIDENCE_STATE.UNRESOLVED);
    assert.equal(result.evidence.blocker, 'Runtime evidence is unavailable in source-only mode.');
    assert.equal(result.evidence.validationPlan, 'Validate in a bounded sandbox when available.');
  });

  it('keeps refuted findings out of Semantic Precision', () => {
    const result = evaluate(FINAL_STATUS.DISMISSED_BY_EVIDENCE);

    assert.equal(result.semanticPrecisionEligible, false);
    assert.equal(result.evidence.state, EVIDENCE_STATE.REFUTED);
  });

  it('fails safe for missing, malformed, and unknown validation', () => {
    for (const input of [undefined, null, 42, {}, { validation: null }, { validation: {} }]) {
      const result = evaluateSemanticPrecisionEligibility(input);

      assert.equal(result.semanticPrecisionEligible, false);
      assert.equal(result.evidence.state, EVIDENCE_STATE.UNRESOLVED);
    }

    const unknown = evaluate('future-status');
    assert.equal(unknown.semanticPrecisionEligible, false);
    assert.equal(unknown.evidence.state, EVIDENCE_STATE.UNRESOLVED);
  });

  it('does not treat reviewer withdrawal as materiality-ready', () => {
    const result = evaluate(FINAL_STATUS.WITHDRAWN_BY_REVIEWER);

    assert.equal(result.semanticPrecisionEligible, false);
    assert.equal(result.evidence.state, EVIDENCE_STATE.UNRESOLVED);
  });

  it('does not treat out-of-ask routing as materiality-ready', () => {
    const result = evaluate(FINAL_STATUS.OUT_OF_ASK);

    assert.equal(result.semanticPrecisionEligible, false);
    assert.equal(result.evidence.state, EVIDENCE_STATE.UNRESOLVED);
  });

  it('does not let orthogonal axes override unresolved evidence state', () => {
    const result = evaluate(FINAL_STATUS.CRITIC_TIMEOUT, {
      severity: 'critical',
      confidence: 'high',
      scope: 'in-diff',
      askRelevance: 'in-ask',
      agreement: ['reviewer-a', 'reviewer-b'],
      disposition: 'blocking',
    });

    assert.equal(result.semanticPrecisionEligible, false);
    assert.equal(result.evidence.state, EVIDENCE_STATE.UNRESOLVED);
  });

  it('does not mutate established finding metadata', () => {
    const finding = {
      validation: { finalStatus: FINAL_STATUS.CONFIRMED },
      severity: 'major',
      confidence: 'high',
      scope: 'pre-existing',
      askRelevance: 'in-ask',
    };
    const snapshot = structuredClone(finding);

    const result = evaluateSemanticPrecisionEligibility(finding);

    assert.deepEqual(finding, snapshot);
    assert.equal(result.semanticPrecisionEligible, true);
    assert.equal(result.evidence.state, EVIDENCE_STATE.ESTABLISHED);
  });

  it('does not mutate or discard unresolved operational context', () => {
    const finding = {
      validation: { finalStatus: FINAL_STATUS.NEEDS_HUMAN_JUDGMENT },
      blocker: 'A runtime-only invariant cannot be established from source.',
      validationPlan: 'Exercise the invariant in an approved sandbox.',
    };
    const snapshot = structuredClone(finding);

    const result = evaluateSemanticPrecisionEligibility(finding);

    assert.deepEqual(finding, snapshot);
    assert.equal(result.semanticPrecisionEligible, false);
    assert.equal(result.evidence.blocker, finding.blocker);
    assert.equal(result.evidence.validationPlan, finding.validationPlan);
    assert.equal(result.evidence.unresolvedContextComplete, true);
  });
});
