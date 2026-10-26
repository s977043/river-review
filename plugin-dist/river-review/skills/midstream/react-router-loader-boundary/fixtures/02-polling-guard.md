# Test Case: Non-navigation Polling (False Positive Guard)

## Description

Verifies the skill does NOT flag `useEffect` used for real-time polling that is not tied to route navigation.

## Input Diff

```diff
diff --git a/app/routes/live.tsx b/app/routes/live.tsx
index 1234567..89abcde 100644
--- a/app/routes/live.tsx
+++ b/app/routes/live.tsx
@@ -1,0 +1,12 @@
+import { useEffect } from 'react';
+import type { Route } from './+types/live';
+
+export async function loader() { return { initial: await getMetrics() }; }
+
+export default function Live({ loaderData }: Route.ComponentProps) {
+  useEffect(() => {
+    const id = setInterval(() => refetchMetrics(), 5000); // live polling
+    return () => clearInterval(id);
+  }, []);
+  return <Metrics data={loaderData.initial} />;
+}
```

## Expected Behavior

The skill should:

1. NOT flag the `useEffect` polling — it is real-time refresh, not navigation-tied initial data
2. Recognize the initial data is already loaded via `loader`
3. Produce no findings
