/**
 * Offline, read-only evaluation for Sashiko-style self-dismissed concerns.
 *
 * This does NOT validate code evidence, run an agent, promote findings, or
 * influence Review Coverage, severity, a Gate, or merge authority. The oracle
 * is a human-frozen benchmark label, not an LLM claim.
 */
import { evaluateReviewerIndependence } from './reviewer-independence.mjs';

const TRUTH = new Set(['bug', 'not-bug']);
const CLAIM = new Set(['bug', 'not-bug', 'unresolved']);
const MAX_CASES = 100;

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasEvidenceReference(references) {
  return (
    Array.isArray(references) &&
    references.some(
      (ref) =>
        ref !== null &&
        typeof ref === 'object' &&
        nonEmptyString(ref.path) &&
        Number.isSafeInteger(ref.lineStart) &&
        ref.lineStart > 0
    )
  );
}

/**
 * Compare a second-pass bug *candidate* against a prior human oracle.
 * Logical run-id separation and syntactic citations are necessary but never
 * sufficient proof of independence or correctness. No claim becomes a finding.
 *
 * @param {{ cases: object[] }} input
 * @returns {{ records: object[], metrics: object, shadowOnly: true }}
 */
export function evaluateSelfDismissalShadow(input = {}) {
  const cases = input?.cases;
  if (!Array.isArray(cases)) {
    throw new TypeError('cases must be an array; missing evaluation is not a clean review');
  }
  if (cases.length > MAX_CASES) {
    throw new RangeError('cases exceeds the explicit limit of ' + MAX_CASES);
  }

  const seen = new Set();
  const records = cases.map((entry) => {
    if (!entry || typeof entry !== 'object' || !nonEmptyString(entry.id)) {
      throw new TypeError('each case needs a non-empty id');
    }
    if (seen.has(entry.id)) throw new TypeError('duplicate case id: ' + entry.id);
    seen.add(entry.id);
    if (entry.initialDisposition !== 'dismissed' || !TRUTH.has(entry.oracle)) {
      throw new TypeError('case ' + entry.id + ': expected a self-dismissal and frozen human oracle');
    }

    const check = evaluateReviewerIndependence({
      finderRunId: entry.finderRunId,
      verifierRunId: entry.verification?.verifierRunId,
    });
    const reasons = [];
    if (!entry.verification || !CLAIM.has(entry.verification.claim)) {
      reasons.push('verifier-result-unavailable');
    }
    if (
      !nonEmptyString(entry.subjectRevision) ||
      entry.subjectRevision !== entry.verification?.subjectRevision
    ) {
      reasons.push('revision-unverified-or-stale');
    }
    if (!check.independent) reasons.push('logical-independence-unverified');
    if (!hasEvidenceReference(entry.verification?.evidenceRefs)) {
      reasons.push('citation-missing');
    }

    // Only a structurally reviewable claim becomes a *candidate* for a human
    // evidence audit. It is never an accepted bug or an automatic Gate input.
    const auditCandidate = reasons.length === 0 && entry.verification.claim === 'bug';
    if (reasons.length === 0 && entry.verification.claim === 'unresolved') {
      reasons.push('verifier-unresolved');
    }
    return {
      id: entry.id,
      oracle: entry.oracle,
      auditCandidate,
      requiresHumanEvidenceAudit: true,
      logicalIndependence: check.status,
      reasonCodes: reasons,
    };
  });

  const bugCases = records.filter((record) => record.oracle === 'bug');
  const notBugCases = records.filter((record) => record.oracle === 'not-bug');
  const recoveredBugCandidates = bugCases.filter((record) => record.auditCandidate).length;
  const falseAlarmCandidates = notBugCases.filter((record) => record.auditCandidate).length;
  return {
    shadowOnly: true,
    records,
    metrics: {
      cases: records.length,
      knownDismissedBugs: bugCases.length,
      knownDismissedNonBugs: notBugCases.length,
      recoveredBugCandidates,
      missedBugCandidates: bugCases.length - recoveredBugCandidates,
      falseAlarmCandidates,
      candidateRecall: bugCases.length === 0 ? null : recoveredBugCandidates / bugCases.length,
      candidateFalseAlarmRate:
        notBugCases.length === 0 ? null : falseAlarmCandidates / notBugCases.length,
    },
  };
}
