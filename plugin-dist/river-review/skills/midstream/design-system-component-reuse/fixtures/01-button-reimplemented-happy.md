# Fixture 01 — Button Reimplemented (Happy Path)

## Description

A new `SubmitButton.tsx` file is added in a feature directory (NOT under
`components/ui/`). It builds a styled button directly from `<button>` with
multiple Tailwind classes instead of importing an existing `Button` component.
The skill should flag this as a reimplementation and suggest using the design
system `Button`.

## Input Diff

```diff
diff --git a/src/features/checkout/SubmitButton.tsx b/src/features/checkout/SubmitButton.tsx
new file mode 100644
--- /dev/null
+++ b/src/features/checkout/SubmitButton.tsx
@@ -0,0 +1,19 @@
+import React from 'react';
+
+interface Props {
+  label: string;
+  onClick: () => void;
+  disabled?: boolean;
+}
+
+export function SubmitButton({ label, onClick, disabled }: Props) {
+  return (
+    <button
+      className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600 disabled:opacity-50"
+      onClick={onClick}
+      disabled={disabled}
+    >
+      {label}
+    </button>
+  );
+}
```

## Expected Behavior

- Finding identifies `Button` primitive being reimplemented.
- Evidence cites the `<button className="bg-blue-500 ...">` line in `SubmitButton.tsx`.
- Suggestion mentions importing `Button` from the design system (e.g. `src/components/ui/Button`).
- Severity: `major`.
- Confidence: `medium`.
