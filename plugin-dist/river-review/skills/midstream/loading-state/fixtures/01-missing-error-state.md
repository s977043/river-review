# Test Case: Missing Error State in Data-Fetching Component (Should Detect)

## Description

This test verifies that the skill correctly identifies a React component that handles loading state but omits error state handling for an async data fetch.

## Input Diff

```diff
diff --git a/src/components/UserList.tsx b/src/components/UserList.tsx
new file mode 100644
index 0000000..abcdef0
--- /dev/null
+++ b/src/components/UserList.tsx
@@ -0,0 +1,22 @@
+import React from 'react';
+import { useQuery } from '@tanstack/react-query';
+import { fetchUsers } from '../api/users';
+
+export function UserList() {
+  const { data: users, isLoading } = useQuery({
+    queryKey: ['users'],
+    queryFn: fetchUsers,
+  });
+
+  if (isLoading) {
+    return <div className="spinner">Loading...</div>;
+  }
+
+  return (
+    <ul>
+      {users?.map(user => (
+        <li key={user.id}>{user.name}</li>
+      ))}
+    </ul>
+  );
+}
```

## Expected Behavior

The skill should:

1. Detect that `useQuery` is used but only `isLoading` is destructured — `error` / `isError` are ignored
2. Flag the missing error state handling — if the query fails, the component silently renders an empty list
3. Note there is no empty state fallback when `users` is an empty array
4. Suggest adding `isError` handling (error UI or toast) and an empty state
5. Set severity to "major"
