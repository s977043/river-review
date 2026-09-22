/**
 * Loop-signal derivation (Epic #1171 item3).
 *
 * River Review emits two layers of loop signals:
 *
 * Layer 1 — single `river run` artifact:
 *   NO_SIGNAL | REVISE_REQUIRED | CONVERGED | ESCALATE_HUMAN
 *
 * Layer 2 — `runs diff` (3+ runs, oscillation detectable):
 *   adds STOP_OSCILLATED
 *
 * Layer 3 (STOP_MAX_ITERATIONS | STOP_POLICY_REQUIRED) is caller-synthesized.
 * River Review deliberately does NOT emit those values.
 *
 * All functions are pure — no side effects, no AI calls, no file I/O.
 */

import { isIncompleteCoverage } from './review-coverage.mjs';

/** @typedef {'NO_SIGNAL' | 'REVISE_REQUIRED' | 'CONVERGED' | 'ESCALATE_HUMAN'} ArtifactSignal */
/** @typedef {ArtifactSignal | 'STOP_OSCILLATED'} RunsDiffSignal */

/**
 * Derive the loop signal for a single review artifact (Layer 1).
 *
 * Rules (evaluated in order):
 * 1. decision === 'human-review-required'  → ESCALATE_HUMAN
 * 2. blocking findings (critical or major)  → REVISE_REQUIRED
 * 3. no blocking findings + decision is auto-approve equivalent → CONVERGED
 * 4. otherwise                              → NO_SIGNAL
 *
 * "auto-approve equivalent" covers 'auto-approve', 'approve', and 'approved'
 * to be forward-compatible with any future verdict alias.
 *
 * @param {object} artifact  A Review Artifact (schema version "1")
 * @returns {ArtifactSignal}
 */
export function deriveLoopSignalFromArtifact(artifact) {
  const decision = artifact?.decision;

  if (decision === 'human-review-required') {
    return 'ESCALATE_HUMAN';
  }

  const rawFindings = artifact?.findings;
  const findings = Array.isArray(rawFindings) ? rawFindings : [];
  const blockingCount = findings.filter(
    (f) => f != null && (f.severity === 'critical' || f.severity === 'major')
  ).length;

  if (blockingCount > 0) {
    return 'REVISE_REQUIRED';
  }

  const AUTO_APPROVE = new Set(['auto-approve', 'approve', 'approved']);
  if (decision !== undefined && AUTO_APPROVE.has(decision)) {
    return 'CONVERGED';
  }

  return 'NO_SIGNAL';
}

/**
 * Derive the loop signal for a `runs diff` result (Layer 2).
 *
 * When `diff.oscillated` is non-empty, oscillation takes priority and returns
 * STOP_OSCILLATED regardless of finding severity — the fix loop is spinning
 * and human triage is needed. Whether an entry belongs in `diff.oscillated` at
 * all is decided upstream, in `_hasOscillation` (`review-differ.mjs`), which
 * ignores absences produced by a run that did not finish (#2336) — see
 * `qualifyLoopSignalForCoverage` for why that test cannot live here.
 *
 * The derived signal is then qualified by the latest run's `reviewCoverage`
 * (see `qualifyLoopSignalForCoverage`): a run that did not complete its planned
 * review work cannot report CONVERGED.
 *
 * Otherwise, derives from the latest run's artifact:
 * 1. `latestArtifact` parameter (explicit, preferred for 2-run and multi-run CLI paths)
 * 2. `diff.runs[last].artifact` or `diff.runs[last]` (embedded in diff object)
 * Falls back to NO_SIGNAL when neither is available.
 *
 * @param {object} diff  Output of diffRunHistory / diffReviews
 * @param {object|null} [latestArtifact]  Latest run's artifact (findings + decision).
 *   Pass the latest run record directly when the diff object does not embed it.
 * @returns {RunsDiffSignal}
 */
export function deriveLoopSignalFromRunsDiff(diff, latestArtifact) {
  if (Array.isArray(diff?.oscillated) && diff.oscillated.length > 0) {
    return 'STOP_OSCILLATED';
  }

  // Prefer the explicitly passed latest artifact.
  if (latestArtifact != null && typeof latestArtifact === 'object') {
    return qualifyLoopSignalForCoverage(
      deriveLoopSignalFromArtifact(latestArtifact),
      latestArtifact.reviewCoverage
    );
  }

  // Fall back to runs[] embedded in diff (for callers that populate it).
  const runs = diff?.runs;
  if (Array.isArray(runs) && runs.length > 0) {
    const latest = runs[runs.length - 1];
    const embedded = latest?.artifact ?? latest;
    if (embedded && typeof embedded === 'object') {
      return qualifyLoopSignalForCoverage(
        deriveLoopSignalFromArtifact(embedded),
        embedded.reviewCoverage ?? latest?.reviewCoverage
      );
    }
  }

  return 'NO_SIGNAL';
}

/**
 * Demote `CONVERGED` to `NO_SIGNAL` when the run it was derived from did not
 * finish the review work it planned (#2331).
 *
 * `deriveLoopSignalFromArtifact` reads only `decision` and finding severities,
 * so a run whose reviewers timed out looks byte-identical to a clean run: zero
 * blocking findings plus an auto-approve decision. `CONVERGED` is the signal a
 * caller stops iterating on, so emitting it there stops the loop on the
 * strength of a review that never ran to completion — the layer inconsistency
 * `docs/adr/011-review-resolution-loop.md` names.
 *
 * Only `CONVERGED` is qualified here. `ESCALATE_HUMAN`, `REVISE_REQUIRED` and
 * `NO_SIGNAL` already point away from "stop and accept", so incomplete
 * coverage cannot make any of them less safe.
 *
 * `STOP_OSCILLATED` is the one signal that breaks that reasoning: it does point
 * at stopping, and a partial run can manufacture it (#2336). It is still not
 * qualified *here*, because this function only ever sees the coverage of the
 * run the signal was derived from — the latest one — and that is the wrong
 * observable for oscillation. In a present→absent→present timeline the latest
 * run is a run where the finding is *present*; the absence that has to be
 * doubted sits in an earlier run. Qualifying on the latest run's coverage would
 * therefore miss the false oscillation it is aimed at (latest complete, middle
 * partial) and suppress genuine ones (latest partial, middle complete).
 * The absence is instead discounted where the per-run timeline exists, in
 * `_hasOscillation` (`review-differ.mjs`), using the same
 * `isIncompleteCoverage` derivation this function uses.
 *
 * `unknown` coverage (no `reviewCoverage` on the record — the shape every run
 * written before Review Coverage was wired still has) is deliberately NOT
 * demoted: doing so would make `CONVERGED` unreachable for those callers and
 * silently convert a working loop into one that never terminates. Absence of
 * the observation is not an observation of incompleteness.
 *
 * @param {string} signal  A signal from `deriveLoopSignalFromArtifact`.
 * @param {object|null|undefined} coverage  The run's `reviewCoverage` object.
 * @returns {string} The qualified signal.
 */
export function qualifyLoopSignalForCoverage(signal, coverage) {
  if (signal !== 'CONVERGED') return signal;
  if (isIncompleteCoverage(coverage)) return 'NO_SIGNAL';
  return signal;
}
