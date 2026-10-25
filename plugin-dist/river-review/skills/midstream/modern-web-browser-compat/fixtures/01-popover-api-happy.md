# Fixture 01 — Popover API without `@supports` (Happy Path)

## Description

The Popover API (Baseline "Newly available" 2024) is introduced without any
feature detection or fallback. The skill should suggest `@supports` or
`if ('popover' in HTMLElement.prototype)` detection.

## Input Diff

```diff
diff --git a/src/components/HelpTooltip.tsx b/src/components/HelpTooltip.tsx
@@ -3,7 +3,7 @@ export function HelpTooltip({ id, children }: Props) {
   return (
     <>
       <button popovertarget={id}>?</button>
-      <div role="tooltip">{children}</div>
+      <div popover="auto" id={id}>{children}</div>
     </>
   );
 }
```

## Expected Behavior

- Finding referencing the Popover API and its Baseline state.
- Suggestion proposes feature detection (`if ('popover' in HTMLElement.prototype)`)
  or `@supports` for the CSS side.
- `Baseline:` line populated.
- `Severity: minor`.
