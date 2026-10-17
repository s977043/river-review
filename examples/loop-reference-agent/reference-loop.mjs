/**
 * Reference Loop Agent (Epic #1171 item2).
 *
 * A deterministic, API-free reference implementation of how a *caller* consumes
 * River Review's loop contract to drive a generate → review → revise loop.
 *
 * River Review only returns judgment material (`decision`, finding severities,
 * `oscillated`, `suggestedLoopSignal`). Iteration / stop / escalation is the
 * caller's responsibility (#976 boundary). This module encodes that caller-side
 * decision logic exactly as specified in
 * `pages/reference/loop-convergence-contract.md`, so it doubles as a contract
 * test fixture and an executable demo.
 *
 * All functions are pure / side-effect-free. The loop driver delegates the
 * actual "run River Review" step to an injected `review` callback, so tests feed
 * fixed artifacts and never touch a real LLM or the filesystem.
 */

import {
  deriveLoopSignalFromArtifact,
  deriveLoopSignalFromRunsDiff,
} from '../../src/lib/loop-signal.mjs';

/** Caller-side loop actions. */
export const LOOP_ACTIONS = Object.freeze({
  REVISE: 'revise',
  STOP_CONVERGED: 'stop-converged',
  STOP_ESCALATE: 'stop-escalate',
  STOP_MAX_ITERATIONS: 'stop-max-iterations',
  STOP_POLICY: 'stop-policy',
  // Epic #1347 S4: the "hill" tier — continue, but the change is under a
  // time-boxed observation window the caller must track (see
  // observationDeadline in the returned decision).
  CONTINUE_WITH_OBSERVATION: 'continue-with-observation',
});

/**
 * Decide the next loop action for one review result. Pure.
 *
 * Precedence (highest first):
 * 1. caller policy (cost cap, HITL label, …) → STOP_POLICY  (Layer 3)
 * 2. STOP_OSCILLATED / ESCALATE_HUMAN        → STOP_ESCALATE (Layer 2/1)
 * 3. CONVERGED                                → STOP_CONVERGED
 * 4. would revise but hit the iteration cap   → STOP_MAX_ITERATIONS (Layer 3)
 * 5. otherwise (REVISE_REQUIRED / NO_SIGNAL)  → REVISE
 *
 * Note CONVERGED/ESCALATE take priority over the max-iterations guard: reaching
 * the cap on a converged/escalated result is not a "max iterations" stop.
 *
 * @param {object} params
 * @param {object} params.artifact - Latest Review Artifact (findings + decision).
 * @param {object|null} [params.runsDiff] - `runs diff` output when 3+ runs exist
 *   (enables STOP_OSCILLATED). Omit/null for single-run derivation.
 * @param {number} params.iteration - 1-based iteration counter.
 * @param {number} params.maxIterations - Divergence guard (recommended 3–5).
 * @param {number} [params.replanAfter=3] - Caller-owned advisory threshold.\n *   Reaching it does not change the action or override a stop/escalation.\n * @param {string|null} [params.policySignal] - Caller-synthesized Layer 3 signal,
 *   e.g. 'STOP_POLICY_REQUIRED' when a cost cap or HITL label fires.
 * @returns {{signal: string, action: string, reason: string}}
 */
/**
 * Map a `gate` block to a loop action (Epic #1347 S4). Returns null when the
 * gate does not determine the action (unknown decision → fall back to the
 * loop-signal path). The iteration cap still applies to NO_GO (revise).
 *
 * @param {object} params
 * @param {object} params.gate - artifact.gate
 * @param {string} params.signal - the loop signal (for the returned decision's `signal`)
 * @param {number} params.iteration
 * @param {number} params.maxIterations
 * @returns {{signal: string, action: string, reason: string, observationDeadline?: number}|null}
 */
/** Resolve the divergence-guard iteration limit (shared by gate + loop-signal
 * paths so the cap cannot drift asymmetrically). A bad value must not disable
 * the cap (infinite loop) or trip it on iteration 1. */
function resolveIterationLimit(maxIterations) {
  return typeof maxIterations === 'number' && maxIterations > 0 ? maxIterations : 5;
}

/**
 * Single source of truth mapping a gate decision to its loop action (Epic
 * #1347 S4). Exported so contract tests assert against the SAME map the
 * driver uses, instead of re-deriving it (which would silently drift).
 */
// Caller-owned, non-blocking advice. This is not a River Review gate or an
// extra loop signal. It only appears when the next action would be REVISE.
function withReplanAdvice(decision, iteration, replanAfter) {
  if (decision.action !== LOOP_ACTIONS.REVISE) return decision;
  const threshold = Number.isSafeInteger(replanAfter) && replanAfter > 0 ? replanAfter : 3;
  if (!Number.isSafeInteger(iteration) || iteration < threshold) return decision;
  return {
    ...decision,
    replanSuggested: true,
    replanReason: `review round ${iteration} reached the caller replan threshold (${threshold}); reassess repeated findings, scope and verification strategy before another revision`,
  };
}

export const GATE_DECISION_TO_ACTION = Object.freeze({
  GO: LOOP_ACTIONS.STOP_CONVERGED,
  GO_WITH_OBSERVATION: LOOP_ACTIONS.CONTINUE_WITH_OBSERVATION,
  NO_GO: LOOP_ACTIONS.REVISE,
  ESCALATE: LOOP_ACTIONS.STOP_ESCALATE,
});

function decideFromGate({ gate, signal, iteration, maxIterations }) {
  switch (gate.decision) {
    case 'ESCALATE':
      return {
        signal,
        action: LOOP_ACTIONS.STOP_ESCALATE,
        reason: `gate ESCALATE (${gate.reasonCode}) — human approval required`,
      };
    case 'GO':
      return {
        signal,
        action: LOOP_ACTIONS.STOP_CONVERGED,
        reason: `gate GO (${gate.reasonCode}) — autonomous continuation permitted`,
      };
    case 'GO_WITH_OBSERVATION': {
      // The hill tier: continue, but under a bounded observation window the
      // caller must track. The decision SURFACES the full observation contract
      // (deadline + files + onExpiry) so the caller can enforce it; this
      // reference driver does not itself track wall-clock time (a revise loop
      // terminates here — expiry is a post-loop concern for the merged change).
      //
      // A well-formed gate ALWAYS carries a finite expiresInHours
      // (deriveGateDecision defaults it), so a missing/non-finite deadline means
      // a malformed gate. Fail-safe = escalate: never continue an UNBOUNDED
      // observation, and never fall back to the loop-signal path (which could
      // promote a CONVERGED artifact to a full GO — the wrong direction for the
      // hill tier, contra the Epic's unknown-never-toward-GO invariant).
      const hours = gate.observation?.expiresInHours;
      if (!Number.isFinite(hours)) {
        return {
          signal,
          action: LOOP_ACTIONS.STOP_ESCALATE,
          reason: `gate GO_WITH_OBSERVATION (${gate.reasonCode}) without a finite observation deadline — malformed gate, escalating`,
        };
      }
      return {
        signal,
        action: LOOP_ACTIONS.CONTINUE_WITH_OBSERVATION,
        reason: `gate GO_WITH_OBSERVATION (${gate.reasonCode}) — proceed under a review window`,
        observationDeadline: hours,
        ...(gate.observation ? { observation: gate.observation } : {}),
      };
    }
    case 'NO_GO': {
      const limit = resolveIterationLimit(maxIterations);
      if (iteration >= limit) {
        return {
          signal: 'STOP_MAX_ITERATIONS',
          action: LOOP_ACTIONS.STOP_MAX_ITERATIONS,
          reason: `gate NO_GO but reached max iterations (${limit}) without converging`,
        };
      }
      return {
        signal,
        action: LOOP_ACTIONS.REVISE,
        reason: `gate NO_GO (${gate.reasonCode}) — revise and re-run`,
      };
    }
    default:
      return null; // unknown gate decision → fall back to loop-signal path
  }
}

export function decideLoopAction({
  artifact,
  runsDiff = null,
  iteration,
  maxIterations,
  policySignal = null,
  replanAfter = 3,
}) {
  // 1. Caller policy (Layer 3) — highest priority external override.
  if (policySignal === 'STOP_POLICY_REQUIRED') {
    return {
      signal: 'STOP_POLICY_REQUIRED',
      action: LOOP_ACTIONS.STOP_POLICY,
      reason: 'caller policy (cost cap / HITL label) requires stopping',
    };
  }

  // 2/3/5. River Review-derived signal (Layer 2 when a diff is supplied, else Layer 1).
  const signal = runsDiff
    ? deriveLoopSignalFromRunsDiff(runsDiff, artifact)
    : deriveLoopSignalFromArtifact(artifact);

  // Oscillation is a Layer-2 (runs diff) signal the gate block does not carry,
  // so it stays an override even in gate mode — a caller that only reads the
  // gate would otherwise loop forever on an oscillating fix.
  if (signal === 'STOP_OSCILLATED') {
    return {
      signal,
      action: LOOP_ACTIONS.STOP_ESCALATE,
      reason: 'oscillation detected — revise is re-introducing resolved findings',
    };
  }

  // Epic #1347 S4: when the artifact carries a `gate` block, it is the
  // authoritative signal (it composes the risk tiers with the loop signal).
  // Older artifacts without `gate` fall through to the loop-signal path below
  // (backward compatible).
  if (artifact?.gate && typeof artifact.gate === 'object') {
    const gateDecision = decideFromGate({
      gate: artifact.gate,
      signal,
      iteration,
      maxIterations,
    });
    if (gateDecision) return withReplanAdvice(gateDecision, iteration, replanAfter);
  }

  if (signal === 'ESCALATE_HUMAN') {
    return {
      signal,
      action: LOOP_ACTIONS.STOP_ESCALATE,
      reason: 'decision is human-review-required',
    };
  }

  if (signal === 'CONVERGED') {
    return {
      signal,
      action: LOOP_ACTIONS.STOP_CONVERGED,
      reason: 'no blocking findings and decision is auto-approve equivalent',
    };
  }

  // 4. We would revise (REVISE_REQUIRED or NO_SIGNAL) — apply the divergence guard.
  const limit = resolveIterationLimit(maxIterations);
  if (iteration >= limit) {
    return {
      signal: 'STOP_MAX_ITERATIONS',
      action: LOOP_ACTIONS.STOP_MAX_ITERATIONS,
      reason: `reached max iterations (${limit}) without converging`,
    };
  }

  return withReplanAdvice(\n    {\n      signal,\n      action: LOOP_ACTIONS.REVISE,\n      reason: 'blocking findings remain — revise and re-run',\n    },\n    iteration,\n    replanAfter\n  );
}

/**
 * Drive the generate → review → revise loop until a stop action is reached.
 *
 * The `review` callback abstracts "run River Review for this iteration". In
 * production it would shell out to `river run` and parse the artifact; in tests
 * it returns a fixed artifact (and optional runsDiff) so the loop is fully
 * deterministic with no LLM / IO.
 *
 * `review` and `policyFor` may be sync or async (returning a Promise): real
 * callers await `river run` subprocesses / LLM calls, so the driver awaits both.
 *
 * @param {object} params
 * @param {(ctx: {iteration: number, history: object[]}) => (({artifact: object, runsDiff?: object|null}) | Promise<{artifact: object, runsDiff?: object|null}>)} params.review
 *   Returns (or resolves to) the review result for the given iteration.
 * @param {number} [params.maxIterations=5] - Divergence guard.
 * @param {number} [params.replanAfter=3] - Caller-side replan advice threshold.\n * @param {(ctx: {iteration: number, history: object[], decision: object}) => (void | Promise<void>)} [params.onReplan]\n *   Optional caller hook. It may reassess a plan but never grants merge authority.\n * @param {(ctx: {iteration: number, history: object[]}) => ((string|null) | Promise<string|null>)} [params.policyFor]
 *   Returns (or resolves to) 'STOP_POLICY_REQUIRED' to force a policy stop, else null.
 * @returns {Promise<{signal: string, action: string, reason: string, iteration: number, history: object[]}>}
 */
export async function runReferenceLoop({\n  review,\n  maxIterations = 5,\n  replanAfter = 3,\n  policyFor = () => null,\n  onReplan = null,\n}) {
  const history = [];

  for (let iteration = 1; ; iteration++) {
    const { artifact, runsDiff = null } = await review({ iteration, history });
    history.push(artifact);

    const decision = decideLoopAction({
      artifact,
      runsDiff,
      iteration,
      maxIterations,
      policySignal: await policyFor({ iteration, history }),
      replanAfter,
    });

    if (decision.replanSuggested && typeof onReplan === 'function') {
      await onReplan({ iteration, history, decision });
    }

    if (decision.action !== LOOP_ACTIONS.REVISE) {
      return { ...decision, iteration, history };
    }
    // else: revise and continue to the next iteration.
  }
}
