# Test Case: False Positive Avoidance (Backslash Rejected Before Same-Host Check)

## Description

This test verifies that the skill does not flag a same-host check that already rejects `\` and `%5C` before calling `parse_url`.
With the rejection in place, `?back=http://evil.example\@self.example/` falls back to `/mypage`, so the redirect stays on the same host.

## Input Diff

```diff
diff --git a/src/auth/login_redirect.php b/src/auth/login_redirect.php
index 1234567..89abcde 100644
--- a/src/auth/login_redirect.php
+++ b/src/auth/login_redirect.php
@@ -8,6 +8,16 @@ function finish_login(array $user): void
 {
     session_regenerate_id(true);
     $_SESSION['user_id'] = $user['id'];
-    header('Location: /mypage');
+
+    $back = $_GET['back'] ?? '/mypage';
+    if (preg_match('/\\\\|%5c/i', $back)) {
+        $back = '/mypage';
+    }
+    $host = parse_url($back, PHP_URL_HOST);
+    if ($host !== null && $host !== $_SERVER['HTTP_HOST']) {
+        $back = '/mypage';
+    }
+
+    header('Location: ' . $back);
     exit;
 }
```

## Expected Behavior

The skill should:

1. Recognize that values containing `\` or `%5C` are rejected before the `parse_url` host check
2. NOT report an open redirect on `header('Location: ' . $back);`
3. Return no findings, or explicitly cite the backslash-rejection guard
