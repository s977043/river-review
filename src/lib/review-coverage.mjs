import { shouldExclude } from './utils.mjs';

/**
 * Review execution coverage contract (#2212).
 *
 * Coverage answers whether the review work that was expected to run actually
 * completed. It is deliberately independent from finding count, skill routing,
 * context supply, and gate policy.
 */

export const REVIEW_UNIT_STATUSES = Object.freeze(['completed', 'failed', 'timed_out']);
export const REVIEW_COVERAGE_STATUSES = Object.freeze(['complete', 'partial', 'not_executed']);

function isCompleted(unit) {
  return unit?.status === 'completed';
}

function normalizeRequired(unit) {
  // Fail-safe default: an execution unit is required unless policy explicitly
  // marks it optional. Materialize the default in the returned unit as well so
  // the derived coverage object conforms to review-coverage.schema.json.
  return { ...unit, required: unit?.required !== false };
}

function isRequired(unit) {
  return unit?.required === true;
}

/**
 * Derive machine-readable review execution coverage from already-planned units.
 *
 * This function is intentionally pure and has no gate side effects. Runtime
 * wiring in reviewer-orchestrator is a separate step so observe-only telemetry
 * can land before any policy change.
 *
 * @param {Array<object>} units planned/executed review units
 * @returns {{
 *   schemaVersion: '1',
 *   status: 'complete'|'partial'|'not_executed',
 *   expectedUnits: number,
 *   completedUnits: number,
 *   requiredUnits: number,
 *   completedRequiredUnits: number,
 *   incompleteRequiredUnitIds: string[],
 *   units: Array<object>
 * }}
 */
export function deriveReviewCoverage(units = []) {
  const normalizedUnits = Array.isArray(units)
    ? units.filter(Boolean).map((unit) => normalizeRequired(unit))
    : [];
  const expectedUnits = normalizedUnits.length;
  const completedUnits = normalizedUnits.filter(isCompleted).length;
  const required = normalizedUnits.filter(isRequired);
  const requiredUnits = required.length;
  const completedRequiredUnits = required.filter(isCompleted).length;
  const incompleteRequiredUnitIds = required
    .filter((unit) => !isCompleted(unit))
    .map((unit) => unit.id)
    .filter((id) => typeof id === 'string' && id.length > 0);

  let status;
  if (expectedUnits === 0) {
    status = 'not_executed';
  } else if (requiredUnits === 0) {
    // Defensive path for future policies that may make every unit optional.
    status =
      completedUnits === expectedUnits
        ? 'complete'
        : completedUnits > 0
          ? 'partial'
          : 'not_executed';
  } else if (completedRequiredUnits === requiredUnits) {
    status = 'complete';
  } else if (completedRequiredUnits === 0) {
    status = 'not_executed';
  } else {
    status = 'partial';
  }

  return {
    schemaVersion: '1',
    status,
    expectedUnits,
    completedUnits,
    requiredUnits,
    completedRequiredUnits,
    incompleteRequiredUnitIds,
    units: normalizedUnits,
  };
}

/**
 * Classify how one generateReview call used the LLM (#2423).
 *
 * The single source for "was the LLM attempted, and did it fail". Both the
 * Review Coverage derivations (single-reviewer and reviewer orchestration) and
 * the Markdown "LLM semantic review incomplete" header import this.
 *
 * - `llmUsed === true` => 'completed' (a partial-batch warning in llmError does
 *   not demote it: usable semantic output was produced)
 * - `llmUsed === false` with a skip reason in `llmSkipped` => null (intentional
 *   skip: dry-run, offline, missing key, unsupported provider)
 * - `llmUsed === false` without a skip reason => 'failed' (transport /
 *   response / parse failure). generateReview sets `llmSkipped` only on the
 *   branch that does not call the LLM, so this does not depend on how
 *   llmError is worded — an empty or missing message is still a failure
 * - `llmUsed` not a boolean => null (not a generateReview debug)
 *
 * @param {object|null|undefined} debug generateReview debug
 * @returns {'completed'|'failed'|null}
 */
export function classifyLlmAttempt(debug) {
  if (debug?.llmUsed === true) return 'completed';
  if (debug?.llmUsed !== false) return null;
  const skipped = typeof debug.llmSkipped === 'string' && debug.llmSkipped.trim().length > 0;
  return skipped ? null : 'failed';
}

/**
 * Build Review Coverage for the legacy single-reviewer LLM path.
 *
 * The observation exists only when an LLM call was actually attempted:
 * - successful response (including valid NO_ISSUES) => completed
 * - transport / response / parse failure => failed
 * - intentional skip (dry-run, offline, missing key) => no coverage observation
 *
 * llmError can also accompany a successful partial finding batch. llmUsed
 * wins in that case because execution completed and usable semantic output was
 * produced; Review Coverage measures execution completeness, not finding quality.
 *
 * @param {object} params
 * @param {object|null|undefined} params.debug generateReview debug
 * @param {string[]} [params.subjects] paths in the LLM-facing file scope
 * @param {number} [params.findingsCount] final finding count
 * @returns {ReturnType<typeof deriveReviewCoverage>|null}
 */
export function deriveSingleReviewerLlmCoverage({ debug, subjects = [], findingsCount = 0 } = {}) {
  const status = classifyLlmAttempt(debug);
  if (status === null) return null;

  const normalizedSubjects = [
    ...new Set(
      (Array.isArray(subjects) ? subjects : []).filter(
        (subject) => typeof subject === 'string' && subject.length > 0
      )
    ),
  ];

  return deriveReviewCoverage([
    {
      id: 'reviewer:single/chunk:1',
      kind: 'diff-chunk',
      subjects: normalizedSubjects.length > 0 ? normalizedSubjects : ['<unknown-diff>'],
      reviewerRole: 'single-reviewer',
      required: true,
      status,
      reasonCode: status === 'completed' ? null : 'reviewer_error',
      findingsCount:
        status === 'completed' && Number.isInteger(findingsCount) && findingsCount >= 0
          ? findingsCount
          : 0,
    },
  ]);
}

/**
 * Map a `reviewCoverage` object onto the four-state coverage vocabulary
 * (`complete` | `partial` | `not_executed` | `unknown`).
 *
 * Anything that is not one of the three `REVIEW_COVERAGE_STATUSES` values —
 * including a missing object — is `unknown`, so a caller that supplies nothing
 * is never reported as having complete coverage.
 *
 * Single derivation for every consumer that has to qualify a claim by how much
 * of the review actually ran (`review-differ.mjs` resolution basis,
 * `loop-signal.mjs` signal qualification).
 *
 * @param {object|null|undefined} coverage
 * @returns {'complete'|'partial'|'not_executed'|'unknown'}
 */
export function normalizeCoverageStatus(coverage) {
  const status = coverage?.status;
  if (!REVIEW_COVERAGE_STATUSES.includes(status)) return 'unknown';
  // Cross-check the label against the counts it summarizes.
  // `deriveReviewCoverage` keeps the two consistent, but a run record written
  // by an older build (or hand-edited) can carry `complete` next to counts
  // that say otherwise. Believing the label alone would re-open exactly the
  // over-claim this module is closing, so an inconsistent record is demoted
  // rather than trusted.
  if (status === 'complete') {
    const { requiredUnits, completedRequiredUnits } = coverage;
    if (
      Number.isFinite(requiredUnits) &&
      Number.isFinite(completedRequiredUnits) &&
      completedRequiredUnits < requiredUnits
    ) {
      return completedRequiredUnits > 0 ? 'partial' : 'not_executed';
    }
  }
  return status;
}

/**
 * True when a run's coverage says review work that was expected to run did not
 * finish (`partial` or `not_executed`).
 *
 * Single derivation of the "this observation is not safe to act on" set, shared
 * by every consumer that has to discount a claim a partial run produced:
 * `loop-signal.mjs` (`CONVERGED` demotion, #2331) and `review-differ.mjs`
 * (absence-based oscillation detection, #2336).
 *
 * `unknown` is deliberately NOT incomplete. A record with no `reviewCoverage`
 * — the shape of every run written before Review Coverage was wired — would
 * otherwise make both `CONVERGED` and oscillation detection unreachable for
 * those callers. Absence of the observation is not an observation of
 * incompleteness.
 *
 * @param {object|null|undefined} coverage  A run's `reviewCoverage` object.
 * @returns {boolean}
 */
export function isIncompleteCoverage(coverage) {
  return isIncompleteCoverageStatus(normalizeCoverageStatus(coverage));
}

/**
 * `isIncompleteCoverage` for callers that already hold a normalized status
 * (e.g. the per-run status on a `runs diff` oscillation timeline), so the
 * `partial` / `not_executed` set is written down exactly once.
 *
 * @param {'complete'|'partial'|'not_executed'|'unknown'} status
 * @returns {boolean}
 */
export function isIncompleteCoverageStatus(status) {
  return status === 'partial' || status === 'not_executed';
}

function uniquePaths(paths = []) {
  const seen = new Set();
  const result = [];
  for (const filePath of Array.isArray(paths) ? paths : []) {
    if (typeof filePath !== 'string' || !filePath || seen.has(filePath)) continue;
    seen.add(filePath);
    result.push(filePath);
  }
  return result;
}

/**
 * Build the observe-only file-selection ledger for Review Coverage (#2212 Slice C).
 *
 * `rawDiff` is the repository diff before `config.exclude.files`; `filteredDiff`
 * is the exact diff handed to planning/reviewer execution after configured
 * exclusions. `filesForReview` already reflects the LLM diff optimizer, so the
 * difference lets us record why a changed path did not become a Review Unit
 * subject without changing optimizer behavior or inventing file-level execution
 * semantics.
 */
export function deriveReviewFileScope(rawDiff = {}, filteredDiff = {}, patterns = []) {
  const rawChanged = uniquePaths(rawDiff?.changedFiles ?? []);
  const selectedCandidates = uniquePaths(
    (filteredDiff?.filesForReview ?? filteredDiff?.files ?? [])
      .map((file) => file?.path)
      .filter(Boolean)
  );
  const selectedSet = new Set(selectedCandidates);
  const rawSet = new Set(rawChanged);
  const selected = rawChanged.length
    ? rawChanged.filter((filePath) => selectedSet.has(filePath))
    : selectedCandidates;

  // A selected path not present in changedFiles can occur only on synthetic
  // programmatic input. Keep it rather than silently losing caller-provided
  // scope while preserving raw changed-file order for normal repository runs.
  for (const filePath of selectedCandidates) {
    if (!rawSet.has(filePath) && !selected.includes(filePath)) selected.push(filePath);
  }

  const excluded = rawChanged
    .filter((filePath) => !selectedSet.has(filePath))
    .map((filePath) => ({
      path: filePath,
      reasonCode: shouldExclude(filePath, patterns) ? 'configured_exclusion' : 'diff_optimization',
    }));

  return { selected, excluded };
}

/**
 * Attach the file-selection ledger (#2212 Slice C) to an orchestration-derived
 * Review Coverage object.
 *
 * Counters / status / units are never recomputed here: this only enriches an
 * existing observation. Callers without a ledger keep the exact pre-Slice-C
 * coverage object (or `null` when there is none at all).
 */
export function attachReviewFileScope(coverage, fileScope) {
  if (coverage && fileScope) return { ...coverage, fileScope };
  return coverage ?? null;
}
