# Test Case: Validation Error Thrown to ErrorBoundary (Happy Path)

## Description

Verifies the skill flags expected validation failures that are `throw`n (reaching the ErrorBoundary) instead of returned as data with a 4xx status.

## Input Diff

```diff
diff --git a/app/routes/signup.tsx b/app/routes/signup.tsx
index 1234567..89abcde 100644
--- a/app/routes/signup.tsx
+++ b/app/routes/signup.tsx
@@ -1,0 +1,9 @@
+export async function action({ request }: Route.ActionArgs) {
+  const form = await request.formData();
+  const email = String(form.get('email'));
+  if (!email.includes('@')) {
+    throw new Response('Invalid email', { status: 400 });
+  }
+  await createUser(email);
+  return { ok: true };
+}
```

## Expected Behavior

The skill should:

1. Flag the thrown validation error (should be returned as `data({ errors }, { status: 400 })` for inline display)
2. Flag the missing `redirect()` on success (returns `{ ok: true }` instead)
3. Reference the form-validation convention
