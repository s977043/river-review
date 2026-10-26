# Test Case: Type-Guarded Value (False Positive Guard)

## Description

This test verifies that the skill does NOT flag code where null is statically excluded by the type system with a proper type guard.

## Input Diff

```diff
diff --git a/src/utils/config.ts b/src/utils/config.ts
index 1234567..89abcdef 100644
--- a/src/utils/config.ts
+++ b/src/utils/config.ts
@@ -12,7 +12,14 @@ interface Config {
   apiUrl: string;
 }

+function assertConfig(cfg: Partial<Config>): asserts cfg is Config {
+  if (!cfg.apiUrl) {
+    throw new Error('apiUrl is required');
+  }
+}
+
 export function getConfig(): Config {
   const raw = loadRaw();
+  assertConfig(raw);
   return raw;
 }
```

## Expected Behavior

The skill should:

1. Recognize the `assertConfig` function uses TypeScript `asserts` narrowing
2. NOT flag `raw` access after `assertConfig(raw)` as unsafe
3. Either return no findings or explicitly acknowledge the type guard makes the access safe
4. NOT produce false positive warnings about null safety
