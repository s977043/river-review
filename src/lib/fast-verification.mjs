/**
 * Fast-verification checkpoint core (#2275 PR-3B, Epic #2054 Phase 3).
 *
 * The `after-change` trigger is declared in `flows/entry-map.json` with an
 * EMPTY entries list, `profile: fast-verification` and `mode: observe`: it
 * starts no Flow, and only changed-file-scoped deterministic checks apply.
 * Until now that declaration had no runtime consumer. This module is that
 * consumer, and nothing else:
 *
 *   - it is HOST-NEUTRAL. `PostToolUse`, `Write`, `Edit`, hook names and shell
 *     invocation mechanics belong to the adapter (PR-3C) and never appear
 *     here. The input is a `resolveTrigger` resolution plus a changed-file
 *     list; `tests/fast-verification.test.mjs` pins the absence of host
 *     vocabulary in this file;
 *   - it holds NO gate, decision or merge authority. The output is evidence.
 *     `observe` is the only mode it accepts; an `active` resolution is refused
 *     rather than silently treated as observe;
 *   - it makes NO model call and NO network call. The import list of this file
 *     is asserted mechanically by the test, so a future LLM/network import is
 *     a test failure, not a review question;
 *   - it starts NO process of its own. The single command-execution path is
 *     `runDeterministicGates` (#1401), which keeps trusted-base allowlist,
 *     exact-argv match, scrubbed env, clean sandbox, `execFile`-only and
 *     timeout handling in one place.
 *
 * NEVER A FALSE GREEN. `pass` means a deterministic check really ran and
 * really succeeded on this revision. Every other outcome keeps its own word:
 *
 *   fail       the check ran and reported failure
 *   unrunnable the check was attempted and could not produce a verdict
 *              (spawn error, timeout, invalid entry)
 *   skipped    there was nothing to run (no check selected, no changed file,
 *              or this occurrence already ran)
 *   bypassed   running was not permitted: the host published no trusted
 *              allowlist, or the check is not on it
 *   stale      a verdict exists but describes a revision that is no longer the
 *              subject, so it may not be read as a verdict on the subject
 *
 * STAGING IS PART OF "REALLY RAN ON THIS REVISION" (#2311). A check runs in a
 * sandbox holding copies of the changed files. The sandbox refuses a symlinked,
 * escaping or `.git` path, and a copy can fail. A checker handed a sandbox that
 * is missing one of its subject files still exits 0 — an empty directory is a
 * clean directory as far as a linter is concerned. So a `pass` whose subject
 * files did not all arrive is not a verdict about those files, and this module
 * downgrades it to `unrunnable`: the check WAS attempted, the process DID
 * launch, and what came back cannot be read as a verdict. `bypassed` would be
 * wrong (nothing refused permission) and `skipped` would be worse still (it
 * reads as "nothing needed checking" and is ignored in triage). A `fail` is
 * NOT downgraded: a checker that found a problem in a partial sandbox found a
 * real problem, and hiding it would be the fail-open this module exists to
 * prevent.
 */

import { nonEmptyNfcString as nonEmptyString } from './promotion-candidates.mjs';
import {
  extractGateCommands,
  loadTrustedAllowlistEntries,
  runDeterministicGates,
} from './deterministic-command-orchestrator.mjs';

/** The only profile this checkpoint implements (`schemas/flow-entry-map.schema.json`). */
export const FAST_VERIFICATION_PROFILE = 'fast-verification';

/** The only rollout mode PR-3B runs under. */
export const FAST_VERIFICATION_MODE = 'observe';

/**
 * Check-level status vocabulary. Deliberately six words: collapsing any of the
 * four non-verdict states into `pass` is the failure this checkpoint exists to
 * prevent.
 */
export const CHECK_STATUS = Object.freeze({
  PASS: 'pass',
  FAIL: 'fail',
  UNRUNNABLE: 'unrunnable',
  SKIPPED: 'skipped',
  BYPASSED: 'bypassed',
  STALE: 'stale',
});

/** Statuses that are a real verdict produced by a real execution. */
const EXECUTED_STATUSES = Object.freeze([CHECK_STATUS.PASS, CHECK_STATUS.FAIL]);

/** Stable reason codes. One code per reason a status was chosen. */
export const FAST_VERIFICATION_REASON = Object.freeze({
  EXECUTED: 'check-executed',
  NO_CHECK_SELECTED: 'no-deterministic-check-selected',
  NO_CHANGED_FILES: 'no-changed-files',
  DUPLICATE_OCCURRENCE: 'duplicate-occurrence',
  TRUSTED_ALLOWLIST_ABSENT: 'trusted-allowlist-absent',
  TRUSTED_ALLOWLIST_EMPTY: 'trusted-allowlist-empty',
  ALLOWLIST_MISS: 'allowlist-miss',
  EXECUTOR_STATUS_MISSING: 'executor-status-missing',
  RESULT_CORRELATION_FAILED: 'result-correlation-failed',
  STAGING_INCOMPLETE: 'staging-incomplete',
  STAGING_EVIDENCE_MISSING: 'staging-evidence-missing',
  SUBJECT_REVISION_CHANGED: 'subject-revision-changed',
  SUBJECT_REVISION_UNREADABLE: 'subject-revision-unreadable',
});

/**
 * The ONLY executor fields copied onto a check row. The orchestrator already
 * filters what it preserves, but `runGatesImpl` is injectable, so this module
 * does not inherit that guarantee and re-states it at its own boundary rather
 * than spreading whatever object it was handed.
 */
const SAFE_CHECK_METADATA_KEYS = Object.freeze([
  'durationMs',
  'exitCode',
  'stdoutBytes',
  'unrunnableCause',
]);

/** Refusal reasons a staging row may carry (`STAGING_SKIP_REASON`, #2311). */
const STAGING_SKIP_REASONS = Object.freeze(['symlink', 'outside-root', 'git-path', 'copy-error']);

/**
 * Re-validate the orchestrator's `staging` summary at this module's boundary.
 * `runGatesImpl` is injectable, so nothing that arrives here is trusted to have
 * the shape the real orchestrator produces: an unreadable summary is returned
 * as `null`, which the caller treats as "no staging evidence", never as "fine".
 *
 * @param {unknown} staging
 * @returns {{ requested: number, copied: number, complete: boolean,
 *   skipped: Array<{ path: string, reason: string }> } | null}
 */
function normalizeStaging(staging) {
  if (!isPlainObject(staging)) return null;
  if (typeof staging.complete !== 'boolean') return null;
  if (!Number.isInteger(staging.requested) || staging.requested < 0) return null;
  if (!Number.isInteger(staging.copied) || staging.copied < 0) return null;
  const skipped = [];
  for (const row of Array.isArray(staging.skipped) ? staging.skipped : []) {
    const filePath = nonEmptyString(row?.path);
    if (filePath == null || !STAGING_SKIP_REASONS.includes(row?.reason)) return null;
    skipped.push({ path: filePath, reason: row.reason });
  }
  return {
    requested: staging.requested,
    copied: staging.copied,
    // A summary that claims completeness while reporting a refusal is not
    // believed: the refusals decide.
    complete: staging.complete && skipped.length === 0,
    skipped,
  };
}

function safeCheckMetadata(result) {
  const metadata = {};
  for (const key of SAFE_CHECK_METADATA_KEYS) {
    if (result?.[key] !== undefined) metadata[key] = result[key];
  }
  return metadata;
}

/**
 * Map orchestrator result rows onto the gate positions that produced them.
 * Returns `null` when the rows cannot be attributed — a missing, duplicate or
 * out-of-range `gateIndex` — so the caller can refuse to read any of them as a
 * verdict instead of guessing.
 *
 * @param {unknown} results
 * @param {number} gateCount
 * @returns {Map<number, object> | null}
 */
function correlateResults(results, gateCount) {
  const rows = Array.isArray(results) ? results : [];
  const byGateIndex = new Map();
  for (const row of rows) {
    const index = row?.gateIndex;
    if (!Number.isInteger(index) || index < 0 || index >= gateCount) return null;
    if (byGateIndex.has(index)) return null;
    byGateIndex.set(index, row);
  }
  return byGateIndex;
}

export class FastVerificationError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'FastVerificationError';
  }
}

const isPlainObject = (value) =>
  value != null && typeof value === 'object' && !Array.isArray(value);

const compareStrings = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** Changed files are evidence, so they are normalized and order-stable. */
function normalizeChangedFiles(changedFiles) {
  if (changedFiles == null) return [];
  if (!Array.isArray(changedFiles)) {
    throw new FastVerificationError('changedFiles must be an array of strings.');
  }
  const normalized = changedFiles.map((file, index) => {
    const value = nonEmptyString(file);
    if (value == null) {
      throw new FastVerificationError(`changedFiles[${index}] must be a non-empty string.`);
    }
    return value;
  });
  return [...new Set(normalized)].sort(compareStrings);
}

/**
 * Accept only an `after-change`-shaped resolution: the fast-verification
 * profile, observe mode, and no Flow entries. A resolution that selects
 * entries is a Flow occurrence and belongs to the Flow runner, not here.
 */
function readResolution(resolution) {
  if (!isPlainObject(resolution)) {
    throw new FastVerificationError('resolution must be a resolveTrigger result object.');
  }
  const triggerId = nonEmptyString(resolution.triggerId);
  const occurrenceId = nonEmptyString(resolution.occurrenceId);
  if (triggerId == null || occurrenceId == null) {
    throw new FastVerificationError('resolution must carry triggerId and occurrenceId.');
  }
  if (resolution.profile !== FAST_VERIFICATION_PROFILE) {
    throw new FastVerificationError(
      `resolution declares profile "${resolution.profile}"; only "${FAST_VERIFICATION_PROFILE}" is implemented.`
    );
  }
  if (resolution.mode !== FAST_VERIFICATION_MODE) {
    throw new FastVerificationError(
      `resolution declares mode "${resolution.mode}"; this checkpoint runs only in "${FAST_VERIFICATION_MODE}".`
    );
  }
  const entries = Array.isArray(resolution.selectedEntries) ? resolution.selectedEntries : [];
  if (entries.length > 0) {
    throw new FastVerificationError(
      `trigger "${triggerId}" selects Flow entries (${entries.join(', ')}); the fast-verification profile starts no Flow.`
    );
  }
  return { triggerId, occurrenceId };
}

const checkEntry = (id, status, reasonCode, extra = {}) => ({
  id,
  status,
  reasonCode,
  ...extra,
});

/**
 * Checkpoint-level status: the worst thing that happened, under the ordering
 * that keeps a false green impossible. `stale` outranks everything because a
 * stale checkpoint says nothing at all about the current subject.
 */
const CHECKPOINT_PRECEDENCE = [
  CHECK_STATUS.STALE,
  CHECK_STATUS.FAIL,
  CHECK_STATUS.UNRUNNABLE,
  CHECK_STATUS.BYPASSED,
  CHECK_STATUS.SKIPPED,
  CHECK_STATUS.PASS,
];

function aggregateStatus(checks) {
  if (checks.length === 0) return CHECK_STATUS.SKIPPED;
  const present = new Set(checks.map((check) => check.status));
  for (const status of CHECKPOINT_PRECEDENCE) {
    if (present.has(status)) return status;
  }
  return CHECK_STATUS.SKIPPED;
}

/**
 * Run the `after-change` fast-verification checkpoint and return its evidence.
 *
 * @param {object} input
 * @param {object} input.resolution a `resolveTrigger` result for `after-change`
 * @param {string} input.subjectRevision commit SHA / content hash the checkpoint is about
 * @param {string[]} [input.changedFiles] repo-relative paths the change touched
 * @param {Array<object>} [input.selected] selected skills (`metadata.deterministicGate`)
 * @param {string} [input.trustedTree] host-trusted base checkout (allowlist source)
 * @param {string} [input.reviewSourceDir] dir the changed files are staged FROM
 * @param {Record<string, string|undefined>} [input.processEnv] source env to scrub
 * @param {Iterable<string>} [input.seenOccurrences] occurrence keys already recorded
 * @param {() => (string|null|Promise<string|null>)} [input.readSubjectRevision] re-read of the
 *   subject revision after execution; a different value makes the verdicts stale
 * @param {() => number} [input.now] injected clock (ms since epoch)
 * @param {Function} [input.runGatesImpl] injected `runDeterministicGates` (tests)
 * @param {Function} [input.loadAllowlistImpl] injected trusted-allowlist read (tests)
 * @returns {Promise<object>} fast-verification evidence
 *   (`schemas/fast-verification-evidence.schema.json`)
 */
export async function runFastVerification({
  resolution,
  subjectRevision,
  changedFiles,
  selected,
  trustedTree,
  reviewSourceDir,
  processEnv,
  seenOccurrences,
  readSubjectRevision,
  now = Date.now,
  runGatesImpl = runDeterministicGates,
  loadAllowlistImpl = loadTrustedAllowlistEntries,
} = {}) {
  const { triggerId, occurrenceId } = readResolution(resolution);
  const revision = nonEmptyString(subjectRevision);
  if (revision == null) {
    throw new FastVerificationError('subjectRevision must be a non-empty string.');
  }
  const files = normalizeChangedFiles(changedFiles);
  const startedAtMs = now();

  const finish = (checks, reasonCode) => {
    const completedAtMs = now();
    return {
      triggerId,
      occurrenceId,
      occurrenceKey: occurrenceKeyOf({ occurrenceId, subjectRevision: revision }),
      subjectRevision: revision,
      profile: FAST_VERIFICATION_PROFILE,
      mode: FAST_VERIFICATION_MODE,
      changedFiles: files,
      checks,
      status: aggregateStatus(checks),
      reasonCode,
      startedAt: new Date(startedAtMs).toISOString(),
      completedAt: new Date(completedAtMs).toISOString(),
      totalDurationMs: Math.max(0, completedAtMs - startedAtMs),
    };
  };

  // The checks this occurrence is accountable for, read from the same
  // definition the orchestrator runs from so the two cannot enumerate
  // different sets.
  const gates = extractGateCommands(selected);
  const checkIds = gates.map((gate) => String(gate.skillId));

  // (a) Duplicate occurrence. Same occurrence id AND same subject revision has
  // already been accounted for: re-running is not free and not more true.
  const seen = new Set(seenOccurrences ?? []);
  if (seen.has(occurrenceKeyOf({ occurrenceId, subjectRevision: revision }))) {
    return finish(
      checkIds.map((id) =>
        checkEntry(id, CHECK_STATUS.SKIPPED, FAST_VERIFICATION_REASON.DUPLICATE_OCCURRENCE)
      ),
      FAST_VERIFICATION_REASON.DUPLICATE_OCCURRENCE
    );
  }

  // (b) Nothing to run.
  if (checkIds.length === 0) {
    return finish([], FAST_VERIFICATION_REASON.NO_CHECK_SELECTED);
  }
  if (files.length === 0) {
    return finish(
      checkIds.map((id) =>
        checkEntry(id, CHECK_STATUS.SKIPPED, FAST_VERIFICATION_REASON.NO_CHANGED_FILES)
      ),
      FAST_VERIFICATION_REASON.NO_CHANGED_FILES
    );
  }

  // (c) Running not permitted. The allowlist is read from the host-trusted
  // base tree only; a head-side allowlist is never consulted, here or in the
  // orchestrator. Absent → bypassed with a reason, never pass.
  const trustedEntries = await loadAllowlistImpl(trustedTree);
  if (trustedEntries == null || trustedEntries.length === 0) {
    // An allowlist that is absent and one that survived validation with zero
    // entries are different host conditions, and a reader has to be able to
    // tell "no allowlist was published" from "the published one is unusable".
    const reason =
      trustedEntries == null
        ? FAST_VERIFICATION_REASON.TRUSTED_ALLOWLIST_ABSENT
        : FAST_VERIFICATION_REASON.TRUSTED_ALLOWLIST_EMPTY;
    return finish(
      checkIds.map((id) => checkEntry(id, CHECK_STATUS.BYPASSED, reason)),
      reason
    );
  }

  // (d) Execute — through the one #1401 path, on the changed files only.
  const gateResult = await runGatesImpl({
    trustedTree,
    selected,
    reviewSourceDir,
    changedFiles: files,
    processEnv,
  });
  // Correlate results to gates BY POSITION, never by `skillId`. A skill
  // without an id falls back to its command string in `extractGateCommands`,
  // so two gates on the same command with different args share a skillId: a
  // skillId-keyed map silently dropped one of them and reported the survivor's
  // verdict for both — a real `fail` disappearing behind a `pass`.
  const byGateIndex = correlateResults(gateResult?.results, checkIds.length);

  const checks = checkIds.map((id, gateIndex) => {
    if (byGateIndex == null) {
      // The results could not be correlated to the gates that produced them.
      // No row can be attributed, so no row is a verdict.
      return checkEntry(
        id,
        CHECK_STATUS.UNRUNNABLE,
        FAST_VERIFICATION_REASON.RESULT_CORRELATION_FAILED
      );
    }
    const result = byGateIndex.get(gateIndex);
    // A selected check the orchestrator did not run: the trusted allowlist
    // does not carry this exact argv. Not an execution, so not a verdict.
    if (result == null) {
      return checkEntry(id, CHECK_STATUS.BYPASSED, FAST_VERIFICATION_REASON.ALLOWLIST_MISS);
    }
    const { status, reasonCode } = result;
    const metadata = safeCheckMetadata(result);
    const staging = normalizeStaging(result.staging);
    const stagingEvidence = staging == null ? {} : { staging };
    if (status !== CHECK_STATUS.PASS && status !== CHECK_STATUS.FAIL) {
      // Anything the executor could not turn into a verdict is unrunnable —
      // including an absent or unrecognized status, which must not decay to pass.
      return checkEntry(id, CHECK_STATUS.UNRUNNABLE, resolveUnrunnableReason(status, reasonCode), {
        ...metadata,
        ...stagingEvidence,
      });
    }
    // (d2) A `pass` is a verdict about the changed files only if the changed
    // files were there. Absent staging evidence is not evidence of absence of a
    // problem, so it is refused the same way an incomplete staging is (#2311).
    if (status === CHECK_STATUS.PASS && (staging == null || !staging.complete)) {
      return checkEntry(
        id,
        CHECK_STATUS.UNRUNNABLE,
        staging == null
          ? FAST_VERIFICATION_REASON.STAGING_EVIDENCE_MISSING
          : FAST_VERIFICATION_REASON.STAGING_INCOMPLETE,
        { ...metadata, ...stagingEvidence, supersededStatus: CHECK_STATUS.PASS }
      );
    }
    return checkEntry(id, status, reasonCode ?? FAST_VERIFICATION_REASON.EXECUTED, {
      ...metadata,
      ...stagingEvidence,
    });
  });

  // (e) Staleness. If the subject moved while the checks ran — or could not be
  // re-read at all — the verdicts may not be read as verdicts on the subject.
  // "I could not confirm the revision" is not "the revision did not move".
  if (typeof readSubjectRevision === 'function') {
    const currentRevision = nonEmptyString(await readSubjectRevision());
    if (currentRevision !== revision) {
      const reasonCode =
        currentRevision == null
          ? FAST_VERIFICATION_REASON.SUBJECT_REVISION_UNREADABLE
          : FAST_VERIFICATION_REASON.SUBJECT_REVISION_CHANGED;
      const staled = checks.map((check) =>
        EXECUTED_STATUSES.includes(check.status)
          ? {
              ...check,
              status: CHECK_STATUS.STALE,
              reasonCode,
              supersededStatus: check.status,
            }
          : check
      );
      return finish(staled, reasonCode);
    }
  }

  return finish(checks, FAST_VERIFICATION_REASON.EXECUTED);
}

function resolveUnrunnableReason(status, reasonCode) {
  if (status === CHECK_STATUS.UNRUNNABLE) {
    return nonEmptyString(reasonCode) ?? FAST_VERIFICATION_REASON.EXECUTOR_STATUS_MISSING;
  }
  return FAST_VERIFICATION_REASON.EXECUTOR_STATUS_MISSING;
}

/**
 * Idempotency key of one checkpoint: an occurrence is only the same occurrence
 * on the same subject revision. `resolveTrigger` already folds the revision it
 * was given into `occurrenceId`, but a caller may resolve without one, so the
 * revision is carried explicitly rather than assumed.
 *
 * @param {{ occurrenceId: string, subjectRevision: string }} fields
 * @returns {string}
 */
export function occurrenceKeyOf({ occurrenceId, subjectRevision }) {
  return `${occurrenceId}@${subjectRevision}`;
}
