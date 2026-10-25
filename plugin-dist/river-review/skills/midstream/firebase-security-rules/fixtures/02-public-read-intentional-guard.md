# Test Case: Intentional Public Read + Client apiKey (False Positive Guard)

## Description

Verifies the skill does NOT flag a deliberately public `allow read` on a published-posts collection (justified with a comment) and does NOT flag the client-side Firebase `apiKey` as a secret leak — both are officially sanctioned, distinct from an unguarded write or an admin SDK `private_key` exposure.

## Input Diff

```diff
diff --git a/firestore.rules b/firestore.rules
index 1234567..89abcde 100644
--- a/firestore.rules
+++ b/firestore.rules
@@ -1,0 +1,10 @@
+rules_version = '2';
+service cloud.firestore {
+  match /databases/{database}/documents {
+    match /posts/{postId} {
+      // 公開ブログ記事: 公開 read は要件上正当（write は所有者のみ）
+      allow read: if true;
+      allow write: if request.auth != null && request.auth.uid == resource.data.authorId;
+    }
+  }
+}
diff --git a/src/firebase.ts b/src/firebase.ts
index 1234567..89abcde 100644
--- a/src/firebase.ts
+++ b/src/firebase.ts
@@ -1,0 +1,5 @@
+// Firebase の apiKey はクライアント公開が公式仕様（秘密情報ではない）
+const firebaseConfig = {
+  apiKey: 'AIzaSyClient-Public-Web-Api-Key',
+  projectId: 'demo-project',
+};
```

## Expected Behavior

The skill should:

1. NOT flag the public `allow read: if true;` — intentional and comment-justified for a published-posts collection
2. NOT flag the client `apiKey` — public exposure is the official Firebase spec, not a secret leak
3. Recognize the `write` rule correctly enforces an ownership check
4. Produce no findings
