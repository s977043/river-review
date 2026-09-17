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
  ALLOWLIST_MISS: 'allowlist-miss',
  EXECUTOR_STATUS_MISSING: 'executor-status-missing',
  SUBJECT_REVISION_CHANGED: 'subject-revision-changed',
});

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
  if (trustedEntries == null) {
    return finish(
      checkIds.map((id) =>
        checkEntry(id, CHECK_STATUS.BYPASSED, FAST_VERIFICATION_REASON.TRUSTED_ALLOWLIST_ABSENT)
      ),
      FAST_VERIFICATION_REASON.TRUSTED_ALLOWLIST_ABSENT
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
  const byId = new Map();
  for (const result of Array.isArray(gateResult?.results) ? gateResult.results : []) {
    byId.set(String(result?.skillId), result);
  }

  const checks = checkIds.map((id) => {
    const result = byId.get(id);
    // A selected check the orchestrator did not run: the trusted allowlist
    // does not carry this exact argv. Not an execution, so not a verdict.
    if (result == null) {
      return checkEntry(id, CHECK_STATUS.BYPASSED, FAST_VERIFICATION_REASON.ALLOWLIST_MISS);
    }
    const { skillId: _skillId, status, reasonCode, ...metadata } = result;
    if (status !== CHECK_STATUS.PASS && status !== CHECK_STATUS.FAIL) {
      // Anything the executor could not turn into a verdict is unrunnable —
      // including an absent or unrecognized status, which must not decay to pass.
      return checkEntry(id, CHECK_STATUS.UNRUNNABLE, resolveUnrunnableReason(status, reasonCode), {
        ...metadata,
      });
    }
    return checkEntry(id, status, reasonCode ?? FAST_VERIFICATION_REASON.EXECUTED, {
      ...metadata,
    });
  });

  // (e) Staleness. If the subject moved while the checks ran, the verdicts
  // describe a revision that is no longer the subject.
  const currentRevision =
    typeof readSubjectRevision === 'function' ? nonEmptyString(await readSubjectRevision()) : null;
  if (currentRevision != null && currentRevision !== revision) {
    const staled = checks.map((check) =>
      EXECUTED_STATUSES.includes(check.status)
        ? {
            ...check,
            status: CHECK_STATUS.STALE,
            reasonCode: FAST_VERIFICATION_REASON.SUBJECT_REVISION_CHANGED,
            supersededStatus: check.status,
          }
        : check
    );
    return finish(staled, FAST_VERIFICATION_REASON.SUBJECT_REVISION_CHANGED);
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
