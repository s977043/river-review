# Test Case: Missing Error State (Should Detect)

## Description

A component handles the loading state but forgets the error state, leaving users with no feedback on failure.

## Input Diff

```diff
diff --git a/src/components/UserList.tsx b/src/components/UserList.tsx
index abc1234..def5678 100644
--- a/src/components/UserList.tsx
+++ b/src/components/UserList.tsx
@@ -1,0 +1,12 @@ import { useQuery } from '@tanstack/react-query';
+
+export function UserList() {
+  const { data, isLoading } = useQuery({ queryKey: ['users'], queryFn: fetchUsers });
+
+  if (isLoading) return <Spinner />;
+
+  return (
+    <ul>
+      {data?.map((user) => <li key={user.id}>{user.name}</li>)}
+    </ul>
+  );
+}
```

## Expected Behavior

The skill should:

1. Detect that `isError` (or `error`) is destructured but not handled
2. Flag that users will see an empty list instead of an error message on API failure
3. Severity: major
4. Suggest adding `if (isError) return <ErrorMessage />`
