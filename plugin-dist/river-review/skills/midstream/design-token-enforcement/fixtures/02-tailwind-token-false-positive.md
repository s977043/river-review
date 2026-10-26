# Fixture 02 — Tailwind utility classes only (False-Positive Guard)

## Description

A new card component is added using only standard Tailwind utility classes for all
visual properties. Tailwind utilities ARE the design token system — no raw values
are hardcoded. The skill must NOT flag any of these classes.

## Input Diff

```diff
diff --git a/src/components/Card.tsx b/src/components/Card.tsx
new file mode 100644
--- /dev/null
+++ b/src/components/Card.tsx
@@ -0,0 +1,15 @@
+import React from 'react';
+
+interface Props {
+  title: string;
+  body: string;
+}
+
+export function Card({ title, body }: Props) {
+  return (
+    <div className="bg-blue-500 p-4 rounded-lg shadow-md text-sm text-white">
+      <h2 className="text-lg font-semibold mb-2">{title}</h2>
+      <p className="text-base">{body}</p>
+    </div>
+  );
+}
```

## Expected Behavior

- No findings. All values use Tailwind utility classes which constitute the token
  system (`bg-blue-500`, `p-4`, `rounded-lg`, `shadow-md`, `text-sm`).
- Output should be "No findings" with the Tailwind utility guard cited.
