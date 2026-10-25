# Fixture 01 — Clickable `<div>` with no keyboard handler (Happy Path)

## Description

A clickable `<div>` is added with `onClick` but no `onKeyDown` and no `tabIndex`.
The skill should flag missing keyboard support and recommend a `<button>` or
explicit key handlers + `tabIndex`.

## Input Diff

```diff
diff --git a/src/components/MenuItem.tsx b/src/components/MenuItem.tsx
@@ -1,3 +1,5 @@
 export function MenuItem({ label, onSelect }: Props) {
-  return <button onClick={onSelect}>{label}</button>;
+  return (
+    <div onClick={onSelect} className="menu-item">{label}</div>
+  );
 }
```

## Expected Behavior

- `Aspect: Keyboard`.
- Suggestion: revert to `<button>` or add `tabIndex={0}` + `onKeyDown` for Enter/Space.
- `Severity: minor`.
- `Confidence: high`.
