# Test Case: Suspense + ErrorBoundary Delegation (False Positive Guard)

## Description

This test verifies that the skill does NOT flag a component that intentionally delegates loading and error state handling to parent Suspense and ErrorBoundary components.

## Input Diff

```diff
diff --git a/src/components/ProductDetail.tsx b/src/components/ProductDetail.tsx
new file mode 100644
index 0000000..abcdef0
--- /dev/null
+++ b/src/components/ProductDetail.tsx
@@ -0,0 +1,16 @@
+import React, { Suspense } from 'react';
+import { ErrorBoundary } from 'react-error-boundary';
+import { ProductDetailContent } from './ProductDetailContent';
+import { LoadingSpinner } from '../ui/LoadingSpinner';
+import { ErrorFallback } from '../ui/ErrorFallback';
+
+// Loading and error states are handled by Suspense + ErrorBoundary
+export function ProductDetail({ productId }: { productId: string }) {
+  return (
+    <ErrorBoundary FallbackComponent={ErrorFallback}>
+      <Suspense fallback={<LoadingSpinner />}>
+        <ProductDetailContent productId={productId} />
+      </Suspense>
+    </ErrorBoundary>
+  );
+}
diff --git a/src/components/ProductDetailContent.tsx b/src/components/ProductDetailContent.tsx
new file mode 100644
index 0000000..1234567
--- /dev/null
+++ b/src/components/ProductDetailContent.tsx
@@ -0,0 +1,17 @@
+import { useSuspenseQuery } from '@tanstack/react-query';
+import { fetchProduct } from '../api/products';
+
+// This component suspends — loading/error handled by parent boundary
+export function ProductDetailContent({ productId }: { productId: string }) {
+  const { data: product } = useSuspenseQuery({
+    queryKey: ['product', productId],
+    queryFn: () => fetchProduct(productId),
+  });
+
+  return (
+    <div>
+      <h1>{product.name}</h1>
+      <p>{product.description}</p>
+    </div>
+  );
+}
```

## Expected Behavior

The skill should:

1. Recognize that `useSuspenseQuery` is used — loading state is handled via React Suspense protocol
2. Recognize that `ProductDetail` wraps with `<ErrorBoundary>` and `<Suspense>` providing both loading and error handling
3. NOT flag the absence of explicit `isLoading`/`isError` checks in `ProductDetailContent`
4. Either return no findings or explicitly acknowledge that the Suspense + ErrorBoundary pattern satisfies state handling requirements
5. NOT produce false positive warnings about missing loading/error states
