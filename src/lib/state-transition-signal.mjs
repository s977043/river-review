import { classifyHunkBodyLine, parseUnifiedDiff } from './diff-processor.mjs';

// #2875: diffs dense in exception, resume, and state-rewrite paths are where
// per-PR review missed protocol violations. buildExecutionPlan force-selects
// the testing and unknown-coverage skills when this signal fires.
const SOURCE_PATH_RE = /\.(?:ts|tsx|js|jsx|mjs|cjs|py|go|rb|java|kt|rs|php)$/i;
const TEST_PATH_RE =
  /(?:^|\/)(?:test|tests|__tests__|fixtures|__fixtures__)(?:\/|$)|\.(?:test|spec)\.[^.]+$/i;

// Statement forms only: `promise.catch(fn)` is a callback, not an exception path.
const CATCH_STATEMENT_RE = /(?:^|[;}])\s*catch\s*[({]|^\s*(?:except|rescue)\b/;
const EXCEPTION_RE = new RegExp(`${CATCH_STATEMENT_RE.source}|(?:^|[;}])\\s*finally\\s*\\{`);
// Lowercase follow-up is rejected so `restartable` / `isRetryable` stay out
// while camelCase calls such as `resumeFromCheckpoint` still count.
const RESUME_RE =
  /\b(?:[Rr]esume|[Rr]etry|[Rr]estart|[Rr]ecover|[Cc]heckpoint|[Rr]eplay)(?:s|ed|ing)?(?![a-z])/;
const STATE_WRITE_RE =
  /\b(?:state|status|phase|stage)\s*=(?!=)|\.(?:state|status|phase|stage)\s*=(?!=)|\bset(?:State|Status|Phase)\s*\(/;
// A success value returned from inside a catch block: the recovered-exception
// shape #2875 observed (failure reported as success).
const SUCCESS_RETURN_RE = /\breturn\s+(?:true\b|\{[^}]*\b(?:ok|success)\s*:\s*true\b)/;

const CATEGORY_KEYS = Object.freeze(['exception', 'resume', 'stateWrite', 'swallowedSuccess']);

// Measured against tests/fixtures/planner-dataset/diffs (49 cases): the
// maximum is 1 line in 1 category, so normal diffs keep their selection.
export const STATE_TRANSITION_MIN_LINES = 6;
export const STATE_TRANSITION_MIN_CATEGORIES = 2;
export const STATE_TRANSITION_DISTINCT_CATEGORIES = 3;

function braceBalance(text) {
  let balance = 0;
  for (const char of text) {
    if (char === '{') balance += 1;
    else if (char === '}') balance -= 1;
  }
  return balance;
}

/**
 * Count added source lines that touch exception, resume, state-rewrite, or
 * swallowed-success paths. Test files are excluded: they exercise these paths
 * rather than add them. Context lines only track whether a catch block is open.
 *
 * @param {string} diffText
 * @returns {{ triggered: boolean, signalLines: number, categories: Record<string, number> }}
 */
export function detectStateTransitionSignal(diffText) {
  const categories = Object.fromEntries(CATEGORY_KEYS.map((key) => [key, 0]));
  let signalLines = 0;
  if (typeof diffText === 'string' && diffText.length > 0) {
    for (const file of parseUnifiedDiff(diffText).files ?? []) {
      const filePath = typeof file?.path === 'string' ? file.path : '';
      if (!SOURCE_PATH_RE.test(filePath) || TEST_PATH_RE.test(filePath)) continue;
      for (const hunk of file.hunks ?? []) {
        const width =
          Number.isInteger(hunk?.parentCount) && hunk.parentCount > 1 ? hunk.parentCount : 1;
        let catchDepth = 0;
        for (const rawLine of hunk.lines ?? []) {
          const line = String(rawLine);
          const kind = classifyHunkBodyLine(line, hunk?.parentCount);
          if (kind === 'removed') continue;
          const text = line.slice(width);
          const inCatch = catchDepth > 0;
          const catchMatch = CATCH_STATEMENT_RE.exec(text);
          if (catchMatch)
            catchDepth = braceBalance(text.slice(text.indexOf('catch', catchMatch.index)));
          else if (catchDepth > 0) catchDepth += braceBalance(text);
          if (kind !== 'added') continue;
          const hits = {
            exception: EXCEPTION_RE.test(text),
            resume: RESUME_RE.test(text),
            stateWrite: STATE_WRITE_RE.test(text),
            swallowedSuccess: inCatch && SUCCESS_RETURN_RE.test(text),
          };
          let matched = false;
          for (const key of CATEGORY_KEYS) {
            if (hits[key]) {
              categories[key] += 1;
              matched = true;
            }
          }
          if (matched) signalLines += 1;
        }
      }
    }
  }
  const categoryCount = Object.values(categories).filter((n) => n > 0).length;
  return {
    triggered:
      (signalLines >= STATE_TRANSITION_MIN_LINES &&
        categoryCount >= STATE_TRANSITION_MIN_CATEGORIES) ||
      categoryCount >= STATE_TRANSITION_DISTINCT_CATEGORIES,
    signalLines,
    categories,
  };
}
