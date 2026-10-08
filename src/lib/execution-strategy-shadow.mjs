/**
 * #2564 Phase 3: deterministic, observe-only Host execution-strategy advice.
 *
 * This is NOT reviewer/Skill routing, an execution engine, a permission gate,
 * or a measurement ledger. No candidate-generation model is invoked here.
 * Only Host/provider evidence can establish the actual strategy or cost.
 */

const STRATEGIES = new Set(['single', 'cascade', 'critique']);
const RISK_ACTIONS = new Set(['comment_only', 'escalate', 'require_human_review']);

function nonnegativeNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function observedConcernCount(reviewConcernMap) {
  if (
    reviewConcernMap?.kind !== 'review-concern-map' ||
    reviewConcernMap?.schemaVersion !== '1' ||
    !Array.isArray(reviewConcernMap.concerns) ||
    !['completed', 'partial'].includes(reviewConcernMap.analysis?.status)
  ) {
    return null;
  }
  return reviewConcernMap.concerns.length;
}

function normalizeStrategy(value) {
  return typeof value === 'string' && STRATEGIES.has(value) ? value : null;
}

/**
 * @param {object} input
 * @param {string[]} [input.changedFiles] Current planned diff files (not source text).
 * @param {number|null} [input.tokenEstimate] Existing diff estimate; not billed tokens.
 * @param {object|null} [input.riskAssessment] Existing deterministic risk map outcome.
 * @param {object|null} [input.reviewConcernMap] Optional semantic evidence, never a command.
 * @param {object|null} [input.reviewSignals] Host planning hints (unverified).
 * @param {object|null} [input.hostBudget] Explicit Host constraints, when supplied.
 * @param {string|null} [input.actualStrategy] Host-declared only, never inferred.
 * @param {string|null} [input.actualStrategySource] Must be host-execution-log.
 * @returns {object} Non-authoritative observation; has no effect on execution.
 */
export function buildExecutionStrategyShadowObservation({
  changedFiles,
  tokenEstimate = null,
  riskAssessment = null,
  reviewConcernMap = null,
  reviewSignals = null,
  hostBudget = null,
  actualStrategy = null,
  actualStrategySource = null,
} = {}) {
  const fileCount = Array.isArray(changedFiles) ? changedFiles.length : null;
  const estimatedDiffTokens = nonnegativeNumber(tokenEstimate);
  const riskAction = RISK_ACTIONS.has(riskAssessment?.aggregateAction)
    ? riskAssessment.aggregateAction
    : null;
  const concernCount = observedConcernCount(reviewConcernMap);
  const concernStatus = ['completed', 'partial', 'failed'].includes(
    reviewConcernMap?.analysis?.status
  )
    ? reviewConcernMap.analysis.status
    : null;
  const independentReviewRequired =
    typeof reviewSignals?.independentReviewRequired === 'boolean'
      ? reviewSignals.independentReviewRequired
      : null;
  const uncertaintyHigh =
    reviewSignals?.uncertainty === 'high' || concernStatus === 'partial'
      ? true
      : reviewSignals?.uncertainty === 'low' && concernStatus !== 'partial'
        ? false
        : null;
  const budgetUsd = nonnegativeNumber(hostBudget?.maxCostUsd);
  const latencyBudgetMs = nonnegativeNumber(hostBudget?.maxLatencyMs);

  let recommendedStrategy = null;
  const reasons = [];
  if (riskAction === 'require_human_review') {
    reasons.push('human-risk-boundary');
  } else if (independentReviewRequired === true || riskAction === 'escalate') {
    recommendedStrategy = 'critique';
    reasons.push(
      independentReviewRequired === true ? 'explicit-independence-need' : 'risk-escalation'
    );
  } else if (concernCount !== null && concernCount >= 3) {
    recommendedStrategy = 'critique';
    reasons.push('multiple-observed-concerns');
  } else if (
    uncertaintyHigh === true ||
    (fileCount !== null && fileCount >= 5) ||
    (estimatedDiffTokens !== null && estimatedDiffTokens >= 8000)
  ) {
    recommendedStrategy = 'cascade';
    reasons.push('complexity-or-uncertainty');
  } else if (fileCount !== null && fileCount > 0 && riskAction === 'comment_only') {
    recommendedStrategy = 'single';
    reasons.push('limited-diff-with-comment-only-risk');
  } else {
    reasons.push('insufficient-execution-evidence');
  }

  // Neither a proposed strategy nor known cost/latency constraints proves
  // the execution graph, provider availability, isolation, or budget feasibility.
  const actual =
    actualStrategySource === 'host-execution-log' ? normalizeStrategy(actualStrategy) : null;
  return {
    kind: 'execution-strategy-shadow-observation',
    schemaVersion: '1',
    heuristicVersion: 'exploratory-v0',
    status: recommendedStrategy ? 'provisional' : 'no-recommendation',
    recommendedStrategy,
    actualStrategy: actual,
    actualStrategyEvidence:
      actual === null ? null : { source: 'host-execution-log', trust: 'unverified' },
    comparison:
      actual !== null && recommendedStrategy !== null
        ? { matches: actual === recommendedStrategy, evidenceStatus: 'exploratory' }
        : null,
    recommendationApplied: false,
    humanReviewRequired: riskAction === 'require_human_review',
    reasons,
    signals: {
      changedFileCount: fileCount,
      estimatedDiffTokens,
      riskAction,
      concernCount,
      concernStatus,
      independentReviewRequired,
      uncertaintyHigh,
      maxCostUsd: budgetUsd,
      maxLatencyMs: latencyBudgetMs,
    },
    limitations: [
      'host-strategy-routing-not-connected',
      'provider-attempt-accounting-not-measured',
      'strategy-budget-and-isolation-not-validated',
      ...(actual === null
        ? ['actual-host-strategy-unobserved']
        : ['host-actual-strategy-not-independently-verified']),
      ...(riskAction === null ? ['risk-not-classified'] : []),
      ...(budgetUsd === null ? ['cost-budget-unknown'] : []),
      ...(latencyBudgetMs === null ? ['latency-budget-unknown'] : []),
    ],
  };
}
