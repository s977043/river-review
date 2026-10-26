# Test Case: Silent Exception Catch (Happy Path)

This test case should trigger a finding for silent exception handling.

## Input Diff

```diff
diff --git a/src/services/user.ts b/src/services/user.ts
index 1111111..2222222 100644
--- a/src/services/user.ts
+++ b/src/services/user.ts
@@ -10,0 +11,8 @@
+async function fetchUser(userId: string) {
+  try {
+    const response = await api.get(`/users/${userId}`);
+    return response.data;
+  } catch (error) {
+    // ignore
+  }
+}
```

## Expected Behavior

The skill should detect that the catch block silently swallows the exception without logging or re-throwing.
