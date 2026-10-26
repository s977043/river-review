# Test Case: i18n Key Rename (Should NOT Detect)

## Description

A translation key is renamed — both the source reference and the locale entry are updated together.

## Input Diff

```diff
diff --git a/src/components/Header.tsx b/src/components/Header.tsx
index abc1234..def5678 100644
--- a/src/components/Header.tsx
+++ b/src/components/Header.tsx
@@ -5,2 +5,2 @@ export function Header() {
-  return <h1>{t('header.title_old')}</h1>;
+  return <h1>{t('header.title')}</h1>;
 }
diff --git a/src/i18n/en.json b/src/i18n/en.json
index 1111111..2222222 100644
--- a/src/i18n/en.json
+++ b/src/i18n/en.json
@@ -2,4 +2,4 @@ {
   "header": {
-    "title_old": "My App"
+    "title": "My App"
   }
 }
```

## Expected Behavior

The skill should NOT flag this — the old key is removed and the new key is added together (a rename). No orphaned keys exist after the change.
