# Test Case: Theme-Extended / Justified Arbitrary Value (False Positive Guard)

## Description

Verifies the skill does NOT flag arbitrary values that are deliberately outside the scale and are either justified by a comment or backed by a `theme.extend` entry — a legitimate, sanctioned use distinct from scale-bypassing overuse.

## Input Diff

```diff
diff --git a/src/components/Divider.tsx b/src/components/Divider.tsx
index 1234567..89abcde 100644
--- a/src/components/Divider.tsx
+++ b/src/components/Divider.tsx
@@ -1,0 +1,6 @@
+export function Divider() {
+  // 1px hairline border is intentional — no theme scale value maps to 0.5px
+  return (
+    <hr className="border-[0.5px] border-gray-200" />
+  );
+}
diff --git a/src/components/Hero.tsx b/src/components/Hero.tsx
index 2234567..99abcde 100644
--- a/src/components/Hero.tsx
+++ b/src/components/Hero.tsx
@@ -1,0 +1,2 @@
+// width below maps to theme.extend.width['hero'] in tailwind.config
+export const heroClass = 'w-hero bg-brand';
```

## Expected Behavior

The skill should:

1. NOT flag `border-[0.5px]` — justified by the comment as an intentional out-of-scale hairline
2. NOT flag `w-hero` / `bg-brand` — these resolve to `theme.extend` entries, not arbitrary values
3. Produce no findings
