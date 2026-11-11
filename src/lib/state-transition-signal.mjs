import { classifyHunkBodyLine, parseUnifiedDiff } from './diff-processor.mjs';

// #2875: diffs dense in exception, resume, and state-rewrite paths are where
// per-PR review missed protocol violations. buildExecutionPlan force-selects
// the testing and unknown-coverage skills when this signal fires.
const SOURCE_PATH_RE = /\.(?:ts|tsx|js|jsx|mjs|cjs|py|go|rb|java|kt|rs|php)$/i;
const TEST_PATH_RE =
  /(?:^|\/)(?:test|tests|__tests__|fixtures|__fixtures__)(?:\/|$)|\.(?:test|spec)\.[^.]+$/i;

const CATEGORY_PATTERNS = Object.freeze({
  exception: /\bcatch\b|\bfinally\b|\bexcept\b|\brescue\b/,
  resume: /\b(?:resume|retry|restart|recover|checkpoint|replay)/i,
  stateWrite:
    /\b(?:state|status|phase|stage)\s*(?:=(?!=)|:\s*['"])|\.(?:state|status|phase|stage)\s*=(?!=)|\bset(?:State|Status|Phase)\s*\(/,
});

// Thresholds measured against tests/fixtures/planner-dataset/diffs: no case
// reaches 2 categories with 6 lines, so normal diffs keep their selection.
export const STATE_TRANSITION_MIN_LINES = 6;
export const STATE_TRANSITION_MIN_CATEGORIES = 2;

/**
 * Count added source lines that touch exception, resume, or state-rewrite
 * paths. Test files are excluded: they exercise these paths rather than add them.
 *
 * @param {string} diffText
 * @returns {{ triggered: boolean, signalLines: number, categories: Record<string, number> }}
 */
export function detectStateTransitionSignal(diffText) {
  const categories = Object.fromEntries(Object.keys(CATEGORY_PATTERNS).map((key) => [key, 0]));
  let signalLines = 0;
  if (typeof diffText === 'string' && diffText.length > 0) {
    for (const file of parseUnifiedDiff(diffText).files ?? []) {
      const filePath = typeof file?.path === 'string' ? file.path : '';
      if (!SOURCE_PATH_RE.test(filePath) || TEST_PATH_RE.test(filePath)) continue;
      for (const hunk of file.hunks ?? []) {
        const width =
          Number.isInteger(hunk?.parentCount) && hunk.parentCount > 1 ? hunk.parentCount : 1;
        for (const rawLine of hunk.lines ?? []) {
          const line = String(rawLine);
          if (classifyHunkBodyLine(line, hunk?.parentCount) !== 'added') continue;
          const text = line.slice(width);
          let matched = false;
          for (const [key, re] of Object.entries(CATEGORY_PATTERNS)) {
            if (re.test(text)) {
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
      signalLines >= STATE_TRANSITION_MIN_LINES && categoryCount >= STATE_TRANSITION_MIN_CATEGORIES,
    signalLines,
    categories,
  };
}
