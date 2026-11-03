import { pathToFileURL } from 'node:url';

// #2701 Phase 1: validate operator-supplied case *metadata*, not the bug oracle.
// No incident discovery, saved-run execution, scoring, writes or approval.
export const MAX_INPUT_BYTES = 128 * 1024;
const MAX_CASES = 30;
const SHA = /^[a-f0-9]{40}$/i;
const DIGEST = /^[a-f0-9]{64}$/i;
const CASE_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
const OPAQUE_REF = /^[a-z0-9][a-z0-9._:/#@-]{0,255}$/i;
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validSha(value) {
  return typeof value === 'string' && SHA.test(value);
}

function validDigest(value) {
  return typeof value === 'string' && DIGEST.test(value);
}

function validCaseId(value) {
  return typeof value === 'string' && CASE_ID.test(value);
}

function validTime(value) {
  if (typeof value !== 'string' || !ISO_TIME.test(value)) return false;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return false;
  const canonical = value.includes('.') ? value : value.replace('Z', '.000Z');
  return new Date(timestamp).toISOString() === canonical;
}

function validRef(value) {
  return typeof value === 'string' && OPAQUE_REF.test(value);
}

function checkKeys(value, allowed) {
  if (!isRecord(value)) return;
  if (Object.keys(value).some((key) => !allowed.includes(key))) {
    throw new Error('unsupported_field');
  }
}

function caseReasons(entry) {
  if (!isRecord(entry)) return ['invalid_case'];
  checkKeys(entry, [
    'caseId',
    'partition',
    'label',
    'usedForTuning',
    'source',
    'oracle',
    'isolation',
  ]);
  const reasons = [];
  const { source, oracle, isolation } = entry;
  checkKeys(source, [
    'reviewedTarget',
    'reviewedCommit',
    'mergeBase',
    'reviewedAt',
    'diffScopeRef',
    'reviewVisibility',
    'evidenceDigest',
    'bugIntroducingCommit',
    'fixEvidenceRef',
    'fixObservedAt',
  ]);
  checkKeys(oracle, [
    'claimedStatus',
    'adjudicatorRef',
    'evidenceRef',
    'adjudicatedAt',
    'causeRef',
    'locationRef',
    'cleanScopeRef',
    'alternativeAssessment',
  ]);
  checkKeys(isolation, ['labelsWithheld', 'laterFixWithheld', 'privateReportsWithheld']);

  if (!validCaseId(entry.caseId)) reasons.push('invalid_case_id');
  if (!['development', 'held_out'].includes(entry.partition)) reasons.push('invalid_partition');
  if (!['bug', 'clean'].includes(entry.label)) reasons.push('invalid_label');
  if (
    typeof entry.usedForTuning !== 'boolean' ||
    (entry.partition === 'held_out' && entry.usedForTuning !== false)
  ) {
    reasons.push('unconfirmed_tuning_exposure');
  }
  if (
    !isRecord(source) ||
    !validRef(source.reviewedTarget) ||
    !validSha(source.reviewedCommit) ||
    !validSha(source.mergeBase) ||
    !validTime(source.reviewedAt) ||
    !validRef(source.diffScopeRef) ||
    !validDigest(source.evidenceDigest)
  ) {
    reasons.push('incomplete_review_snapshot');
  }
  if (source?.reviewVisibility !== 'reviewable') reasons.push('unconfirmed_review_visibility');
  if (
    !isRecord(oracle) ||
    oracle.claimedStatus !== 'independently_checked' ||
    !validRef(oracle.adjudicatorRef) ||
    !validRef(oracle.evidenceRef) ||
    !validTime(oracle.adjudicatedAt)
  ) {
    reasons.push('unconfirmed_oracle');
  }

  if (entry.label === 'bug') {
    if (
      !validSha(source?.bugIntroducingCommit) ||
      !validRef(source?.fixEvidenceRef) ||
      !validTime(source?.fixObservedAt) ||
      !validRef(oracle?.causeRef) ||
      !validRef(oracle?.locationRef)
    ) {
      reasons.push('incomplete_bug_oracle');
    }
    if (
      validTime(source?.reviewedAt) &&
      validTime(source?.fixObservedAt) &&
      Date.parse(source.fixObservedAt) <= Date.parse(source.reviewedAt)
    ) {
      reasons.push('fix_not_after_review');
    }
    if (oracle?.cleanScopeRef !== undefined || oracle?.alternativeAssessment !== undefined) {
      reasons.push('mixed_oracle_fields');
    }
  }
  if (entry.label === 'clean') {
    if (
      !validRef(oracle?.cleanScopeRef) ||
      !['checked_valid', 'checked_not_applicable'].includes(oracle?.alternativeAssessment)
    ) {
      reasons.push('unconfirmed_clean_scope');
    }
    if (
      source?.bugIntroducingCommit !== undefined ||
      source?.fixEvidenceRef !== undefined ||
      source?.fixObservedAt !== undefined ||
      oracle?.causeRef !== undefined ||
      oracle?.locationRef !== undefined
    ) {
      reasons.push('mixed_oracle_fields');
    }
  }
  if (
    !isRecord(isolation) ||
    isolation.labelsWithheld !== true ||
    isolation.laterFixWithheld !== true ||
    isolation.privateReportsWithheld !== true
  ) {
    reasons.push('unconfirmed_context_isolation');
  }
  return reasons;
}

/** Structural preparation only. All apparent oracle and isolation claims are unverified. */
export function assessIncidentReviewSmoke(input) {
  if (!isRecord(input)) throw new Error('invalid_input');
  checkKeys(input, ['kind', 'heldOutFrozenAt', 'cases']);
  if (
    input.kind !== 'incident-review-smoke/v1' ||
    !Array.isArray(input.cases) ||
    input.cases.length > MAX_CASES
  ) {
    throw new Error('invalid_input');
  }
  const reasons = [];
  if (!validTime(input.heldOutFrozenAt)) reasons.push('holdout_not_frozen');
  if (input.cases.length === 0) reasons.push('no_cases');

  const counts = {
    total: input.cases.length,
    reportedBug: 0,
    reportedClean: 0,
    development: 0,
    heldOut: 0,
  };
  const seen = new Set();
  const seenSnapshots = new Map();
  const cases = Array.from({ length: input.cases.length }, (_, index) => {
    const entry = input.cases[index];
    const problems = caseReasons(entry);
    if (isRecord(entry)) {
      if (entry.label === 'bug') counts.reportedBug += 1;
      if (entry.label === 'clean') counts.reportedClean += 1;
      if (entry.partition === 'development') counts.development += 1;
      if (entry.partition === 'held_out') counts.heldOut += 1;
      if (validCaseId(entry.caseId)) {
        if (seen.has(entry.caseId)) problems.push('duplicate_case_id');
        seen.add(entry.caseId);
      }
      if (
        ['development', 'held_out'].includes(entry.partition) &&
        isRecord(entry.source) &&
        validRef(entry.source.reviewedTarget) &&
        validSha(entry.source.reviewedCommit) &&
        validSha(entry.source.mergeBase) &&
        validRef(entry.source.diffScopeRef) &&
        validDigest(entry.source.evidenceDigest)
      ) {
        const snapshotKey = JSON.stringify([
          entry.source.reviewedTarget,
          entry.source.reviewedCommit,
          entry.source.mergeBase,
          entry.source.diffScopeRef,
          entry.source.evidenceDigest,
        ]);
        const previousPartition = seenSnapshots.get(snapshotKey);
        if (previousPartition && previousPartition !== entry.partition) {
          problems.push('cross_partition_snapshot');
        } else {
          seenSnapshots.set(snapshotKey, entry.partition);
        }
      }
    }
    return {
      index,
      metadataStatus: problems.length ? 'incomplete' : 'complete',
      reasonCodes: problems,
    };
  });
  if (counts.reportedBug === 0) reasons.push('no_reported_bug_cases');
  if (counts.reportedClean === 0) reasons.push('no_reported_clean_cases');
  if (counts.development === 0 || counts.heldOut === 0) reasons.push('missing_dataset_partition');

  const complete = reasons.length === 0 && cases.every((entry) => entry.reasonCodes.length === 0);
  return {
    kind: 'incident-review-smoke-preflight-result/v1',
    scope: 'metadata-only',
    metadataStatus: complete ? 'complete' : 'incomplete',
    evidenceTrust: 'unverified-input',
    authorizesApproval: false,
    precision: null,
    recall: null,
    harmfulFalsePositiveRate: null,
    humanAttention: null,
    decision: null,
    writeEffects: [],
    counts,
    reasonCodes: reasons,
    cases,
  };
}

async function readStdin(stream, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let settled = false;
    const timer = setTimeout(() => finish(new Error('input_timeout')), timeoutMs);
    function finish(error, value) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      stream.off('data', onData);
      stream.off('end', onEnd);
      stream.pause();
      // Even a successfully ended source can fail during auto-destroy cleanup.
      stream.once('close', () => stream.off('error', onError));
      if (error) {
        // A failing producer may emit another error after overflow/timeout.
        // Keep the listener until close so it cannot escape as raw stderr.
        stream.destroy();
        reject(error);
      } else {
        resolve(value);
      }
    }
    function onData(chunk) {
      let bytes;
      try {
        if (!Buffer.isBuffer(chunk) && typeof chunk !== 'string') {
          finish(new Error('input_read_failed'));
          return;
        }
        bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      } catch {
        finish(new Error('input_read_failed'));
        return;
      }
      size += bytes.length;
      if (size > MAX_INPUT_BYTES) finish(new Error('input_too_large'));
      else chunks.push(bytes);
    }
    function onEnd() {
      try {
        finish(null, new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
      } catch {
        finish(new Error('invalid_utf8'));
      }
    }
    function onError() {
      finish(new Error('input_read_failed'));
    }
    stream.on('data', onData);
    stream.once('end', onEnd);
    stream.on('error', onError);
    stream.resume();
  });
}

const HELP = `Usage: node scripts/experiments/incident-review-smoke-preflight.mjs < cases.json
Accepts at most 128 KiB of explicit JSON stdin, with a 5-second timeout.
Exit 0: claimed metadata complete (NOT verified evidence or approval).
Exit 3: metadata incomplete. Exit 2: invalid input or transport.
Never sends network requests, runs reviewers, persists cases or calculates accuracy.
`;

function writeOutput(stream, value) {
  return new Promise((resolve, reject) => {
    let settled = false;
    function finish(error) {
      if (settled) return;
      settled = true;
      if (error) {
        // _write callbacks can report an error before its error event fires.
        stream.once('close', () => stream.off('error', onError));
        reject(new Error('output_write_failed'));
      } else {
        stream.off('error', onError);
        resolve();
      }
    }
    function onError() {
      finish(true);
    }
    stream.on('error', onError);
    try {
      stream.write(value, (error) => finish(error));
    } catch {
      finish(true);
    }
  });
}

export async function runIncidentReviewPreflightCli(args, stdin, stdout, stderr) {
  try {
    if (args.length === 1 && args[0] === '--help') {
      await writeOutput(stdout, HELP);
      return 0;
    }
    if (args.length !== 0 || stdin.isTTY) throw new Error('invalid_arguments');
    const input = JSON.parse(await readStdin(stdin));
    const result = assessIncidentReviewSmoke(input);
    await writeOutput(stdout, `${JSON.stringify(result)}\n`);
    return result.metadataStatus === 'complete' ? 0 : 3;
  } catch (error) {
    const safeCodes = new Set([
      'invalid_arguments',
      'input_timeout',
      'input_too_large',
      'invalid_utf8',
      'input_read_failed',
      'invalid_input',
      'unsupported_field',
      'output_write_failed',
    ]);
    const code = safeCodes.has(error.message) ? error.message : 'invalid_json';
    try {
      await writeOutput(stderr, `${JSON.stringify({ error: code })}\n`);
    } catch {
      // Do not echo unsanitized input to an alternative channel when stderr breaks.
    }
    stdin.destroy();
    return 2;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runIncidentReviewPreflightCli(
    process.argv.slice(2),
    process.stdin,
    process.stdout,
    process.stderr
  );
}
