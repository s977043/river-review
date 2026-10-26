# Fixture 02 — Residue is a documented backward-compatibility alias (False-Positive Guard)

## Description

The commit message carries a completion claim（「移行」「置換」）, so the
Pre-execution Gate holds and the skill runs. Grep does find a remaining
`formatDateLegacy` symbol, but the diff itself declares it as a deprecation-period
alias with a removal target, which is the False-positive guard 「残骸が意図的に
残されたもの（後方互換のための alias、deprecation 期間中の旧 API 等）で、差分内に
その旨が明記されている場合は抑制」. The numeric claim is already a range, matching
the guard 「数値主張が範囲表記で既に幅を持っている場合は抑制」.

## Input Diff

Commit message:

```text
refactor: 日付整形を formatDate へ置換（旧 API は 1 リリース分 alias として残す）。分岐は -40%〜-55% 削減
```

```diff
diff --git a/src/date/legacy.ts b/src/date/legacy.ts
--- a/src/date/legacy.ts
+++ b/src/date/legacy.ts
@@ -1,6 +1,6 @@
-export function formatDateLegacy(at: Date): string {
-  const y = at.getFullYear();
-  const m = String(at.getMonth() + 1).padStart(2, '0');
-  const d = String(at.getDate()).padStart(2, '0');
-  return `${y}/${m}/${d}`;
-}
+import { formatDate } from './format';
+
+/**
+ * @deprecated v2.0.0 で削除する後方互換 alias。新規コードは formatDate を使うこと。
+ */
+export const formatDateLegacy = formatDate;
diff --git a/src/report/summary.ts b/src/report/summary.ts
--- a/src/report/summary.ts
+++ b/src/report/summary.ts
@@ -1 +1 @@
-import { formatDateLegacy } from '../date/legacy';
+import { formatDate } from '../date/format';
```

## Expected Behavior

- `findings: []`.
- The surviving `formatDateLegacy` symbol is annotated `@deprecated` with an
  explicit removal version inside the diff, so it is intentional residue.
- The `-40%〜-55%` claim is already a range, so no 独立試算 demand is warranted.
- The refactor is a pure symbol swap with no extraction, so the 性能特性の退行 and
  キー集約の衝突 lenses have nothing to compare — reporting either without base-code
  evidence of parallelism / fast-path is listed under 不合格基準.

<!-- expected:
findings: []
reason: Pre-execution Gate は成立するが、残存シンボルは差分内で @deprecated と削除予定版が明記された後方互換 alias であり、数値主張も範囲表記であるため、いずれも False-positive guard に該当する
-->
