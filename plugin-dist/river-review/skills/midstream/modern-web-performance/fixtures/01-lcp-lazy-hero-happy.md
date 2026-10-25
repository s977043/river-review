# Fixture 01 — `loading="lazy"` on hero image (Happy Path)

## Description

The hero image gains `loading="lazy"` — an LCP regression for above-the-fold
content. The skill should flag it and suggest removing `loading="lazy"` and
adding `fetchpriority="high"`.

## Input Diff

```diff
diff --git a/src/components/Hero.tsx b/src/components/Hero.tsx
@@ -2,7 +2,7 @@ export function Hero() {
   return (
     <section className="hero">
-      <img src="/hero.jpg" alt="..." width="1200" height="600" fetchpriority="high" />
+      <img src="/hero.jpg" alt="..." width="1200" height="600" loading="lazy" />
       <h1>Welcome</h1>
     </section>
   );
 }
```

## Expected Behavior

- `Metric: LCP`.
- Suggestion: remove `loading="lazy"`, restore (or add) `fetchpriority="high"`.
- `Severity: minor`.
- `Confidence: high`.
