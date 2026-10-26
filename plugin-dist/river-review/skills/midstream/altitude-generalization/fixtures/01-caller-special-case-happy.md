# Test Case: Caller Special-Case on Shared Formatter (Happy Path)

This test case should trigger an Altitude finding: a third per-caller special-case is
bolted onto a shared formatter, so the lower-level mechanism should be generalized.

## Input Diff

```diff
diff --git a/src/lib/finding-formatter.mjs b/src/lib/finding-formatter.mjs
index 1111111..2222222 100644
--- a/src/lib/finding-formatter.mjs
+++ b/src/lib/finding-formatter.mjs
@@ -40,11 +40,19 @@ export function formatFinding(finding, options = {}) {
   // Shared formatter used by cli, markdown-exporter, github-annotator, and sarif-writer.
   let header = `${finding.file}:${finding.line}: ${finding.title}`;

   if (options.caller === 'sarif-writer') {
     header = header.replace(/ /g, '');
   }
   if (options.caller === 'github-annotator') {
     header = truncate(header, 240);
   }
+  // markdown-exporter needs the severity emoji inline because its template
+  // renders header as a single line without the badge column.
+  if (options.caller === 'markdown-exporter') {
+    header = `${severityEmoji(finding.severity)} ${header}`;
+    if (finding.confidence === 'low') {
+      header += ' (low confidence)';
+    }
+  }
   return { header, body: renderBody(finding, options) };
 }
```

## Expected Behavior

The skill should detect that `formatFinding` now carries three per-caller special-cases
(`sarif-writer`, `github-annotator`, and the newly added `markdown-exporter`), each keyed
on `options.caller === '<name>'`. With two or more same-kind special-cases present, it
should propose generalizing the mechanism — e.g. moving each caller's header treatment into
a declarative caller-config map instead of growing the shared function per caller.
