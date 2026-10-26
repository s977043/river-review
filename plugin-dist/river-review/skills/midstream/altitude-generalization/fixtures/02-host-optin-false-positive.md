# Test Case: Public Opt-in Option (False Positive Canary)

This test case should NOT trigger any Altitude finding.

## Input Diff

```diff
diff --git a/src/lib/finding-formatter.mjs b/src/lib/finding-formatter.mjs
index 1111111..2222222 100644
--- a/src/lib/finding-formatter.mjs
+++ b/src/lib/finding-formatter.mjs
@@ -40,5 +40,10 @@ export function formatFinding(finding, options = {}) {
   // Shared formatter. `options.compact` is a documented public option any caller may set.
   let header = `${finding.file}:${finding.line}: ${finding.title}`;

+  // Public opt-in: any caller may pass options.compact to request a shorter
+  // header. This is a first-class formatting option, not a per-caller bypass.
+  if (options.compact) {
+    header = truncate(header, 80);
+  }
   return { header, body: renderBody(finding, options) };
 }
```

## Expected Behavior

The skill should stay silent (`NO_ISSUES`). The added branch keys on a documented,
first-class public option (`options.compact`) that any caller may set — not on a specific
caller's identity — and it is the only such branch. This is a legitimate API extension
(host opt-in), not a per-caller bandaid, so the False-positive guards suppress it.
