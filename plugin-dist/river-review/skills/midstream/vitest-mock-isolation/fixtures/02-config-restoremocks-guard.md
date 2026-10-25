# Test Case: restoreMocks Config Present (False Positive Guard)

## Description

Verifies the skill does NOT flag a `vi.spyOn` lacking an explicit `afterEach` restore when the vitest config sets `test.restoreMocks: true`. The config-level cleanup makes per-test restore unnecessary.

## Input Diff

```diff
diff --git a/vitest.config.ts b/vitest.config.ts
index 1234567..89abcde 100644
--- a/vitest.config.ts
+++ b/vitest.config.ts
@@ -1,5 +1,7 @@
 import { defineConfig } from 'vitest/config';

 export default defineConfig({
-  test: {},
+  test: {
+    restoreMocks: true,
+  },
 });
diff --git a/src/user.test.ts b/src/user.test.ts
index 1234567..89abcde 100644
--- a/src/user.test.ts
+++ b/src/user.test.ts
@@ -1,0 +1,10 @@
+import { describe, it, expect, vi } from 'vitest';
+import * as api from './api';
+import { loadUser } from './user';
+
+describe('user', () => {
+  it('reads from api', async () => {
+    vi.spyOn(api, 'fetchUser').mockResolvedValue({ id: 1 });
+    await expect(loadUser(1)).resolves.toEqual({ id: 1 });
+  });
+});
```

## Expected Behavior

The skill should:

1. NOT flag the missing `afterEach` restore — `restoreMocks: true` in config provides automatic per-test restore
2. Recognize the `await expect(...).resolves` is correctly awaited
3. Produce no findings
