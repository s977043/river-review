# Fixture 01 — div onClick (Happy Path)

## Description

A `<div>` is given a `click` handler and `tabIndex` instead of using `<button>`.
The skill should suggest `<button>` and cite the focus/keyboard benefits.

## Input Diff

```diff
diff --git a/src/components/Toolbar.tsx b/src/components/Toolbar.tsx
@@ -10,6 +10,8 @@ export function Toolbar({ onSave }: Props) {
   return (
     <div className="toolbar">
-      <button onClick={onSave}>Save</button>
+      <div onClick={onSave} tabIndex={0} className="save-btn">
+        Save
+      </div>
     </div>
   );
 }
```

## Expected Behavior

- Finding referencing the `<div onClick>` pattern.
- Suggestion mentions `<button>` and cites the HTML `<button>` element.
- Severity: `minor`.
- Confidence: `medium` or `high` (no false-positive guard applies).
