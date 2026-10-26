# Test Case: Removed Component Leaves Unused i18n Key (Should Detect)

## Description

This test verifies that the skill correctly identifies an unused locale key left in the JSON file after the corresponding UI component was removed.

## Input Diff

```diff
diff --git a/src/components/UserBadge.tsx b/src/components/UserBadge.tsx
deleted file mode 100644
index 1234567..0000000
--- a/src/components/UserBadge.tsx
+++ /dev/null
@@ -1,10 +0,0 @@
-import { useTranslation } from 'react-i18next';
-
-export function UserBadge({ role }: { role: string }) {
-  const { t } = useTranslation();
-  return (
-    <span className="badge">
-      {t('userBadge.roleLabel')}: {role}
-    </span>
-  );
-}
diff --git a/src/locales/en.json b/src/locales/en.json
index 2345678..3456789 100644
--- a/src/locales/en.json
+++ b/src/locales/en.json
@@ -10,5 +10,8 @@
   "userCard": {
     "title": "User",
     "subtitle": "Profile"
-  }
+  },
+  "userBadge": {
+    "roleLabel": "Role"
+  }
 }
```

## Expected Behavior

The skill should:

1. Detect that `UserBadge.tsx` was deleted and no longer calls `t('userBadge.roleLabel')`
2. Flag that the `userBadge.roleLabel` key added to `en.json` is now unreferenced
3. Suggest removing the `userBadge` section from all locale files
4. Set severity to "minor" and note the dead-code risk
