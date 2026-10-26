# Test Case: Script Injection via Untrusted Input (Happy Path)

## Description

Verifies the skill flags untrusted `github.event.*` fields expanded directly into a `run:` step, which allows shell command injection.

## Input Diff

```diff
diff --git a/.github/workflows/pr-comment.yml b/.github/workflows/pr-comment.yml
index 1234567..89abcde 100644
--- a/.github/workflows/pr-comment.yml
+++ b/.github/workflows/pr-comment.yml
@@ -1,0 +1,7 @@
+on: issue_comment
+jobs:
+  greet:
+    runs-on: ubuntu-latest
+    steps:
+      - run: echo "Title is ${{ github.event.issue.title }}"
+      - run: ./build.sh "${{ github.head_ref }}"
```

## Expected Behavior

The skill should:

1. Flag `${{ github.event.issue.title }}` and `${{ github.head_ref }}` expanded into `run:` as script injection (attacker-controlled fields)
2. Recommend passing the values through `env:` instead of inlining into the shell
3. Treat this as critical severity (RCE in a token-bearing context)
