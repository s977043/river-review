# Test Case: Safe Fields and env-Passing (False Positive Guard)

## Description

Verifies the skill does NOT flag constrained/safe fields and the correct `env:`-passing pattern.

## Input Diff

```diff
diff --git a/.github/workflows/ci.yml b/.github/workflows/ci.yml
index 1234567..89abcde 100644
--- a/.github/workflows/ci.yml
+++ b/.github/workflows/ci.yml
@@ -1,0 +1,11 @@
+on: pull_request
+permissions:
+  contents: read
+jobs:
+  build:
+    runs-on: ubuntu-latest
+    steps:
+      - run: echo "PR number ${{ github.event.pull_request.number }} by ${{ github.actor }}"
+      - env:
+          TITLE: ${{ github.event.pull_request.title }}
+        run: echo "$TITLE"
```

## Expected Behavior

The skill should:

1. NOT flag `github.event.pull_request.number` / `github.actor` (constrained, non-injectable fields)
2. NOT flag the `env:`-passed `TITLE` usage (the correct mitigation)
3. Produce no findings
