# Fixture 02 — UI Primitive Definition (False Positive)

## Description

A diff modifies `src/components/ui/Button.tsx` to add a new `size` prop with
corresponding Tailwind size variants. This is the canonical Button definition
in the design system — the skill must NOT flag it as a reimplementation.

## Input Diff

```diff
diff --git a/src/components/ui/Button.tsx b/src/components/ui/Button.tsx
--- a/src/components/ui/Button.tsx
+++ b/src/components/ui/Button.tsx
@@ -1,15 +1,24 @@
 import React from 'react';

-interface Props {
+type Size = 'sm' | 'md' | 'lg';
+
+interface Props {
   children: React.ReactNode;
   onClick?: () => void;
   disabled?: boolean;
+  size?: Size;
 }

-export function Button({ children, onClick, disabled }: Props) {
+const sizeClasses: Record<Size, string> = {
+  sm: 'px-2 py-1 text-sm',
+  md: 'px-4 py-2 text-base',
+  lg: 'px-6 py-3 text-lg',
+};
+
+export function Button({ children, onClick, disabled, size = 'md' }: Props) {
   return (
     <button
-      className="bg-blue-500 text-white px-4 py-2 rounded"
+      className={`bg-blue-500 text-white rounded ${sizeClasses[size]}`}
       onClick={onClick}
       disabled={disabled}
     >
```

## Expected Behavior

- No finding emitted.
- The false-positive guard for definition files (`src/components/ui/Button.tsx`
  is the canonical design system primitive) must be cited as the suppression
  reason.
- Severity: not applicable (no finding).
