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
 * Content digest of the project rules text returned by {@link loadProjectRules}.
 *
 * The digest is taken over `rulesText` — the exact string the review prompt
 * receives (base `.river/rules.md` plus the `## <file>` sections appended from
 * `.river/rules.d/`) — so it changes exactly when the effective project rules
 * change. Returns null when there are no rules, so callers can omit the field
 * instead of recording an empty value (#2202 Phase 0).
 *
 * @param {string | null | undefined} rulesText
 * @returns {string | null} lowercase hex sha256, or null when there are no rules
 */
export function computeRulesDigest(rulesText) {
  if (typeof rulesText !== 'string' || rulesText.length === 0) return null;
  return crypto.createHash('sha256').update(rulesText, 'utf8').digest('hex');
}

/**
 * Load the project rules through {@link loadProjectRules} and return their
 * digest. The read path is not re-derived here: the same resolution (default
 * path, rules.d/ scan, outside-repo guard, error semantics) applies.
 *
 * @param {string} repoRoot
 * @param {{ rulesPath?: string }} [options]
 * @returns {Promise<string | null>}
 */
export async function loadProjectRulesDigest(repoRoot, options = {}) {
  const { rulesText } = await loadProjectRules(repoRoot, options);
  return computeRulesDigest(rulesText);
}
