/**
 * after-change adapter support (#2275 PR-3C, Epic #2054 Phase 3).
 *
 * PR-3B added the fast-verification checkpoint core
 * (`src/lib/fast-verification.mjs`). This module is the piece between a host
 * that notices "an edit settled" and that core: it resolves the neutral
 * `after-change` trigger and runs the checkpoint. It is what the Claude Code
 * `PostToolUse` hook calls, but it does not know that:
 *
 *   - it is HOST-NEUTRAL. No hook name, no tool name, no host payload shape
 *     appears here. The host vocabulary lives in `.claude/hooks/` and is
 *     translated there; `tests/after-change-adapter.test.mjs` pins the absence
 *     of that vocabulary in this file AND in the core it calls;
 *   - it holds NO gate, decision or merge authority. It returns the evidence
 *     the core produced. `observe` is the only mode, inherited from the
 *     registry declaration, and the core refuses anything else;
 *   - it makes NO model call and NO network call, and starts no process of its
 *     own: the single command path stays `runDeterministicGates` (#1401),
 *     reached through the core. The import list of this file is asserted
 *     mechanically by the test;
 *   - it is OPT-IN. `isAfterChangeObserveEnabled` is false for every
 *     environment that does not explicitly ask for the checkpoint, so a host
 *     without the plugin, or with the plugin and no opt-in, behaves exactly as
 *     it did before this PR.
 *
 * WHY THIS MODULE DECLARES DELETIONS. The core stages the changed files into a
 * clean sandbox and refuses to read a `pass` whose subject files did not all
 * arrive (#2311). A file the change DELETED cannot arrive, so a change that
 * removes a file would be permanently `unrunnable` unless the caller says
 * which paths were removed. The core deliberately does not infer that from the
 * filesystem — an empty or wrong source dir makes every path absent, and
 * reading that as "all deleted" manufactures the false green the checkpoint
 * exists to prevent. Declaring deletions is therefore the adapter's job, and
 * `parseChangedFileStatus` is how it is done: the status letters of
 * `git diff --name-status` are the host's own record of what it removed, not
 * an inference from what happens to be on disk now.
 */

import { runFastVerification } from './fast-verification.mjs';
import { resolveTrigger } from './trigger-resolver.mjs';

/** The neutral event this adapter converts an edit into. */
export const AFTER_CHANGE_EVENT = 'after-change';

/**
 * Opt-in switch. The checkpoint is OFF unless the environment sets this to
 * exactly `1`: any other value, including `true`, `yes` and an empty string,
 * leaves the host untouched. One exact literal rather than a truthiness test,
 * so a stray value can never turn observation on by accident.
 */
export const AFTER_CHANGE_OPT_IN_ENV = 'RIVER_AFTER_CHANGE_OBSERVE';

export class AfterChangeAdapterError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = 'AfterChangeAdapterError';
  }
}

/**
 * @param {Record<string, string|undefined>} [env]
 * @returns {boolean} whether the host asked for the after-change checkpoint
 */
export function isAfterChangeObserveEnabled(env) {
  return env?.[AFTER_CHANGE_OPT_IN_ENV] === '1';
}

/**
 * Parse `git diff --name-status` output into the changed set and the subset of
 * it the change DELETED.
 *
 * The status letter is the record of intent; the filesystem is not consulted.
 * Renames and copies arrive as `R100\told\tnew` / `C75\told\tnew`: the new path
 * is changed, and for a rename the old path is gone, so it is reported as a
 * deletion. `deletedFiles` is always a subset of `changedFiles`, which is what
 * the core requires — it drops any declared deletion that is not in scope.
 *
 * Unparseable lines are ignored rather than guessed at: a line this function
 * cannot read contributes no file, so it can never quietly excuse one from
 * being staged.
 *
 * @param {string} nameStatusText raw `git diff --name-status` output
 * @returns {{ changedFiles: string[], deletedFiles: string[] }}
 */
export function parseChangedFileStatus(nameStatusText) {
  const changed = new Set();
  const deleted = new Set();
  if (typeof nameStatusText !== 'string') return { changedFiles: [], deletedFiles: [] };
  for (const rawLine of nameStatusText.split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    if (line.length === 0) continue;
    const fields = line.split('\t');
    const status = fields[0];
    if (typeof status !== 'string' || status.length === 0) continue;
    const letter = status[0];
    if (letter === 'R' || letter === 'C') {
      const from = fields[1];
      const to = fields[2];
      if (!from || !to) continue;
      changed.add(to);
      if (letter === 'R') {
        changed.add(from);
        deleted.add(from);
      }
      continue;
    }
    const filePath = fields[1];
    if (!filePath) continue;
    changed.add(filePath);
    if (letter === 'D') deleted.add(filePath);
  }
  const changedFiles = [...changed].sort();
  return {
    changedFiles,
    deletedFiles: [...deleted].filter((file) => changed.has(file)).sort(),
  };
}

/**
 * Resolve `after-change` and run the fast-verification checkpoint on it.
 *
 * Deliberately exposes NO injection point for the trigger resolver or the
 * checkpoint: the production wiring is the only wiring, so a test of this
 * function is a test of what actually runs (CLAUDE.md "Tests one layer inside
 * miss wiring"). What the checkpoint itself injects for its own tests stays
 * its business.
 *
 * @param {object} input
 * @param {object} input.registry the trigger registry (`flows/entry-map.json`)
 * @param {string} input.subjectRevision revision the checkpoint is about
 * @param {string[]} [input.changedFiles] repo-relative paths the change touched
 * @param {string[]} [input.deletedFiles] subset of `changedFiles` the change DELETED
 * @param {Array<object>} [input.selected] selected skills (`metadata.deterministicGate`)
 * @param {string} [input.trustedTree] host-trusted base checkout (allowlist source)
 * @param {string} [input.reviewSourceDir] dir the changed files are staged FROM
 * @param {Record<string, string|undefined>} [input.processEnv] source env to scrub
 * @param {Iterable<string>} [input.seenOccurrences] occurrence keys already recorded
 * @param {() => (string|null|Promise<string|null>)} [input.readSubjectRevision] re-read
 * @param {() => number} [input.now] injected clock (ms since epoch)
 * @returns {Promise<object>} fast-verification evidence
 */
export async function runAfterChangeCheckpoint({
  registry,
  subjectRevision,
  changedFiles,
  deletedFiles,
  selected,
  trustedTree,
  reviewSourceDir,
  processEnv,
  seenOccurrences,
  readSubjectRevision,
  now,
} = {}) {
  if (registry == null || typeof registry !== 'object') {
    throw new AfterChangeAdapterError('registry must be the trigger registry object.');
  }
  const resolution = resolveTrigger(
    { event: AFTER_CHANGE_EVENT, subjectRevision },
    { registry, flowDocuments: [] }
  );
  return runFastVerification({
    resolution,
    subjectRevision,
    changedFiles,
    deletedFiles,
    selected,
    trustedTree,
    reviewSourceDir,
    processEnv,
    seenOccurrences,
    readSubjectRevision,
    ...(typeof now === 'function' ? { now } : {}),
  });
}
