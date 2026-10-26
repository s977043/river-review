# Test Case: Breaking DTO Change Without Tests (Should Detect)

## Description

A required field is added to a request DTO, breaking all existing callers, and no test file is updated.

## Input Diff

```diff
diff --git a/src/types/api.ts b/src/types/api.ts
index abc1234..def5678 100644
--- a/src/types/api.ts
+++ b/src/types/api.ts
@@ -3,3 +3,4 @@ export interface CreateOrderRequest {
   productId: string;
   quantity: number;
+  warehouseId: string;
 }
```

## Expected Behavior

The skill should:

1. Detect that `warehouseId: string` (non-optional) was added to a request DTO — existing callers passing `{productId, quantity}` will fail TypeScript compilation
2. Flag absence of corresponding test file changes
3. Severity: major
4. Suggest either making the field optional (`warehouseId?: string`) or adding a migration note
