// Completion capability for QA evidence (ADR-017 D3, docs/development/qa-evidence-contract.md §8).
//
// Assembles a full completion-assessment from three inputs: the audit result of `auditQaEvidence`
// (src/lib/qa-evidence.mjs), its partial projection (`projectQaEvidence`, imported, never
// recomputed) and a pinned reference to the stored audit result (the QA artifact). The parts only
// completion-judge can supply (tasks, requirement counts, goal validation, its own evidence) come
// in as `judge`. The document is checked against schemas/completion-assessment.schema.json before
// it is returned, and an invalid document throws instead of being returned.
//
// QA evidence alone never yields COMPLETE: the projection never makes the tests evidence
// `present` (§8.1), and COMPLETE stays with completion-judge (§8.2). This module neither reads nor
// writes a gate.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import Ajv2020 from 'ajv/dist/2020.js';

import { projectQaEvidence } from './qa-evidence-projection.mjs';

export const QA_COMPLETION_SCHEMA_VERSION = '0.1.0';

// The state table. `outcome` is what the audit says about the QA population; the state is the one
// the schema allows for it (§8.2). COMPLETE is not a value of this table.
export const QA_COMPLETION_OUTCOMES = Object.freeze({
  'evidence-absent': 'UNVERIFIED',
  'evidence-rejected': 'UNVERIFIED',
  'population-undetermined': 'UNVERIFIED',
  'all-verified': 'UNVERIFIED',
  'unconfirmed-only': 'UNVERIFIED',
  'failed-only': 'INCOMPLETE',
  mixed: 'INCOMPLETE',
});

// An AC whose only unmet §5 conditions are the reported failure itself: the run was trusted and
// it did not pass. Every other reasonCode means the result could not be confirmed.
const FAILURE_REASON_CODES = new Set([
  'QA_VERIFICATION_NOT_PASS',
  'QA_VERIFICATION_ASSERTIONS_MISSING',
]);
// Evidence states that forbid INCOMPLETE (§8.2; schema "missing ... forbids INCOMPLETE").
const UNCHECKED_EVIDENCE_STATES = new Set(['missing', 'unreadable']);
const UNSATISFIED_STATES = new Set(['UNVERIFIED', 'INCOMPLETE']);
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const SCOPE_BY_INTENT = Object.freeze({ 'task-completion': 'task', 'final-convergence': 'final' });

// Read on first use, as schemaValidator in qa-evidence.mjs does, so importing this module reads
// no file.
let schema = null;
function completionSchema() {
  if (!schema) {
    schema = JSON.parse(
      readFileSync(
        new URL('../../schemas/completion-assessment.schema.json', import.meta.url),
        'utf8'
      )
    );
  }
  return schema;
}
const reasonCodeOrder = () => completionSchema().$defs.completionReasonCode.enum;

let compiledSchema = null;
function schemaValidator() {
  if (!compiledSchema) {
    // Ajv's default strictness, as compileCompletionAssessmentValidator (tests/helpers) uses:
    // the schema's if/then branches omit `type` and do not compile with `strict: true`.
    const ajv = new Ajv2020({ allErrors: true, logger: false });
    compiledSchema = ajv.compile(completionSchema());
  }
  return compiledSchema;
}

/**
 * Schema check plus the rules the schema delegates to code: one evidence entry per kind, and
 * `tasks.unsupportedClaims` equal to the length of `unsupportedClaims` (an absent list is empty).
 *
 * @param {unknown} document
 * @returns {{ valid: boolean, errors: object[] }}
 */
export function validateCompletionAssessment(document) {
  const validate = schemaValidator();
  const errors = validate(document) ? [] : [...validate.errors];
  const kinds = Array.isArray(document?.evidence)
    ? document.evidence.map((entry) => entry?.kind)
    : [];
  const duplicate = kinds.find((kind, index) => kinds.indexOf(kind) !== index);
  if (duplicate !== undefined) {
    errors.push({ instancePath: '/evidence', message: `duplicate evidence kind: ${duplicate}` });
  }
  if (document?.tasks !== undefined) {
    const listed = Array.isArray(document.unsupportedClaims)
      ? document.unsupportedClaims.length
      : 0;
    if (document.tasks?.unsupportedClaims !== listed) {
      errors.push({
        instancePath: '/tasks/unsupportedClaims',
        message: `tasks.unsupportedClaims must equal the ${listed} listed unsupportedClaims`,
      });
    }
  }
  return { valid: errors.length === 0, errors };
}

/**
 * The stored form of an audit result and its sha256. The host writes `content` and passes
 * `{ path, sha256 }` back as the QA artifact, so the assessment names the exact audit it reflects.
 *
 * @param {object} audit - an `auditQaEvidence` / `judgeQaEvidence` result
 */
export function serializeQaArtifact(audit) {
  const content = `${JSON.stringify(audit, null, 2)}\n`;
  return { content, sha256: createHash('sha256').update(content).digest('hex') };
}

/**
 * Classify an audit result into a row of `QA_COMPLETION_OUTCOMES`. Pure.
 *
 * @param {object | null} audit - null when the run had no QA evidence
 * @returns {{ outcome: string, confirmedFailures: string[], unconfirmed: string[] }}
 */
export function classifyQaAudit(audit) {
  const none = { confirmedFailures: [], unconfirmed: [] };
  if (audit === null || audit === undefined) return { outcome: 'evidence-absent', ...none };
  const projected = projectQaEvidence(audit);
  if (projected !== null) {
    const { total, verified, unverified } = projected.acceptanceCriteria;
    const verifiedCriteria = audit.criteria.filter((criterion) => criterion.verified).length;
    if (total !== verified + unverified || verified !== verifiedCriteria) {
      throw new Error('QA audit projection is not consistent with its criteria');
    }
  }
  if (audit.accepted !== true) return { outcome: 'evidence-rejected', ...none };
  if (projected === null) return { outcome: 'population-undetermined', ...none };

  const confirmedFailures = [];
  const unconfirmed = [];
  for (const criterion of audit.criteria) {
    if (criterion.verified) continue;
    const failureOnly =
      criterion.status === 'FAIL' &&
      criterion.reasonCodes.every((code) => FAILURE_REASON_CODES.has(code));
    (failureOnly ? confirmedFailures : unconfirmed).push(criterion.acId);
  }
  if (confirmedFailures.length + unconfirmed.length !== projected.acceptanceCriteria.unverified) {
    throw new Error('QA audit criteria disagree with its projection');
  }
  let outcome = 'all-verified';
  if (confirmedFailures.length > 0) outcome = unconfirmed.length > 0 ? 'mixed' : 'failed-only';
  else if (unconfirmed.length > 0) outcome = 'unconfirmed-only';
  return { outcome, confirmedFailures, unconfirmed };
}

function acceptanceEvidenceState(outcome) {
  if (outcome === 'evidence-absent') return 'missing';
  if (outcome === 'evidence-rejected') return 'unreadable';
  if (outcome === 'population-undetermined') return 'partial';
  return 'present';
}

function qaArtifactNote(audit, qaArtifact) {
  if (audit === null || audit === undefined) return 'No QA evidence was supplied.';
  const path = typeof qaArtifact?.path === 'string' ? qaArtifact.path.trim() : '';
  const sha256 = typeof qaArtifact?.sha256 === 'string' ? qaArtifact.sha256.toLowerCase() : '';
  if (path === '' || !SHA256_PATTERN.test(sha256)) {
    throw new TypeError('qaArtifact needs a path and a sha256 when QA evidence is present');
  }
  if (serializeQaArtifact(audit).sha256 !== sha256) {
    throw new Error('qaArtifact.sha256 does not match the audit result');
  }
  return `QA audit result: ${path} (sha256 ${sha256})`;
}

function acceptanceCounts(projected, judgeCounts) {
  if (projected) return projected.acceptanceCriteria;
  if (judgeCounts === undefined) return undefined;
  // Without a determined QA population nothing was verified by QA (§8.1).
  if (judgeCounts.verified !== 0 || judgeCounts.unverified !== judgeCounts.total) {
    throw new Error(
      'acceptanceCriteria must have verified 0 and unverified = total when the QA population is undetermined'
    );
  }
  return judgeCounts;
}

function overallState(table, { validation, blockedBy, evidence }) {
  if (validation?.state === 'REQUIRES_HUMAN_JUDGMENT') return 'HUMAN_JUDGMENT_REQUIRED';
  if (Array.isArray(blockedBy) && blockedBy.length > 0) return 'BLOCKED';
  if (table === 'INCOMPLETE' && evidence.some((e) => UNCHECKED_EVIDENCE_STATES.has(e.state))) {
    return 'UNVERIFIED';
  }
  return table;
}

/**
 * Build and validate the completion-assessment for a QA run.
 *
 * Scope responsibilities: `task` needs `judge.tasks`; `final` needs `judge.requirements` and
 * `judge.validation`, and acceptance-criterion counts from the projection or, when the population
 * is undetermined, `judge.acceptanceCriteria` with `verified: 0`. `verification` is emitted
 * whenever AC counts exist, so `judge.requirements` is then required at either scope.
 *
 * @param {object} input
 * @param {'task' | 'final'} input.scope
 * @param {object | null} input.audit - `auditQaEvidence` result, null when no QA evidence was given
 * @param {{ path: string, sha256: string }} [input.qaArtifact] - required when `audit` is not null
 * @param {object} [input.judge]
 * @returns {{ assessment: object, qa: ReturnType<typeof classifyQaAudit> }}
 */
export function buildQaCompletionAssessment({ scope, audit, qaArtifact, judge = {} }) {
  const qa = classifyQaAudit(audit);
  const projected = qa.outcome === 'evidence-absent' ? null : projectQaEvidence(audit);
  const judgeEvidence = Array.isArray(judge.evidence) ? judge.evidence : [];
  if (judgeEvidence.some((entry) => entry?.kind === 'acceptanceCriteria')) {
    throw new Error('the acceptanceCriteria evidence entry belongs to the QA capability');
  }
  const evidence = [
    ...judgeEvidence,
    {
      kind: 'acceptanceCriteria',
      state: acceptanceEvidenceState(qa.outcome),
      note: qaArtifactNote(audit, qaArtifact),
    },
  ];

  const judgeReasonCodes = Array.isArray(judge.reasonCodes) ? judge.reasonCodes : [];
  const order = reasonCodeOrder();
  const unknownCode = judgeReasonCodes.find((code) => !order.includes(code));
  if (unknownCode !== undefined) {
    throw new Error(
      `judge.reasonCodes has a value outside the completion vocabulary: ${unknownCode}`
    );
  }
  const reasonCodes = new Set(judgeReasonCodes);
  if (projected) projected.reasonCodes.forEach((code) => reasonCodes.add(code));
  if (!projected || projected.reasonCodes.length === 0) {
    reasonCodes.add('EVIDENCE_SOURCE_UNAVAILABLE');
  }
  if (!projected) reasonCodes.add('ACCEPTANCE_CRITERION_UNVERIFIED');

  const assessment = {
    schemaVersion: QA_COMPLETION_SCHEMA_VERSION,
    scope,
    mode: 'observe',
    state: overallState(QA_COMPLETION_OUTCOMES[qa.outcome], {
      validation: judge.validation,
      blockedBy: judge.blockedBy,
      evidence,
    }),
    reasonCodes: order.filter((code) => reasonCodes.has(code)),
  };
  if (UNSATISFIED_STATES.has(assessment.state) && reasonCodes.has('ALL_REQUIREMENTS_SATISFIED')) {
    throw new Error(`ALL_REQUIREMENTS_SATISFIED contradicts state ${assessment.state}`);
  }
  const acceptanceCriteria = acceptanceCounts(projected, judge.acceptanceCriteria);
  if (acceptanceCriteria !== undefined || scope === 'final') {
    if (acceptanceCriteria === undefined) {
      throw new TypeError('final scope needs acceptance-criterion counts');
    }
    if (judge.requirements === undefined) {
      throw new TypeError('verification needs judge.requirements');
    }
    assessment.verification = { requirements: judge.requirements, acceptanceCriteria };
  }
  if (scope === 'final') assessment.validation = judge.validation;
  for (const key of ['tasks', 'unsupportedClaims', 'unresolvedRefs', 'humanJudgment']) {
    if (judge[key] !== undefined) assessment[key] = judge[key];
  }
  assessment.evidence = evidence;
  if (assessment.state === 'BLOCKED') assessment.blockedBy = judge.blockedBy;

  const { valid, errors } = validateCompletionAssessment(assessment);
  if (!valid) {
    throw new Error(`completion-assessment failed validation: ${JSON.stringify(errors)}`);
  }
  return { assessment, qa };
}

/**
 * The `evaluate-completion` capability for `executeFlow` (src/lib/flow-runner.mjs), injected as
 * `capabilities['evaluate-completion']`. The scope follows the Flow's intent, as
 * `$defs/completionScope` in the schema pairs them.
 *
 * @param {Omit<Parameters<typeof buildQaCompletionAssessment>[0], 'scope'>} input
 */
export function createQaCompletionCapability({ audit, qaArtifact, judge = {} }) {
  return (context) => {
    const purpose = context?.document?.intent?.purpose;
    const scope = Object.hasOwn(SCOPE_BY_INTENT, purpose) ? SCOPE_BY_INTENT[purpose] : undefined;
    if (scope === undefined) {
      throw new Error(
        'evaluate-completion runs only in a task-completion or final-convergence Flow'
      );
    }
    return buildQaCompletionAssessment({ scope, audit, qaArtifact, judge });
  };
}
