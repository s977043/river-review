# Test Case: Over-permissive `allow read, write: if true` (Happy Path)

## Description

Verifies the skill flags a Firestore rule that grants unconditional read and write access (`if true`), allowing anyone to overwrite any user's document.

## Input Diff

```diff
diff --git a/firestore.rules b/firestore.rules
index 1234567..89abcde 100644
--- a/firestore.rules
+++ b/firestore.rules
@@ -1,0 +1,8 @@
+rules_version = '2';
+service cloud.firestore {
+  match /databases/{database}/documents {
+    match /users/{userId} {
+      allow read, write: if true;
+    }
+  }
+}
```

## Expected Behavior

The skill should:

1. Flag `allow read, write: if true;` as an unconditional grant with no auth or ownership check
2. Note that any client can read and overwrite any user's document
3. Reference the rules-and-auth convention (require `request.auth.uid == userId`)
