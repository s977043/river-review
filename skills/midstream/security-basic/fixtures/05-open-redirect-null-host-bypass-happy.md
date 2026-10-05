# Test Case: Open Redirect via Null Host Despite Backslash Rejection (Happy Path)

## Description

This test verifies that rejecting `\` and `%5C` alone is not treated as a safe same-host check.
The check skips values whose `parse_url` host is `null`, but some of those values still resolve to another host in browsers.

- `?back=http:evil.example`: PHP `parse_url` returns no host. The WHATWG URL parser resolves it against `https://self.example/` to `http://evil.example/`.
- `?back=/%09/evil.example`: `$_GET` decodes `%09` to a tab, and `parse_url('/\t/evil.example')` returns no host. The WHATWG URL parser removes tabs, reads `//evil.example`, and resolves it to `evil.example`.

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

1. Detect the open redirect on line 21 (`header('Location: ' . $back);`), citing lines 16-19 where a `null` host passes the check
2. Explain that `http:evil.example` or `/%09/evil.example` passes the check but resolves to `evil.example` in browsers
3. Suggest an allowlist of same-site relative paths (a single leading `/`, not `//` or `/\`, no `\`, no control characters), or a WHATWG-equivalent parse compared by origin
4. Set severity to "major"
