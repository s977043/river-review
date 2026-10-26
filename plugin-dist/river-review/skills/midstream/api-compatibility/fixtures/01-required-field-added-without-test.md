# Test Case: Required DTO Field Added Without Test Update (Should Detect)

## Description

This test verifies that the skill correctly identifies a DTO change that makes a previously optional field required, without updating the corresponding API tests to include the new required field.

## Input Diff

```diff
diff --git a/src/types/create-order.dto.ts b/src/types/create-order.dto.ts
index 1234567..abcdef0 100644
--- a/src/types/create-order.dto.ts
+++ b/src/types/create-order.dto.ts
@@ -4,5 +4,6 @@ export interface CreateOrderDto {
   customerId: string;
   items: OrderItem[];
-  shippingAddressId?: string;
+  shippingAddressId: string;
   paymentMethodId: string;
+  couponCode?: string;
 }
diff --git a/src/api/orders.ts b/src/api/orders.ts
index 2345678..3456789 100644
--- a/src/api/orders.ts
+++ b/src/api/orders.ts
@@ -6,7 +6,7 @@ export async function createOrder(dto: CreateOrderDto): Promise<Order> {
   const response = await fetch('/api/orders', {
     method: 'POST',
     headers: { 'Content-Type': 'application/json' },
-    body: JSON.stringify(dto),
+    body: JSON.stringify({ ...dto, source: 'web' }),
   });
   return response.json();
 }
```

## Expected Behavior

The skill should:

1. Detect that `shippingAddressId` was changed from optional (`?`) to required in `CreateOrderDto`
2. Flag this as a potentially breaking change — existing callers that omit `shippingAddressId` will now have a TypeScript error
3. Note that no test files are updated in the diff to cover this change
4. Suggest finding all call sites of `createOrder` to confirm `shippingAddressId` is always provided
5. Suggest adding or updating tests to verify the new required field behavior
6. Set severity to "major"
