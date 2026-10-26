# Test Case: Arbitrary Value Overuse and Conflicting Utilities (Happy Path)

## Description

Verifies the skill flags arbitrary values that bypass the theme scale (`w-[437px]`, `text-[#1a2b3c]`) and conflicting utilities on one element (`px-2 px-4`) added to a `className`.

## Input Diff

```diff
diff --git a/src/components/Card.tsx b/src/components/Card.tsx
index 1234567..89abcde 100644
--- a/src/components/Card.tsx
+++ b/src/components/Card.tsx
@@ -1,0 +1,7 @@
+export function Card() {
+  return (
+    <div className="w-[437px] px-2 px-4 mt-[13px] text-[#1a2b3c]">
+      <p className="bg-[#ffffff]">content</p>
+    </div>
+  );
+}
```

## Expected Behavior

The skill should:

1. Flag `w-[437px]` and `mt-[13px]` as arbitrary values bypassing the theme spacing/size scale
2. Flag `px-2 px-4` as conflicting utilities on one element (later wins, `px-2` is dead)
3. Flag `text-[#1a2b3c]` and `bg-[#ffffff]` as hardcoded arbitrary colors that should use design tokens (e.g. `bg-white`)
4. Reference the Tailwind theme / arbitrary-value conventions
