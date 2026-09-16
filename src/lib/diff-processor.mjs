import { diffWithContext, listChangedFiles, parseDiffHeaderPath } from './git.mjs';
import { classifyChangedFiles } from './file-classifier.mjs';

// ---------------------------------------------------------------------------
// diff-optimizer — filter and compress diff for LLM consumption
// ---------------------------------------------------------------------------

const EXCLUDED_EXTENSIONS = new Set(['.md']);
const EXCLUDED_FILES = new Set(['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock']);
// Build output directories hold machine-generated bundles (ncc dist output,
// source maps, generated type declarations) that are not meaningfully
// reviewable line-by-line; their hunks waste the LLM prompt's char budget and
// produce noise findings (#1543/#1547). This is a purely PATH-based rule — it
// matches any `dist/` path segment (e.g. runners/github-action/dist/…), not a
// content-type check. LLM-facing diff optimization only — heuristic detection
// still reads the raw diff.files, so other pipeline inputs are unchanged.
const EXCLUDED_DIR_RE = /(?:^|\/)dist\//;
const MAX_HUNK_LINES = 200;
const MAX_HUNK_HEAD = 120;
const MAX_HUNK_TAIL = 40;

function extension(path) {
  const idx = path.lastIndexOf('.');
  return idx >= 0 ? path.slice(idx).toLowerCase() : '';
}

function baseName(path) {
  const parts = path.split('/');
  return parts[parts.length - 1];
}

function isExcludedFile(path) {
  const ext = extension(path);
  if (EXCLUDED_EXTENSIONS.has(ext)) return true;
  if (EXCLUDED_FILES.has(baseName(path))) return true;
  if (EXCLUDED_DIR_RE.test(path)) return true;
  return false;
}

/**
 * Whether a finding pointing at `path` targets a machine-generated build
 * artifact directory (a `dist/` path segment, e.g.
 * `runners/github-action/dist/index.mjs`).
 *
 * This is a DIFFERENT, deliberately NARROWER concept than `isExcludedFile`
 * (the LLM-diff optimizer's exclusion rule). `isExcludedFile` also drops `.md`
 * and lock files to save the LLM prompt's char budget — but for the
 * finding-OUTPUT stage that over-suppresses: a real finding on `docs/how-to.md`
 * (e.g. a hardcoded secret inside a code fence detected by findHardcodedSecrets)
 * or on `package-lock.json` would be silently hidden. #1597's scope is
 * "generated build artifacts" only, so output suppression matches the generated
 * directory (`EXCLUDED_DIR_RE`) alone and never `.md` / lock files. The
 * heuristic detectors still scan the raw diff by design (#1570/#1597 — the
 * #1070 canary boundary); this predicate only gates the emitted findings.
 *
 * @param {string} path
 * @returns {boolean}
 */
export function isGeneratedArtifactPath(path) {
  if (!path || typeof path !== 'string') return false;
  return EXCLUDED_DIR_RE.test(path);
}

function normalizeWhitespace(line) {
  return line.replace(/\s+/g, '');
}

function isWhitespaceOnlyChange(lines) {
  const added = lines
    .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
    .map((line) => line.slice(1));
  const removed = lines
    .filter((line) => line.startsWith('-') && !line.startsWith('---'))
    .map((line) => line.slice(1));
  if (added.length === 0 && removed.length === 0) return false;
  return normalizeWhitespace(added.join('')) === normalizeWhitespace(removed.join(''));
}

const COMMENT_MARKERS = [/^\/\//, /^\/\*/, /^\*($|\s)/, /^\*\/$/, /^#/, /^<!--/, /^--!?>/];

function isCommentOnlyChange(lines) {
  const changed = lines.filter((line) => line.startsWith('+') || line.startsWith('-'));
  if (!changed.length) return false;
  return changed.every((line) => {
    const content = line.slice(1).trim();
    if (!content) return true;
    return COMMENT_MARKERS.some((re) => re.test(content));
  });
}

function compressHunkLines(lines) {
  if (lines.length <= MAX_HUNK_LINES) return lines;
  const head = lines.slice(0, MAX_HUNK_HEAD);
  const tail = lines.slice(-MAX_HUNK_TAIL);
  return [...head, '... (hunk truncated) ...', ...tail];
}

/**
 * Filter and compress parsed diff files.
 * @param {{files: Array<{path: string, hunks: Array<{header: string, lines: string[]}>}>, diffText?: string}} diff
 * @returns {{files: Array, diffText: string, tokenEstimate: number, reduction: number, rawTokenEstimate: number}}
 */
export function optimizeDiff(diff) {
  const rawTokenEstimate = Math.ceil((diff.diffText ?? '').length / 4);
  const optimizedFiles = [];

  for (const file of diff.files ?? []) {
    if (isExcludedFile(file.path)) continue;

    const keptHunks = [];
    for (const hunk of file.hunks ?? []) {
      const lines = hunk.lines ?? [];
      if (isWhitespaceOnlyChange(lines)) continue;
      if (isCommentOnlyChange(lines)) continue;

      const compressedLines = compressHunkLines(lines);
      keptHunks.push({
        ...hunk,
        lines: compressedLines,
      });
    }

    if (keptHunks.length) {
      optimizedFiles.push({
        ...file,
        hunks: keptHunks,
      });
    }
  }

  const diffText = renderDiffText(optimizedFiles);
  const tokenEstimate = Math.ceil(diffText.length / 4);
  const reduction =
    rawTokenEstimate === 0
      ? 0
      : Math.max(0, Math.round(((rawTokenEstimate - tokenEstimate) / rawTokenEstimate) * 100));

  return {
    files: optimizedFiles,
    diffText,
    tokenEstimate,
    reduction,
    rawTokenEstimate,
  };
}

/**
 * Build the LLM-facing view of a diff — the changed-file list and diff text
 * with non-reviewable build artifacts (see isExcludedFile) removed. Used ONLY
 * for prompt construction; heuristic detection, scoring, and fixture eval keep
 * reading the raw `diff.files`, so this changes no other pipeline input.
 *
 * Entry shapes converge here:
 *  - collectRepoDiff already ran optimizeDiff and exposes `filesForReview` +
 *    optimized `diffText`; this existing contract is passed through unchanged.
 *  - reviewer chunking aliases the raw chunk array into BOTH `files` and
 *    `filesForReview`. That internal shape is re-optimized so chunking cannot
 *    reintroduce Markdown, lockfiles, dist artifacts, or non-reviewable hunks.
 *  - the artifact-driven plan/exec path (review-plan.mjs) parses a diff
 *    artifact and bypasses optimizeDiff — filtered on the fly. The diff text is
 *    re-rendered only when a file was actually excluded, so the common
 *    no-artifact case passes the caller's `diffText` through unchanged.
 *
 * @param {{files?: Array, filesForReview?: Array, diffText?: string}} diff
 * @returns {{files: Array, diffText: string}}
 */
export function buildLlmDiffView(diff) {
  if (Array.isArray(diff?.filesForReview)) {
    const isRawChunkAlias = Array.isArray(diff?.files) && diff.filesForReview === diff.files;
    if (isRawChunkAlias) {
      const optimized = optimizeDiff({
        files: diff.filesForReview,
        diffText: diff.diffText ?? renderDiffText(diff.filesForReview),
      });
      return { files: optimized.files, diffText: optimized.diffText };
    }
    return {
      files: diff.filesForReview,
      diffText: diff.diffText ?? renderDiffText(diff.filesForReview),
    };
  }
  const rawFiles = Array.isArray(diff?.files) ? diff.files : [];
  const files = rawFiles.filter((file) => !isExcludedFile(file?.path ?? ''));
  const diffText =
    files.length === rawFiles.length
      ? (diff?.diffText ?? renderDiffText(files))
      : renderDiffText(files);
  return { files, diffText };
}

export function renderDiffText(files) {
  if (!files.length) return '';
  const chunks = [];
  for (const file of files) {
    const isNewFile = !file.oldPath || file.oldPath === '/dev/null';
    const isDeletedFile = !file.newPath || file.newPath === '/dev/null';
    const oldPath = isNewFile ? '/dev/null' : (file.oldPath ?? file.path);
    const newPath = isDeletedFile ? '/dev/null' : (file.newPath ?? file.path);
    const oldDisplay = oldPath === '/dev/null' ? '/dev/null' : `a/${oldPath}`;
    const newDisplay = newPath === '/dev/null' ? '/dev/null' : `b/${newPath}`;

    chunks.push(`diff --git a/${oldPath} b/${newPath}`);
    chunks.push(`--- ${oldDisplay}`);
    chunks.push(`+++ ${newDisplay}`);
    for (const hunk of file.hunks ?? []) {
      chunks.push(hunk.header);
      chunks.push(...(hunk.lines ?? []));
    }
  }
  return chunks.join('\n');
}

// ---------------------------------------------------------------------------
// diff — parse unified diff and collect repo diff from git
// ---------------------------------------------------------------------------

/**
 * Parse a unified diff into a structured representation.
 * Returns files with hunks and added line hints so downstream consumers
 * can locate where to attach review comments.
 */
export function parseUnifiedDiff(diffText) {
  if (!diffText || typeof diffText !== 'string') return { files: [] };

  const files = [];
  let currentFile = null;
  let currentHunk = null;
  let newLineNumber = 0;

  const lines = diffText.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.startsWith('diff --git')) {
      currentHunk = null;
      continue;
    }
    // A file header is only recognised as the complete three-line sequence
    // `--- <old>` / `+++ <new>` / `@@ ...`. Every real unified-diff producer
    // emits those three lines adjacently, while an unprefixed `@@` line can
    // never occur inside a well-formed hunk body — so the third line is what
    // separates a genuine header from diff content that merely looks like one
    // (a hunk body line `+++ phantom.md`, i.e. the added line `++ phantom.md`).
    // This is a structural test on the header itself; it deliberately does not
    // depend on tracking where a hunk ends.
    if (line.startsWith('--- ') && (lines[index + 1] ?? '').startsWith('+++ ')) {
      const nextAfterPair = lines[index + 2] ?? '';
      if (nextAfterPair.startsWith('@@')) {
        const oldPathRaw = parseDiffHeaderPath(line.slice(4));
        const newPathRaw = parseDiffHeaderPath(lines[index + 1].slice(4));
        const isDeletion = newPathRaw === '/dev/null';
        const oldPath = oldPathRaw ?? (isDeletion ? '/dev/null' : newPathRaw);
        const newPath = isDeletion ? '/dev/null' : newPathRaw;
        const path = isDeletion ? oldPath : newPath;

        currentFile = { path, newPath, oldPath, hunks: [], addedLines: [] };
        files.push(currentFile);
        currentHunk = null;
        newLineNumber = 0;
        index += 1;
        continue;
      }
    }
    if (!currentFile) continue;
    if (line.startsWith('@@')) {
      const match = /@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
      if (!match) continue;
      const oldStart = Number.parseInt(match[1], 10);
      const oldLines = match[2] ? Number.parseInt(match[2], 10) : 1;
      const newStart = Number.parseInt(match[3], 10);
      const newLines = match[4] ? Number.parseInt(match[4], 10) : 1;
      currentHunk = {
        header: line,
        oldStart,
        oldLines,
        newStart,
        newLines,
        lines: [],
        addedLines: [],
      };
      currentFile.hunks.push(currentHunk);
      newLineNumber = newStart;
      continue;
    }
    if (!currentHunk) continue;
    currentHunk.lines.push(line);
    if (line.startsWith('+') && !line.startsWith('+++')) {
      currentFile.addedLines.push(newLineNumber);
      currentHunk.addedLines.push(newLineNumber);
      newLineNumber += 1;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      // deletion: do not advance new line number
    } else {
      newLineNumber += 1;
    }
  }
  return { files };
}

/**
 * Derive the list of changed file paths from unified diff text,
 * excluding deletions (/dev/null).
 * @param {string} diffText
 * @returns {string[]}
 */
export function deriveChangedFiles(diffText) {
  const parsed = parseUnifiedDiff(diffText);
  const files = parsed.files?.map((f) => f.path).filter(Boolean) ?? [];
  return files.filter((p) => p !== '/dev/null');
}

export async function collectRepoDiff(repoRoot, baseRef, { contextLines = 3 } = {}) {
  const changedFiles = await listChangedFiles(repoRoot, baseRef);
  if (!changedFiles.length) {
    return {
      changedFiles: [],
      rawDiffText: '',
      rawTokenEstimate: 0,
      files: [],
      diffText: '',
      tokenEstimate: 0,
      reduction: 0,
    };
  }

  const rawDiffText = await diffWithContext(repoRoot, baseRef, { unified: contextLines });
  const parsed = parseUnifiedDiff(rawDiffText);
  const files = parsed.files.length
    ? parsed.files
    : changedFiles.map((file) => ({
        path: file,
        hunks: [],
        addedLines: [],
      }));
  const rawTokenEstimate = Math.ceil(rawDiffText.length / 4);
  const optimized = optimizeDiff({ files, diffText: rawDiffText });

  return {
    changedFiles,
    files,
    rawDiffText,
    rawTokenEstimate,
    diffText: optimized.diffText,
    filesForReview: optimized.files,
    tokenEstimate: optimized.tokenEstimate,
    reduction: optimized.reduction,
  };
}

// ---------------------------------------------------------------------------
// diff-meta — extract metadata from diff for review depth control
// ---------------------------------------------------------------------------

/**
 * Count changed lines from raw unified diff text.
 *
 * @param {string} diffText
 * @returns {number}
 */
export function countChangedLinesFromText(diffText) {
  if (!diffText) return 0;
  let lines = 0;
  for (const line of diffText.split('\n')) {
    if (
      (line.startsWith('+') && !line.startsWith('+++')) ||
      (line.startsWith('-') && !line.startsWith('---'))
    ) {
      lines++;
    }
  }
  return lines;
}

/**
 * Extract metadata from a diff object for review depth control.
 *
 * @param {{ changedFiles?: string[], diffText?: string }} diff
 * @returns {{ fileCount: number, changedLines: number, fileTypes: object, hasTests: boolean, hasMigrations: boolean, hasSchemas: boolean }}
 */
export function extractDiffMeta(diff) {
  const changedFiles = diff?.changedFiles ?? [];
  const changedLines = countChangedLinesFromText(diff?.diffText);
  const fileTypes = classifyChangedFiles(changedFiles);

  return {
    fileCount: changedFiles.length,
    changedLines,
    fileTypes,
    hasTests: fileTypes.test.length > 0,
    hasMigrations: fileTypes.migration.length > 0,
    hasSchemas: fileTypes.schema.length > 0,
  };
}
