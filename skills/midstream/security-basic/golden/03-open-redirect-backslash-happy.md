# Expected Output: Open Redirect via Backslash

**Finding:** Open redirect: the same-host check on the return URL does not reject `\`

**Evidence:** Lines 12-18: `$host = parse_url($back, PHP_URL_HOST);` is compared with `$_SERVER['HTTP_HOST']`, and `$back` is then sent as-is in `header('Location: ' . $back);`

**Impact:** With `?back=http://evil.example\@self.example/`, PHP `parse_url` returns the host `self.example`, so the check passes. The browser parses the `Location` value with the WHATWG URL parser, treats `\` as `/`, and navigates to `evil.example`. An attacker can use the login flow to send users to an external site.

**Fix:** Reject values that contain `\` before the host check. If the value is decoded again after the check, reject `%5C` as well:

```php
if (preg_match('/\\\\|%5c/i', $back)) {
    $back = '/mypage';
}
```

**Severity:** major

**Confidence:** high
