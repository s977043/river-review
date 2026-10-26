# Test Case: Non-Null Assertion on API Response (Happy Path)

## Description

This test verifies that the skill correctly identifies unsafe non-null assertion on an external API response value.

## Input Diff

```diff
diff --git a/src/services/user-service.ts b/src/services/user-service.ts
index 1234567..89abcdef 100644
--- a/src/services/user-service.ts
+++ b/src/services/user-service.ts
@@ -8,5 +8,5 @@ export async function getUserName(userId: string): Promise<string> {
   const response = await fetch(`/api/users/${userId}`);
   const data = await response.json();

-  return data.profile?.name ?? 'Anonymous';
+  return data.profile!.name;
 }
```

## Expected Behavior

The skill should:

1. Detect the unsafe non-null assertion `data.profile!.name`
2. Note that `data` is from an external API response and could be null/undefined
3. Explain the runtime crash risk
4. Suggest using optional chaining or null guard instead
5. Set severity to "major" and confidence to "high"
