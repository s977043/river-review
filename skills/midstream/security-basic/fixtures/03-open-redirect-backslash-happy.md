# Test Case: Open Redirect via Backslash in Same-Host Check (Happy Path)

## Description

This test verifies that the skill flags a same-host check that relies on PHP `parse_url` while not rejecting `\`.
PHP `parse_url('http://evil.example\\@self.example/', PHP_URL_HOST)` returns `self.example`, so the check passes.
Browsers parse the `Location` value with the WHATWG URL parser, which treats `\` as `/`, and navigate to `evil.example`.

## Input Diff

```diff
diff --git a/src/auth/login_redirect.php b/src/auth/login_redirect.php
index 1234567..89abcde 100644
--- a/src/auth/login_redirect.php
+++ b/src/auth/login_redirect.php
@@ -8,6 +8,13 @@ function finish_login(array $user): void
 {
     session_regenerate_id(true);
     $_SESSION['user_id'] = $user['id'];
-    header('Location: /mypage');
+
+    $back = $_GET['back'] ?? '/mypage';
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

1. Detect the open redirect on line 18 (`header('Location: ' . $back);`), with the host check on lines 12-16 as evidence
2. Explain that `?back=http://evil.example\@self.example/` passes the `parse_url` host check but browsers navigate to `evil.example`
3. Suggest an allowlist of same-site relative paths (a single leading `/`, not `//` or `/\`, no `\`, no control characters), or a WHATWG-equivalent parse compared by origin. Rejecting `\` alone is not a sufficient fix
4. Set severity to "major"
