# Test Case: Optional Field Addition With Tests (Should NOT Detect)

## Description

A new optional field is added to a response DTO, and the test file is updated.

## Input Diff

```diff
diff --git a/src/types/api.ts b/src/types/api.ts
index abc1234..def5678 100644
--- a/src/types/api.ts
+++ b/src/types/api.ts
@@ -3,3 +3,4 @@ export interface OrderResponse {
   id: string;
   status: string;
+  estimatedDelivery?: string;
 }
diff --git a/src/api/orders.test.ts b/src/api/orders.test.ts
index 1111111..2222222 100644
--- a/src/api/orders.test.ts
+++ b/src/api/orders.test.ts
@@ -15,3 +15,5 @@ describe('GET /orders/:id', () => {
   it('returns order with estimated delivery when available', async () => {
+    const res = await request(app).get('/orders/123');
+    expect(res.body.estimatedDelivery).toBeUndefined(); // optional
   });
 });
```

## Expected Behavior

The skill should NOT flag this — adding an optional field (`?:`) is backward-compatible, and the test file is updated accordingly.
