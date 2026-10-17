/**
 * Contract test for the Reference Loop Agent (Epic #1171 item2).
 *
 * Proves a caller consuming River Review's loop contract reaches every terminal
 * outcome deterministically from fixed artifacts / run-diff fixtures — no LLM,
 * no filesystem, no network. This is the executable counterpart to
 * pages/reference/loop-convergence-contract.md.
 *
 * Asserts: CONVERGED, REVISE (→ eventual stop), ESCALATE_HUMAN,
 * STOP_OSCILLATED, STOP_MAX_ITERATIONS, plus the caller-only STOP_POLICY.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  decideLoopAction,
  runReferenceLoop,
  LOOP_ACTIONS,
  GATE_DECISION_TO_ACTION,
} from '../examples/loop-reference-agent/reference-loop.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const fixDir = join(here, 'fixtures', 'loop-reference-agent');
const load = (name) => JSON.parse(readFileSync(join(fixDir, name), 'utf8'));

const REVISE = load('artifact-revise.json');
const CONVERGED = load('artifact-converged.json');
const ESCALATE = load('artifact-escalate.json');
const OSCILLATED_DIFF = load('runs-diff-oscillated.json');

// ---------------------------------------------------------------------------
// decideLoopAction — single-step decisions
// ---------------------------------------------------------------------------

describe('decideLoopAction', () => {
  test('CONVERGED → stop-converged', () => {
    const d = decideLoopAction({ artifact: CONVERGED, iteration: 1, maxIterations: 5 });
    assert.equal(d.signal, 'CONVERGED');
    assert.equal(d.action, LOOP_ACTIONS.STOP_CONVERGED);
  });

  test('blocking findings → revise', () => {
    const d = decideLoopAction({ artifact: REVISE, iteration: 1, maxIterations: 5 });
    assert.equal(d.signal, 'REVISE_REQUIRED');
    assert.equal(d.action, LOOP_ACTIONS.REVISE);
  });

  test('human-review-required → stop-escalate', () => {
    const d = decideLoopAction({ artifact: ESCALATE, iteration: 1, maxIterations: 5 });
    assert.equal(d.signal, 'ESCALATE_HUMAN');
    assert.equal(d.action, LOOP_ACTIONS.STOP_ESCALATE);
  });

  test('oscillation diff → stop-escalate (STOP_OSCILLATED)', () => {
    const d = decideLoopAction({
      artifact: REVISE,
      runsDiff: OSCILLATED_DIFF,
      iteration: 3,
      maxIterations: 5,
    });
    assert.equal(d.signal, 'STOP_OSCILLATED');
    assert.equal(d.action, LOOP_ACTIONS.STOP_ESCALATE);
  });

  test('blocking findings at the iteration cap → stop-max-iterations', () => {
    const d = decideLoopAction({ artifact: REVISE, iteration: 5, maxIterations: 5 });
    assert.equal(d.signal, 'STOP_MAX_ITERATIONS');
    assert.equal(d.action, LOOP_ACTIONS.STOP_MAX_ITERATIONS);
  });

  test('caller policy overrides everything → stop-policy', () => {
    const d = decideLoopAction({
      artifact: REVISE,
      iteration: 1,
      maxIterations: 5,
      policySignal: 'STOP_POLICY_REQUIRED',
    });
    assert.equal(d.action, LOOP_ACTIONS.STOP_POLICY);
  });

  test('CONVERGED at the cap is converged, not max-iterations', () => {
    const d = decideLoopAction({ artifact: CONVERGED, iteration: 5, maxIterations: 5 });
    assert.equal(d.action, LOOP_ACTIONS.STOP_CONVERGED);
  });

  test('round three suggests caller replan without changing REVISE', () => {
    const earlier = decideLoopAction({ artifact: REVISE, iteration: 2, maxIterations: 5 });
    const third = decideLoopAction({ artifact: REVISE, iteration: 3, maxIterations: 5 });
    assert.equal(earlier.replanSuggested, undefined);
    assert.equal(third.action, LOOP_ACTIONS.REVISE);
    assert.equal(third.signal, 'REVISE_REQUIRED');
    assert.equal(third.replanSuggested, true);
    assert.match(third.replanReason, /review round 3/);
  });

  test('caller can tune replan threshold; invalid values use three', () => {
    const late = decideLoopAction({
      artifact: REVISE,
      iteration: 3,
      maxIterations: 6,
      replanAfter: 4,
    });
    assert.equal(late.replanSuggested, undefined);
    const adjusted = decideLoopAction({
      artifact: REVISE,
      iteration: 4,
      maxIterations: 6,
      replanAfter: 4,
    });
    assert.equal(adjusted.replanSuggested, true);
    const invalid = decideLoopAction({
      artifact: REVISE,
      iteration: 3,
      maxIterations: 5,
      replanAfter: 0,
    });
    assert.equal(invalid.replanSuggested, true);
  });

  test('replan never overrides convergence, escalation, or the iteration cap', () => {
    for (const [artifact, expected] of [
      [CONVERGED, LOOP_ACTIONS.STOP_CONVERGED],
      [ESCALATE, LOOP_ACTIONS.STOP_ESCALATE],
    ]) {
      const result = decideLoopAction({ artifact, iteration: 3, maxIterations: 5 });
      assert.equal(result.action, expected);
      assert.equal(result.replanSuggested, undefined);
    }
    const capped = decideLoopAction({ artifact: REVISE, iteration: 3, maxIterations: 3 });
    assert.equal(capped.action, LOOP_ACTIONS.STOP_MAX_ITERATIONS);
    assert.equal(capped.replanSuggested, undefined);
  });

  test('invalid maxIterations falls back to default (no premature/absent cap)', () => {
    // null would coerce to 0 (iteration >= 0 → premature stop); guard must prevent it.
    const early = decideLoopAction({ artifact: REVISE, iteration: 1, maxIterations: null });
    assert.equal(early.action, LOOP_ACTIONS.REVISE);
    // and the default cap (5) still trips when reached.
    const capped = decideLoopAction({ artifact: REVISE, iteration: 5, maxIterations: null });
    assert.equal(capped.action, LOOP_ACTIONS.STOP_MAX_ITERATIONS);
  });
});

// ---------------------------------------------------------------------------
// runReferenceLoop — full loop drive
// ---------------------------------------------------------------------------

describe('runReferenceLoop', () => {
  test('revises until convergence', async () => {
    // Two revise rounds, then converge.
    const sequence = [REVISE, REVISE, CONVERGED];
    const result = await runReferenceLoop({
      review: ({ iteration }) => ({ artifact: sequence[iteration - 1] }),
      maxIterations: 5,
    });
    assert.equal(result.action, LOOP_ACTIONS.STOP_CONVERGED);
    assert.equal(result.iteration, 3);
    assert.equal(result.history.length, 3);
  });

  test('stops at max iterations when never converging', async () => {
    const result = await runReferenceLoop({
      review: () => ({ artifact: REVISE }),
      maxIterations: 3,
    });
    assert.equal(result.action, LOOP_ACTIONS.STOP_MAX_ITERATIONS);
    assert.equal(result.iteration, 3);
  });

  test('optional replan hook is invoked only before another revise', async () => {
    const replans = [];
    const result = await runReferenceLoop({
      review: ({ iteration }) => ({ artifact: iteration === 4 ? CONVERGED : REVISE }),
      maxIterations: 5,
      onReplan: async ({ iteration, decision }) => {
        replans.push({ iteration, action: decision.action });
      },
    });
    assert.equal(result.action, LOOP_ACTIONS.STOP_CONVERGED);
    assert.deepEqual(replans, [{ iteration: 3, action: LOOP_ACTIONS.REVISE }]);
  });

  test('escalates immediately on human-review-required', async () => {
    const result = await runReferenceLoop({
      review: () => ({ artifact: ESCALATE }),
      maxIterations: 5,
    });
    assert.equal(result.action, LOOP_ACTIONS.STOP_ESCALATE);
    assert.equal(result.iteration, 1);
  });

  test('escalates on oscillation surfaced from runs diff', async () => {
    // First two rounds revise; third round surfaces oscillation via runsDiff.
    const result = await runReferenceLoop({
      review: ({ iteration }) =>
        iteration >= 3 ? { artifact: REVISE, runsDiff: OSCILLATED_DIFF } : { artifact: REVISE },
      maxIterations: 10,
    });
    assert.equal(result.signal, 'STOP_OSCILLATED');
    assert.equal(result.action, LOOP_ACTIONS.STOP_ESCALATE);
    assert.equal(result.iteration, 3);
  });

  test('caller policy stops the loop mid-flight', async () => {
    const result = await runReferenceLoop({
      review: () => ({ artifact: REVISE }),
      maxIterations: 5,
      policyFor: ({ iteration }) => (iteration === 2 ? 'STOP_POLICY_REQUIRED' : null),
    });
    assert.equal(result.action, LOOP_ACTIONS.STOP_POLICY);
    assert.equal(result.iteration, 2);
  });

  test('awaits async review and policyFor callbacks', async () => {
    const result = await runReferenceLoop({
      review: async ({ iteration }) => ({ artifact: iteration >= 2 ? CONVERGED : REVISE }),
      maxIterations: 5,
      policyFor: async () => null,
    });
    assert.equal(result.action, LOOP_ACTIONS.STOP_CONVERGED);
    assert.equal(result.iteration, 2);
  });
});

// ---------------------------------------------------------------------------
// Gate consumption (Epic #1347 S4) — the gate block is authoritative when
// present; older artifacts without gate fall back to the loop-signal path.
// ---------------------------------------------------------------------------
describe('decideLoopAction — gate block (S4)', () => {
  const withGate = (decision, extra = {}) => ({
    version: '1',
    timestamp: '2026-07-05T00:00:00.000Z',
    phase: 'midstream',
    status: 'ok',
    findings: [],
    gate: {
      decision,
      reasonCode:
        decision === 'GO'
          ? 'CONVERGED_CLEAN'
          : decision === 'ESCALATE'
            ? 'HUMAN_APPROVAL_REQUIRED'
            : decision === 'GO_WITH_OBSERVATION'
              ? 'MINOR_FINDINGS_OBSERVE'
              : 'BLOCKING_FINDINGS',
      tier: 'field',
      inputs: {},
      inputsHash: 'aaaaaaaaaaaaaaaa',
      schemaVersion: '1',
      ...extra,
    },
  });

  test('gate GO → stop-converged', () => {
    const d = decideLoopAction({ artifact: withGate('GO'), iteration: 1, maxIterations: 5 });
    assert.equal(d.action, LOOP_ACTIONS.STOP_CONVERGED);
  });

  test('gate ESCALATE → stop-escalate (cliff isolated from revise)', () => {
    const d = decideLoopAction({ artifact: withGate('ESCALATE'), iteration: 1, maxIterations: 5 });
    assert.equal(d.action, LOOP_ACTIONS.STOP_ESCALATE);
  });

  test('gate NO_GO gets caller replan advice without changing gate action', () => {
    const result = decideLoopAction({
      artifact: withGate('NO_GO'),
      iteration: 3,
      maxIterations: 5,
    });
    assert.equal(result.action, LOOP_ACTIONS.REVISE);
    assert.equal(result.replanSuggested, true);
    const stop = decideLoopAction({
      artifact: withGate('ESCALATE'),
      iteration: 3,
      maxIterations: 5,
    });
    assert.equal(stop.replanSuggested, undefined);
  });

  test('gate NO_GO → revise (with iteration cap)', () => {
    const d = decideLoopAction({ artifact: withGate('NO_GO'), iteration: 1, maxIterations: 5 });
    assert.equal(d.action, LOOP_ACTIONS.REVISE);
    const capped = decideLoopAction({
      artifact: withGate('NO_GO'),
      iteration: 5,
      maxIterations: 5,
    });
    assert.equal(capped.action, LOOP_ACTIONS.STOP_MAX_ITERATIONS);
  });

  test('gate GO_WITH_OBSERVATION → continue-with-observation + deadline', () => {
    const d = decideLoopAction({
      artifact: withGate('GO_WITH_OBSERVATION', {
        observation: { expiresInHours: 72, onExpiry: 'stop', files: ['a.mjs'] },
      }),
      iteration: 1,
      maxIterations: 5,
    });
    assert.equal(d.action, LOOP_ACTIONS.CONTINUE_WITH_OBSERVATION);
    assert.equal(d.observationDeadline, 72);
    // The full observation contract is surfaced so the caller can enforce it
    // (#1400 review Minor 2) — not just the deadline.
    assert.deepEqual(d.observation, { expiresInHours: 72, onExpiry: 'stop', files: ['a.mjs'] });
  });

  test('gate GO_WITH_OBSERVATION without a finite deadline → stop-escalate (fail-safe, not unbounded observe)', () => {
    // A malformed hill gate (no finite expiresInHours) must NOT continue an
    // unbounded observation, and must NOT fall back to the loop-signal path
    // (which would promote this findings:[] artifact to a full GO). #1400 review.
    const d = decideLoopAction({
      artifact: withGate('GO_WITH_OBSERVATION'), // no observation block → no deadline
      iteration: 1,
      maxIterations: 5,
    });
    assert.equal(d.action, LOOP_ACTIONS.STOP_ESCALATE);
    assert.equal(d.observationDeadline, undefined);
  });

  test('oscillation (runs diff) overrides the gate block', () => {
    const artifact = withGate('GO'); // gate says GO...
    const d = decideLoopAction({
      artifact,
      runsDiff: OSCILLATED_DIFF, // ...but oscillation is detected
      iteration: 1,
      maxIterations: 5,
    });
    assert.equal(d.action, LOOP_ACTIONS.STOP_ESCALATE);
  });

  test('caller policy still overrides the gate block', () => {
    const d = decideLoopAction({
      artifact: withGate('GO'),
      iteration: 1,
      maxIterations: 5,
      policySignal: 'STOP_POLICY_REQUIRED',
    });
    assert.equal(d.action, LOOP_ACTIONS.STOP_POLICY);
  });

  test('unknown gate decision falls back to the loop-signal path', () => {
    const artifact = { ...CONVERGED, gate: { decision: 'FUTURE_VALUE', reasonCode: 'x' } };
    const d = decideLoopAction({ artifact, iteration: 1, maxIterations: 5 });
    // falls through to loop-signal → CONVERGED artifact yields stop-converged
    assert.equal(d.action, LOOP_ACTIONS.STOP_CONVERGED);
  });
});

// Conformance fixtures (S3) drive the same Reference Loop, proving the
// documented expectedHostAction is what a real caller reaches (S4 wiring).
describe('gate conformance fixtures drive the reference loop (S4)', () => {
  // Assert against the driver's OWN exported map (single source of truth) so
  // the conformance action mapping cannot drift from the driver (#1400 review
  // Info 5). Note: fixtures 03 (NO_GO/BLOCKING_FINDINGS) and 05
  // (NO_GO/NOT_EXECUTED) both map to REVISE here — the revise loop re-runs the
  // review in either case; the reasonCode distinction (revise vs run-first)
  // lives in gate.reasonCode, which callers needing the nuance can read.
  const confDir = join(here, 'fixtures', 'gate-conformance');
  const files = readdirSync(confDir).filter((f) => f.endsWith('.json'));
  for (const f of files) {
    test(`${f}: reference loop reaches the tier-appropriate action`, () => {
      const fixture = JSON.parse(readFileSync(join(confDir, f), 'utf8'));
      const gate = fixture.artifact.gate;
      const d = decideLoopAction({ artifact: fixture.artifact, iteration: 1, maxIterations: 5 });
      assert.equal(d.action, GATE_DECISION_TO_ACTION[gate.decision], `for gate ${gate.decision}`);
    });
  }
});
