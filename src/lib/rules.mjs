import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_RULES_PATH = path.join('.river', 'rules.md');
const DEFAULT_RULES_DIR = path.join('.river', 'rules.d');

export class ProjectRulesError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ProjectRulesError';
  }
}

/**
 * Read a single rules file. Missing or empty files yield null (no error).
 *
 * @param {string} filePath
 * @param {{ tolerateDirectory?: boolean }} [options] When true, a path that is
 *   actually a directory (EISDIR) yields null instead of throwing. Used for the
 *   rules.d/ scan, where a stray `*.md` sub-directory should be skipped — but
 *   NOT for the base rules.md, where a directory is a misconfiguration to surface.
 */
async function readRulesFile(filePath, { tolerateDirectory = false } = {}) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return raw.trim() || null;
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    if (error.code === 'EISDIR' && tolerateDirectory) return null;
    throw new ProjectRulesError(`Failed to read project rules at ${filePath}: ${error.message}`);
  }
}

/**
 * Load project-specific review rules.
 *
 * Reads `.river/rules.md` (or a custom path via `options.rulesPath`). When the
 * default path is used, additional `*.md` files under `.river/rules.d/` are
 * read in alphabetical order and appended (each prefixed with a `## <file>`
 * header), so teams can split domain / incidents / glossary rules across files.
 * Missing or empty files are treated as "no rules" without error; with no base
 * file and no rules.d entries the result is identical to the single-file case.
 */
export async function loadProjectRules(repoRoot, options = {}) {
  const repoRootAbs = path.resolve(repoRoot);
  const relativeRulesPath = options.rulesPath ?? DEFAULT_RULES_PATH;
  const rulesPath = path.resolve(repoRootAbs, relativeRulesPath);

  if (!rulesPath.startsWith(repoRootAbs + path.sep) && rulesPath !== repoRootAbs) {
    throw new ProjectRulesError(
      `Project rules path is outside of the repository: ${relativeRulesPath}`
    );
  }

  const sections = [];
  const extraPaths = [];

  const base = await readRulesFile(rulesPath);
  if (base) sections.push(base);

  // Only the default rules path activates the rules.d/ split; custom rulesPath
  // callers keep the exact single-file behavior. Compare the resolved relative
  // path so an explicit `rulesPath: '.river/rules.md'` still scans rules.d/.
  if (relativeRulesPath === DEFAULT_RULES_PATH) {
    const rulesDir = path.resolve(repoRootAbs, DEFAULT_RULES_DIR);
    let entries = [];
    try {
      entries = (await fs.readdir(rulesDir)).filter((name) => name.endsWith('.md')).sort();
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw new ProjectRulesError(
          `Failed to read project rules directory at ${rulesDir}: ${error.message}`
        );
      }
    }
    // Files are independent; read them in parallel but keep alphabetical order.
    const loaded = await Promise.all(
      entries.map(async (name) => ({
        name,
        filePath: path.join(rulesDir, name),
        text: await readRulesFile(path.join(rulesDir, name), { tolerateDirectory: true }),
      }))
    );
    for (const { name, filePath, text } of loaded) {
      if (text) {
        sections.push(`## ${name}\n\n${text}`);
        extraPaths.push(filePath);
      }
    }
  }

  return {
    rulesText: sections.length ? sections.join('\n\n') : null,
    path: rulesPath,
    extraPaths,
  };
}

/**
 * Rules digest algorithms (#2202 Phase 2). A suppression records which one
 * produced its `context.rulesDigest` in `context.rulesDigestAlgo`; an absent
 * value is read as `'v1'`, the pre-Phase-2 digest. The digest cannot be
 * normalized after the fact, so normalization is introduced as a new version
 * rather than by changing `'v1'` — the same shape as `fingerprintAlgo` (#1797).
 *
 * - `'v1'`: sha256 of `rulesText` exactly as loaded (no normalization).
 * - `'v2'`: sha256 of `rulesText` after {@link normalizeRulesTextV2}.
 */
export const RULES_DIGEST_ALGOS = Object.freeze(['v1', 'v2']);

/** The algorithm new suppressions record (#2202 Phase 2). */
export const CURRENT_RULES_DIGEST_ALGO = 'v2';

/**
 * The `'v2'` normalization: line endings unified to LF (CRLF and lone CR), and
 * trailing whitespace removed from every line. Nothing else changes — the
 * `## <file>` headers `loadProjectRules` inserts for `.river/rules.d/` stay in
 * the text, because they are part of the string the review prompt receives.
 *
 * @param {string} rulesText
 * @returns {string}
 */
export function normalizeRulesTextV2(rulesText) {
  return rulesText
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n');
}

/**
 * Content digest of the project rules text returned by {@link loadProjectRules}.
 *
 * The digest is taken over `rulesText` — the exact string the review prompt
 * receives (base `.river/rules.md` plus the `## <file>` sections appended from
 * `.river/rules.d/`) — so it changes exactly when the effective project rules
 * change. Returns null when there are no rules, so callers can omit the field
 * instead of recording an empty value (#2202 Phase 0).
 *
 * `options.algo` selects the version (#2202 Phase 2). The default stays `'v1'`
 * (the unnormalized digest) so every existing caller and every digest already
 * recorded keeps its meaning; `'v2'` hashes {@link normalizeRulesTextV2}'s
 * output instead, so a CRLF checkout or trailing whitespace does not change it.
 * An algorithm outside {@link RULES_DIGEST_ALGOS} throws: callers decide what
 * an unknown recorded version means before asking for a digest.
 *
 * @param {string | null | undefined} rulesText
 * @param {{ algo?: 'v1' | 'v2' }} [options]
 * @returns {string | null} lowercase hex sha256, or null when there are no rules
 */
export function computeRulesDigest(rulesText, { algo = 'v1' } = {}) {
  if (!RULES_DIGEST_ALGOS.includes(algo)) {
    throw new TypeError(`Unsupported rules digest algorithm: ${JSON.stringify(algo)}`);
  }
  if (typeof rulesText !== 'string' || rulesText.length === 0) return null;
  const text = algo === 'v2' ? normalizeRulesTextV2(rulesText) : rulesText;
  if (text.length === 0) return null;
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * Load the project rules through {@link loadProjectRules} and return their
 * digest. The read path is not re-derived here: the same resolution (default
 * path, rules.d/ scan, outside-repo guard, error semantics) applies.
 *
 * @param {string} repoRoot
 * @param {{ rulesPath?: string, algo?: 'v1' | 'v2' }} [options] `algo` is passed
 *   to {@link computeRulesDigest}; the rest to {@link loadProjectRules}
 * @returns {Promise<string | null>}
 */
export async function loadProjectRulesDigest(repoRoot, options = {}) {
  const { algo, ...loadOptions } = options ?? {};
  const { rulesText } = await loadProjectRules(repoRoot, loadOptions);
  return computeRulesDigest(rulesText, algo === undefined ? {} : { algo });
}
