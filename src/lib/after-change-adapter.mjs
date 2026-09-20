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
import { unquoteGitPath } from './git.mjs';
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
 * Split a NUL-delimited git record stream into fields.
 *
 * `-z` is what makes the path unambiguous: without it git applies
 * `core.quotePath` and emits `"tab\there.txt"` /
 * `"\346\227\245\346\234\254..."` for any path with a TAB or a non-ASCII
 * byte. The old TAB-split parser handed those spellings through verbatim, and
 * the two halves failed in OPPOSITE directions: a modified non-ASCII file got a
 * path that could not be staged (`unrunnable`, so a repo with Japanese
 * filenames could never run the checkpoint), while a DELETED one put a
 * fictional path into `deletedFiles`, which excused it from staging and let the
 * run report `pass` — with the file that was really removed never accounted for
 * at all. `-z` removes the quoting, and `unquoteGitPath` (`./git.mjs`, the
 * repo's single decoder for a quoted git path, #2240/#2241) decodes anything
 * that still arrives quoted rather than a second private unescaper here.
 */
const gitRecords = (text) =>
  typeof text === 'string'
    ? text
        .split('\0')
        .filter((field) => field.length > 0)
        .map((field) => unquoteGitPath(field))
    : [];

/**
 * Build the changed set, and the subset of it the change DELETED, from git's
 * own record of the change.
 *
 * TWO SOURCES, because one is not the change. `git diff --name-status HEAD`
 * reports only paths git already tracks, and the single most common thing a
 * `Write` does is CREATE a file — which is untracked, and therefore absent from
 * that output entirely. A checkpoint fed only the tracked half publishes a
 * `pass` for a change whose new files it never looked at, and the mixed case is
 * the dangerous one: one tracked edit alongside any number of new files still
 * produces a `pass`, because the run is no longer empty. `git ls-files --others
 * --exclude-standard` is the other half, merged in as an addition.
 *
 * DELETION IS DECLARED, AND THEN CHECKED AGAINST DISK. A declared deletion
 * excuses its path from staging, so a wrong one is a false green. Two things
 * are therefore required of every entry in `deletedFiles`: it is in scope (the
 * core drops what is not, and a dropped declaration stops excusing anything),
 * and the path is not ALSO present as an untracked file. `git rm --cached`, and
 * delete-then-recreate, both produce exactly that shape — `D` in the diff and
 * the same path in `--others` — and the file is on disk, so it must be staged
 * and checked like any other.
 *
 * Unparseable records are ignored rather than guessed at: a record this
 * function cannot read contributes no file, so it can never quietly excuse one
 * from being staged.
 *
 * @param {string} nameStatusZ `git diff -z --name-status` output (NUL-delimited)
 * @param {object} [sources]
 * @param {string} [sources.untrackedZ] `git ls-files -z --others --exclude-standard`
 * @returns {{ changedFiles: string[], deletedFiles: string[] }}
 */
export function parseChangedFileStatus(nameStatusZ, { untrackedZ } = {}) {
  const changed = new Set();
  const deleted = new Set();
  const untracked = new Set(gitRecords(untrackedZ));

  const fields = gitRecords(nameStatusZ);
  for (let i = 0; i < fields.length; i += 1) {
    const status = fields[i];
    // A status field is a letter plus an optional similarity score. Anything
    // else means the stream is not the shape this function reads, and guessing
    // where the next record starts is how a path gets misattributed.
    if (!/^[A-Z][0-9]*$/.test(status)) continue;
    const letter = status[0];
    if (letter === 'R' || letter === 'C') {
      const from = fields[i + 1];
      const to = fields[i + 2];
      i += 2;
      if (!from || !to) continue;
      changed.add(to);
      if (letter === 'R') {
        changed.add(from);
        deleted.add(from);
      }
      continue;
    }
    const filePath = fields[i + 1];
    i += 1;
    if (!filePath) continue;
    changed.add(filePath);
    if (letter === 'D') deleted.add(filePath);
  }

  for (const file of untracked) changed.add(file);

  const changedFiles = [...changed].sort();
  return {
    changedFiles,
    deletedFiles: [...deleted].filter((file) => changed.has(file) && !untracked.has(file)).sort(),
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
