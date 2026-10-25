# Test Case: Route Data Fetched in useEffect (Happy Path)

## Description

Verifies the skill flags route-tied initial data fetched in `useEffect` instead of a `loader`.

## Input Diff

```diff
diff --git a/app/routes/dashboard.tsx b/app/routes/dashboard.tsx
index 1234567..89abcde 100644
--- a/app/routes/dashboard.tsx
+++ b/app/routes/dashboard.tsx
@@ -1,0 +1,12 @@
+import { useEffect, useState } from 'react';
+
+export default function Dashboard() {
+  const [stats, setStats] = useState(null);
+  useEffect(() => {
+    fetch('/api/stats')
+      .then((r) => r.json())
+      .then(setStats);
+  }, []);
+  if (!stats) return <Spinner />;
+  return <StatsView stats={stats} />;
+}
```

## Expected Behavior

The skill should:

1. Flag the `useEffect` + `fetch` of route-tied initial data
2. Recommend moving it to a `loader` (SSR, no double-fetch / hydration mismatch)
3. Tie the finding to the file/line with the data-loading convention reference
