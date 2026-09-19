/**
 * Deterministic command orchestrator — the confluence point (#1401 §11.8 (c2a) / §11.5.3).
 *
 * Composes the four merged building blocks into a single gate pass:
 *   allowlist (validate) → sandbox (prepare env + clean cwd) → executor (run)
 *   → aggregate into the { strictBlock, deterministicUnrunnable } gate inputs
 *   consumed by `deriveGateDecision` (rules 5b / 5c).
 *
 * TRUST BOUNDARY (§11.6). The allowlist is read ONLY from the host-trusted base
 * checkout (`trustedTree`). The PR head's `.river/deterministic-allowlist.yaml`
 * is NEVER read — an implementation agent under review must not be able to add
 * its own command to the allowlist. When `trustedTree` is not supplied or the
 * base allowlist file is absent, this function runs NOTHING and returns the
 * safe-default empty result — deterministic gates are opt-in (§11.6).
 *
 * INJECTABLE EXECUTOR / OFF BY DEFAULT. The actual process launch is reached
 * only through the injected `execImpl` (default `executeDeterministicCommand`).
 * This module itself imports `child_process` transitively via the executor but
 * starts no process on import: nothing runs until a caller invokes
 * `runDeterministicGates`. As of §11.8 (c2) the review pipeline (local-runner /
 * review-plan) invokes this — but ONLY behind a double env-var gate
 * (`RIVER_DETERMINISTIC_EXEC=1` AND `RIVER_TRUSTED_TREE`); absent either, the
 * caller never imports this module and behavior is unchanged. CI wiring
 * (action.yml) lands in (d). Tests inject a mock `execImpl` and `mkdtempImpl`
 * so no real process is spawned.
 *
 * STAGING OUTCOME IS EVIDENCE (#2311). `copyReviewTargetToSandbox` refuses to
 * stage a symlinked, escaping or `.git` path, and can fail to copy one. Before
 * PR #2304 its return value was only gate-decision material and discarding it
 * was harmless. It is not any more: the fast-verification checkpoint publishes
 * `pass` as proof that a check ran on the changed files it names, and a checker
 * handed an empty sandbox exits 0 on its own. Each `results[]` row therefore
 * carries the `staging` summary of the sandbox it ran in, so the layer that
 * publishes a verdict can see which subject files never arrived, and why. Gate
 * aggregation (`strictBlock` / `deterministicUnrunnable`) is deliberately
 * UNCHANGED: this is additive surfacing, not a new gate rule.
 *
 * DELETION IS DECLARED, NEVER INFERRED (#2311 review). A file the change
 * DELETED cannot be staged: it is not in `reviewSourceDir` any more, so the
 * copy fails and the gate would be permanently unrunnable for any change that
 * removes a file. The caller therefore declares them in `deletedFiles`; they
 * are not staged, are excluded from `requested`, and are listed under
 * `staging.deleted` so the scope stays auditable. Absence from the source dir
 * is deliberately NOT read as "deleted": a wrong or empty `reviewSourceDir`
 * makes every path absent, and inferring deletion from it would turn that
 * mistake into a clean bill of health — the exact false green #2311 is about.
 *
 * SAFE EVIDENCE METADATA (#2275 PR-3A). The executor already classifies one
 * command into a verdict plus bounded execution metadata. This orchestrator
 * preserves only an explicit allowlist of that metadata (`durationMs`,
 * `exitCode`, `stdoutBytes`, `unrunnableCause`) in `results[]`. Raw stdout /
 * stderr or arbitrary executor fields are never copied. Gate aggregation is
 * unchanged; this is additive evidence for the after-change fast-verification
 * checkpoint and other provenance consumers.
 */

import fs from 'node:fs/promises';
import path from 'node:path';

import { loadValidAllowlist, matchCommand } from './deterministic-command-allowlist.mjs';
import {
  buildSandboxEnv,
  copyReviewTargetToSandbox,
  makeSandboxTempDir,
} from './deterministic-command-sandbox.mjs';
import { executeDeterministicCommand } from './deterministic-command-executor.mjs';

/** Relative path of the host-trusted allowlist inside the base checkout (§11.6). */
export const ALLOWLIST_RELATIVE_PATH = '.river/deterministic-allowlist.yaml';

/** Safe-default empty result: nothing ran, gate learns nothing. */
function emptyResult() {
  return { strictBlock: false, deterministicUnrunnable: false, results: [] };
}

/**
 * Read + validate the host-trusted allowlist from the base checkout. Returns the
 * surviving valid entries, or `null` when `trustedTree` is unusable / the file
 * is missing (safe-default: run nothing). Never reads the PR head allowlist.
 *
 * Exported (#2275 PR-3B) so the fast-verification checkpoint can tell
 * "the host never opted in" (null) apart from "opted in, nothing matched"
 * without reading the allowlist a second time through its own code path.
 *
 * @param {string | undefined} trustedTree base-checkout path
 * @returns {Promise<Array<object> | null>}
 */
export async function loadTrustedAllowlistEntries(trustedTree) {
  if (typeof trustedTree !== 'string' || trustedTree.length === 0) return null;
  const allowlistPath = path.join(trustedTree, ALLOWLIST_RELATIVE_PATH);
  let yamlText;
  try {
    yamlText = await fs.readFile(allowlistPath, 'utf8');
  } catch {
    // Missing / unreadable base allowlist → deterministic gates are not opted in.
    return null;
  }
  return loadValidAllowlist(yamlText).valid;
}

/**
 * Extract the deterministic-gate command definitions from the selected skills.
 * Exported (#2275 PR-3B) so the fast-verification checkpoint enumerates the
 * checks it expects to run from this one definition rather than a second copy.
 * Only skills whose `metadata.deterministicGate` carries a non-empty `command`
 * are candidates. `args` defaults to `[]`.
 *
 * @param {Array<object>} selected
 * @returns {Array<{ skillId: string, command: string, args: string[] }>}
 */
export function extractGateCommands(selected) {
  const list = Array.isArray(selected) ? selected : [];
  const gates = [];
  for (const skill of list) {
    const gate = skill?.metadata?.deterministicGate;
    if (gate == null || typeof gate !== 'object') continue;
    if (typeof gate.command !== 'string' || gate.command.length === 0) continue;
    const args = Array.isArray(gate.args) ? gate.args : [];
    const skillId = skill?.id ?? skill?.metadata?.id ?? gate.command;
    gates.push({ skillId, command: gate.command, args });
  }
  return gates;
}

/** Why a requested file did not reach the sandbox. One code per refusal kind. */
export const STAGING_SKIP_REASON = Object.freeze({
  SYMLINK: 'symlink',
  OUTSIDE_ROOT: 'outside-root',
  GIT_PATH: 'git-path',
  COPY_ERROR: 'copy-error',
});

/**
 * Summarize one `copyReviewTargetToSandbox` result into bounded evidence.
 *
 * `complete` is the single question a consumer has to answer: did every file
 * this gate was asked to stage actually reach the sandbox? It is computed from
 * the presence of refusals, NOT from `copied.length === requested`, because the
 * residual-symlink sweep can also report a path the request never named.
 *
 * Only repo-relative paths are carried. Copy-error messages are NOT copied:
 * they can embed absolute host paths, and the reason code already says what
 * happened.
 *
 * `requested` counts only the files that were actually asked for, i.e. the
 * changed files MINUS the declared deletions, which are reported separately.
 *
 * @param {number} requested how many files this gate asked to stage
 * @param {object} staged the `copyReviewTargetToSandbox` return value
 * @param {string[]} [deleted] declared deletions, excluded from `requested`
 * @returns {{ requested: number, copied: number, complete: boolean,
 *   skipped: Array<{ path: string, reason: string }>, deleted: string[] }}
 */
function summarizeStaging(requested, staged, deleted = []) {
  const skipped = [];
  const push = (list, reason) => {
    for (const file of Array.isArray(list) ? list : []) {
      if (typeof file === 'string' && file.length > 0) skipped.push({ path: file, reason });
    }
  };
  push(staged?.skippedSymlinks, STAGING_SKIP_REASON.SYMLINK);
  push(staged?.skippedOutside, STAGING_SKIP_REASON.OUTSIDE_ROOT);
  push(staged?.skippedGit, STAGING_SKIP_REASON.GIT_PATH);
  for (const err of Array.isArray(staged?.errors) ? staged.errors : []) {
    if (typeof err?.file === 'string' && err.file.length > 0) {
      skipped.push({ path: err.file, reason: STAGING_SKIP_REASON.COPY_ERROR });
    }
  }
  const copied = Array.isArray(staged?.copied) ? staged.copied.length : 0;
  return {
    requested,
    copied,
    // Incomplete when anything was refused, OR when fewer files arrived than
    // were asked for. The second clause is not redundant: a non-string or empty
    // `files` entry is dropped by `copyReviewTargetToSandbox` without being
    // recorded in ANY of the four skip lists (deterministic-command-sandbox.mjs
    // "Ignore non-string / empty entries safely"), so the count is the only
    // evidence that something never arrived (#2311 review M1).
    complete: skipped.length === 0 && copied >= requested,
    skipped,
    deleted: [...deleted],
  };
}

/**
 * Copy only executor fields that are safe to persist as deterministic evidence.
 * Unknown fields — especially raw stdout/stderr supplied by an injected executor
 * in tests or by a future implementation — are intentionally dropped.
 *
 * @param {object | undefined} result
 * @returns {{durationMs?: number, exitCode?: number, stdoutBytes?: number,
 *   unrunnableCause?: 'spawn-error'|'timeout'|'invalid-entry'}}
 */
function safeExecutionMetadata(result) {
  const metadata = {};
  if (
    typeof result?.durationMs === 'number' &&
    Number.isFinite(result.durationMs) &&
    result.durationMs >= 0
  ) {
    metadata.durationMs = result.durationMs;
  }
  if (Number.isInteger(result?.exitCode) && result.exitCode >= 0) {
    metadata.exitCode = result.exitCode;
  }
  if (Number.isInteger(result?.stdoutBytes) && result.stdoutBytes >= 0) {
    metadata.stdoutBytes = result.stdoutBytes;
  }
  if (
    result?.status === 'unrunnable' &&
    ['spawn-error', 'timeout', 'invalid-entry'].includes(result?.unrunnableCause)
  ) {
    metadata.unrunnableCause = result.unrunnableCause;
  }
  return metadata;
}

/**
 * Run the deterministic gates for a review pass and aggregate their verdicts.
 *
 * Processing (§11.5.3 confluence):
 *  1. Read the host-trusted allowlist from `trustedTree`. Absent → run nothing,
 *     return the safe-default empty result (PR-head allowlist is never read).
 *  2. Collect each selected skill's `deterministicGate` {command, args}.
 *  3. Match each against the valid allowlist by EXACT argv equality
 *     (`matchCommand`). No match → skip (do not run an unlisted command).
 *  4. For each match: prepare a clean cwd + an empty HOME (two temp dirs),
 *     stage the changed files, build the scrubbed env, then invoke the injected
 *     `execImpl`. Temp dirs are removed in `finally` on every path.
 *  5. Aggregate: any `fail` → strictBlock; any `unrunnable` → deterministicUnrunnable.
 *     Both can be true at once (the gate composes 5b > 5c).
 *  6. Preserve only safe bounded executor metadata in `results[]`; raw process
 *     output is never copied into the orchestrator result. Each row carries the
 *     `gateIndex` it came from: `skillId` falls back to the command string for a
 *     skill without an id, so two gates on the same command with different args
 *     share a skillId and cannot be told apart by it (#2275 PR-3B review).
 *
 * @param {object} opts
 * @param {string} [opts.trustedTree] base-checkout path (host-trusted allowlist source)
 * @param {Array<object>} [opts.selected] selected skills (metadata.deterministicGate)
 * @param {string} [opts.reviewSourceDir] dir the changed files are copied FROM
 * @param {string[]} [opts.changedFiles] relative paths to stage into the clean cwd
 * @param {string[]} [opts.deletedFiles] subset of `changedFiles` the change DELETED;
 *   declared by the caller (never inferred), not staged, and excluded from `requested`
 * @param {Record<string, string | undefined>} [opts.processEnv] source env (e.g. process.env)
 * @param {(args: object) => Promise<{ status: string, reasonCode: string }>} [opts.execImpl]
 *   injected executor; defaults to `executeDeterministicCommand`
 * @param {(prefix: string) => Promise<string>} [opts.mkdtempImpl] injected mkdtemp (tests)
 * @returns {Promise<{ strictBlock: boolean, deterministicUnrunnable: boolean,
 *   results: Array<{ gateIndex: number, skillId: string, status: string, reasonCode: string,
 *     durationMs?: number, exitCode?: number, stdoutBytes?: number,
 *     unrunnableCause?: 'spawn-error'|'timeout'|'invalid-entry',
 *     staging: { requested: number, copied: number, complete: boolean,
 *       skipped: Array<{ path: string, reason: string }>, deleted: string[] } }> }>}
 */
export async function runDeterministicGates({
  trustedTree,
  selected,
  reviewSourceDir,
  changedFiles,
  deletedFiles,
  processEnv,
  execImpl,
  mkdtempImpl,
} = {}) {
  const validEntries = await loadTrustedAllowlistEntries(trustedTree);
  if (validEntries == null) return emptyResult();

  const gates = extractGateCommands(selected);
  if (gates.length === 0) return emptyResult();

  const exec = typeof execImpl === 'function' ? execImpl : executeDeterministicCommand;

  // Declared deletions. Only non-empty strings count: a malformed entry must
  // not silently excuse a file from being staged.
  const deletedSet = new Set(
    (Array.isArray(deletedFiles) ? deletedFiles : []).filter(
      (file) => typeof file === 'string' && file.length > 0
    )
  );

  let strictBlock = false;
  let deterministicUnrunnable = false;
  const results = [];

  for (const [gateIndex, gate] of gates.entries()) {
    const entry = matchCommand({ command: gate.command, args: gate.args }, validEntries);
    // Not on the host-trusted allowlist → never run it.
    if (entry == null) continue;

    // Declared outside try so finally can clean up whichever dirs were created
    // even if the SECOND makeSandboxTempDir throws (gemini #1433 leak fix).
    let cleanCwd;
    let emptyHome;
    try {
      cleanCwd = await makeSandboxTempDir(mkdtempImpl);
      emptyHome = await makeSandboxTempDir(mkdtempImpl);
      const requestedFiles = Array.isArray(changedFiles) ? changedFiles : [];
      const deleted = [];
      const filesToStage = [];
      for (const file of requestedFiles) {
        (deletedSet.has(file) ? deleted : filesToStage).push(file);
      }
      const staged = await copyReviewTargetToSandbox({
        sourceDir: reviewSourceDir,
        destDir: cleanCwd,
        files: filesToStage,
      });
      const staging = summarizeStaging(filesToStage.length, staged, deleted);
      const env = buildSandboxEnv(processEnv, { home: emptyHome });
      const result = await exec({ entry, sandboxDir: cleanCwd, env });

      const status = result?.status;
      const reasonCode = result?.reasonCode;
      if (status === 'fail') strictBlock = true;
      if (status === 'unrunnable') deterministicUnrunnable = true;
      results.push({
        gateIndex,
        skillId: gate.skillId,
        status,
        reasonCode,
        staging,
        ...safeExecutionMetadata(result),
      });
    } finally {
      // Remove both sandbox temp dirs on every path. Each rm is individually
      // guarded so a failure removing one still attempts the other (gemini #1433).
      for (const dir of [cleanCwd, emptyHome]) {
        if (!dir) continue;
        try {
          await fs.rm(dir, { recursive: true, force: true });
        } catch {
          // Ignore cleanup errors so the remaining dir is still attempted.
        }
      }
    }
  }

  return { strictBlock, deterministicUnrunnable, results };
}
