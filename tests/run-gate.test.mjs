/**
 * Tests for src/lib/run-gate.mjs deriveRunGate (Epic #1347 S3/S4).
 * Focus: the S4 strict_block forwarding link — a runLocalReview result carrying
 * `strictBlock: true` must derive a NO_GO / STRICT_BLOCK gate.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { deriveRunGate, noReviewerRoleSucceeded } from '../src/lib/run-gate.mjs';
import { gateDecisionExitCode } from '../src/lib/gate-exit.mjs';

const okResult = {
  status: 'ok',
  dryRun: false,
  findings: [],
  changedFiles: ['src/lib/foo.mjs'],
  plan: {},
  config: {},
};

describe('deriveRunGate — strict_block forwarding (Epic #1347 S4)', () => {
  test('a clean result with no strict block gates GO', () => {
    const { gate } = deriveRunGate(okResult);
    assert.equal(gate.decision, 'GO');
  });

  test('result.strictBlock === true → NO_GO / STRICT_BLOCK', () => {
    const { gate } = deriveRunGate({ ...okResult, strictBlock: true });
    assert.equal(gate.decision, 'NO_GO');
    assert.equal(gate.reasonCode, 'STRICT_BLOCK');
  });

  test('strictBlock forces NO_GO even with zero blocking findings', () => {
    const { gate } = deriveRunGate({ ...okResult, findings: [], strictBlock: true });
    assert.equal(gate.decision, 'NO_GO');
    assert.equal(gate.reasonCode, 'STRICT_BLOCK');
  });

  test('a missing strictBlock field is treated as false (backward compatible)', () => {
    const { gate } = deriveRunGate(okResult);
    assert.notEqual(gate.reasonCode, 'STRICT_BLOCK');
  });

  test('reviewer execution provenance cannot change decision or Gate (#2481)', () => {
    const baseline = deriveRunGate({
      ...okResult,
      findings: [
        {
          id: 'rr-1',
          severity: 'minor',
          file: 'src/lib/foo.mjs',
        },
      ],
    });
    const withProvenance = deriveRunGate({
      ...okResult,
      findings: [
        {
          id: 'rr-1',
          severity: 'minor',
          file: 'src/lib/foo.mjs',
          sourceExecutionIds: ['exec-a', 'exec-b'],
        },
      ],
      reviewCoverage: {
        schemaVersion: '1',
        status: 'complete',
        expectedUnits: 1,
        completedUnits: 1,
        requiredUnits: 1,
        completedRequiredUnits: 1,
        incompleteRequiredUnitIds: [],
        units: [
          {
            id: 'reviewer:bug-hunter/chunk:1',
            executionId: 'exec-a',
            kind: 'diff-chunk',
            subjects: ['src/lib/foo.mjs'],
            reviewerRole: 'bug-hunter',
            required: true,
            status: 'completed',
            reasonCode: null,
            findingsCount: 1,
          },
        ],
      },
    });

    assert.equal(withProvenance.decision, baseline.decision);
    assert.equal(withProvenance.gate.decision, baseline.gate.decision);
    assert.equal(withProvenance.gate.reasonCode, baseline.gate.reasonCode);
    assert.deepEqual(withProvenance.gate.inputs, baseline.gate.inputs);
  });

  test('a null result yields the fail-soft shape (no throw)', () => {
    const { decision, gate } = deriveRunGate(null);
    assert.equal(decision, undefined);
    assert.equal(gate, undefined);
  });
});

describe('deriveRunGate — deterministicUnrunnable forwarding (Epic #1347 §11.8 c2)', () => {
  test('result.deterministicUnrunnable === true → ESCALATE / DETERMINISTIC_UNRUNNABLE', () => {
    const { gate } = deriveRunGate({ ...okResult, deterministicUnrunnable: true });
    assert.equal(gate.decision, 'ESCALATE');
    assert.equal(gate.reasonCode, 'DETERMINISTIC_UNRUNNABLE');
  });

  test('a missing deterministicUnrunnable field is treated as false (default OFF)', () => {
    const { gate } = deriveRunGate(okResult);
    assert.notEqual(gate.reasonCode, 'DETERMINISTIC_UNRUNNABLE');
    assert.equal(gate.decision, 'GO');
  });

  test('strictBlock outranks deterministicUnrunnable (rule 5b > 5c)', () => {
    const { gate } = deriveRunGate({
      ...okResult,
      strictBlock: true,
      deterministicUnrunnable: true,
    });
    assert.equal(gate.decision, 'NO_GO');
    assert.equal(gate.reasonCode, 'STRICT_BLOCK');
  });
});

// #1689 review B2: the reviewer orchestration is fail-soft — a slow or broken
// role is dropped and the run continues. With ZERO surviving roles the empty
// findings list means "the review never ran", which scoring cannot distinguish
// from "the diff is clean". Both the human-facing decision and the machine gate
// must refuse the GO-family outcome.
describe('deriveRunGate — all reviewer roles failed (#1689)', () => {
  const timedOutRoles = [
    { role: 'bug-hunter', status: 'rejected', timedOut: true, findingsCount: 0 },
    { role: 'security-scanner', status: 'rejected', timedOut: true, findingsCount: 0 },
  ];

  test('every role timed out → not auto-approve and not GO', () => {
    const { decision, gate } = deriveRunGate({ ...okResult, reviewerResults: timedOutRoles });
    assert.notEqual(decision, 'auto-approve', 'a review that never ran cannot auto-approve');
    assert.equal(decision, 'human-review-required');
    assert.notEqual(gate.decision, 'GO');
    assert.notEqual(gate.decision, 'GO_WITH_OBSERVATION');
    assert.equal(gate.inputs.reviewExecuted, false, 'the gate must see reviewExecuted=false');
  });

  test('every role failed for a non-timeout reason → same outcome', () => {
    const { decision, gate } = deriveRunGate({
      ...okResult,
      reviewerResults: [
        { role: 'bug-hunter', status: 'rejected', timedOut: false, error: 'boom' },
        { role: 'security-scanner', status: 'rejected', timedOut: false, error: 'boom' },
      ],
    });
    assert.notEqual(decision, 'auto-approve');
    assert.notEqual(gate.decision, 'GO');
  });

  test('at least one surviving role keeps the previous behavior', () => {
    const { decision, gate } = deriveRunGate({
      ...okResult,
      reviewerResults: [
        { role: 'bug-hunter', status: 'fulfilled', timedOut: false, findingsCount: 0 },
        { role: 'security-scanner', status: 'rejected', timedOut: true, findingsCount: 0 },
      ],
    });
    assert.equal(decision, 'auto-approve');
    assert.equal(gate.decision, 'GO');
    assert.equal(gate.reasonCode, 'CONVERGED_CLEAN');
  });

  test('no orchestration at all (null / absent) is unaffected', () => {
    for (const reviewerResults of [null, undefined, []]) {
      const { decision, gate } = deriveRunGate({ ...okResult, reviewerResults });
      assert.equal(decision, 'auto-approve', `reviewerResults=${JSON.stringify(reviewerResults)}`);
      assert.equal(gate.decision, 'GO');
    }
  });

  test('noReviewerRoleSucceeded only fires for a non-empty all-failed list', () => {
    assert.equal(noReviewerRoleSucceeded(null), false);
    assert.equal(noReviewerRoleSucceeded([]), false);
    assert.equal(noReviewerRoleSucceeded([{ status: 'fulfilled' }]), false);
    assert.equal(noReviewerRoleSucceeded([{ status: 'rejected' }]), true);
    assert.equal(noReviewerRoleSucceeded([{ status: 'rejected' }, { status: 'fulfilled' }]), false);
  });

  test('--gate maps the all-failed run to a non-zero exit code', () => {
    const { gate } = deriveRunGate({ ...okResult, reviewerResults: timedOutRoles });
    assert.notEqual(
      gateDecisionExitCode(gate.decision),
      0,
      'a run where no reviewer survived must not exit 0 under --gate'
    );
  });
});
