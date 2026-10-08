import { classifyHunkBodyLine } from './diff-processor.mjs';

const SOURCE_PATH_RE = /\.(?:ts|tsx|js|jsx|mjs|cjs)$/i;
const TEST_PATH_RE =
  /(?:^|\/)(?:test|tests|__tests__|fixtures|__fixtures__)(?:\/|$)|\.(?:test|spec)\.[^.]+$/i;
const ASYNC_DECLARATION_RES = [
  /\basync\s+function\s*\*?\s*(?<name>[A-Za-z_$][\w$]*)\s*\(/g,
  /\b(?:const|let|var)\s+(?<name>[A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*async\b/g,
];
const ASYNC_ITERATION_CALLBACK_RE =
  /\.(?:forEach|filter|reduce|some|every|find|findIndex)\s*\(\s*async\b/;
const TRY_OPEN_RE = /\btry\s*\{/;
const TRY_CLOSE_RE = /\b(?:catch|finally)\b/;
const PROMISE_COMBINATOR_RE = /\bPromise\.(?:all|allSettled|race|any)\s*\(/;

function markerWidth(hunk) {
  const parentCount = hunk?.parentCount;
  return Number.isInteger(parentCount) && parentCount > 1 ? parentCount : 1;
}

function stripLineComment(text) {
  const index = text.indexOf('//');
  return index === -1 ? text : text.slice(0, index);
}

/**
 * Body lines of every hunk, classified by the parse layer's own classifier.
 * Added and context lines carry their new-side line number; removed lines are
 * dropped because they are absent from the code under review.
 */
function collectVisibleLines(file) {
  const hunks = [];
  for (const hunk of file?.hunks ?? []) {
    const width = markerWidth(hunk);
    let newLine = Number.isInteger(hunk?.newStart) ? hunk.newStart : 1;
    const rows = [];
    for (const rawLine of hunk?.lines ?? []) {
      const line = String(rawLine);
      const classified = classifyHunkBodyLine(line, hunk?.parentCount);
      if (classified === 'removed') continue;
      rows.push({ added: classified === 'added', line: newLine, text: line.slice(width) });
      newLine += 1;
    }
    hunks.push(rows);
  }
  return hunks;
}

function collectAsyncNames(hunks) {
  const names = new Set();
  for (const rows of hunks) {
    for (const { text } of rows) {
      const code = stripLineComment(text);
      for (const re of ASYNC_DECLARATION_RES) {
        for (const match of code.matchAll(re)) names.add(match.groups.name);
      }
    }
  }
  return names;
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isInsideOpenTry(rows, index) {
  for (let i = index - 1; i >= 0; i -= 1) {
    const code = stripLineComment(rows[i].text);
    if (TRY_CLOSE_RE.test(code)) return false;
    if (TRY_OPEN_RE.test(code)) return true;
  }
  return false;
}

/**
 * Classify one call to a known async function on an added line.
 * Returns the signal kind, or null when the call site is not one this v1
 * producer can classify without type information.
 */
function classifyAsyncCall(code, name, rows, index) {
  const callRe = new RegExp(`(^|[^\\w$.])(${escapeRegExp(name)})\\s*\\(`);
  const match = callRe.exec(code);
  if (!match) return null;

  const before = code.slice(0, match.index + match[1].length);
  if (/\b(?:await|void)\s*$/.test(before)) return null;
  // The declaration line of the function itself is not a call site.
  if (/\bfunction\s*\*?\s*$/.test(before) || /\b(?:const|let|var)\s*$/.test(before)) {
    return null;
  }
  if (PROMISE_COMBINATOR_RE.test(code)) return null;

  const after = code.slice(match.index + match[0].length);
  if (/\)\s*\.\s*(?:then|catch|finally)\s*\(/.test(after)) return null;

  if (/\breturn\s*$/.test(before)) {
    return isInsideOpenTry(rows, index) ? 'async-return-in-try' : null;
  }
  if (
    /^\s*(?:\}\s*else\s+)?(?:if|while)\s*\(/.test(code) ||
    /!\s*$/.test(before) ||
    /\)\s*\?(?![?.])/.test(after)
  ) {
    return 'async-call-in-condition';
  }
  if (/^\s*$/.test(before)) return 'async-call-floating';
  if (/\b(?:const|let|var)\s+[A-Za-z_$][\w$]*\s*(?::[^=]+)?=\s*$/.test(before)) {
    return 'async-result-assigned-unawaited';
  }
  return null;
}

/**
 * Extract neutral, deterministic facts that can activate async-correctness
 * Review Viewpoints. These are signals, not findings: no severity, policy,
 * violation decision, or gate behavior is attached here.
 *
 * Whether a callee returns a Promise is only known when the same file's visible
 * diff lines (added or context) declare it `async`. Calls to functions declared
 * elsewhere emit nothing, so this v1 producer trades recall for precision
 * rather than guessing from names. Test and fixture files are excluded because
 * un-awaited assertions belong to a different Skill.
 *
 * @param {{diff?: {files?: Array<object>}}} options
 * @returns {Array<{kind: string, file: string, line: number}>}
 */
export function detectAsyncCorrectnessSignals({ diff } = {}) {
  const signals = [];

  for (const file of diff?.files ?? []) {
    const filePath = typeof file?.path === 'string' ? file.path : '';
    if (!filePath || filePath === '/dev/null') continue;
    if (!SOURCE_PATH_RE.test(filePath) || TEST_PATH_RE.test(filePath)) continue;

    const hunks = collectVisibleLines(file);
    const asyncNames = collectAsyncNames(hunks);
    const seen = new Set();
    const emit = (kind, line) => {
      const key = `${kind}\u0000${line}`;
      if (seen.has(key)) return;
      seen.add(key);
      signals.push({ kind, file: filePath, line });
    };

    for (const rows of hunks) {
      for (const [index, row] of rows.entries()) {
        if (!row.added) continue;
        const code = stripLineComment(row.text);
        if (ASYNC_ITERATION_CALLBACK_RE.test(code)) emit('async-callback-in-iteration', row.line);
        for (const name of asyncNames) {
          const kind = classifyAsyncCall(code, name, rows, index);
          if (kind) emit(kind, row.line);
        }
      }
    }
  }

  return signals;
}
