# Fixture 01 — Icon-only button without accessible name (Happy Path)

## Description

A `<button>` rendering an icon with no visible text and no `aria-label`.
The skill should flag missing accessible name and suggest `aria-label`.

## Input Diff

```diff
diff --git a/src/components/CloseButton.tsx b/src/components/CloseButton.tsx
@@ -1,3 +1,3 @@
 export function CloseButton({ onClose }: Props) {
-  return <button onClick={onClose} aria-label="Close">{/* icon */}<XIcon /></button>;
+  return <button onClick={onClose}><XIcon /></button>;
 }
```

## Expected Behavior

- Finding mentions missing accessible name on the `<button>`.
- Fix suggests adding `aria-label` (or visible text).
- Severity: `minor`.
- Confidence: `high`.
