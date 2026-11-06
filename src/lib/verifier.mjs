/**
 * Verify individual review findings before emission.
 *
 * Rule-based checks only (no LLM calls). Returns verification result
 * with per-check details. Rejected findings should be logged but not emitted.
 */

import {
  DEFAULT_FINDING_SCOPE,
  extractRefFieldSpans,
  matchSelfReportedScope,
  normalizeScope,
  normalizeSeverity,
  stripTraceabilityRefs,
  SEVERITY_RANK,
} from './finding-factory.mjs';

// Module-scope regexes to avoid re-creation per call
const RE_EVIDENCE = /Evidence:\s*(\S.{4,})/;
const RE_SEVERITY = /Severity:\s*(\w+)/;
// The `Scope:` label grammar lives in finding-factory.mjs
// (`matchSelfReportedScope`): it is value-constrained so that prose containing
// the word "Scope:" (OAuth / IAM scopes are common in review text) cannot be
// mistaken for a self-report, and the strip performed on the output surfaces
// (`stripSelfReportedScope`) must target exactly the labels read here.
const RE_ACTIONABLE = /(?:Fix|Suggestion):\s*(.{10,})/;
const RE_FILE_REF = /[\w/-]+(?:\.[\w]+)+/g;
// Same shape as RE_FILE_REF but only where an anchor fragment follows
// (`plan.md#AC-4`). Used to exempt artifact citations from the diff check.
const RE_ANCHORED_FILE_REF = /[\w/-]+(?:\.[\w]+)+(?=#)/g;

/**
 * Check that the finding message contains "Evidence:" followed by
 * at least 5 non-whitespace characters of content.
 * @param {{ message?: string }} finding
 * @returns {boolean}
 */
function checkEvidenceExists(finding) {
  const text = String(finding?.message ?? '');
  const match = RE_EVIDENCE.exec(text);
  return match !== null;
}

/**
 * Check that the finding's phase matches the skill's declared phase.
 * The skill phase may be a single phase or an array of phases.
 * Lenient: returns true when either side is missing phase information.
 * @param {{ phase?: string }} finding
 * @param {{ metadata?: { phase?: string | string[] } }} skill
 * @returns {boolean}
 */
function checkPhaseCoherent(finding, skill) {
  const findingPhase = finding?.phase;
  const skillPhase = skill?.metadata?.phase;
  if (!findingPhase || !skillPhase) return true;
  return Array.isArray(skillPhase)
    ? skillPhase.includes(findingPhase)
    : findingPhase === skillPhase;
}

/**
 * Check that the finding severity does not exceed the skill's declared
 * severity level. Uses the internal vocabulary mapping from review-core.md.
 * Lenient: returns true when severity cannot be determined from either side.
 * @param {{ message?: string }} finding
 * @param {{ metadata?: { severity?: string } }} skill
 * @returns {boolean}
 */
function checkSeverityJustified(finding, skill) {
  const text = String(finding?.message ?? '');
  const sevMatch = RE_SEVERITY.exec(text);
  if (!sevMatch) return true;

  const skillSeverity = skill?.metadata?.severity;
  if (!skillSeverity) return true;

  const findingNormalized = normalizeSeverity(sevMatch[1]);
  const skillNormalized = normalizeSeverity(skillSeverity);

  const findingRank = SEVERITY_RANK[findingNormalized] ?? SEVERITY_RANK.major;
  const skillRank = SEVERITY_RANK[skillNormalized] ?? SEVERITY_RANK.major;

  return findingRank <= skillRank;
}

/**
 * Check that the finding message contains "Fix:" or "Suggestion:" followed
 * by at least 10 characters of actionable content.
 * @param {{ message?: string }} finding
 * @returns {boolean}
 */
function checkSuggestionActionable(finding) {
  const text = String(finding?.message ?? '');
  const match = RE_ACTIONABLE.exec(text);
  return match !== null;
}

/**
 * Check that file names referenced in the Evidence text actually appear
 * in the diff. Lenient: returns true when no file references are found
 * in the evidence (to avoid false negatives on prose-only evidence).
 * @param {{ message?: string }} finding
 * @param {string} diffText
 * @returns {boolean}
 */
function checkEvidenceInDiff(finding, diffText) {
  const text = String(finding?.message ?? '');
  const evidenceMatch = RE_EVIDENCE.exec(text);
  if (!evidenceMatch) return true;

  const evidenceText = evidenceMatch[1];
  const fileRefs = evidenceText.match(RE_FILE_REF);
  if (!fileRefs || fileRefs.length === 0) return true;

  // #1666: subtract, never delete. Running this check on a ref-stripped message
  // let a reviewer launder a hallucinated evidence path by labelling it
  // (`Evidence: the secret is in ArtifactRefs: src/fake.mjs …` deleted the path
  // and the check then passed). Instead, keep the raw text and exempt only the
  // file references that are unambiguously artifact citations: those written
  // WITH an anchor fragment (`plan.md#AC-4`) inside a refs field. Such an
  // artifact is by design absent from the diff. A BARE path inside a refs field
  // stays checkable — it is indistinguishable from an evidence claim, so it
  // fails closed.
  const exempt = new Set(
    extractRefFieldSpans(text).flatMap((span) => span.match(RE_ANCHORED_FILE_REF) ?? [])
  );
  const checkable = exempt.size === 0 ? fileRefs : fileRefs.filter((ref) => !exempt.has(ref));
  // Nothing left to verify reads the same as "the evidence cites no file" —
  // lenient, matching the early return above.
  if (checkable.length === 0) return true;

  const diff = String(diffText ?? '');
  return checkable.some((ref) => diff.includes(ref));
}

/**
 * Expected phase(s) for each file type category from file-classifier.
 * Lenient: categories not listed here are not checked.
 */
const FILE_TYPE_PHASE_MAP = {
  test: ['downstream'],
  docs: ['upstream', 'midstream'],
  schema: ['upstream', 'midstream'],
  migration: ['upstream', 'midstream'],
};

/**
 * Check that the finding's file category is coherent with the finding's phase.
 * Uses file-classifier output to map file → category → expected phases.
 * Lenient: returns true when information is insufficient.
 * @param {{ file?: string, phase?: string }} finding
 * @param {Record<string, string[]> | null | undefined} fileTypes
 * @returns {boolean}
 */
function checkFilePhaseCoherent(finding, fileTypes) {
  if (!fileTypes || !finding?.file || !finding?.phase) return true;
  const fileCategory = Object.entries(fileTypes).find(([, files]) =>
    files.includes(finding.file)
  )?.[0];
  if (!fileCategory) return true;
  const expectedPhases = FILE_TYPE_PHASE_MAP[fileCategory];
  if (!expectedPhases) return true;
  return expectedPhases.includes(finding.phase);
}

/**
 * Tolerance (in lines) when matching a finding line against the diff's added
 * lines.
 *
 * Deliberately 0: `addedLines` is ground truth for "this diff changed this
 * line", and a unified diff surrounds every hunk with context lines (-U3 by
 * default). Any non-zero window bleeds into those context lines and reports
 * unchanged code as `in-diff`, which breaks the adopted contract that context
 * lines are `pre-existing`. Do not widen this without re-deriving the contract
 * (a widened window is measurable: see tests/verifier.test.mjs, which asserts
 * context-line scope against real parseUnifiedDiff output).
 */
const SCOPE_LINE_TOLERANCE = 0;

/**
 * Locate the parsed-diff entry for a finding's file.
 * Accepts an exact path match first, then an unambiguous suffix match so that
 * findings reported with a repo-relative path still match a prefixed diff path.
 * An ambiguous suffix match (2+ candidates) returns null so that the caller
 * fails safe rather than guessing a file.
 * @param {string} file
 * @param {Array<{ path?: string, newPath?: string, addedLines?: number[] }>} diffFiles
 * @returns {{ path?: string, newPath?: string, addedLines?: number[] } | null}
 */
function findDiffFileEntry(file, diffFiles) {
  const target = String(file ?? '');
  if (!target) return null;
  const candidates = (entry) => [entry?.path, entry?.newPath].filter(Boolean).map(String);
  const exact = diffFiles.find((entry) => candidates(entry).includes(target));
  if (exact) return exact;
  const suffixMatches = diffFiles.filter((entry) =>
    candidates(entry).some((p) => p.endsWith(`/${target}`) || target.endsWith(`/${p}`))
  );
  return suffixMatches.length === 1 ? suffixMatches[0] : null;
}

/**
 * Machine determination of a finding's scope by matching its line range against
 * the added lines of the parsed diff (#1644 Phase 1, option B).
 *
 * Returns `null` when the diff cannot decide (no parsed diff, file not present
 * or ambiguous in the diff, or the finding carries no usable line number).
 * Callers fall back to the LLM self-report and then to the fail-safe default.
 *
 * Context lines (unified ±3) are deliberately treated as `pre-existing`: they
 * are not changed lines. A range finding (`lineEnd`) is `in-diff` when the
 * range intersects any added line.
 *
 * @param {{ file?: string, line?: number|null, lineStart?: number|null, lineEnd?: number|null }} finding
 * @param {Array<object>|null|undefined} diffFiles parsed diff files (diff-processor parseUnifiedDiff)
 * @returns {'in-diff'|'pre-existing'|null}
 */
export function determineScopeFromDiff(finding, diffFiles) {
  if (!Array.isArray(diffFiles) || diffFiles.length === 0) return null;
  const entry = findDiffFileEntry(finding?.file, diffFiles);
  if (!entry) return null;

  const isUsableLine = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 1;

  const start = finding?.line ?? finding?.lineStart ?? null;
  if (!isUsableLine(start)) return null;
  const end = isUsableLine(finding?.lineEnd) && finding.lineEnd >= start ? finding.lineEnd : start;

  const addedLines = Array.isArray(entry.addedLines) ? entry.addedLines : [];
  if (addedLines.length === 0) return null;

  const lower = start - SCOPE_LINE_TOLERANCE;
  const upper = end + SCOPE_LINE_TOLERANCE;
  const isAdded = addedLines.some((added) => added >= lower && added <= upper);
  return isAdded ? 'in-diff' : 'pre-existing';
}

/**
 * Resolve the final scope of a finding by combining the machine determination
 * with the optional LLM self-report (`Scope:` label), per the adopted hybrid
 * (option C): machine wins, self-report fills the gap, default is fail-safe.
 *
 * @param {{ finding: object, diffFiles?: Array<object>|null }} params
 * @returns {{ scope: 'in-diff'|'pre-existing', source: 'machine'|'self-reported'|'default', selfReported: 'in-diff'|'pre-existing'|null, mismatch: boolean }}
 */
export function resolveFindingScope({ finding, diffFiles }) {
  const machineScope = determineScopeFromDiff(finding, diffFiles);
  // Value-constrained match: only an in-vocabulary token counts as a
  // self-report. An out-of-vocabulary label (`Scope: unknown`) must NOT be
  // normalized into `in-diff`, or it would both fabricate a self-report and
  // produce a spurious scopeMismatch against the machine verdict.
  const selfReportMatch = matchSelfReportedScope(finding?.message);
  const selfReported = selfReportMatch === null ? null : normalizeScope(selfReportMatch);

  if (machineScope) {
    return {
      scope: machineScope,
      source: 'machine',
      selfReported,
      mismatch: selfReported !== null && selfReported !== machineScope,
    };
  }
  if (selfReported) {
    return { scope: selfReported, source: 'self-reported', selfReported, mismatch: false };
  }
  return { scope: DEFAULT_FINDING_SCOPE, source: 'default', selfReported: null, mismatch: false };
}

/**
 * @param {{ finding: object, diff: string, skill: object, fileTypes?: object, diffFiles?: Array<object>|null, deterministicSource?: boolean }} params
 *   deterministicSource: the finding comes from a detector, so its severity and
 *   evidence are code constants rather than claims to check. Callers derive it
 *   from the batch's provenance, never from the finding text.
 * @returns {{ verified: boolean, reasons: string[], checks: object, scope: 'in-diff'|'pre-existing', scopeSource: string, scopeSelfReported: string|null, scopeMismatch: boolean }}
 */
export function verifyFinding({
  finding,
  diff,
  skill,
  fileTypes,
  diffFiles,
  deterministicSource = false,
}) {
  // #1666: traceability refs are additive metadata and MUST NOT move the
  // `verified` decision in either direction. RE_EVIDENCE / RE_ACTIONABLE are
  // deliberately greedy to end-of-line, so appended refs would otherwise satisfy
  // the minimum-length requirements on Evidence and Fix on their own. The
  // LENGTH checks therefore run against the ref-stripped message — removal only
  // makes them stricter. `checkEvidenceInDiff` is deliberately excluded: it
  // scans for file references, where deleting text is a bypass rather than a
  // safeguard, so it takes the raw message and subtracts instead.
  const findingForLengthChecks =
    typeof finding?.message === 'string'
      ? { ...finding, message: stripTraceabilityRefs(finding.message) }
      : finding;
  const checks = {
    evidenceExists: checkEvidenceExists(findingForLengthChecks),
    evidenceInDiff: deterministicSource || checkEvidenceInDiff(finding, diff),
    phaseCoherent: checkPhaseCoherent(finding, skill),
    filePhaseCoherent: checkFilePhaseCoherent(finding, fileTypes),
    severityJustified: deterministicSource || checkSeverityJustified(findingForLengthChecks, skill),
    suggestionActionable: checkSuggestionActionable(findingForLengthChecks),
  };

  const reasons = [];
  if (!checks.evidenceExists) reasons.push('No evidence provided in finding');
  if (!checks.evidenceInDiff) reasons.push('Evidence references file not found in diff');
  if (!checks.filePhaseCoherent) reasons.push('File type does not match finding phase');
  if (!checks.phaseCoherent) {
    const skillPhase = skill?.metadata?.phase;
    const skillPhaseLabel = Array.isArray(skillPhase) ? skillPhase.join('/') : skillPhase;
    reasons.push(`Phase mismatch: finding phase does not match skill phase "${skillPhaseLabel}"`);
  }
  if (!checks.severityJustified)
    reasons.push('Severity exceeds skill severity without justification');
  if (!checks.suggestionActionable) reasons.push('Fix/suggestion is missing or too brief');

  // Scope is metadata only (#1644 Phase 1): it never contributes a rejection
  // reason and never changes `verified`.
  const scopeResult = resolveFindingScope({ finding, diffFiles });

  return {
    verified: reasons.length === 0,
    reasons,
    checks,
    scope: scopeResult.scope,
    scopeSource: scopeResult.source,
    scopeSelfReported: scopeResult.selfReported,
    scopeMismatch: scopeResult.mismatch,
  };
}
