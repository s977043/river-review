# Test Case: Guarded Property Access (Should NOT Detect)

## Description

Code uses optional chaining and null guards consistently.

## Input Diff

```diff
diff --git a/src/api/profile.ts b/src/api/profile.ts
index abc1234..def5678 100644
--- a/src/api/profile.ts
+++ b/src/api/profile.ts
@@ -5,3 +5,7 @@ export async function getUserProfile(userId: string) {
   const response = await fetch(`/api/users/${userId}`);
   const data: UserProfileResponse | null = await response.json();
+
+  if (!data) return null;
+  const displayName = data.profile?.displayName ?? data.username;
+  return { displayName };
 }
```

## Expected Behavior

The skill should NOT flag this — the code checks `!data` before accessing properties, and uses optional chaining with a nullish coalescing fallback.
