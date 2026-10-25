# Test Case: Intentional 404 Throw (False Positive Guard)

## Description

Verifies the skill does NOT flag the deliberate `throw data(..., { status: 404 })` for a missing resource — an officially sanctioned pattern distinct from validation errors.

## Input Diff

```diff
diff --git a/app/routes/post.tsx b/app/routes/post.tsx
index 1234567..89abcde 100644
--- a/app/routes/post.tsx
+++ b/app/routes/post.tsx
@@ -1,0 +1,8 @@
+import { data, redirect } from 'react-router';
+
+export async function action({ params }: Route.ActionArgs) {
+  const post = await getPost(params.id);
+  if (!post) throw data('Not Found', { status: 404 });
+  await deletePost(post.id);
+  return redirect('/posts');
+}
```

## Expected Behavior

The skill should:

1. NOT flag `throw data('Not Found', { status: 404 })` — intentional resource-absence throw, not a validation error
2. Recognize the success path correctly uses `redirect()`
3. Produce no findings
