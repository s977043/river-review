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
  repeatRun = null,
  candidates = [],
  findings = [],
  architectureNotes = [],
} = {}) {
  const at = requireString(generatedAt, 'generatedAt');
  if (!ISO_INSTANT.test(at)) {
    throw new TypeError('generatedAt must be an ISO-8601 UTC instant');
  }
  if (coverage?.kind !== 'SecurityAuditCoverage') {
    throw new TypeError('coverage must be a SecurityAuditCoverage record');
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
  // No fallback severity. An unresolved finding has none by contract, and
  // inventing one here is exactly the "recompute severity in prose" the Epic
  // forbids.
  return finding.severity ?? '(no severity — unresolved)';
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
  const openUnits = record.coverage.units.filter(
    (unit) => unit.state === 'planned' || unit.state === 'blocked' || unit.state === 'deferred'
  );
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
