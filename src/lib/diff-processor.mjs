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
 * Parse a hunk header, ordinary or combined.
 *
 * Ordinary unified diff uses two `@` and one old range:
 *   `@@ -37,15 +37,15 @@`
 * A combined diff (`git show --cc`, `git log -p --cc`) uses `parents + 1` `@`
 * characters and one old range PER PARENT, with the new range last:
 *   2 parents: `@@@ -37,15 -37,14 +37,15 @@@`
 *   3 parents: `@@@@ -1,2 -1,2 -1,2 +1,2 @@@@`
 * The marker widths on both sides are equal, and the old-range count is always
 * `markerWidth - 1`, so the parent count is read off the marker rather than
 * guessed from how many ranges happen to be present (#2294).
 *
 * `oldStart`/`oldLines` report the FIRST parent, which is what the ordinary
 * form already reports and what every caller of `hunk.oldStart` expects.
 *
 * @param {string} line
 * @returns {{oldStart: number, oldLines: number, newStart: number, newLines: number, parentCount: number} | null}
 */
function parseHunkHeader(line) {
  // The marker widths are deliberately NOT tied to each other with a
  // backreference, and nothing is asserted after the closing marker. Both would
  // narrow acceptance below the pre-#2294 regexp, which was unanchored and so
  // read any line merely CONTAINING `@@ -N,M +N,M @@`.
  const match = /^@{2,}((?: -\d+(?:,\d+)?)+) \+(\d+)(?:,(\d+))? @{2,}/.exec(line);
  if (!match) return null;
  const oldRanges = match[1].trim().split(' ');
  // Real git always emits `markerWidth === parents + 1` old ranges, so the two
  // agree. When a hand-authored header disagrees, the RANGE COUNT wins: the
  // body's prefix width is what actually has to be counted, and a body written
  // against N ranges carries N columns whatever the marker says. Trusting the
  // marker instead would refuse the header outright and re-open the very
  // fail-silent drop this change closes — measured on `@@@ -1,1 +1,1 @@@` and
  // `@@@@ -1,1 +1,1 @@`, both of which parse identically to pre-#2294 here.
  const parentCount = oldRanges.length;
  const [firstOldStart, firstOldLines] = oldRanges[0].slice(1).split(',');
  return {
    oldStart: Number.parseInt(firstOldStart, 10),
    oldLines: firstOldLines === undefined ? 1 : Number.parseInt(firstOldLines, 10),
    newStart: Number.parseInt(match[2], 10),
    newLines: match[3] ? Number.parseInt(match[3], 10) : 1,
    parentCount,
  };
}

/**
 * Classify one ordinary (single-parent) hunk body line.
 * @param {string} line
 * @returns {'added' | 'removed' | 'context'}
 */
function classifyUnifiedBodyLine(line) {
  if (line.startsWith('+')) return 'added';
  if (line.startsWith('-')) return 'removed';
  return 'context';
}

/**
 * Classify one combined hunk body line by its `parentCount` prefix columns.
 *
 * Column `i` describes the line's relationship to parent `i`:
 *   `-` the line exists in that parent and NOT in the merge result
 *   `+` the line exists in the merge result and NOT in that parent
 *   ` ` the line exists in both
 *
 * Therefore the line is present in the result unless SOME column is `-`, and it
 * is a change worth reviewing when SOME column is `+`. The common merge-
 * resolution line (`++RESOLVED` for two parents) is present in the result and
 * in neither parent, so it is exactly the line a reviewer needs.
 *
 * `\ No newline at end of file` is metadata rather than a body line and must
 * not advance the line counter.
 *
 * @param {string} line
 * @param {number} parentCount
 * @returns {'added' | 'removed' | 'context'}
 */
function classifyCombinedBodyLine(line, parentCount) {
  if (line.startsWith('\\')) return 'removed';
  const columns = line.slice(0, parentCount);
  if (columns.includes('-')) return 'removed';
  if (columns.includes('+')) return 'added';
  return 'context';
}

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
  let gitFormatted = false;
  let gitFileBoundaryPending = false;

  const lines = diffText.split('\n');
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    // Any `diff ` line at column 0 is a producer section marker, never hunk
    // content: every body line inside a well-formed hunk carries a ` `/`+`/`-`
    // prefix, so an unprefixed `diff ` can only be a section header.
    //
    // The match is the whole `diff ` family, not the literal `diff --git`, and
    // not `diff --` either. Both narrower forms leave `gitFileBoundaryPending`
    // unarmed for section headers that real producers do emit, and an unarmed
    // section is absorbed into the PREVIOUS file — which injects that section's
    // line numbers into a real file. Two producers were measured doing this
    // (#2288 review):
    //   - `diff --cc <path>` / `diff --combined <path>`, which Git emits for
    //     merge commits (`git show --cc`, `git log -p --cc`);
    //   - `diff -u -r a/f b/f`, which GNU diff emits with SHORT options. The
    //     long form `diff --unified --recursive` happens to start with `diff --`
    //     and so was already handled, which is exactly why a `diff --` anchor
    //     looked sufficient until the short form was measured.
    //
    // Combined sections still parse as zero hunks because the hunk regexp below
    // does not accept the `@@@ ... @@@` form — see #2294, which owns that gap.
    if (line.startsWith('diff ')) {
      gitFormatted = true;
      gitFileBoundaryPending = true;
      currentHunk = null;
      continue;
    }
    // A file header still requires the complete three-line sequence
    // `--- <old>` / `+++ <new>` / `@@ ...`. For plain unified diff this remains
    // the structural discriminator because there is no stronger file marker.
    // Once a Git `diff --git` marker has been observed, however, the triple is
    // accepted only while that marker's file boundary is still pending. This
    // prevents `--unified=0` hunk content (`--- x` / `+++ y`) plus the next
    // hunk's `@@` from minting a ghost file, without adding any hunk-termination
    // heuristic (#2261/#2280).
    //
    // Known limitation, scoped narrowly: input that CONCATENATES a
    // Git-formatted section with a section that carries NO `diff ` header line
    // at all still absorbs the marker-less section into the previous file. Such
    // a section is byte-for-byte indistinguishable from the `--unified=0` ghost
    // above, so separating them would need a hunk-termination rule — the exact
    // approach that failed across four consecutive designs in #2261.
    //
    // Do not read this as "no producer emits a concatenated diff". Producers
    // do, and those cases are handled: every Git and GNU diff section carries a
    // `diff ` header line, so the marker above re-arms for each one. The gap is
    // only a section stripped of that header, which is hand-authored input.
    // An earlier revision of this comment claimed the broader exemption and was
    // disproved by measurement (#2288 review) — the `diff -u -r` short-option
    // concatenation it declared impossible was injecting line numbers into a
    // real file. Pinned by the band-4 and band-6 concatenation tests, both of
    // which assert addedLines and not only paths.
    const canOpenFile = !gitFormatted || gitFileBoundaryPending;
    if (canOpenFile && line.startsWith('--- ') && (lines[index + 1] ?? '').startsWith('+++ ')) {
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
        if (gitFormatted) gitFileBoundaryPending = false;
        index += 1;
        continue;
      }
    }
    if (!currentFile) continue;
    if (line.startsWith('@@')) {
      const hunkHeader = parseHunkHeader(line);
      if (!hunkHeader) continue;
      currentHunk = {
        header: line,
        oldStart: hunkHeader.oldStart,
        oldLines: hunkHeader.oldLines,
        newStart: hunkHeader.newStart,
        newLines: hunkHeader.newLines,
        parentCount: hunkHeader.parentCount,
        lines: [],
        addedLines: [],
      };
      currentFile.hunks.push(currentHunk);
      newLineNumber = hunkHeader.newStart;
      continue;
    }
    if (!currentHunk) continue;
    currentHunk.lines.push(line);
    // No `+++` / `---` exclusion here: a header now reaches the parser only as
    // an accepted file-boundary triple above, so anything arriving at this
    // counter is hunk content. `+++ x` is the added line `++ x` and `--- x` is
    // the deleted line `-- x`; excluding either miscounts `newLineNumber`, and
    // a deleted line must not advance it at all (#2249 review).
    //
    // A combined hunk (`parentCount > 1`) carries one prefix COLUMN per parent
    // instead of a single prefix character, so the one-character test above
    // would read the second parent's column as file content. The column rules
    // are counted instead — see `classifyCombinedBodyLine` (#2294).
    const classified =
      currentHunk.parentCount > 1
        ? classifyCombinedBodyLine(line, currentHunk.parentCount)
        : classifyUnifiedBodyLine(line);
    if (classified === 'added') {
      currentFile.addedLines.push(newLineNumber);
      currentHunk.addedLines.push(newLineNumber);
      newLineNumber += 1;
    } else if (classified === 'removed') {
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
