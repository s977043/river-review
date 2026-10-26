# Test Case: Map.get() Result Used Without Null Check (Should Detect)

## Description

This test verifies that the skill correctly identifies unsafe use of `Map.get()` result without null/undefined checking, which can cause a runtime TypeError.

## Input Diff

```diff
diff --git a/src/services/cache-service.ts b/src/services/cache-service.ts
index 1234567..abcdef0 100644
--- a/src/services/cache-service.ts
+++ b/src/services/cache-service.ts
@@ -8,6 +8,15 @@ export class CacheService {
   private store = new Map<string, CachedItem>();

-  get(key: string): CachedItem | undefined {
-    return this.store.get(key);
+  get(key: string): CachedItem {
+    return this.store.get(key) as CachedItem;
   }
+
+  getExpiry(key: string): number {
+    return this.store.get(key).expiresAt;
+  }
+
+  getMetadata(key: string): Record<string, unknown> {
+    const item = this.store.get(key);
+    return item!.metadata;
+  }
 }
```

## Expected Behavior

The skill should:

1. Detect that `this.store.get(key)` returns `CachedItem | undefined` but:
   - `get()` hides the `undefined` case via `as CachedItem` type assertion
   - `getExpiry()` directly accesses `.expiresAt` without a null check
   - `getMetadata()` uses non-null assertion `!` on the result
2. Flag each of the three unsafe patterns
3. Suggest using early return with null check or throwing a descriptive error when the key is missing
4. Set severity to "major"
