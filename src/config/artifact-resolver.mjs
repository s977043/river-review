/**
 * Artifact Input resolver — #802 Phase 2b
 *
 * Resolution order (per artifact-input-contract.md):
 *   1. CLI arg     – path passed explicitly by the caller
 *   2. config      – artifacts.<id> in river.config.*
 *   3. cwd default – well-known filename in the working directory
 *
 * Pure module: no singleton state; fs is injectable.
 * Scope: resolve path + existence check only.
 * Content reading / skill injection / CLI parsing → Phase 3.
 */

import path from 'node:path';
import fs from 'node:fs/promises';

// CWD default filenames (from artifact-input-contract.md)

/** @type {Readonly<Record<string, string>>} */
export const CWD_DEFAULTS = Object.freeze({
  'pbi-input': 'pbi-input.md',
  plan: 'plan.md',
  todo: 'todo.md',
  'test-cases': 'test-cases.md',
  'review-self': 'review-self.md',
  'review-external': 'review-external.md',
  diff: 'diff.patch',
  junit: 'junit.xml',
  coverage: 'coverage.xml',
  lint: 'lint.json',
  typecheck: 'typecheck.txt',
  'findings-pool': 'findings-pool.json',
  'tdd-ledger': 'tdd-ledger.json',
});

/**
 * @typedef {'cli'|'config'|'cwd'} ArtifactSource
 * @typedef {object} ArtifactResolution
 * @property {string}              id
 * @property {string|null}         path
 * @property {ArtifactSource|null} source
 * @property {boolean}             exists
 * @property {boolean}             optional
 */

/**
 * Resolve a single artifact path using the three-tier order.
 *
 * Path base: CLI → cwd; config → configDir ?? cwd; cwd-default → cwd.
 *
 * @param {object} opts
 * @param {string} opts.id
 * @param {string|null} [opts.cliArg]
 * @param {string|{path:string,optional?:boolean}|null} [opts.configValue]
 * @param {string} [opts.configDir]
 * @param {string} [opts.cwd]
 * @param {Pick<import('node:fs/promises'),'access'>} [opts.fsImpl]
 * @returns {Promise<ArtifactResolution>}
 */
export async function resolveArtifact({
  id,
  cliArg = null,
  configValue = null,
  configDir,
  cwd = process.cwd(),
  fsImpl = fs,
}) {
  // Tier 1: CLI arg
  if (cliArg != null && cliArg !== '') {
    const resolved = path.resolve(cwd, cliArg);
    const exists = await _fileExists(resolved, fsImpl);
    return { id, path: resolved, source: 'cli', exists, optional: false };
  }

  // Tier 2: config value
  if (configValue != null) {
    const base = configDir ?? cwd;
    const { rawPath, optional } = _normalizeConfigValue(configValue);
    if (rawPath) {
      const resolved = path.resolve(base, rawPath);
      const exists = await _fileExists(resolved, fsImpl);
      return { id, path: resolved, source: 'config', exists, optional: optional ?? false };
    }
  }

  // Tier 3: cwd default (only if the file exists)
  const defaultName = CWD_DEFAULTS[id];
  if (defaultName) {
    const resolved = path.resolve(cwd, defaultName);
    const exists = await _fileExists(resolved, fsImpl);
    if (exists) {
      return { id, path: resolved, source: 'cwd', exists: true, optional: true };
    }
  }

  // Not found
  return { id, path: null, source: null, exists: false, optional: true };
}

/**
 * Resolve all artifact IDs in parallel.
 *
 * The ID set is the union of the contract's known IDs (CWD_DEFAULTS) plus
 * any IDs explicitly named via cliArgs or configArtifacts. Explicitly
 * named IDs are never silently dropped — this keeps the resolver
 * consistent with the Phase 2a schema, which accepts unknown artifact
 * keys via `.catchall` so the contract can add IDs in a
 * backward-compatible minor bump. cwd-default lookup still only applies
 * to known IDs (CWD_DEFAULTS); an unknown ID resolves only if supplied
 * via CLI/config, otherwise it reports path:null/source:null.
 *
 * @param {object} [opts]
 * @param {Record<string,string>} [opts.cliArgs]
 * @param {Record<string,string|{path:string,optional?:boolean}>} [opts.configArtifacts]
 * @param {string} [opts.configDir]
 * @param {string} [opts.cwd]
 * @param {Pick<import('node:fs/promises'),'access'>} [opts.fsImpl]
 * @returns {Promise<Record<string, ArtifactResolution>>}
 */
export async function resolveAllArtifacts({
  cliArgs = {},
  configArtifacts = {},
  configDir,
  cwd,
  fsImpl,
} = {}) {
  const ids = new Set([
    ...Object.keys(CWD_DEFAULTS),
    ...Object.keys(cliArgs),
    ...Object.keys(configArtifacts),
  ]);
  const entries = await Promise.all(
    [...ids].map((id) =>
      resolveArtifact({
        id,
        cliArg: cliArgs[id] ?? null,
        configValue: configArtifacts[id] ?? null,
        configDir,
        cwd,
        fsImpl,
      }).then((r) => [id, r])
    )
  );
  return Object.fromEntries(entries);
}

// Internal helpers

function _normalizeConfigValue(value) {
  if (typeof value === 'string') return { rawPath: value || null, optional: false };
  if (value && typeof value === 'object') {
    return { rawPath: value.path || null, optional: value.optional ?? false };
  }
  return { rawPath: null, optional: false };
}

async function _fileExists(filePath, fsImpl) {
  try {
    await fsImpl.access(filePath);
    return true;
  } catch {
    return false;
  }
}
