# Fixture 01 — Nonexistent helper imported and called (Happy Path)

## Description

A new report module imports `formatDateRange` from `./utils/date` and calls it.
The repository's `src/utils/date.ts` exports only `formatDate` — `formatDateRange`
does not exist anywhere in the codebase (`rg "formatDateRange" src/` returns 0
definitions). This is a hallucinated reference typical of AI-generated code and
will throw at runtime (`formatDateRange is not a function`).

Repository context (not part of the diff):

```ts
// src/utils/date.ts (existing, unchanged)
export function formatDate(date: Date, pattern: string): string {
  /* ... */
}
```

## Input Diff

```diff
diff --git a/src/report/summary.ts b/src/report/summary.ts
new file mode 100644
--- /dev/null
+++ b/src/report/summary.ts
@@ -0,0 +1,6 @@
+import { formatDateRange } from '../utils/date';
+
+export function buildSummaryHeader(start: Date, end: Date): string {
+  const range = formatDateRange(start, end, 'yyyy-MM-dd');
+  return `Summary: ${range}`;
+}
```

## Expected Behavior

- Exactly one finding anchored to the import or call site of `formatDateRange`
  (`src/report/summary.ts:1` or `src/report/summary.ts:4`).
- The finding cites code_search evidence: definitions found = 0, while
  `src/utils/date.ts` exports `formatDate` only.
- Severity: major (runtime TypeError on the main path).
- Fix suggestion: use `formatDate` twice or implement `formatDateRange`.
- No findings about style, naming, or anything other than reference existence.
