# Test Case: i18n Unused Key (Should Detect)

## Description

A UI component removes a translated string reference, but the key remains in the locale file.

## Input Diff

```diff
diff --git a/src/components/UserProfile.tsx b/src/components/UserProfile.tsx
index abc1234..def5678 100644
--- a/src/components/UserProfile.tsx
+++ b/src/components/UserProfile.tsx
@@ -8,7 +8,6 @@ export function UserProfile({ user }: Props) {
   return (
     <div>
       <h1>{t('user.profile.title')}</h1>
-      <p>{t('user.profile.deprecated_bio_label')}</p>
       <p>{user.bio}</p>
     </div>
   );
diff --git a/src/i18n/en.json b/src/i18n/en.json
index 1111111..2222222 100644
--- a/src/i18n/en.json
+++ b/src/i18n/en.json
@@ -5,4 +5,5 @@ {
     "title": "User Profile",
-    "bio_label": "Bio"
+    "bio_label": "Bio",
+    "deprecated_bio_label": "Biography (deprecated)"
   }
 }
```

## Expected Behavior

The skill should:

1. Detect that `user.profile.deprecated_bio_label` was added to the locale file but is no longer referenced in source
2. Set severity to "minor"
3. Suggest removing the orphaned key from locale files
