# Test Case: Dynamic i18n Key Reference (False Positive Guard)

## Description

This test verifies that the skill does NOT flag locale keys that are referenced via dynamic key generation (template literals or computed property keys), which cannot be statically resolved.

## Input Diff

```diff
diff --git a/src/locales/en.json b/src/locales/en.json
index 2345678..3456789 100644
--- a/src/locales/en.json
+++ b/src/locales/en.json
@@ -5,5 +5,11 @@
   "common": {
     "save": "Save",
     "cancel": "Cancel"
+  },
+  "status": {
+    "active": "Active",
+    "inactive": "Inactive",
+    "pending": "Pending",
+    "archived": "Archived"
   }
 }
diff --git a/src/components/StatusBadge.tsx b/src/components/StatusBadge.tsx
index abcdef0..1234567 100644
--- a/src/components/StatusBadge.tsx
+++ b/src/components/StatusBadge.tsx
@@ -3,5 +3,6 @@ import { useTranslation } from 'react-i18next';

 export function StatusBadge({ status }: { status: string }) {
   const { t } = useTranslation();
-  return <span>{status}</span>;
+  // Dynamic key: key is constructed at runtime from the status value
+  return <span>{t(`status.${status}`)}</span>;
 }
```

## Expected Behavior

The skill should:

1. Recognize the `t(\`status.${status}\`)` call uses a dynamic template literal key
2. NOT flag the `status.*` keys in `en.json` as unused — they are referenced dynamically
3. Either return no findings or explicitly acknowledge dynamic key usage makes static analysis unreliable
4. NOT produce false positive warnings about unused keys for dynamically-generated references
