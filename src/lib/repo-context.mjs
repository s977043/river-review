/**
 * Repo-wide context collector for River Review.
 * Gathers full file text, corresponding tests, symbol usages, and config
 * snippets relevant to the changed files, within a configurable token budget.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';

import { REDACTION_PATTERN_IDS, redactText, shouldExcludeForContext } from './secret-redactor.mjs';
import { charsToTokens, estimateTokens } from './token-estimator.mjs';
import { DEFAULT_WEIGHTS, pathProximity, scoreContextCandidate } from './context-ranker.mjs';
import { resolveContextBudget } from './context-presets.mjs';

const execFileAsync = promisify(execFile);

/** Maximum total characters of repo context injected into the prompt. */
export const DEFAULT_MAX_CHARS = 8000;

/** Per-section character caps (applied before the global budget). */
export const SECTION_CAPS = {
  fullFile: 3000,
  tests: 2000,
  usages: 1500,
  config: 500,
};

/**
 * Number of leading changed files eligible for fullFile content. The
 * declaration path (#1606) and the actual injection share this so parity holds.
 */
export const FULLFILE_MAX_FILES = 5;

/** Test file path heuristics. */
const TEST_SUFFIXES = [
  (f) => f.replace(/\.(ts|tsx|js|jsx|mjs|cjs)$/, '.test.$1'),
  (f) => f.replace(/\.(ts|tsx|js|jsx|mjs|cjs)$/, '.spec.$1'),
  (f) => f.replace(/src\//, 'tests/').replace(/\.(ts|tsx|js|jsx|mjs|cjs)$/, '.test.$1'),
  (f) => {
    const base = path.basename(f);
    const dir = path.dirname(f);
    return path.join(dir, '__tests__', base.replace(/\.(ts|tsx|js|jsx|mjs|cjs)$/, '.test.$1'));
  },
];

/** Config files to include a snippet of. */
const CONFIG_GLOBS = [
  'tsconfig.json',
  'package.json',
  'next.config.*',
  '.eslintrc*',
  'vite.config.*',
];

/**
 * Collect repo-wide context relevant to the changed files.
 *
 * @param {object} opts
 * @param {string[]} opts.changedFiles - Relative paths of changed files
 * @param {string} opts.repoRoot - Absolute path to the repository root
 * @param {number} [opts.maxChars] - Total character budget (default 8000)
 * @param {object} [opts.security] - `config.security` block (#692). When omitted,
 *   redaction defaults are used and `shouldExcludeForContext` runs against
 *   `DEFAULT_DENY_GLOBS` only.
 * @returns {Promise<RepoContext>}
 */
/**
 * Build the redaction & path-level deny primitives shared by every context
 * section. Extracted (#1606) so the fullFile section — used both for prompt
 * injection here and for the fullFile-context availability declaration in
 * fullfile-supply.mjs — runs the SAME exclusion / redaction rules.
 *
 * @param {object} [security] - `config.security`
 * @returns {{ isPathExcluded: (rel: string) => boolean,
 *   maybeRedact: (text: string) => string, totalHits: Map<string, number>,
 *   excludedPaths: Array<{path: string, section: string}> }}
 */
export function createRedactionPrimitives(security) {
  // #692 PR-C: redaction & path-level deny.
  // - shouldExcludeForContext runs BEFORE we even read a file so dotenv,
  //   pem keys, lock files, build artifacts never enter process memory.
  // - redactText runs AFTER reading so any secret that slipped past the
  //   path filter (e.g. an inline AWS key in a regular .ts file) is masked
  //   before being injected into the prompt.
  const redactCfg = security?.redact;
  const redactionEnabled = redactCfg?.enabled !== false; // default true
  const denyExtra = Array.isArray(redactCfg?.denyFiles) ? redactCfg.denyFiles : [];
  const allowExtra = Array.isArray(redactCfg?.allowlist) ? redactCfg.allowlist : [];
  const redactOpts = redactionEnabled
    ? {
        allowlist: allowExtra,
        ...(redactCfg?.entropyThreshold != null
          ? { entropyThreshold: redactCfg.entropyThreshold }
          : {}),
        ...(redactCfg?.categories?.highEntropy === false ? { highEntropy: false } : {}),
      }
    : null;
  const totalHits = new Map();
  const excludedPaths = [];
  const bumpHits = (hits) => {
    for (const { category, count } of hits) {
      totalHits.set(category, (totalHits.get(category) || 0) + count);
    }
  };
  const isPathExcluded = (rel) =>
    shouldExcludeForContext(rel, { extraDenyGlobs: denyExtra, allowlist: allowExtra });
  const maybeRedact = (text) => {
    if (!redactionEnabled || !text) return text;
    const { text: redacted, hits } = redactText(text, redactOpts);
    if (hits.length) bumpHits(hits);
    return redacted;
  };
  // #2033 AC3: report WHICH categories were searched for, not just the hit
  // tally. A consumer reading `redactionHits: []` cannot tell an exhaustive
  // clean scan from a disabled redactor; the pattern id list makes the
  // difference explicit. Empty when redaction is off, because in that case
  // no category was searched for at all.
  const redactionPatternIds = redactionEnabled ? REDACTION_PATTERN_IDS : [];
  return { isPathExcluded, maybeRedact, totalHits, excludedPaths, redactionPatternIds };
}

/**
 * Build the candidate ranking function (#689 PR-C). When
 * `config.context.ranking.enabled` is true and there is more than one
 * candidate, files closest (pathProximity) to the rest of the change set are
 * processed first under the budget; otherwise original order is preserved.
 */
function makeRankCandidates(contextConfig) {
  const rankingCfg = contextConfig?.ranking;
  const rankingEnabled = rankingCfg?.enabled === true;
  const weights = rankingCfg?.weights ?? DEFAULT_WEIGHTS;
  return (paths) => {
    if (!rankingEnabled || paths.length <= 1)
      return paths.map((p, i) => ({ path: p, score: 1, originalIndex: i }));
    return paths
      .map((p, i) => {
        const proximities = paths.filter((_, j) => j !== i).map((other) => pathProximity(p, other));
        const proximity = proximities.length ? Math.max(...proximities) : 0;
        const score = scoreContextCandidate({
          signals: { pathProximity: proximity },
          weights,
        });
        return { path: p, score, originalIndex: i };
      })
      .sort((a, b) => b.score - a.score || a.originalIndex - b.originalIndex);
  };
}

/**
 * Compute the "Full file: …" prompt sections for the changed source files,
 * plus a ledger of which files were supplied vs skipped and why. This is the
 * SINGLE source of the fullFile budget / exclusion / truncation logic (#1606):
 * `collectRepoContext` uses it for actual prompt injection, and
 * `fullfile-supply.mjs` uses it (via the same call) to decide whether the
 * `fullFile` inputContext can be honestly declared available. Because both go
 * through this function, a declaration of `available` can never diverge from an
 * empty real injection (the false-parity class #1606 warning-1 targeted).
 *
 * Budget accounting mirrors the legacy inline loop: char budget (`maxChars`,
 * default DEFAULT_MAX_CHARS) and optional token budget
 * (`config.context.budget.maxTokens`) both gate each file; per-file content is
 * capped at SECTION_CAPS.fullFile and truncated (marked `truncated: true`) when
 * larger. Files after the first FULLFILE_MAX_FILES are recorded, not read.
 *
 * @param {object} opts
 * @param {string[]} opts.changedFiles
 * @param {string} opts.repoRoot
 * @param {object} [opts.security] - `config.security`
 * @param {object} [opts.context] - `config.context`
 * @param {number} [opts.maxChars]
 * @param {ReturnType<typeof createRedactionPrimitives>} [opts.primitives]
 * @returns {{ sections: Array<{label: string, content: string, file: string}>,
 *   supplied: Array<{path: string, chars: number, truncated: boolean}>,
 *   skipped: Array<{path: string, reason: string}>, budgetRemaining: number,
 *   tokenBudgetRemaining: number|null, maxTokensCfg: number|null,
 *   rankedScores: Array<{path: string, score: number}> }}
 */
export function collectFullFileSections({
  changedFiles = [],
  repoRoot,
  security,
  context: contextConfig,
  maxChars = DEFAULT_MAX_CHARS,
  primitives = createRedactionPrimitives(security),
}) {
  const { isPathExcluded, maybeRedact, excludedPaths } = primitives;
  // #689 PR-C/PR-D: optional token budget on top of the legacy char budget.
  const budgetCfg = resolveContextBudget(contextConfig);
  const maxTokensCfg = Number.isFinite(budgetCfg?.maxTokens) ? budgetCfg.maxTokens : null;
  let tokenBudget = maxTokensCfg;
  let budget = maxChars;
  const rankCandidates = makeRankCandidates(contextConfig);

  const sections = [];
  const supplied = [];
  const skipped = [];
  const rankedScores = [];

  // Files past the read window are recorded (not read) so the ledger accounts
  // for every changed file (#1606 gemini: avoid silent under-count).
  for (const rel of changedFiles.slice(FULLFILE_MAX_FILES)) {
    skipped.push({ path: rel, reason: 'beyond-file-limit' });
  }

  const ranked = rankCandidates(changedFiles.slice(0, FULLFILE_MAX_FILES));
  for (const { path: rel, score } of ranked) {
    // Budget exhausted: record remaining candidates instead of silently
    // dropping them, then keep scanning (the budget cannot recover, so no
    // further content lands — parity with the legacy early break).
    if (budget <= 0 || (tokenBudget != null && tokenBudget <= 0)) {
      skipped.push({ path: rel, reason: 'budget-exhausted' });
      continue;
    }
    if (isPathExcluded(rel)) {
      excludedPaths.push({ path: rel, section: 'fullFile' });
      skipped.push({ path: rel, reason: 'excluded' });
      continue;
    }
    if (!isSourceFile(rel)) {
      skipped.push({ path: rel, reason: 'non-source' });
      continue;
    }
    const abs = path.join(repoRoot, rel);
    if (!fileExists(abs)) {
      skipped.push({ path: rel, reason: 'missing' });
      continue;
    }
    // Tighter of char-budget and token-budget (translated to chars); the file
    // is truncated to whatever the remaining budget allows and still supplied,
    // so a tight budget yields a smaller — never a phantom-empty — section.
    const tokenChars = tokenBudget != null ? Math.max(0, charsToTokens(tokenBudget)) : Infinity;
    const cap = Math.min(SECTION_CAPS.fullFile, budget, tokenChars);
    if (cap <= 0) {
      skipped.push({ path: rel, reason: 'budget-exceeded' });
      continue;
    }
    const raw = readFileCapped(abs, cap);
    if (!raw) {
      // readFileCapped returns null for empty or unreadable files.
      skipped.push({ path: rel, reason: 'empty' });
      continue;
    }
    const truncated = raw.endsWith('\n// ...[truncated]');
    const content = maybeRedact(raw);
    sections.push({ label: `Full file: ${rel}`, content, file: rel });
    supplied.push({ path: rel, chars: content.length, truncated });
    budget -= content.length;
    if (tokenBudget != null) tokenBudget -= estimateTokens(content);
    rankedScores.push({ path: rel, score });
  }

  return {
    sections,
    supplied,
    skipped,
    budgetRemaining: budget,
    tokenBudgetRemaining: tokenBudget,
    maxTokensCfg,
    rankedScores,
  };
}

export async function collectRepoContext({
  changedFiles,
  repoRoot,
  maxChars = DEFAULT_MAX_CHARS,
  security,
  context: contextConfig,
}) {
  const rankingEnabled = contextConfig?.ranking?.enabled === true;
  const primitives = createRedactionPrimitives(security);
  const { isPathExcluded, maybeRedact, totalHits, excludedPaths, redactionPatternIds } = primitives;

  // 1. Full text of changed source files — the SAME computation the fullFile
  //    availability declaration uses (#1606), so declaration and injection can
  //    never diverge.
  const fullFile = collectFullFileSections({
    changedFiles,
    repoRoot,
    maxChars,
    security,
    context: contextConfig,
    primitives,
  });
  const sections = [...fullFile.sections];
  const maxTokensCfg = fullFile.maxTokensCfg;
  let budget = fullFile.budgetRemaining;
  let tokenBudget = fullFile.tokenBudgetRemaining;
  const billTokens = (text) => {
    if (tokenBudget == null || !text) return;
    tokenBudget -= estimateTokens(text);
  };
  const tokenBudgetExhausted = () => tokenBudget != null && tokenBudget <= 0;
  const rankedScores = fullFile.rankedScores;

  // 2. Corresponding test files
  const testContents = [];
  for (const rel of changedFiles.slice(0, 5)) {
    if (budget <= 0 || tokenBudgetExhausted()) break;
    for (const toTest of TEST_SUFFIXES) {
      const candidate = toTest(rel);
      if (isPathExcluded(candidate)) {
        excludedPaths.push({ path: candidate, section: 'tests' });
        break;
      }
      const abs = path.join(repoRoot, candidate);
      if (fileExists(abs)) {
        const tokenChars = tokenBudget != null ? Math.max(0, charsToTokens(tokenBudget)) : Infinity;
        const cap = Math.min(SECTION_CAPS.tests, budget, tokenChars);
        if (cap <= 0) break;
        const raw = readFileCapped(abs, cap);
        if (raw) {
          const content = maybeRedact(raw);
          // The pushed entry includes a `// candidate\n` header; bill the
          // entire entry against the budget so the running total stays
          // accurate when many test files are aggregated.
          const entry = `// ${candidate}\n${content}`;
          testContents.push(entry);
          budget -= entry.length;
          billTokens(entry);
        }
        break;
      }
    }
  }
  if (testContents.length) {
    sections.push({
      label: 'Corresponding test files',
      content: testContents.join('\n\n'),
      file: null,
    });
  }

  // 3. Symbol usage search via ripgrep
  if (budget > 0 && !tokenBudgetExhausted()) {
    const exportedSymbols = extractExportedSymbols({ changedFiles, repoRoot });
    if (exportedSymbols.length) {
      const tokenChars = tokenBudget != null ? Math.max(0, charsToTokens(tokenBudget)) : Infinity;
      const usagesCap = Math.min(SECTION_CAPS.usages, budget, tokenChars);
      if (usagesCap > 0) {
        const usages = await searchSymbolUsages({
          symbols: exportedSymbols.slice(0, 5),
          repoRoot,
          excludeFiles: changedFiles,
          maxChars: usagesCap,
        });
        if (usages) {
          const content = maybeRedact(usages);
          sections.push({ label: 'Symbol usage references', content, file: null });
          budget -= content.length;
          billTokens(content);
        }
      }
    }
  }

  // 4. Config snippets
  if (budget > 0 && !tokenBudgetExhausted()) {
    const configSnippets = [];
    for (const glob of CONFIG_GLOBS) {
      if (isPathExcluded(glob)) {
        excludedPaths.push({ path: glob, section: 'config' });
        continue;
      }
      const abs = path.join(repoRoot, glob);
      if (fileExists(abs)) {
        const snippet = readFileCapped(
          abs,
          Math.min(SECTION_CAPS.config, budget - configSnippets.reduce((s, c) => s + c.length, 0))
        );
        if (snippet) configSnippets.push(`// ${glob}\n${maybeRedact(snippet)}`);
      }
    }
    if (configSnippets.length) {
      const content = configSnippets.join('\n\n');
      sections.push({ label: 'Config files', content, file: null });
      budget -= content.length;
      billTokens(content);
    }
  }

  const redactionHits = [...totalHits.entries()].map(([category, count]) => ({ category, count }));

  return {
    sections,
    totalChars: maxChars - budget,
    truncated: budget <= 0 || tokenBudgetExhausted(),
    redactionHits,
    redactionPatternIds,
    excludedPaths,
    // PR-C (#689): expose ranking + budget telemetry on the result so
    // callers can surface it via reviewDebug. Raw context never appears
    // here — only counts and per-path scores.
    ranking: rankingEnabled
      ? {
          enabled: true,
          scores: rankedScores,
        }
      : null,
    tokenBudget:
      maxTokensCfg != null
        ? {
            max: maxTokensCfg,
            remaining: Math.max(0, tokenBudget),
            exhausted: tokenBudgetExhausted(),
          }
        : null,
  };
}

/**
 * Build the "Repository Context" section string for prompt injection.
 * Returns empty string when no context is available.
 *
 * @param {RepoContext|null|undefined} repoContext
 * @returns {string}
 */
export function buildRepoContextSection(repoContext) {
  if (!repoContext?.sections?.length) return '';
  const parts = ['\n### Repository Context\n'];
  parts.push('差分の外側にある関連コードです。cross-file の影響分析に使用してください。\n');
  for (const sec of repoContext.sections) {
    parts.push(`#### ${sec.label}\n\`\`\`\n${sec.content}\n\`\`\`\n`);
  }
  if (repoContext.truncated) {
    parts.push('> _Repository context was truncated to fit the prompt budget._\n');
  }
  return parts.join('\n');
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function isSourceFile(rel) {
  return /\.(ts|tsx|js|jsx|mjs|cjs|vue|svelte|py|rb|go|java|kt|swift)$/.test(rel);
}

function fileExists(abs) {
  try {
    return fs.statSync(abs).isFile();
  } catch {
    return false;
  }
}

function readFileCapped(abs, cap) {
  try {
    const raw = fs.readFileSync(abs, 'utf8');
    if (!raw.trim()) return null;
    return raw.length > cap ? raw.slice(0, cap) + '\n// ...[truncated]' : raw;
  } catch {
    return null;
  }
}

function extractExportedSymbols({ changedFiles, repoRoot }) {
  const symbols = [];
  const exportRe = /^export\s+(?:(?:async\s+)?function|class|const|let|var)\s+(\w+)/gm;
  for (const rel of changedFiles.slice(0, 5)) {
    const abs = path.join(repoRoot, rel);
    if (!isSourceFile(rel) || !fileExists(abs)) continue;
    try {
      const text = fs.readFileSync(abs, 'utf8');
      for (const m of text.matchAll(exportRe)) {
        if (m[1] && !symbols.includes(m[1])) symbols.push(m[1]);
      }
    } catch {
      // skip
    }
  }
  return symbols;
}

async function searchSymbolUsages({ symbols, repoRoot, excludeFiles, maxChars }) {
  if (!symbols.length) return null;
  const pattern = symbols.map((s) => `\\b${s}\\b`).join('|');
  const excludeArgs = excludeFiles.flatMap((f) => ['--iglob', `!${f}`]);
  try {
    const { stdout } = await execFileAsync(
      'rg',
      [
        '--no-heading',
        '--line-number',
        '--max-count',
        '3',
        '--max-filesize',
        '200K',
        '--glob',
        '*.{ts,tsx,js,jsx,mjs,cjs}',
        ...excludeArgs,
        '-e',
        pattern,
        '.',
      ],
      { cwd: repoRoot, timeout: 5000 }
    );
    const trimmed = stdout.slice(0, maxChars);
    return trimmed || null;
  } catch {
    return null;
  }
}

/**
 * @typedef {object} RepoContext
 * @property {Array<{label: string, content: string, file: string|null}>} sections
 * @property {number} totalChars
 * @property {boolean} truncated
 */
