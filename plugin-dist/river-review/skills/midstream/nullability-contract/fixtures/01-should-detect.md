# Test Case: Unsafe Property Access on API Response (Should Detect)

## Description

Code accesses a nested property from an API response without null guards.

## Input Diff

```diff
diff --git a/src/api/orders.ts b/src/api/orders.ts
index abc1234..def5678 100644
--- a/src/api/orders.ts
+++ b/src/api/orders.ts
@@ -5,3 +5,8 @@ export async function getOrderSummary(orderId: string) {
   const response = await fetch(`/api/orders/${orderId}`);
   const data = await response.json();
+
+  // Display shipping address
+  const city = data.shipping.address.city;
+  const zip = data.shipping.address.zipCode;
+  return { city, zip };
 }
```

## Expected Behavior

The skill should:

1. Flag `data.shipping.address.city` as an unsafe chain — `shipping` or `address` may be null/undefined for digital-only orders
2. Severity: major
3. Suggest using optional chaining: `data.shipping?.address?.city`
