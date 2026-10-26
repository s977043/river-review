# Fixture 01 — Hardcoded color and padding in style prop (Happy Path)

## Description

A new React component is added with inline `style` props using a raw hex color
and a pixel padding value. Both are design token violations: `#3B82F6` should use
a token / CSS custom property, and `padding: '16px'` should use the Tailwind `p-4`
class or equivalent spacing token.

## Input Diff

```diff
diff --git a/src/components/PrimaryButton.tsx b/src/components/PrimaryButton.tsx
new file mode 100644
--- /dev/null
+++ b/src/components/PrimaryButton.tsx
@@ -0,0 +1,17 @@
+import React from 'react';
+
+interface Props {
+  label: string;
+  onClick: () => void;
+}
+
+export function PrimaryButton({ label, onClick }: Props) {
+  return (
+    <button
+      style={{ color: '#3B82F6', padding: '16px', fontSize: '14px' }}
+      onClick={onClick}
+    >
+      {label}
+    </button>
+  );
+}
```

## Expected Behavior

- At least one finding for the hardcoded hex color `#3B82F6`.
- A `TokenSuggestion` referencing a color token (e.g., `var(--color-primary)` or
  `text-blue-500`) must be present.
- `Severity: minor` in the output.
- `Confidence: high` (raw literal is unambiguously hardcoded).
