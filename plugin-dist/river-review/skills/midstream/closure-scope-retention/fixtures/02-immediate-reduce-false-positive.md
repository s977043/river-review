# Test Case: Immediate Reduce and Release (False Positive Canary)

This test case should NOT trigger any closure-scope-retention finding.

## Input Diff

```diff
diff --git a/src/lib/severity-index.mjs b/src/lib/severity-index.mjs
new file mode 100644
index 0000000..3333333
--- /dev/null
+++ b/src/lib/severity-index.mjs
@@ -0,0 +1,16 @@
+import { readFile } from 'node:fs/promises';
+import { parseAllDocuments } from 'yaml';
+
+// Builds a compact id -> severity Map. The multi-MB rawText and the parsed
+// document array are only local variables: once this function returns they
+// are unreachable and eligible for GC. Only the small Map survives.
+export async function buildSeverityIndex(registryPath) {
+  const rawText = await readFile(registryPath, 'utf8');
+  const entries = parseAllDocuments(rawText).flatMap((doc) => doc.toJS()?.skills ?? []);
+
+  const index = new Map();
+  for (const entry of entries) {
+    index.set(entry.id, entry.severity ?? 'major');
+  }
+  return index;
+}
```

## Expected Behavior

The skill should stay silent (`NO_ISSUES`). The large data (`rawText`, parsed documents,
`entries`) is reduced immediately into a compact `Map` inside the function, no closure or
returned object captures the enclosing scope, and the large locals become unreachable (GC
eligible) as soon as the function returns. This is exactly the recommended pattern, so the
False-positive guards ("即時縮約して解放されるケース") suppress any finding.
