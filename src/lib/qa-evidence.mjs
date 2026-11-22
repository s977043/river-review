// Deterministic validator for QA evidence (ADR-017 D3 / D5).
//
// The SSoT for every rule here is docs/development/qa-evidence-contract.md; section numbers in
// comments (§N) point there. Stages follow §7: stage 0 settles the AC population from host input
// only, stages 1-4 decide whether the evidence is accepted at all, and stage 5 judges each AC.
//
// The judging functions are pure. File access is confined to `resolveQaArtifacts` (§3.5).
// Independence is an injected argument; the production entry point `auditQaEvidence` always
// passes `unknown`, so no AC is verified in the first version (§5 condition 8, §9).
import { createHash } from 'node:crypto';
import { constants as fsConstants, readFileSync } from 'node:fs';
import { open, readlink, realpath } from 'node:fs/promises';
import { release } from 'node:os';
import { join } from 'node:path';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

import { nfc, nonEmptyNfcString } from './promotion-candidates.mjs';
import { redactText, shouldExcludeForContext } from './secret-redactor.mjs';

export const QA_EVIDENCE_LIMITS = Object.freeze({
  evidenceBytes: 1_048_576,
  depth: 16,
  artifactBytes: 104_857_600,
  artifactTotalBytes: 536_870_912,
});

export const PRODUCTION_INDEPENDENCE = 'unknown';

// §12, in table order. `reject` = 全体を拒否, `uncount-all` = 全 AC を数えない,
// `uncount` = 数えない, `record` = 記録のみ.
export const QA_REASON_CODES = Object.freeze({
  QA_TARGET_REPOSITORY_INVALID: 'reject',
  QA_TARGET_REVISION_INVALID: 'reject',
  QA_TARGET_AC_EMPTY: 'reject',
  QA_TARGET_AC_ID_INVALID: 'reject',
  QA_TARGET_AC_ID_DUPLICATE: 'reject',
  QA_TARGET_AC_MISSING: 'reject',
  QA_TARGET_AC_UNKNOWN: 'reject',
  QA_TARGET_EXPECTED_MISSING: 'uncount',
  QA_TARGET_EXPECTED_SOURCE_MISSING: 'uncount',
  QA_TARGET_EXPECTED_SOURCE_UNRESOLVED: 'uncount',
  QA_TARGET_EXPECTED_DERIVED: 'uncount',
  QA_TARGET_EXPECTED_REPRODUCED: 'uncount',
  QA_TARGET_EXPECTED_SOURCE_UNTRUSTED: 'uncount',
  QA_TARGET_EXPECTED_MISMATCH: 'uncount',
  QA_TARGET_REVISION_STALE: 'uncount',
  QA_TARGET_REVISION_UNOBSERVED: 'uncount',
  QA_EXECUTION_RUNNER_MISSING: 'uncount-all',
  QA_EXECUTION_COMMAND_MISSING: 'uncount',
  QA_EXECUTION_EXIT_CODE_UNKNOWN: 'uncount',
  QA_EXECUTION_EXIT_CODE_MISMATCH: 'uncount',
  QA_ENVIRONMENT_INCOMPLETE: 'uncount-all',
  QA_VERIFICATION_AC_UNKNOWN: 'reject',
  QA_VERIFICATION_AC_DUPLICATE: 'reject',
  QA_VERIFICATION_AC_MISSING: 'uncount',
  QA_VERIFICATION_STATUS_INVALID: 'reject',
  QA_VERIFICATION_STATUS_MISMATCH: 'reject',
  QA_VERIFICATION_BASIS_MISSING: 'uncount',
  QA_VERIFICATION_ATTEMPTS_EMPTY: 'uncount',
  QA_VERIFICATION_REASON_MISSING: 'record',
  QA_VERIFICATION_ATTEMPTS_UNORDERED: 'reject',
  QA_VERIFICATION_ATTEMPT_INVALID: 'reject',
  QA_VERIFICATION_SUBCASE_ID_INVALID: 'reject',
  QA_VERIFICATION_SUBCASE_STATUS_MISMATCH: 'reject',
  QA_CONTROL_MISSING: 'record',
  QA_CONTROL_PASSED: 'record',
  QA_CONTROL_SAME_REVISION: 'record',
  QA_CONTROL_LOG_UNRESOLVED: 'record',
  QA_VERIFICATION_NOT_PASS: 'uncount',
  QA_VERIFICATION_EXPLORE_ONLY: 'uncount',
  QA_VERIFICATION_ASSERTIONS_MISSING: 'uncount',
  QA_VERIFICATION_FLAKY: 'uncount',
  QA_ARTIFACT_ID_INVALID: 'reject',
  QA_ARTIFACT_REF_UNKNOWN: 'reject',
  QA_ARTIFACT_PATH_REJECTED: 'reject',
  QA_ARTIFACT_HASH_MISMATCH: 'uncount',
  QA_ARTIFACT_UNRESOLVED: 'uncount',
  QA_ARTIFACT_TOO_LARGE: 'uncount',
  QA_AC_POPULATION_UNKNOWN: 'uncount-all',
  QA_INDEPENDENCE_UNKNOWN: 'uncount',
  QA_EVIDENCE_MALFORMED: 'reject',
  QA_EVIDENCE_TOO_LARGE: 'reject',
  QA_EVIDENCE_REDACTION_FAILED: 'reject',
});

// Order of an AC's reasonCodes: stage 0, then §5 conditions 1-8. Field-level codes of §3 sit
// with the condition they defeat.
export const AC_REASON_ORDER = Object.freeze([
  'QA_AC_POPULATION_UNKNOWN',
  // 1
  'QA_VERIFICATION_AC_MISSING',
  'QA_VERIFICATION_NOT_PASS',
  // 2
  'QA_VERIFICATION_BASIS_MISSING',
  'QA_VERIFICATION_EXPLORE_ONLY',
  'QA_VERIFICATION_ATTEMPTS_EMPTY',
  'QA_VERIFICATION_ASSERTIONS_MISSING',
  // 3
  'QA_VERIFICATION_FLAKY',
  // 4
  'QA_ARTIFACT_UNRESOLVED',
  'QA_ARTIFACT_HASH_MISMATCH',
  'QA_ARTIFACT_TOO_LARGE',
  'QA_EXECUTION_COMMAND_MISSING',
  'QA_EXECUTION_EXIT_CODE_UNKNOWN',
  'QA_EXECUTION_EXIT_CODE_MISMATCH',
  // 5
  'QA_TARGET_REVISION_STALE',
  'QA_TARGET_REVISION_UNOBSERVED',
  // 6
  'QA_TARGET_EXPECTED_SOURCE_MISSING',
  'QA_TARGET_EXPECTED_SOURCE_UNRESOLVED',
  'QA_TARGET_EXPECTED_DERIVED',
  'QA_TARGET_EXPECTED_REPRODUCED',
  'QA_TARGET_EXPECTED_SOURCE_UNTRUSTED',
  // 7
  'QA_EXECUTION_RUNNER_MISSING',
  'QA_ENVIRONMENT_INCOMPLETE',
  'QA_TARGET_EXPECTED_MISSING',
  'QA_TARGET_EXPECTED_MISMATCH',
  // 8
  'QA_INDEPENDENCE_UNKNOWN',
]);

const RECORD_ORDER = Object.freeze([
  'QA_VERIFICATION_REASON_MISSING',
  'QA_CONTROL_MISSING',
  'QA_CONTROL_PASSED',
  'QA_CONTROL_SAME_REVISION',
  'QA_CONTROL_LOG_UNRESOLVED',
]);
const REJECT_ORDER = Object.freeze(
  Object.keys(QA_REASON_CODES).filter((code) => QA_REASON_CODES[code] === 'reject')
);

const ID_PATTERN = /^[A-Za-z0-9._-]{1,128}$/;
const COMMIT_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const BASIS_VALUES = new Set(['verified', 'explore']);
const SOURCE_VALUES = new Set(['sourced', 'reproduced', 'derived']);
const NOT_RUN_REASONS = new Set([
  'criteria-ambiguous',
  'environment-unavailable',
  'out-of-scope',
  'execution-failed',
  'requires-human-judgment',
]);
// §3.4.1: worst first.
const STATUS_SEVERITY = Object.freeze({ FAIL: 0, NOT_RUN: 1, SKIP: 2, PASS: 3 });
const STAGE_ONE_KEYWORDS = new Set(['additionalProperties', 'type', 'maxLength', 'maxItems']);

const ordered = (codes, order) => order.filter((code) => codes.has(code));
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const asArray = (value) => (Array.isArray(value) ? value : []);
const lowerHex = (value) => (typeof value === 'string' ? value.toLowerCase() : null);
const isNonBlank = (value) => typeof value === 'string' && value.trim() !== '';

/** §4.2: normalized id, or null when it is not a valid id. */
export function normalizeQaId(value) {
  const normalized = nonEmptyNfcString(value);
  return normalized !== null && ID_PATTERN.test(normalized) ? normalized : null;
}

let compiledSchema = null;
function schemaValidator() {
  if (!compiledSchema) {
    const schema = JSON.parse(
      readFileSync(new URL('../../schemas/qa-evidence.schema.json', import.meta.url), 'utf8')
    );
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    addFormats(ajv);
    compiledSchema = ajv.compile(schema);
  }
  return compiledSchema;
}

function nestingDepth(root) {
  let max = 0;
  const stack = [[root, 1]];
  while (stack.length) {
    const [value, depth] = stack.pop();
    if (value === null || typeof value !== 'object') continue;
    if (depth > max) max = depth;
    if (max > QA_EVIDENCE_LIMITS.depth) return max;
    for (const child of Object.values(value)) stack.push([child, depth + 1]);
  }
  return max;
}

function pointerSegments(instancePath) {
  if (!instancePath) return [];
  return instancePath
    .slice(1)
    .split('/')
    .map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'));
}

const ATTEMPT_FIELD =
  /^verification\/\*(?:\/subcases\/\*)?\/attempts\/\*\/(?:startedAt|status|assertions)(?:\/|$)/;
const FIELD_CODES = [
  [/^target\/repository$/, 'QA_TARGET_REPOSITORY_INVALID'],
  [/^target\/subjectRevision$/, 'QA_TARGET_REVISION_INVALID'],
  [/^target\/acceptanceCriteria$/, 'QA_TARGET_AC_EMPTY'],
  [/^target\/acceptanceCriteria\/\*\/id$/, 'QA_TARGET_AC_ID_INVALID'],
  [/^verification\/\*(?:\/subcases\/\*)?\/status$/, 'QA_VERIFICATION_STATUS_INVALID'],
  [/^verification\/\*\/subcases\/\*\/id$/, 'QA_VERIFICATION_SUBCASE_ID_INVALID'],
  [/^artifacts\/refs\/\*\/id$/, 'QA_ARTIFACT_ID_INVALID'],
  [/^artifacts\/refs\/\*\/(?:root|path)$/, 'QA_ARTIFACT_PATH_REJECTED'],
];

function codeForSchemaError(error) {
  if (error.keyword === 'if') return null;
  if (error.keyword === 'maxLength' || error.keyword === 'maxItems') return 'QA_EVIDENCE_TOO_LARGE';
  const segments = pointerSegments(error.instancePath);
  if (error.keyword === 'required') segments.push(error.params.missingProperty);
  const key = segments.map((segment) => (/^\d+$/.test(segment) ? '*' : segment)).join('/');
  if (ATTEMPT_FIELD.test(key) && error.keyword !== 'additionalProperties') {
    return 'QA_VERIFICATION_ATTEMPT_INVALID';
  }
  if (error.keyword === 'type' || error.keyword === 'additionalProperties') {
    return 'QA_EVIDENCE_MALFORMED';
  }
  for (const [pattern, code] of FIELD_CODES) if (pattern.test(key)) return code;
  return 'QA_EVIDENCE_MALFORMED';
}

/** §3.5: true when the relative artifact path must be rejected before any read. */
export function isArtifactPathRejected(path) {
  if (typeof path !== 'string' || path === '') return true;
  const normalized = nfc(path);
  if (normalized.startsWith('/') || normalized.includes('\\') || normalized.includes('\0')) {
    return true;
  }
  const segments = normalized.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..'))
    return true;
  if (segments.some((segment) => segment.toLowerCase() === '.git')) return true;
  return shouldExcludeForContext(normalized);
}

function defaultRedact(text) {
  const { text: redacted, hits } = redactText(text);
  return { text: redacted, count: hits.reduce((sum, hit) => sum + hit.count, 0) };
}

function redactCopy(value, redact, counter) {
  if (typeof value === 'string') {
    const { text, count } = redact(value);
    counter.count += count;
    return text;
  }
  if (Array.isArray(value)) return value.map((item) => redactCopy(item, redact, counter));
  if (isObject(value)) {
    const copy = {};
    for (const [key, item] of Object.entries(value)) copy[key] = redactCopy(item, redact, counter);
    return copy;
  }
  return value;
}

/**
 * Stage 0 (§4.1): settle the AC population from host input only.
 *
 * @param {{ trusted?: boolean, source?: { path?: string, sha256?: string, approvalRef?: string },
 *   criteria?: Array<{ id: string, required: boolean, expected: string }> } | null | undefined} population
 * @returns {{ determined: boolean, criteria: Map<string, { required: boolean, expected: string }> }}
 */
export function determineAcPopulation(population) {
  const undetermined = { determined: false, criteria: new Map() };
  if (!isObject(population) || population.trusted !== true) return undetermined;
  const source = population.source;
  if (
    !isObject(source) ||
    !isNonBlank(source.path) ||
    !isNonBlank(source.approvalRef) ||
    !SHA256_PATTERN.test(lowerHex(source.sha256) ?? '')
  ) {
    return undetermined;
  }
  const list = population.criteria;
  if (!Array.isArray(list) || list.length === 0) return undetermined;
  const criteria = new Map();
  for (const criterion of list) {
    const id = isObject(criterion) ? normalizeQaId(criterion.id) : null;
    if (
      id === null ||
      criteria.has(id) ||
      typeof criterion.required !== 'boolean' ||
      typeof criterion.expected !== 'string'
    ) {
      return undetermined;
    }
    criteria.set(id, { required: criterion.required, expected: criterion.expected });
  }
  return { determined: true, criteria };
}

function rejected(stage, violations) {
  const codes = new Set(violations.map((violation) => violation.code));
  return { accepted: false, stage, rejectReasons: ordered(codes, REJECT_ORDER), violations };
}

function checkAttempts(attempts, basePath, artifactIds, push) {
  let previous = null;
  attempts.forEach((attempt, index) => {
    if (!isObject(attempt)) return;
    const path = `${basePath}/attempts/${index}`;
    const time = typeof attempt.startedAt === 'string' ? Date.parse(attempt.startedAt) : NaN;
    if (Number.isNaN(time)) push('QA_VERIFICATION_ATTEMPT_INVALID', `${path}/startedAt`);
    else {
      if (previous !== null && time <= previous) {
        push('QA_VERIFICATION_ATTEMPTS_UNORDERED', `${path}/startedAt`);
      }
      previous = time;
    }
    const assertions = attempt.assertions;
    if (isObject(assertions) && assertions.passed > assertions.total) {
      push('QA_VERIFICATION_ATTEMPT_INVALID', `${path}/assertions`);
    }
    if (attempt.logRef !== undefined && !artifactIds.has(normalizeQaId(attempt.logRef))) {
      push('QA_ARTIFACT_REF_UNKNOWN', `${path}/logRef`);
    }
  });
}

function checkStatusAgainstAttempts(result, path, push) {
  const attempts = asArray(result.attempts);
  const last = attempts[attempts.length - 1];
  // An invalid status is already reported by the schema; do not report it twice as a mismatch.
  if (
    isObject(last) &&
    STATUS_SEVERITY[result.status] !== undefined &&
    (last.status === 'PASS' || last.status === 'FAIL') &&
    last.status !== result.status
  ) {
    push('QA_VERIFICATION_STATUS_MISMATCH', `${path}/status`);
  }
}

function checkSemantics(evidence, push) {
  const target = isObject(evidence.target) ? evidence.target : {};
  const seenAc = new Set();
  asArray(target.acceptanceCriteria).forEach((criterion, index) => {
    if (!isObject(criterion) || criterion.id === undefined) return;
    const id = normalizeQaId(criterion.id);
    const path = `/target/acceptanceCriteria/${index}/id`;
    if (id === null) push('QA_TARGET_AC_ID_INVALID', path);
    else if (seenAc.has(id)) push('QA_TARGET_AC_ID_DUPLICATE', path);
    else seenAc.add(id);
  });

  const artifactIds = new Set();
  const refs = isObject(evidence.artifacts) ? asArray(evidence.artifacts.refs) : [];
  refs.forEach((ref, index) => {
    if (!isObject(ref)) return;
    const path = `/artifacts/refs/${index}`;
    if (ref.id !== undefined) {
      const id = normalizeQaId(ref.id);
      if (id === null || artifactIds.has(id)) push('QA_ARTIFACT_ID_INVALID', `${path}/id`);
      else artifactIds.add(id);
    }
    if (typeof ref.path === 'string' && isArtifactPathRejected(ref.path)) {
      push('QA_ARTIFACT_PATH_REJECTED', `${path}/path`);
    }
  });

  const seenResults = new Set();
  asArray(evidence.verification).forEach((result, index) => {
    if (!isObject(result)) return;
    const path = `/verification/${index}`;
    const acId = normalizeQaId(result.acId);
    if (acId !== null) {
      if (seenResults.has(acId)) push('QA_VERIFICATION_AC_DUPLICATE', `${path}/acId`);
      seenResults.add(acId);
    }
    const subcases = asArray(result.subcases);
    if (subcases.length === 0) {
      checkStatusAgainstAttempts(result, path, push);
      checkAttempts(asArray(result.attempts), path, artifactIds, push);
    } else {
      const seenSubcases = new Set();
      let worst = null;
      subcases.forEach((subcase, subIndex) => {
        if (!isObject(subcase)) return;
        const subPath = `${path}/subcases/${subIndex}`;
        if (subcase.id !== undefined) {
          const id = normalizeQaId(subcase.id);
          if (id === null || seenSubcases.has(id)) {
            push('QA_VERIFICATION_SUBCASE_ID_INVALID', `${subPath}/id`);
          } else seenSubcases.add(id);
        }
        checkStatusAgainstAttempts(subcase, subPath, push);
        checkAttempts(asArray(subcase.attempts), subPath, artifactIds, push);
        const severity = STATUS_SEVERITY[subcase.status];
        if (severity !== undefined && (worst === null || severity < STATUS_SEVERITY[worst])) {
          worst = subcase.status;
        }
      });
      if (
        worst !== null &&
        STATUS_SEVERITY[result.status] !== undefined &&
        result.status !== worst
      ) {
        push('QA_VERIFICATION_SUBCASE_STATUS_MISMATCH', `${path}/status`);
      }
    }
    asArray(result.controls).forEach((control, controlIndex) => {
      if (isObject(control) && !artifactIds.has(normalizeQaId(control.logRef))) {
        push('QA_ARTIFACT_REF_UNKNOWN', `${path}/controls/${controlIndex}/logRef`);
      }
    });
  });
}

function compareSets(evidence, population, push) {
  const targetIds = new Set(
    asArray(evidence.target.acceptanceCriteria).map((criterion) => normalizeQaId(criterion.id))
  );
  const confirmed = population.determined ? new Set(population.criteria.keys()) : targetIds;
  const resultIds = new Set();
  evidence.verification.forEach((result, index) => {
    const id = normalizeQaId(result.acId);
    resultIds.add(id);
    if (id === null || (!confirmed.has(id) && !targetIds.has(id))) {
      push('QA_VERIFICATION_AC_UNKNOWN', `/verification/${index}/acId`);
    }
  });
  evidence.target.acceptanceCriteria.forEach((criterion, index) => {
    if (!confirmed.has(normalizeQaId(criterion.id))) {
      push('QA_TARGET_AC_UNKNOWN', `/target/acceptanceCriteria/${index}/id`);
    }
  });
  for (const id of confirmed) {
    if (!targetIds.has(id) && resultIds.has(id))
      push('QA_TARGET_AC_MISSING', '/target/acceptanceCriteria');
  }
}

/**
 * Stages 1-4 (§7): decide whether the evidence is accepted as a whole.
 *
 * @param {string | Buffer} raw - the evidence document as received
 * @param {{ population: ReturnType<typeof determineAcPopulation>,
 *   redact?: (text: string) => { text: string, count: number } }} options
 */
export function checkQaEvidence(raw, { population, redact = defaultRedact }) {
  if (typeof raw !== 'string' && !Buffer.isBuffer(raw)) {
    return rejected(1, [{ code: 'QA_EVIDENCE_MALFORMED', path: '' }]);
  }
  const bytes = typeof raw === 'string' ? Buffer.byteLength(raw, 'utf8') : raw.length;
  if (bytes > QA_EVIDENCE_LIMITS.evidenceBytes) {
    return rejected(1, [{ code: 'QA_EVIDENCE_TOO_LARGE', path: '' }]);
  }
  let evidence;
  try {
    evidence = JSON.parse(typeof raw === 'string' ? raw : raw.toString('utf8'));
  } catch {
    return rejected(1, [{ code: 'QA_EVIDENCE_MALFORMED', path: '' }]);
  }
  if (nestingDepth(evidence) > QA_EVIDENCE_LIMITS.depth) {
    return rejected(1, [{ code: 'QA_EVIDENCE_TOO_LARGE', path: '' }]);
  }

  const validate = schemaValidator();
  const schemaViolations = validate(evidence)
    ? []
    : validate.errors
        .map((error) => ({
          code: codeForSchemaError(error),
          path: error.instancePath,
          keyword: error.keyword,
        }))
        .filter((violation) => violation.code !== null);
  if (schemaViolations.some((violation) => STAGE_ONE_KEYWORDS.has(violation.keyword))) {
    return rejected(
      1,
      schemaViolations.map(({ code, path }) => ({ code, path }))
    );
  }

  const counter = { count: 0 };
  let redactedEvidence;
  try {
    redactedEvidence = redactCopy(evidence, redact, counter);
  } catch {
    return rejected(2, [{ code: 'QA_EVIDENCE_REDACTION_FAILED', path: '' }]);
  }

  const violations = schemaViolations.map(({ code, path }) => ({ code, path }));
  const push = (code, path) => violations.push({ code, path });
  checkSemantics(evidence, push);
  if (violations.length) return rejected(3, violations);

  compareSets(evidence, population, push);
  if (violations.length) return rejected(4, violations);

  return {
    accepted: true,
    stage: null,
    rejectReasons: [],
    violations: [],
    evidence,
    redactedEvidence,
    redactionCount: counter.count,
  };
}

// §3.5: open without following a symlink in any component, or report that this platform cannot.
const O_NOFOLLOW_ANY_DARWIN = 0x20000000;
function noFollowStrategy() {
  if (process.platform === 'darwin' && Number.parseInt(release(), 10) >= 20) return 'darwin';
  if (process.platform === 'linux') return 'linux';
  return null;
}

async function readArtifact(ref, { roots, limits, budget, onBeforeOpen }) {
  const rootDir = roots?.[ref.root];
  if (typeof rootDir !== 'string' || isArtifactPathRejected(ref.path))
    return { state: 'unresolved' };
  const strategy = noFollowStrategy();
  if (strategy === null) return { state: 'unresolved' };
  let realRoot;
  try {
    realRoot = await realpath(rootDir);
  } catch {
    return { state: 'unresolved' };
  }
  const relative = nfc(ref.path);
  const fullPath = join(realRoot, ...relative.split('/'));
  if (onBeforeOpen) await onBeforeOpen({ root: realRoot, path: relative });
  const flags =
    fsConstants.O_RDONLY |
    fsConstants.O_NONBLOCK |
    (strategy === 'darwin' ? O_NOFOLLOW_ANY_DARWIN : fsConstants.O_NOFOLLOW);
  let handle;
  try {
    handle = await open(fullPath, flags);
  } catch {
    return { state: 'unresolved' };
  }
  try {
    if (strategy === 'linux') {
      // The kernel's record of what was opened: any symlink on the way changes it.
      const opened = await readlink(`/proc/self/fd/${handle.fd}`).catch(() => null);
      if (opened !== fullPath) return { state: 'unresolved' };
    }
    const stat = await handle.stat();
    if (!stat.isFile() || stat.nlink !== 1) return { state: 'unresolved' };
    if (stat.size > limits.artifactBytes || budget.used + stat.size > limits.artifactTotalBytes) {
      return { state: 'too-large' };
    }
    const hash = createHash('sha256');
    const chunk = Buffer.alloc(1 << 20);
    let size = 0;
    for (;;) {
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, null);
      if (bytesRead === 0) break;
      size += bytesRead;
      if (size > limits.artifactBytes || budget.used + size > limits.artifactTotalBytes) {
        return { state: 'too-large' };
      }
      hash.update(chunk.subarray(0, bytesRead));
    }
    budget.used += size;
    return { state: 'ok', sha256: hash.digest('hex'), size };
  } catch {
    return { state: 'unresolved' };
  } finally {
    await handle.close();
  }
}

/**
 * §3.5: read and hash every referenced artifact under the read rules.
 *
 * @param {Array<{ id: string, root: string, path: string }>} refs - `artifacts.refs` of accepted evidence
 * @param {{ roots?: { repository?: string, artifacts?: string },
 *   limits?: { artifactBytes: number, artifactTotalBytes: number },
 *   onBeforeOpen?: (target: { root: string, path: string }) => unknown }} [options]
 *   `onBeforeOpen` runs after every check and right before the open; tests use it to swap a
 *   directory for a symlink in that window.
 * @returns {Promise<Map<string, { state: 'ok' | 'unresolved' | 'too-large', sha256?: string, size?: number }>>}
 */
export async function resolveQaArtifacts(
  refs,
  { roots = {}, limits = QA_EVIDENCE_LIMITS, onBeforeOpen } = {}
) {
  const resolutions = new Map();
  const budget = { used: 0 };
  for (const ref of asArray(refs)) {
    const id = normalizeQaId(ref?.id);
    if (id === null || resolutions.has(id)) continue;
    resolutions.set(id, await readArtifact(ref, { roots, limits, budget, onBeforeOpen }));
  }
  return resolutions;
}

function artifactCode(id, refsById, resolutions) {
  const ref = refsById.get(id);
  const resolution = resolutions.get(id);
  if (!ref || !resolution || resolution.state === 'unresolved') return 'QA_ARTIFACT_UNRESOLVED';
  if (resolution.state === 'too-large') return 'QA_ARTIFACT_TOO_LARGE';
  const declared = lowerHex(ref.sha256);
  if (declared === null || !SHA256_PATTERN.test(declared) || declared !== resolution.sha256) {
    return 'QA_ARTIFACT_HASH_MISMATCH';
  }
  return null;
}

// §5 conditions 1-4 for one result without subcases (an AC or a subcase).
function judgeResult(result, refsById, resolutions) {
  const codes = new Set();
  const records = new Set();
  const attempts = asArray(result.attempts);
  if (result.status !== 'PASS') codes.add('QA_VERIFICATION_NOT_PASS');
  if (!BASIS_VALUES.has(result.basis)) codes.add('QA_VERIFICATION_BASIS_MISSING');
  else if (result.basis === 'explore') codes.add('QA_VERIFICATION_EXPLORE_ONLY');
  if ((result.status === 'PASS' || result.status === 'FAIL') && attempts.length === 0) {
    codes.add('QA_VERIFICATION_ATTEMPTS_EMPTY');
  }
  if (
    (result.status === 'SKIP' || result.status === 'NOT_RUN') &&
    !NOT_RUN_REASONS.has(result.notRunReason)
  ) {
    records.add('QA_VERIFICATION_REASON_MISSING');
  }
  const statuses = new Set(attempts.map((attempt) => attempt.status));
  if (statuses.has('PASS') && statuses.has('FAIL')) codes.add('QA_VERIFICATION_FLAKY');
  for (const attempt of attempts) {
    const { total, passed } = attempt.assertions;
    if (!(total >= 1 && passed === total)) codes.add('QA_VERIFICATION_ASSERTIONS_MISSING');
    const logCode = artifactCode(normalizeQaId(attempt.logRef), refsById, resolutions);
    if (logCode) codes.add(logCode);
    if (!isNonBlank(attempt.command)) codes.add('QA_EXECUTION_COMMAND_MISSING');
    if (!Number.isInteger(attempt.exitCode)) codes.add('QA_EXECUTION_EXIT_CODE_UNKNOWN');
    else if ((attempt.status === 'PASS') !== (attempt.exitCode === 0)) {
      codes.add('QA_EXECUTION_EXIT_CODE_MISMATCH');
    }
  }
  return { codes, records };
}

function judgeControls(result, subjectRevision, refsById, resolutions) {
  const records = new Set();
  const controls = asArray(result.controls);
  if (controls.length === 0) records.add('QA_CONTROL_MISSING');
  for (const control of controls) {
    if (control.status === 'PASS') records.add('QA_CONTROL_PASSED');
    if (lowerHex(control.revision) === subjectRevision) records.add('QA_CONTROL_SAME_REVISION');
    if (artifactCode(normalizeQaId(control.logRef), refsById, resolutions)) {
      records.add('QA_CONTROL_LOG_UNRESOLVED');
    }
  }
  return records;
}

// §5 conditions 5-8 and the stage-0 code; independent of the AC's result.
function judgeCommon({
  criterion,
  confirmed,
  population,
  globalCodes,
  revisionCodes,
  refsById,
  resolutions,
  trustedSources,
  independence,
}) {
  const codes = new Set([...globalCodes, ...revisionCodes]);
  const expected = isObject(criterion?.expected) ? criterion.expected : {};
  if (!SOURCE_VALUES.has(expected.source)) codes.add('QA_TARGET_EXPECTED_SOURCE_MISSING');
  else if (expected.source === 'derived') codes.add('QA_TARGET_EXPECTED_DERIVED');
  else if (expected.source === 'reproduced') codes.add('QA_TARGET_EXPECTED_REPRODUCED');
  else {
    const sourceId = normalizeQaId(expected.sourceRef);
    if (sourceId === null || artifactCode(sourceId, refsById, resolutions)) {
      codes.add('QA_TARGET_EXPECTED_SOURCE_UNRESOLVED');
    } else if (!trustedSources.has(sourceId)) {
      codes.add('QA_TARGET_EXPECTED_SOURCE_UNTRUSTED');
    }
  }
  if (typeof expected.value !== 'string') codes.add('QA_TARGET_EXPECTED_MISSING');
  else if (population.determined && confirmed && expected.value !== confirmed.expected) {
    codes.add('QA_TARGET_EXPECTED_MISMATCH');
  }
  if (independence !== 'known') codes.add('QA_INDEPENDENCE_UNKNOWN');
  return codes;
}

function revisionCodes(subjectRevision, observed) {
  const codes = new Set();
  const head = lowerHex(observed?.head);
  if (head === null || !COMMIT_PATTERN.test(head)) codes.add('QA_TARGET_REVISION_UNOBSERVED');
  else if (head !== subjectRevision) codes.add('QA_TARGET_REVISION_STALE');
  if (observed?.dirty !== false) codes.add('QA_TARGET_REVISION_UNOBSERVED');
  return codes;
}

/**
 * Stage 5 (§5) and the projection (§8.1). Pure.
 *
 * @param {object} input
 * @param {ReturnType<typeof checkQaEvidence>} input.checked
 * @param {ReturnType<typeof determineAcPopulation>} input.population
 * @param {{ head?: string | null, dirty?: boolean | null, changedFiles?: string[] }} [input.observed]
 * @param {Map<string, { state: string, sha256?: string, size?: number }>} [input.artifactResolutions]
 * @param {string} [input.independence] - only `known` satisfies §5 condition 8
 * @param {Iterable<string>} [input.trustedSourceIds] - artifact ids the host found in a trusted tree
 */
export function judgeQaEvidence({
  checked,
  population,
  observed,
  artifactResolutions = new Map(),
  independence = PRODUCTION_INDEPENDENCE,
  trustedSourceIds = [],
}) {
  const projectionFor = (verified) =>
    population.determined
      ? {
          total: population.criteria.size,
          verified,
          unverified: population.criteria.size - verified,
        }
      : null;
  const base = {
    accepted: checked.accepted,
    stage: checked.stage,
    rejectReasons: checked.rejectReasons,
    violations: checked.violations,
    populationDetermined: population.determined,
  };
  if (!checked.accepted) {
    return {
      ...base,
      globalReasonCodes: [],
      criteria: [],
      projection: projectionFor(0),
      redaction: null,
      artifacts: [],
    };
  }

  const { evidence, redactedEvidence } = checked;
  const subjectRevision = evidence.target.subjectRevision.toLowerCase();
  const refs = isObject(evidence.artifacts) ? asArray(evidence.artifacts.refs) : [];
  const refsById = new Map(refs.map((ref) => [normalizeQaId(ref.id), ref]));
  const trustedSources = new Set([...trustedSourceIds].map(normalizeQaId));
  const globalCodes = new Set();
  if (!population.determined) globalCodes.add('QA_AC_POPULATION_UNKNOWN');
  if (!isNonBlank(evidence.execution?.runner)) globalCodes.add('QA_EXECUTION_RUNNER_MISSING');
  if (!isNonBlank(evidence.environment?.os)) globalCodes.add('QA_ENVIRONMENT_INCOMPLETE');
  const revision = revisionCodes(subjectRevision, observed);

  const targetById = new Map(
    evidence.target.acceptanceCriteria.map((criterion) => [normalizeQaId(criterion.id), criterion])
  );
  const resultById = new Map(
    evidence.verification.map((result) => [normalizeQaId(result.acId), result])
  );
  const confirmedIds = population.determined
    ? [...population.criteria.keys()]
    : [...targetById.keys()];

  const criteria = confirmedIds.map((acId) => {
    const result = resultById.get(acId);
    const codes = judgeCommon({
      criterion: targetById.get(acId),
      confirmed: population.criteria.get(acId),
      population,
      globalCodes,
      revisionCodes: revision,
      refsById,
      resolutions: artifactResolutions,
      trustedSources,
      independence,
    });
    let records = new Set();
    const subcases = [];
    if (!result) codes.add('QA_VERIFICATION_AC_MISSING');
    else {
      const resultSubcases = asArray(result.subcases);
      if (resultSubcases.length === 0) {
        const judged = judgeResult(result, refsById, artifactResolutions);
        judged.codes.forEach((code) => codes.add(code));
        records = judged.records;
      } else {
        for (const subcase of resultSubcases) {
          const judged = judgeResult(subcase, refsById, artifactResolutions);
          judged.codes.forEach((code) => codes.add(code));
          subcases.push({
            id: normalizeQaId(subcase.id),
            status: subcase.status,
            reasonCodes: ordered(judged.codes, AC_REASON_ORDER),
            records: ordered(judged.records, RECORD_ORDER),
          });
        }
      }
      judgeControls(result, subjectRevision, refsById, artifactResolutions).forEach((code) =>
        records.add(code)
      );
    }
    const reasonCodes = ordered(codes, AC_REASON_ORDER);
    return {
      acId,
      required: population.criteria.get(acId)?.required ?? null,
      status: result ? result.status : 'NOT_RUN',
      verified: reasonCodes.length === 0,
      reasonCodes,
      records: ordered(records, RECORD_ORDER),
      subcases,
    };
  });

  const artifacts = refs.map((ref) => {
    const id = normalizeQaId(ref.id);
    const resolution = artifactResolutions.get(id);
    const entry = { id, state: resolution?.state ?? 'unresolved' };
    if (ref.sensitivity === 'public') {
      entry.path = nfc(ref.path);
      if (resolution?.size !== undefined) entry.size = resolution.size;
    }
    return entry;
  });

  return {
    ...base,
    globalReasonCodes: ordered(globalCodes, AC_REASON_ORDER),
    criteria,
    projection: projectionFor(criteria.filter((criterion) => criterion.verified).length),
    revision: {
      observedHead: lowerHex(observed?.head),
      dirty: typeof observed?.dirty === 'boolean' ? observed.dirty : null,
      changedFiles: asArray(observed?.changedFiles).filter((file) => typeof file === 'string'),
    },
    redaction: { replaced: checked.redactionCount, evidence: redactedEvidence },
    artifacts,
  };
}

/**
 * Stages 0-5 with every dependency injectable. Tests use this; production uses `auditQaEvidence`.
 *
 * @param {object} input
 * @param {string | Buffer} input.evidence
 * @param {Parameters<typeof determineAcPopulation>[0]} input.population
 * @param {{ head?: string | null, dirty?: boolean | null, changedFiles?: string[] }} [input.observed]
 * @param {{ repository?: string, artifacts?: string }} [input.roots]
 * @param {string} [input.independence]
 * @param {Iterable<string>} [input.trustedSourceIds]
 * @param {(text: string) => { text: string, count: number }} [input.redact]
 * @param {{ artifactBytes: number, artifactTotalBytes: number }} [input.limits]
 * @param {(target: { root: string, path: string }) => unknown} [input.onBeforeOpen]
 */
export async function evaluateQaEvidence({
  evidence,
  population,
  observed,
  roots,
  independence = PRODUCTION_INDEPENDENCE,
  trustedSourceIds = [],
  redact,
  limits,
  onBeforeOpen,
}) {
  const settled = determineAcPopulation(population);
  const checked = checkQaEvidence(evidence, { population: settled, ...(redact ? { redact } : {}) });
  const artifactResolutions = checked.accepted
    ? await resolveQaArtifacts(checked.evidence.artifacts?.refs, { roots, limits, onBeforeOpen })
    : new Map();
  return judgeQaEvidence({
    checked,
    population: settled,
    observed,
    artifactResolutions,
    independence,
    trustedSourceIds,
  });
}

/**
 * Production entry point. Independence is always `unknown` and no source is trusted, because the
 * first version has no host path for either (§9): every AC stays unverified.
 *
 * @param {{ evidence: string | Buffer, population: Parameters<typeof determineAcPopulation>[0],
 *   observed?: { head?: string | null, dirty?: boolean | null, changedFiles?: string[] },
 *   roots?: { repository?: string, artifacts?: string } }} input
 */
export function auditQaEvidence({ evidence, population, observed, roots }) {
  return evaluateQaEvidence({
    evidence,
    population,
    observed,
    roots,
    independence: PRODUCTION_INDEPENDENCE,
    trustedSourceIds: [],
  });
}
