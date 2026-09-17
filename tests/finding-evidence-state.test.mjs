import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  EVIDENCE_STATE,
  EVIDENCE_STATE_REASON,
  projectFindingEvidenceState,
} from '../src/lib/finding-evidence-state.mjs';
import { FINAL_STATUS } from '../src/lib/finding-critic.mjs';

function project(finalStatus, extra = {}) {
  return projectFindingEvidenceState({
    validation: { finalStatus },
    ...extra,
  });
}

describe('finding evidence state projection', () => {
  it('projects confirmed validation to established', () => {
    assert.deepEqual(project(FINAL_STATUS.CONFIRMED), {
      state: EVIDENCE_STATE.ESTABLISHED,
      source: 'validation.finalStatus',
      sourceStatus: FINAL_STATUS.CONFIRMED,
      reasonCode: EVIDENCE_STATE_REASON.CONFIRMED,
      blocker: null,
      validationPlan: null,
      unresolvedContextComplete: null,
    });
  });

  it('projects evidence-grounded dismissal to refuted', () => {
    assert.equal(project(FINAL_STATUS.DISMISSED_BY_EVIDENCE).state, EVIDENCE_STATE.REFUTED);
    assert.equal(
      project(FINAL_STATUS.DISMISSED_BY_EVIDENCE).reasonCode,
      EVIDENCE_STATE_REASON.REFUTED
    );
  });

  it('projects deterministic hallucination dismissal to refuted', () => {
    assert.equal(
      project(FINAL_STATUS.DISMISSED_HALLUCINATION).state,
      EVIDENCE_STATE.REFUTED
    );
  });

  it('projects reviewer withdrawal to refuted because the candidate no longer stands', () => {
    assert.equal(
      project(FINAL_STATUS.WITHDRAWN_BY_REVIEWER).state,
      EVIDENCE_STATE.REFUTED
    );
  });

  it(
    'projects needs-human-judgment to unresolved and requires blocker plus validation plan',
    () => {
      const incomplete = project(FINAL_STATUS.NEEDS_HUMAN_JUDGMENT);
      const complete = project(FINAL_STATUS.NEEDS_HUMAN_JUDGMENT, {
        blocker: 'Runtime behavior cannot be established from source only.',
        validationPlan: 'Reproduce in the sandbox adapter when available.',
      });

      assert.equal(incomplete.state, EVIDENCE_STATE.UNRESOLVED);
      assert.equal(incomplete.unresolvedContextComplete, false);
      assert.equal(complete.state, EVIDENCE_STATE.UNRESOLVED);
      assert.equal(complete.unresolvedContextComplete, true);
      assert.equal(complete.blocker, 'Runtime behavior cannot be established from source only.');
      assert.equal(
        complete.validationPlan,
        'Reproduce in the sandbox adapter when available.'
      );
    }
  );

  it('projects critic timeout to unresolved rather than a clean or established state', () => {
    const result = project(FINAL_STATUS.CRITIC_TIMEOUT);

    assert.equal(result.state, EVIDENCE_STATE.UNRESOLVED);
    assert.equal(result.reasonCode, EVIDENCE_STATE_REASON.UNRESOLVED);
    assert.equal(result.unresolvedContextComplete, false);
  });

  it('does not treat out-of-ask relevance routing as refutation', () => {
    const result = project(FINAL_STATUS.OUT_OF_ASK);

    assert.equal(result.state, EVIDENCE_STATE.UNRESOLVED);
    assert.equal(result.reasonCode, EVIDENCE_STATE_REASON.OUT_OF_ASK);
    assert.notEqual(result.state, EVIDENCE_STATE.REFUTED);
  });

  it('fails safe to unresolved when validation status is missing or malformed', () => {
    for (const input of [undefined, null, 42, false, 'finding', {}, { validation: null }]) {
      const result = projectFindingEvidenceState(input);
      assert.equal(result.state, EVIDENCE_STATE.UNRESOLVED);
      assert.equal(result.reasonCode, EVIDENCE_STATE_REASON.STATUS_MISSING);
      assert.equal(result.unresolvedContextComplete, false);
    }
  });

  it('fails safe to unresolved for an unknown final status', () => {
    const result = project('dismissed-duplicate');

    assert.equal(result.state, EVIDENCE_STATE.UNRESOLVED);
    assert.equal(result.reasonCode, EVIDENCE_STATE_REASON.STATUS_UNKNOWN);
    assert.notEqual(result.state, EVIDENCE_STATE.REFUTED);
  });

  it('does not use validatedStatus alone as epistemic truth', () => {
    const result = projectFindingEvidenceState({ validatedStatus: 'confirmed' });

    assert.equal(result.state, EVIDENCE_STATE.UNRESOLVED);
    assert.equal(result.reasonCode, EVIDENCE_STATE_REASON.STATUS_MISSING);
  });

  it(
    'does not let lifecycle, scope, severity, disposition, confidence, or agreement alter truth state',
    () => {
      const baseline = projectFindingEvidenceState({
        validation: { finalStatus: FINAL_STATUS.CONFIRMED },
      });
      const decorated = projectFindingEvidenceState({
        validation: { finalStatus: FINAL_STATUS.CONFIRMED },
        status: 'suppressed',
        scope: 'pre-existing',
        severity: 'critical',
        confidence: 'low',
        disposition: 'advisory',
        agreement: ['reviewer-a', 'reviewer-b', 'reviewer-c'],
        validatedStatus: 'dismissed-duplicate',
      });

      assert.equal(baseline.state, EVIDENCE_STATE.ESTABLISHED);
      assert.equal(decorated.state, EVIDENCE_STATE.ESTABLISHED);
      assert.equal(decorated.reasonCode, EVIDENCE_STATE_REASON.CONFIRMED);
    }
  );

  it('does not invent unresolved blocker or validation plan from malformed values', () => {
    const result = project(FINAL_STATUS.NEEDS_HUMAN_JUDGMENT, {
      blocker: '   ',
      validationPlan: { command: 'npm test' },
    });

    assert.equal(result.blocker, null);
    assert.equal(result.validationPlan, null);
    assert.equal(result.unresolvedContextComplete, false);
  });

  it('trims caller-supplied unresolved context without rewriting it', () => {
    const result = project(FINAL_STATUS.NEEDS_HUMAN_JUDGMENT, {
      blocker: '  Missing runtime evidence  ',
      validationPlan: '  Validate in a bounded sandbox  ',
    });

    assert.equal(result.blocker, 'Missing runtime evidence');
    assert.equal(result.validationPlan, 'Validate in a bounded sandbox');
    assert.equal(result.unresolvedContextComplete, true);
  });

  it('ignores unresolved context for established and refuted records', () => {
    const established = project(FINAL_STATUS.CONFIRMED, {
      blocker: 'stale blocker',
      validationPlan: 'stale plan',
    });
    const refuted = project(FINAL_STATUS.DISMISSED_BY_EVIDENCE, {
      blocker: 'stale blocker',
      validationPlan: 'stale plan',
    });

    for (const result of [established, refuted]) {
      assert.equal(result.blocker, null);
      assert.equal(result.validationPlan, null);
      assert.equal(result.unresolvedContextComplete, null);
    }
  });
});
