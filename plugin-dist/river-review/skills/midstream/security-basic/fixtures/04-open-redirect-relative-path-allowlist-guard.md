# Test Case: False Positive Avoidance (Same-Site Relative Path Allowlist)

## Description

This test verifies that the skill does not flag a return URL that is restricted to same-site relative paths.
The value must start with a single `/` that is not followed by `/` or `\`, and the rest must be printable ASCII without `\` (no control characters, no spaces).
Anything else, including a non-string `back` parameter, falls back to `/mypage`.

Values that bypass a `parse_url` host check are all rejected here: `http://evil.example\@self.example/`, `http:evil.example`, `/<TAB>/evil.example`, `//evil.example`, `/\evil.example`, and `javascript:alert(1)`.
Accepted values such as `/mypage`, `/orders?id=1`, and `/%5Cevil.example` resolve to `self.example` with the WHATWG URL parser.

## Input Diff

```diff
diff --git a/src/auth/login_redirect.php b/src/auth/login_redirect.php
index 1234567..89abcde 100644
--- a/src/auth/login_redirect.php
+++ b/src/auth/login_redirect.php
@@ -8,6 +8,14 @@ function finish_login(array $user): void
 {
     session_regenerate_id(true);
     $_SESSION['user_id'] = $user['id'];
-    header('Location: /mypage');
+
+    $back = $_GET['back'] ?? '/mypage';
+    // Same-site relative paths only: a single leading "/" (not "//" or "/\"),
+    // then printable ASCII without "\" (no control characters, no spaces).
+    if (!is_string($back) || !preg_match('#\A/(?![/\\\\])[\x21-\x5b\x5d-\x7e]*\z#', $back)) {
+        $back = '/mypage';
+    }
+
+    header('Location: ' . $back);
     exit;
 }
```

## Expected Behavior

The skill should:

1. Recognize that `$back` is limited to same-site relative paths before it reaches `header('Location: ' . $back);`
2. NOT report an open redirect
3. Return no findings, or explicitly cite the relative-path allowlist
