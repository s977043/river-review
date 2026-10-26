# Test Case: Auth Delegated to Helper (False Positive Guard)

## Description

Verifies the skill does NOT flag a Server Action that delegates authentication to a shared helper (`requireUser()`) and input validation to a zod schema, with both calls visible in the diff. The owner is derived from the session, not from client-supplied data.

## Input Diff

```diff
diff --git a/app/posts/actions.ts b/app/posts/actions.ts
index 1234567..89abcde 100644
--- a/app/posts/actions.ts
+++ b/app/posts/actions.ts
@@ -1,0 +1,16 @@
+'use server';
+
+import { db } from '@/lib/db';
+import { requireUser } from '@/lib/auth';
+import { z } from 'zod';
+
+const schema = z.object({ postId: z.string().uuid() });
+
+export async function deletePost(formData: FormData) {
+  const user = await requireUser();
+  const { postId } = schema.parse({ postId: formData.get('postId') });
+  const post = await db.post.findUniqueOrThrow({ where: { id: postId } });
+  if (post.ownerId !== user.id) throw new Error('Forbidden');
+  await db.post.delete({ where: { id: postId } });
+  return { ok: true };
+}
```

## Expected Behavior

The skill should:

1. NOT flag authentication — `requireUser()` is called before the mutation and is visible in the diff
2. NOT flag input validation — `schema.parse(...)` validates `formData` before use
3. NOT flag impersonation — ownership is checked against `user.id` derived from the session, not client-supplied data
4. Produce no findings
