# Fixture 02 — `@supports` guard already present (False-Positive Guard)

## Description

A CSS Container Query is introduced, but the diff already wraps it in
`@supports (container-type: inline-size)`. The skill should NOT flag this:
the feature-detection guard applies.

## Input Diff

```diff
diff --git a/src/styles/card.css b/src/styles/card.css
@@ -5,3 +5,11 @@ .card {
   padding: 1rem;
 }

+@supports (container-type: inline-size) {
+  .card-container {
+    container-type: inline-size;
+  }
+  @container (min-width: 400px) {
+    .card { padding: 2rem; }
+  }
+}
```

## Expected Behavior

- No finding. Output references the `@supports` false-positive guard.
