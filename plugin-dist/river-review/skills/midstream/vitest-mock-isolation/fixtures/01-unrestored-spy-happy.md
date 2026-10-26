# Test Case: Unrestored Spy and Un-awaited Rejects (Happy Path)

## Description

Verifies the skill flags a `vi.spyOn` used without any `afterEach` restore (and no `restoreMocks` config), plus an `expect(...).rejects` assertion that is not `await`ed inside an `async` test.

## Input Diff

```diff
diff --git a/src/user.test.ts b/src/user.test.ts
index 1234567..89abcde 100644
--- a/src/user.test.ts
+++ b/src/user.test.ts
@@ -1,0 +1,14 @@
+import { describe, it, expect, vi } from 'vitest';
+import * as api from './api';
+import { loadUser, saveUser } from './user';
+
+describe('user', () => {
+  it('reads from api', () => {
+    vi.spyOn(api, 'fetchUser').mockResolvedValue({ id: 1 });
+    expect(loadUser(1)).resolves.toEqual({ id: 1 });
+  });
+
+  it('rejects on invalid input', async () => {
+    expect(saveUser(null)).rejects.toThrow('invalid');
+  });
+});
```

## Expected Behavior

The skill should:

1. Flag the `vi.spyOn(api, 'fetchUser')` with no `afterEach(() => vi.restoreAllMocks())` and no `restoreMocks` config visible — the mock leaks into later tests
2. Flag `expect(loadUser(1)).resolves...` and `expect(saveUser(null)).rejects...` not being `await`ed/returned — the assertions can pass without actually evaluating
3. Reference the Vitest mock-restore / async-assertion conventions
