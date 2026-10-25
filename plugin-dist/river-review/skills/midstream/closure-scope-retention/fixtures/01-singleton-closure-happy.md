# Test Case: Singleton Closure Retaining Large Scope (Happy Path)

This test case should trigger a closure-scope-retention finding: a process-lifetime singleton
is built from closures that keep the entire enclosing scope (multi-MB raw text, parsed
documents, full entry array) reachable, even though only id -> severity pairs are ever read.

## Input Diff

```diff
diff --git a/src/lib/skill-cache.mjs b/src/lib/skill-cache.mjs
new file mode 100644
index 0000000..3333333
--- /dev/null
+++ b/src/lib/skill-cache.mjs
@@ -0,0 +1,34 @@
+import { readFile } from 'node:fs/promises';
+import { parseAllDocuments } from 'yaml';
+
+// Module-level singleton: lives for the entire process.
+let cachedLookup = null;
+
+/**
+ * Build a lookup of skill id -> severity from the full registry file.
+ * The registry can be several MB in large installations.
+ */
+export async function getSkillSeverityLookup(registryPath) {
+  if (cachedLookup) return cachedLookup;
+
+  const rawText = await readFile(registryPath, 'utf8');
+  const documents = parseAllDocuments(rawText);
+  const allEntries = documents.flatMap((doc) => doc.toJS()?.skills ?? []);
+
+  cachedLookup = {
+    // Retained for the process lifetime. Each accessor is a closure over
+    // this function scope, so rawText / documents / allEntries stay
+    // reachable even though only id->severity pairs are ever read.
+    severityOf(id) {
+      const entry = allEntries.find((e) => e.id === id);
+      return entry ? entry.severity : 'major';
+    },
+    hasSkill(id) {
+      return allEntries.some((e) => e.id === id);
+    },
+    debugDump() {
+      return { rawLength: rawText.length, docCount: documents.length };
+    },
+  };
+  return cachedLookup;
+}
```

## Expected Behavior

The skill should detect that `cachedLookup` is a module-level singleton whose accessor methods
close over `rawText`, `documents`, and `allEntries` — keeping the multi-MB raw registry text and
all parsed documents alive for the process lifetime, even though only `id` and `severity` are
ever consumed. It should propose reducing at construction time: build a compact
`Map<id, severity>` (plus a `Set` of ids) up front so the closures do not capture the large
scope, letting `rawText` / `documents` / `allEntries` become unreachable after the build.
