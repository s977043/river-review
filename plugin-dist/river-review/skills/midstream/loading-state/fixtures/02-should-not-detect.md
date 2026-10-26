# Test Case: Complete State Handling (Should NOT Detect)

## Description

A component properly handles all three states: loading, error, and success.

## Input Diff

```diff
diff --git a/src/components/ProductList.tsx b/src/components/ProductList.tsx
index abc1234..def5678 100644
--- a/src/components/ProductList.tsx
+++ b/src/components/ProductList.tsx
@@ -1,0 +1,16 @@ import { useQuery } from '@tanstack/react-query';
+
+export function ProductList() {
+  const { data, isLoading, isError, error } = useQuery({
+    queryKey: ['products'],
+    queryFn: fetchProducts,
+  });
+
+  if (isLoading) return <Spinner />;
+  if (isError) return <ErrorMessage message={error.message} />;
+
+  return (
+    <ul>
+      {data.map((p) => <li key={p.id}>{p.name}</li>)}
+    </ul>
+  );
+}
```

## Expected Behavior

The skill should NOT flag this — all three states (loading, error, success) are handled correctly.
