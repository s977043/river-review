# Test Case: Server Action Mutation Without Auth or Validation (Happy Path)

## Description

Verifies the skill flags a `'use server'` action that performs a DB delete/update without checking authentication/authorization, and passes unvalidated `formData` (including a client-supplied `userId`) straight to the database.

## Input Diff

```diff
diff --git a/app/posts/actions.ts b/app/posts/actions.ts
index 1234567..89abcde 100644
--- a/app/posts/actions.ts
+++ b/app/posts/actions.ts
@@ -1,0 +1,11 @@
+'use server';
+
+import { db } from '@/lib/db';
+
+export async function deletePost(formData: FormData) {
+  const postId = String(formData.get('postId'));
+  const userId = String(formData.get('userId'));
+  await db.post.update({ where: { id: postId }, data: { ownerId: userId } });
+  await db.post.delete({ where: { id: postId } });
+  return { ok: true };
+}
```

## Expected Behavior

The skill should:

1. Flag the missing authentication check before the mutation (`db.post.update` / `db.post.delete` run with no `auth()` / `requireUser()` etc.)
2. Flag the missing authorization (no owner check that the session user owns `postId`)
3. Flag the unvalidated `formData` passed directly to the DB, and the trust of client-supplied `userId` as owner (impersonation risk)
4. Reference the Next.js authentication-and-authorization convention
