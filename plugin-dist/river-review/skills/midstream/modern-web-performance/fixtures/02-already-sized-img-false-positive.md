# Fixture 02 — Below-the-fold image with sizing + lazy (False-Positive Guard)

## Description

A below-the-fold thumbnail with explicit `width` / `height` and `loading="lazy"`
gains an `alt` attribute. The skill should NOT propose perf changes — the
attributes guard applies and the image is correctly lazy-loaded.

## Input Diff

```diff
diff --git a/src/components/Thumb.tsx b/src/components/Thumb.tsx
@@ -1,3 +1,3 @@
 export function Thumb({ src, title }: Props) {
-  return <img src={src} width="200" height="200" loading="lazy" decoding="async" />;
+  return <img src={src} width="200" height="200" loading="lazy" decoding="async" alt={title} />;
 }
```

## Expected Behavior

- No finding. `loading="lazy"` + sized + `decoding="async"` already satisfy
  the relevant rules; the diff only adds `alt` (out of scope for this skill).
