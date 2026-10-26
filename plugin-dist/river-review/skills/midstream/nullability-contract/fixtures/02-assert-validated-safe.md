# Test Case: Assert Function Guarantees Non-Null Before Access (False Positive Guard)

## Description

This test verifies that the skill does NOT flag property access that follows an assertion function which guarantees the value is non-null via TypeScript's `asserts` narrowing.

## Input Diff

```diff
diff --git a/src/services/session-service.ts b/src/services/session-service.ts
index 1234567..abcdef0 100644
--- a/src/services/session-service.ts
+++ b/src/services/session-service.ts
@@ -4,5 +4,24 @@ interface Session {
   userId: string;
   token: string;
   expiresAt: number;
+  preferences: UserPreferences;
 }

+function assertSession(session: Session | null): asserts session is Session {
+  if (session === null) {
+    throw new Error('Session is required but was null');
+  }
+}
+
+export function getUserPreferences(): UserPreferences {
+  const session = sessionStorage.getSession();
+  assertSession(session);
+  // Safe: assertSession narrows session to Session (non-null)
+  return session.preferences;
+}
+
+export function getSessionUserId(): string {
+  const session = sessionStorage.getSession();
+  assertSession(session);
+  return session.userId;
+}
```

## Expected Behavior

The skill should:

1. Recognize that `assertSession` uses TypeScript's `asserts session is Session` narrowing
2. Understand that after `assertSession(session)` the type is narrowed to `Session` (non-null)
3. NOT flag `session.preferences` or `session.userId` as unsafe null access
4. Either return no findings or explicitly acknowledge that the assert function provides null safety
5. NOT produce false positive warnings about accessing properties on a potentially-null value
