# Fixture 02 — Referenced symbol is defined in the same PR (False-Positive Guard)

## Description

A new helper `truncateLabel` is added in `src/utils/text.ts` AND used from
`src/components/Badge.tsx` within the same diff. Defining a symbol and consuming
it in the same PR is the normal way new code lands. The skill must NOT flag
`truncateLabel` as a hallucinated reference, because its definition exists in
the diff itself.

## Input Diff

```diff
diff --git a/src/utils/text.ts b/src/utils/text.ts
new file mode 100644
--- /dev/null
+++ b/src/utils/text.ts
@@ -0,0 +1,6 @@
+export function truncateLabel(label: string, max: number): string {
+  if (label.length <= max) {
+    return label;
+  }
+  return `${label.slice(0, max - 1)}…`;
+}
diff --git a/src/components/Badge.tsx b/src/components/Badge.tsx
new file mode 100644
--- /dev/null
+++ b/src/components/Badge.tsx
@@ -0,0 +1,6 @@
+import React from 'react';
+import { truncateLabel } from '../utils/text';
+
+export function Badge({ label }: { label: string }) {
+  return <span className="badge">{truncateLabel(label, 12)}</span>;
+}
```

## Expected Behavior

- `findings: []` — no hallucinated-reference findings.
- `truncateLabel` is imported and called, but its definition is added in the
  same diff (`src/utils/text.ts`), so the same-PR definition guard suppresses it.
- `React` / JSX usage must not be flagged either (well-known dependency API).
