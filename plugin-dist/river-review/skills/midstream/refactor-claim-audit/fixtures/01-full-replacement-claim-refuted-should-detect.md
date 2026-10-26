# Fixture 01 — "All call sites replaced" claim refuted by residue (Happy Path)

## Description

The commit message contains a completion claim（「全置換」「完了」）and a numeric
claim（「-60%」）, so the Pre-execution Gate holds. Grepping the claim's target
(`formatDateLegacy`) still finds an un-migrated call site in the same diff's
neighbourhood, and the `-60%` figure has no case definition (best / typical /
worst), which the Rule section's 数値の独立試算 step requires.

## Input Diff

Commit message:

```text
refactor: formatDateLegacy を formatDate に全置換し、日付整形の分岐を -60% 削減（完了）
```

```diff
diff --git a/src/report/summary.ts b/src/report/summary.ts
--- a/src/report/summary.ts
+++ b/src/report/summary.ts
@@ -1,5 +1,5 @@
-import { formatDateLegacy } from '../date/legacy';
+import { formatDate } from '../date/format';

 export function renderSummary(rows: Row[]) {
-  return rows.map((r) => `${formatDateLegacy(r.at)} ${r.title}`);
+  return rows.map((r) => `${formatDate(r.at)} ${r.title}`);
 }
diff --git a/src/report/export.ts b/src/report/export.ts
--- a/src/report/export.ts
+++ b/src/report/export.ts
@@ -1,5 +1,5 @@
 import { formatDateLegacy } from '../date/legacy';

 export function exportCsv(rows: Row[]) {
-  return rows.map((r) => [formatDateLegacy(r.at), r.title].join(','));
+  return rows.map((r) => [formatDateLegacy(r.at), escapeCsv(r.title)].join(','));
 }
```

## Expected Behavior

- A finding anchored at `src/report/export.ts:1` quoting the claim
  （「formatDateLegacy を formatDate に全置換」, 出典: commit message）and showing
  the residue with a reproducible search term (検索語: `formatDateLegacy`,
  `src/report/export.ts:1,4`), so 「全置換」is unsupported.
- A finding on the `-60%` claim asking which case it measures — best / typical /
  worst — since no denominator is given; the Rule requires the case to be stated
  rather than the number to be re-measured.
- No judgement on whether the refactor itself is a good idea — that is a Non-goal.

<!-- expected:
findings:
  - severity: major
    reason: 「全置換」主張に対し formatDateLegacy の呼び出しが残存しており grep で反証できる
    anchor: src/report/export.ts:1
  - severity: minor
    reason: 「-60% 削減」の数値主張に分母・ケース定義（best/typical/worst）が示されていない
    anchor: src/report/summary.ts:1
-->
