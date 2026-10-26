# Fixture 02 — Intentional fire-and-forget with explicit void (False-Positive Guard)

## Description

A telemetry helper intentionally fires an analytics event without awaiting it:
the call is marked with the `void` operator, the promise carries its own
`.catch` handler, and the surrounding comment states the intent. Blocking the
request path on analytics would be wrong, so this fire-and-forget is by design.
The skill must NOT flag this as an await omission or floating promise.

## Input Diff

```diff
diff --git a/src/api/checkout.ts b/src/api/checkout.ts
--- a/src/api/checkout.ts
+++ b/src/api/checkout.ts
@@ -10,3 +10,9 @@ export async function checkout(cart: Cart): Promise<Receipt> {
   const receipt = await submitOrder(cart);
+
+  // Analytics must not block or fail the checkout path (fire-and-forget).
+  void trackEvent('checkout_completed', { total: receipt.total }).catch(
+    (err) => logger.warn('analytics failed', err),
+  );
+
   return receipt;
 }
```

## Expected Behavior

- `findings: []` — no async-correctness findings.
- The `void` operator plus attached `.catch` plus the intent comment satisfy
  the intentional fire-and-forget guard: completion is deliberately not
  awaited, and rejection is handled.
- The awaited `submitOrder` call must not be flagged either.
