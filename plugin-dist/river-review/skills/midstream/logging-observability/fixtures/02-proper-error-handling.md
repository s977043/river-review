# Test Case: Proper Error Handling (False Positive Test)

This test case should NOT trigger any findings.

## Input Diff

```diff
diff --git a/src/services/user.ts b/src/services/user.ts
index 1111111..2222222 100644
--- a/src/services/user.ts
+++ b/src/services/user.ts
@@ -10,0 +11,9 @@
+async function fetchUser(userId: string) {
+  try {
+    const response = await api.get(`/users/${userId}`);
+    return response.data;
+  } catch (error) {
+    logger.error('Failed to fetch user', { userId, error });
+    throw error;
+  }
+}
```

## Expected Behavior

The skill should recognize this as proper error handling:

- Exception is logged with context (userId, error)
- Exception is re-thrown to propagate to caller
