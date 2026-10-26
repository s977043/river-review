# Fixture 02 — Decorative `<img>` with `aria-hidden` (False-Positive Guard)

## Description

A purely decorative image with `aria-hidden="true"` and `alt=""`. The skill
should **not** flag this — the `aria-hidden` guard applies.

## Input Diff

```diff
diff --git a/src/components/Card.tsx b/src/components/Card.tsx
@@ -3,6 +3,7 @@ export function Card({ title }: Props) {
   return (
     <div className="card">
+      <img src="/decoration.svg" alt="" aria-hidden="true" />
       <h3>{title}</h3>
     </div>
   );
 }
```

## Expected Behavior

- No finding. The `aria-hidden="true"` guard suppresses any candidate.
- The output should say "No findings" and reference the aria-hidden guard.
