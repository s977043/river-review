/**
 * #2343 — Critic validation incompleteness is separate from Review Coverage.
 * No provider is called: synthetic, already-observed critic summaries only.
 * Opt-in must preserve old gate output byte-for-byte when disabled.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  computeGateInputsHash,
  criticValidationIncompleteForGate,
  deriveGateDecision,
} from '../src/lib/gate-decision.mjs';
import { deriveRunGate } from '../src/lib/run-gate.mjs';

const ON = { RIVER_GATE_CRITIC_VALIDATION: '1' };
const observation = (humanReview = 2, evaluated = 2) => ({
  mode: 'active',
  evaluated,
  humanReview,
  byFinalStatus: humanReview
    ? { 'critic-timeout': humanReview, confirmed: evaluated - humanReview }
    : { confirmed: evaluated },
});
const base = {
  loopSignal: 'CONVERGED',
  decision: 'auto-approve',
  riskAction: 'comment_only',
  changedFiles: ['src/foo.mjs'],
  reviewExecuted: true,
  artifactStatus: 'ok',
};

describe('#2343 Critic validation gate — evidence and opt-in', () => {
  it('is default OFF and preserves the existing gate byte-for-byte', () => {
    const before = deriveGateDecision(base);
    const after = deriveGateDecision({
      ...base,
      criticIncomplete: criticValidationIncompleteForGate(observation(), {}),
    });
    assert.equal(criticValidationIncompleteForGate(observation(), {}), false);
    assert.deepEqual(after, before);
    assert.equal(Object.hasOwn(after.inputs, 'criticIncomplete'), false);
    assert.equal(computeGateInputsHash(after.inputs), before.inputsHash);
  });

  it('accepts only exact 1, not near-miss opt-ins', () => {
    for (const value of ['true', '0', ' 1', '', undefined]) {
      assert.equal(
        criticValidationIncompleteForGate(observation(), {
          RIVER_GATE_CRITIC_VALIDATION: value,
        }),
        false
      );
    }
    assert.equal(criticValidationIncompleteForGate(observation(), ON), true);
  });

  it('does not fabricate failure when Critic was not active or has no findings', () => {
    for (const item of [
      null,
      undefined,
      {},
      { mode: 'off', evaluated: 2, humanReview: 2 },
      observation(0, 0),
    ]) {
      assert.equal(criticValidationIncompleteForGate(item, ON), false);
    }
  });

  it('routes observed Critic timeouts to Human rather than clean GO', () => {
    const gate = deriveGateDecision({
      ...base,
      criticIncomplete: criticValidationIncompleteForGate(observation(), ON),
    });
    assert.equal(gate.decision, 'ESCALATE');
    assert.equal(gate.reasonCode, 'CRITIC_VALIDATION_INCOMPLETE');
    assert.equal(gate.inputs.criticIncomplete, true);
    assert.notEqual(gate.inputsHash, deriveGateDecision(base).inputsHash);
    assert.equal(deriveGateDecision(gate.inputs).inputsHash, gate.inputsHash);
    assert.equal(deriveGateDecision(gate.inputs).decision, gate.decision);
  });

  it('does not report a completed Critic as incomplete', () => {
    assert.equal(criticValidationIncompleteForGate(observation(0), ON), false);
    assert.deepEqual(
      deriveGateDecision({
        ...base,
        criticIncomplete: criticValidationIncompleteForGate(observation(0), ON),
      }),
      deriveGateDecision(base)
    );
  });

  it('treats malformed active accounting as incomplete rather than clean', () => {
    for (const malformed of [
      { mode: 'active', evaluated: 2, byFinalStatus: { confirmed: 2 } },
      { mode: 'active', evaluated: 2, humanReview: 0, byFinalStatus: {} },
      { mode: 'active', evaluated: 2, humanReview: 3, byFinalStatus: { confirmed: 2 } },
      { mode: 'active', evaluated: 2, humanReview: 0, byFinalStatus: { confirmed: -2 } },
    ]) {
      assert.equal(criticValidationIncompleteForGate(malformed, ON), true);
    }
  });

  it('preserves prior NO_GO and mandatory escalation precedence', () => {
    const blocked = deriveGateDecision({
      ...base,
      loopSignal: 'REVISE_REQUIRED',
      blockingFindings: 1,
      criticIncomplete: true,
    });
    assert.equal(blocked.decision, 'NO_GO');
    assert.equal(blocked.reasonCode, 'BLOCKING_FINDINGS');
    const strict = deriveGateDecision({ ...base, strictBlock: true, criticIncomplete: true });
    assert.equal(strict.reasonCode, 'STRICT_BLOCK');
    const mandatory = deriveGateDecision({
      ...base,
      humanApprovalRequired: true,
      criticIncomplete: true,
    });
    assert.equal(mandatory.reasonCode, 'HUMAN_APPROVAL_REQUIRED');
    const notRun = deriveGateDecision({
      ...base,
      reviewExecuted: false,
      criticIncomplete: true,
    });
    assert.equal(notRun.reasonCode, 'NOT_EXECUTED');
  });

  it('works through the river run gate consumer using existing debug observation', () => {
    const input = {
      status: 'ok',
      dryRun: false,
      changedFiles: ['src/foo.mjs'],
      findings: [],
      reviewDebug: { execution: { findingCritic: observation() } },
    };
    const original = process.env.RIVER_GATE_CRITIC_VALIDATION;
    try {
      delete process.env.RIVER_GATE_CRITIC_VALIDATION;
      const before = deriveRunGate(input);
      assert.equal(before.gate.decision, 'GO');
      process.env.RIVER_GATE_CRITIC_VALIDATION = '1';
      const after = deriveRunGate(input);
      assert.equal(after.gate.decision, 'ESCALATE');
      assert.equal(after.gate.reasonCode, 'CRITIC_VALIDATION_INCOMPLETE');
      assert.equal(after.decision, before.decision, 'evidence does not rewrite scoring');
      assert.equal(after.gate.inputs.criticIncomplete, true);
    } finally {
      if (original === undefined) delete process.env.RIVER_GATE_CRITIC_VALIDATION;
      else process.env.RIVER_GATE_CRITIC_VALIDATION = original;
    }
  });
});
