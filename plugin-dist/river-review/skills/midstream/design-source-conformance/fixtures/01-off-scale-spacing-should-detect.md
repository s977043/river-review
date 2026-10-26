# Fixture 01 — New UI values fall outside the defined token scale (Happy Path)

## Description

The repository has a design definition source (`tailwind.config.js` theme with an
explicit `spacing` / `colors` scale), so the first Pre-execution Gate condition is
satisfiable by `code_search`. The diff adds UI values under `src/**` — the second
condition. The new component introduces `padding: 10px` while the defined spacing
scale is `4 / 8 / 12 / 16`, and a raw `#2d6cdf` while the palette defines
`brand.primary = #2563eb`. Both are off-scale per the Rule section's 値の照合 step.

## Input Diff

```diff
diff --git a/src/components/PromoBanner.tsx b/src/components/PromoBanner.tsx
new file mode 100644
--- /dev/null
+++ b/src/components/PromoBanner.tsx
@@ -0,0 +1,12 @@
+export function PromoBanner({ label }: { label: string }) {
+  return (
+    <div
+      style={{
+        padding: '10px',
+        backgroundColor: '#2d6cdf',
+      }}
+    >
+      {label}
+    </div>
+  );
+}
```

Design definition already in the repository (unchanged, found by `code_search`):

```js
// tailwind.config.js:8
theme: {
  spacing: { 1: '4px', 2: '8px', 3: '12px', 4: '16px' },
  colors: { brand: { primary: '#2563eb' } },
}
```

## Expected Behavior

- A finding on `src/components/PromoBanner.tsx:5` for the off-scale `10px`,
  citing the definition at `tailwind.config.js:8` (検索語: `spacing`) and
  proposing the nearest defined value (`8px` or `12px`).
- A finding on `src/components/PromoBanner.tsx:6` for the raw `#2d6cdf`, citing
  `brand.primary = #2563eb` as the defined value.
- Each finding carries 逸脱値 / 参照した定義 / 準拠候補, as the Rule 制約 requires.
- No comment on accessibility, component reuse, or on hardcoded values in
  repositories without a design definition — those are the Non-goals.

<!-- expected:
findings:
  - severity: minor
    reason: 定義済み spacing スケール（4/8/12/16）に無い 10px を新規導入している
    anchor: src/components/PromoBanner.tsx:5
  - severity: minor
    reason: 定義済みパレット（brand.primary = #2563eb）に無い色 #2d6cdf を新規導入している
    anchor: src/components/PromoBanner.tsx:6
-->
