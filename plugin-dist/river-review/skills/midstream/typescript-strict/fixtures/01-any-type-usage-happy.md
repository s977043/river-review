# Test Case: Unsafe `any` Type Usage (Happy Path)

## Description

This test verifies that the skill correctly identifies newly added `any` type usage that weakens TypeScript's type safety.

## Input Diff

```diff
diff --git a/src/api/parser.ts b/src/api/parser.ts
index 1234567..89abcdef 100644
--- a/src/api/parser.ts
+++ b/src/api/parser.ts
@@ -5,5 +5,7 @@ import { ApiResponse } from './types';
 export function parseApiResponse(raw: unknown): ApiResponse {
   const data = JSON.parse(raw as string);

-  return { id: data.id, name: data.name };
+  const result: any = data;
+  const user: any = result.user;
+  return { id: user.id, name: user.name };
 }
```

## Expected Behavior

The skill should:

1. Detect the `any` type annotations on `result` and `user`
2. Note that using `any` bypasses TypeScript's type checking for these variables
3. Explain the risk of uncaught type errors at runtime
4. Suggest using `unknown` with type guards or an explicit interface
5. Set severity to "major" and confidence to "high"
