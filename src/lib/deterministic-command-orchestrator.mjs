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
 * @param {string | undefined} trustedTree base-checkout path
 * @returns {Promise<Array<object> | null>}
 */
async function loadTrustedAllowlist(trustedTree) {
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
 * Only skills whose `metadata.deterministicGate` carries a non-empty `command`
 * are candidates. `args` defaults to `[]`.
 *
 * @param {Array<object>} selected
 * @returns {Array<{ skillId: string, command: string, args: string[] }>}
 */
function extractGateCommands(selected) {
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
  if (typeof result?.durationMs === 'number' && Number.isFinite(result.durationMs) && result.durationMs >= 0) {
    metadata.durationMs = result.durationMs;
  }
  if (Number.isInteger(result?.exitCode)) {
    metadata.exitCode = result.exitCode;
  }
  if (Number.isInteger(result?.stdoutBytes) && result.stdoutBytes >= 0) {
    metadata.stdoutBytes = result.stdoutBytes;
  }
  if (['spawn-error', 'timeout', 'invalid-entry'].includes(result?.unrunnableCause)) {
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
 *     output is never copied into the orchestrator result.
 *
 * @param {object} opts
 * @param {string} [opts.trustedTree] base-checkout path (host-trusted allowlist source)
 * @param {Array<object>} [opts.selected] selected skills (metadata.deterministicGate)
 * @param {string} [opts.reviewSourceDir] dir the changed files are copied FROM
 * @param {string[]} [opts.changedFiles] relative paths to stage into the clean cwd
 * @param {Record<string, string | undefined>} [opts.processEnv] source env (e.g. process.env)
 * @param {(args: object) => Promise<{ status: string, reasonCode: string }>} [opts.execImpl]
 *   injected executor; defaults to `executeDeterministicCommand`
 * @param {(prefix: string) => Promise<string>} [opts.mkdtempImpl] injected mkdtemp (tests)
 * @returns {Promise<{ strictBlock: boolean, deterministicUnrunnable: boolean,
 *   results: Array<{ skillId: string, status: string, reasonCode: string,
 *     durationMs?: number, exitCode?: number, stdoutBytes?: number,
 *     unrunnableCause?: 'spawn-error'|'timeout'|'invalid-entry' }> }>}
 */
export async function runDeterministicGates({
  trustedTree,
  selected,
  reviewSourceDir,
  changedFiles,
  processEnv,
  execImpl,
  mkdtempImpl,
} = {}) {
  const validEntries = await loadTrustedAllowlist(trustedTree);
  if (validEntries == null) return emptyResult();

  const gates = extractGateCommands(selected);
  if (gates.length === 0) return emptyResult();

  const exec = typeof execImpl === 'function' ? execImpl : executeDeterministicCommand;

  let strictBlock = false;
  let deterministicUnrunnable = false;
  const results = [];

  for (const gate of gates) {
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
      await copyReviewTargetToSandbox({
        sourceDir: reviewSourceDir,
        destDir: cleanCwd,
        files: Array.isArray(changedFiles) ? changedFiles : [],
      });
      const env = buildSandboxEnv(processEnv, { home: emptyHome });
      const result = await exec({ entry, sandboxDir: cleanCwd, env });

      const status = result?.status;
      const reasonCode = result?.reasonCode;
      if (status === 'fail') strictBlock = true;
      if (status === 'unrunnable') deterministicUnrunnable = true;
      results.push({
        skillId: gate.skillId,
        status,
        reasonCode,
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
