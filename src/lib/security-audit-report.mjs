/**
 * Structured security audit artifact set (#2267 Phase 9).
 *
 * The Epic pins the layout:
 *
 *   .river/security-audit/
 *     run-metadata.json
 *     architecture.md
 *     audit-coverage.json
 *     candidates.json
 *     findings.json
 *     REPORT.md
 *     NEEDS-VALIDATION.md
 *
 * and one rule that shapes this module: "machine-readable record を SSoT とし、
 * prose report から verdict / severity を再計算しない". So `buildSecurityAuditRunRecord`
 * produces the record, and every renderer below is a pure projection of it —
 * the renderers classify nothing, derive no severity, and emit no verdict of
 * their own. Anything a reader sees in REPORT.md must already exist as a field
 * in the JSON.
 *
 * Out of scope on purpose (Epic Non-goals): Gate behavior, blocking decisions,
 * relating pre-existing findings to the current PR, and any target execution —
 * the record is `executionPolicy: source-only` and says so.
 */

import { canonicalJson, nonEmptyNfcString } from './promotion-candidates.mjs';
import { validateSecurityAuditCoverageSemantics } from './security-audit-coverage.mjs';
import { sha256Hex } from './shadow-aggregate.mjs';

/** Schema version of the run record. */
export const SECURITY_AUDIT_RUN_RECORD_SCHEMA_VERSION = '1';

/** Directory the artifact set is written under. */
export const SECURITY_AUDIT_ARTIFACT_DIR = '.river/security-audit';

/**
 * Evidence states a finding record may carry (#2267 Phase 6 vocabulary). This
 * module does not assign them; it only refuses to render an unknown one.
 */
export const SECURITY_AUDIT_EVIDENCE_STATES = Object.freeze([
  'established',
  'unresolved',
  'refuted',
]);

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

/**
 * Severity vocabulary of the output schema (`docs/review/output-format.md`).
 * The builder rejects anything else rather than letting the JSON Schema be the
 * only thing standing between an invented severity and a rendered report.
 */
export const SECURITY_AUDIT_SEVERITIES = Object.freeze(['critical', 'major', 'minor', 'info']);

/**
 * Codes from `validateSecurityAuditCoverageSemantics` that need the Phase 2
 * attack registry to be meaningful. Without a registry they say nothing, so
 * they are dropped rather than reported as if the coverage were broken.
 */
const REGISTRY_DEPENDENT_COVERAGE_CODES = new Set([
  'unknown_attack_class',
  'taxonomy_version_mismatch',
]);

function isRealInstant(value) {
  // The pattern above accepts 2026-13-45T99:99:99Z. Round-tripping through Date
  // is what actually rejects an impossible calendar date.
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value.slice(0, 19));
}

function requireString(value, field) {
  const normalized = nonEmptyNfcString(value);
  if (normalized === null) throw new TypeError(`${field} must be a non-empty string`);
  return normalized;
}

function normalizeFinding(finding, index) {
  if (finding === null || typeof finding !== 'object' || Array.isArray(finding)) {
    throw new TypeError(`findings[${index}] must be an object`);
  }
  const evidenceState = requireString(finding.evidenceState, `findings[${index}].evidenceState`);
  if (!SECURITY_AUDIT_EVIDENCE_STATES.includes(evidenceState)) {
    throw new TypeError(`findings[${index}].evidenceState is not a known evidence state`);
  }
  // Phase 6 contract: an unresolved finding has no severity and must carry the
  // exact blocker plus a validation plan. Rendering a severity for it would
  // manufacture a judgment the verification pipeline never made.
  const severity = nonEmptyNfcString(finding.severity);
  if (severity !== null && !SECURITY_AUDIT_SEVERITIES.includes(severity)) {
    throw new TypeError(`findings[${index}].severity is not a known severity`);
  }
  if (evidenceState === 'unresolved') {
    if (severity !== null) {
      throw new TypeError(`findings[${index}] is unresolved and must not carry a severity`);
    }
    requireString(finding.validationPlan, `findings[${index}].validationPlan`);
    requireString(finding.blocker, `findings[${index}].blocker`);
  }
  return {
    id: requireString(finding.id, `findings[${index}].id`),
    title: requireString(finding.title, `findings[${index}].title`),
    evidenceState,
    severity,
    attackClassId: nonEmptyNfcString(finding.attackClassId),
    subsystem: nonEmptyNfcString(finding.subsystem),
    blocker: nonEmptyNfcString(finding.blocker),
    validationPlan: nonEmptyNfcString(finding.validationPlan),
    // `scope` defaults to `repository` because an audit finding with no stated
    // scope is a repository-level observation, not a claim about the current
    // change. Narrowing it is the caller's explicit act.
    scope: nonEmptyNfcString(finding.scope) ?? 'repository',
    askRelevance: nonEmptyNfcString(finding.askRelevance),
    evidenceRefs: Array.isArray(finding.evidenceRefs) ? finding.evidenceRefs : [],
  };
}

function normalizeCandidate(candidate, index) {
  if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new TypeError(`candidates[${index}] must be an object`);
  }
  return {
    id: requireString(candidate.id, `candidates[${index}].id`),
    title: requireString(candidate.title, `candidates[${index}].title`),
    attackClassId: nonEmptyNfcString(candidate.attackClassId),
    subsystem: nonEmptyNfcString(candidate.subsystem),
    coverageUnitId: nonEmptyNfcString(candidate.coverageUnitId),
    promotedFindingId: nonEmptyNfcString(candidate.promotedFindingId),
  };
}

/**
 * Build the machine-readable security audit run record.
 *
 * `recordDigest` content-addresses the record with the repo-wide SSoT
 * (`canonicalJson` + `sha256Hex`) so a rendered report can be tied back to the
 * exact record it came from.
 *
 * @param {object} input
 * @param {string} input.runId audit run id (caller-owned; not derived here)
 * @param {{repository: string, revision: string}} input.target audited target
 * @param {string} input.generatedAt ISO-8601 UTC instant
 * @param {object} input.coverage SecurityAuditCoverage (#2267 Phase 3)
 * @param {object|null} [input.attackRegistry] Phase 2 registry. When supplied,
 *   taxonomy-version and attack-class checks are enforced too.
 * @param {object|null} [input.repeatRun] SecurityAuditRepeatRun summary
 * @param {Array<object>} [input.candidates]
 * @param {Array<object>} [input.findings]
 * @param {Array<string>} [input.architectureNotes] trust-boundary prose lines
 * @returns {object} run record
 */
export function buildSecurityAuditRunRecord({
  runId,
  target,
  generatedAt,
  coverage,
  attackRegistry = null,
  repeatRun = null,
  candidates = [],
  findings = [],
  architectureNotes = [],
} = {}) {
  const at = requireString(generatedAt, 'generatedAt');
  if (!ISO_INSTANT.test(at) || !isRealInstant(at)) {
    throw new TypeError('generatedAt must be an ISO-8601 UTC instant');
  }
  if (coverage?.kind !== 'SecurityAuditCoverage') {
    throw new TypeError('coverage must be a SecurityAuditCoverage record');
  }
  if (!Array.isArray(coverage.units)) {
    throw new TypeError('coverage.units must be an array');
  }
  // The record claims to be the SSoT, so a coverage block whose counters
  // disagree with its own units must never reach it. Phase 3 already owns that
  // check; calling it here is the point.
  const coverageIssues = validateSecurityAuditCoverageSemantics(
    coverage,
    attackRegistry ?? { version: coverage.taxonomyVersion, classes: [] }
  ).filter((issue) => attackRegistry != null || !REGISTRY_DEPENDENT_COVERAGE_CODES.has(issue.code));
  if (coverageIssues.length > 0) {
    throw new TypeError(
      `coverage failed semantic validation: ${coverageIssues.map((i) => i.message).join('; ')}`
    );
  }
  if (!Array.isArray(candidates) || !Array.isArray(findings)) {
    throw new TypeError('candidates and findings must be arrays');
  }

  const normalizedFindings = findings.map(normalizeFinding);
  const byState = Object.fromEntries(
    SECURITY_AUDIT_EVIDENCE_STATES.map((state) => [
      state,
      normalizedFindings.filter((f) => f.evidenceState === state).length,
    ])
  );

  const record = {
    kind: 'SecurityAuditRunRecord',
    schemaVersion: SECURITY_AUDIT_RUN_RECORD_SCHEMA_VERSION,
    status: 'experimental',
    executionPolicy: 'source-only',
    runId: requireString(runId, 'runId'),
    generatedAt: at,
    target: {
      repository: requireString(target?.repository, 'target.repository'),
      revision: requireString(target?.revision, 'target.revision'),
    },
    coverage,
    repeatRun: repeatRun ?? null,
    candidates: candidates.map(normalizeCandidate),
    findings: normalizedFindings,
    findingCountsByEvidenceState: byState,
    architectureNotes: architectureNotes.map((note, i) =>
      requireString(note, `architectureNotes[${i}]`)
    ),
  };

  return { ...record, recordDigest: sha256Hex(canonicalJson(record)) };
}

function bullet(line) {
  return `- ${line}`;
}

function severityLabel(finding) {
  // No fallback severity. Inventing one here is exactly the "recompute severity
  // in prose" the Epic forbids. The label also must not name an evidence state
  // the record does not carry: an established finding may legitimately have no
  // severity yet, and printing "unresolved" for it would misreport its state.
  return finding.severity ?? '(not recorded)';
}

/**
 * Render REPORT.md as a pure projection of the run record.
 *
 * @param {object} record run record from buildSecurityAuditRunRecord
 * @returns {string}
 */
export function renderSecurityAuditReport(record) {
  const { coverage } = record;
  const lines = [
    '# Security Audit Report',
    '',
    `- Run: \`${record.runId}\``,
    `- Target: \`${record.target.repository}\` @ \`${record.target.revision}\``,
    `- Generated: ${record.generatedAt}`,
    `- Execution policy: \`${record.executionPolicy}\` (status: ${record.status})`,
    `- Record digest: \`${record.recordDigest}\``,
    '',
    '> This document is generated from `findings.json` / `audit-coverage.json`.',
    '> Severity, evidence state and coverage state are read from those records,',
    '> never recomputed here. `0 findings` is not a proof of safety.',
    '',
    '## Coverage',
    '',
    bullet(`applicable units: ${coverage.applicableUnits} / total ${coverage.totalUnits}`),
    bullet(`covered: ${coverage.coveredUnits}`),
    bullet(`planned: ${coverage.plannedUnits}`),
    bullet(`blocked: ${coverage.blockedUnits}`),
    bullet(`deferred: ${coverage.deferredUnits}`),
    bullet(`out of scope: ${coverage.outOfScopeUnits}`),
    '',
    '## Findings by evidence state',
    '',
  ];

  for (const state of SECURITY_AUDIT_EVIDENCE_STATES) {
    lines.push(bullet(`${state}: ${record.findingCountsByEvidenceState[state]}`));
  }
  lines.push('');

  const established = record.findings.filter((f) => f.evidenceState === 'established');
  lines.push('## Established findings', '');
  if (established.length === 0) {
    lines.push('None recorded in this run.', '');
  } else {
    for (const finding of established) {
      lines.push(
        `### ${finding.id} — ${finding.title}`,
        '',
        bullet(`severity: ${severityLabel(finding)}`),
        bullet(`attack class: ${finding.attackClassId ?? 'unclassified'}`),
        bullet(`subsystem: ${finding.subsystem ?? 'unspecified'}`),
        bullet(`scope: ${finding.scope}`),
        bullet(`ask relevance: ${finding.askRelevance ?? 'not assessed'}`),
        ''
      );
    }
  }

  // Refuted findings are listed by id rather than dropped to a bare count: a
  // reader has to be able to see which hypothesis was refuted, and a count
  // alone silently loses that.
  const refuted = record.findings.filter((f) => f.evidenceState === 'refuted');
  lines.push('## Refuted findings', '');
  lines.push(
    refuted.length === 0
      ? 'None recorded in this run.'
      : refuted.map((f) => bullet(`\`${f.id}\` — ${f.title}`)).join('\n'),
    ''
  );

  if (record.repeatRun) {
    lines.push(
      '## Repeat run',
      '',
      bullet(`prior covered units: ${record.repeatRun.priorUnitCount}`),
      bullet(`carried over: ${record.repeatRun.carriedOverUnitIds.length}`),
      bullet(`returned to validation: ${record.repeatRun.revalidationRequired.length}`),
      ''
    );
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

/**
 * Render NEEDS-VALIDATION.md: everything this run could not settle.
 *
 * @param {object} record run record from buildSecurityAuditRunRecord
 * @returns {string}
 */
export function renderNeedsValidation(record) {
  const unresolved = record.findings.filter((f) => f.evidenceState === 'unresolved');
  // `openUnitIds` is the Phase 3 derivation of what is still open. Re-filtering
  // by state here would be a second copy of `OPEN_STATES` free to drift.
  const openIds = new Set(record.coverage.openUnitIds);
  const openUnits = record.coverage.units.filter((unit) => openIds.has(unit.id));
  const lines = [
    '# Needs Validation',
    '',
    `- Run: \`${record.runId}\``,
    `- Record digest: \`${record.recordDigest}\``,
    '',
    '## Unresolved findings',
    '',
  ];

  if (unresolved.length === 0) {
    lines.push('None.', '');
  } else {
    for (const finding of unresolved) {
      lines.push(
        `### ${finding.id} — ${finding.title}`,
        '',
        bullet(`exact blocker: ${finding.blocker}`),
        bullet(`validation plan: ${finding.validationPlan}`),
        ''
      );
    }
  }

  lines.push('## Open coverage units', '');
  if (openUnits.length === 0) {
    lines.push('None.', '');
  } else {
    for (const unit of openUnits) {
      lines.push(
        bullet(
          `\`${unit.id}\` (${unit.state}${unit.reasonCode ? `, ${unit.reasonCode}` : ''}) — ${unit.validationPlan ?? 'no validation plan recorded'}`
        )
      );
    }
    lines.push('');
  }

  lines.push('## Returned to validation by this repeat run', '');
  const revalidation = record.repeatRun?.revalidationRequired ?? [];
  if (revalidation.length === 0) {
    lines.push('None.', '');
  } else {
    for (const entry of revalidation) {
      lines.push(bullet(`\`${entry.unitId}\` — ${entry.reason}`));
    }
    lines.push('');
  }

  return `${lines.join('\n').trimEnd()}\n`;
}

/**
 * Render architecture.md from the recorded trust-boundary notes.
 *
 * @param {object} record run record
 * @returns {string}
 */
export function renderArchitectureNotes(record) {
  const lines = ['# Audited Architecture', '', `- Run: \`${record.runId}\``, ''];
  if (record.architectureNotes.length === 0) {
    lines.push('No trust boundary notes were recorded for this run.');
  } else {
    lines.push(...record.architectureNotes.map(bullet));
  }
  return `${lines.join('\n').trimEnd()}\n`;
}

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/**
 * Build the full `.river/security-audit/` artifact set as path → content.
 *
 * The caller writes the files; this module performs no I/O so it stays usable
 * from a read-only audit run.
 *
 * @param {object} record run record from buildSecurityAuditRunRecord
 * @returns {Record<string, string>}
 */
export function buildSecurityAuditArtifactSet(record) {
  if (record?.kind !== 'SecurityAuditRunRecord') {
    throw new TypeError('record must be a SecurityAuditRunRecord');
  }
  const dir = SECURITY_AUDIT_ARTIFACT_DIR;
  const {
    coverage,
    candidates,
    findings,
    ...metadata /* everything that is not one of the three payload documents */
  } = record;

  return {
    [`${dir}/run-metadata.json`]: json(metadata),
    [`${dir}/audit-coverage.json`]: json(coverage),
    [`${dir}/candidates.json`]: json(candidates),
    [`${dir}/findings.json`]: json(findings),
    [`${dir}/architecture.md`]: renderArchitectureNotes(record),
    [`${dir}/REPORT.md`]: renderSecurityAuditReport(record),
    [`${dir}/NEEDS-VALIDATION.md`]: renderNeedsValidation(record),
  };
}
