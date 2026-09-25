/**
 * Gate derivation for `river run` results (Epic #1347 S3 / #1350).
 *
 * Extracted from cli.mjs formatJsonOutput so the same derivation feeds both
 * the JSON output artifact and the persisted run record (result store) —
 * the audit trail must record the same gate the consumer saw.
 *
 * The `river run` path performs no plan-text human-approval scan, so
 * humanApprovalRequired is always false here (documented in
 * schemas/output.schema.json); riskMapDigest is likewise null on this path.
 */

import { scoreReview, resolveVerdict } from './scoring/engine.mjs';
import { deriveLoopSignalFromArtifact } from './loop-signal.mjs';
import {
  coverageIncompleteForGate,
  deriveGateDecision,
  llmNotExecutedForGate,
} from './gate-decision.mjs';

/**
 * True when reviewer-role orchestration ran but NOT ONE role produced a result
 * (every role failed or was cut off by the per-role timeout) — #1689 review B2.
 *
 * The orchestrator is fail-soft by design: a slow role is dropped and the run
 * continues on the survivors. With zero survivors there are no survivors to
 * continue on, so the run has an empty findings list for the same reason a
 * crashed reviewer would — "the review did not happen", not "the diff is
 * clean". Scoring cannot tell those apart (both are `findings: []`), so the
 * distinction has to come from `reviewerResults`.
 *
 * Returns false when orchestration did not run at all (`--reviewers` absent →
 * null/empty), leaving the single-reviewer path's behavior untouched.
 *
 * @param {Array<{status?: string}>|null|undefined} reviewerResults
 * @returns {boolean}
 */
export function noReviewerRoleSucceeded(reviewerResults) {
  if (!Array.isArray(reviewerResults) || reviewerResults.length === 0) return false;
  return !reviewerResults.some((r) => r?.status === 'fulfilled');
}

/**
 * Derive `{ decision, gate }` for a runLocalReview result. Both fields are
 * undefined on derivation failure (same fail-soft contract as
 * finalizeArtifact — the caller's output must never break on scoring).
 *
 * @param {object} result - runLocalReview result
 * @returns {{ decision: string|undefined, gate: object|undefined }}
 */
export function deriveRunGate(result) {
  // Defensive (PR #1372 gemini): a null/undefined result yields the same
  // fail-soft shape instead of throwing on property access.
  if (result == null || typeof result !== 'object') {
    return { decision: undefined, gate: undefined };
  }
  // #1689 review B2: an all-roles-failed run must not score as a clean review.
  // Computed once and applied to BOTH outputs — the verdict a human reads and
  // the gate a bot obeys have to agree, or one of them becomes a bypass.
  const reviewerRolesAllFailed = noReviewerRoleSucceeded(result.reviewerResults);

  let decision;
  if (reviewerRolesAllFailed) {
    // Zero executed reviewers over zero findings is a vacuous perfect score.
    // Force the conservative verdict instead of letting scoreReview() call it
    // `auto-approve`.
    decision = 'human-review-required';
  } else {
    try {
      decision = resolveVerdict(result.decision, scoreReview(result.findings ?? []).verdict);
    } catch {
      if (typeof result.decision === 'string' && result.decision.length > 0) {
        decision = result.decision;
      }
    }
  }

  let gate;
  try {
    const findings = result.findings ?? [];
    const riskAssessment = result.plan?.riskAssessment;
    const loopSignal = deriveLoopSignalFromArtifact({ decision, findings });
    gate = deriveGateDecision({
      loopSignal,
      decision,
      humanApprovalRequired: false,
      riskAction: riskAssessment?.aggregateAction,
      blockingFindings: findings.filter(
        (f) => f != null && (f.severity === 'critical' || f.severity === 'major')
      ).length,
      changedFiles: result.changedFiles ?? [],
      // #1689 review B2: reuse the existing rule 6b (`NOT_EXECUTED` → NO_GO)
      // cliff rather than inventing a second "review did not happen" concept —
      // a run where every reviewer role failed or timed out did not execute a
      // review, whatever the process exit status said.
      reviewExecuted: result.status === 'ok' && result.dryRun !== true && !reviewerRolesAllFailed,
      artifactStatus: result.status ?? null,
      riskMapPresent: riskAssessment != null,
      riskMapDigest: null,
      // Epic #1347 S4 (#1351): deterministic strict_block → unconditional NO_GO.
      strictBlock: result.strictBlock === true,
      // Epic #1347 §11.8 (c2) (#1401): deterministic gate could not run → rule 5c
      // ESCALATE. False unless the double-gated executor was opted in (§11.6).
      deterministicUnrunnable: result.deterministicUnrunnable === true,
      // #2337 (opt-in, default OFF): an execution that did not cover every
      // REQUIRED review unit is not a clean review. Reduced by the SSoT
      // predicate so this site and review-plan's gateContext cannot drift.
      coverageIncomplete: coverageIncompleteForGate(result.reviewCoverage, process.env),
      // #2441 (opt-in RIVER_GATE_REQUIRE_LLM=1, default OFF).
      llmNotExecuted: llmNotExecutedForGate(result.llmNotExecuted, process.env),
      config: result.config ?? {},
    });
  } catch {
    // leave gate unset on derivation failure
  }

  return { decision, gate };
}
