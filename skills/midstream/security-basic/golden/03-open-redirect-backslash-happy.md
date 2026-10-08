# Expected Output: Open Redirect via Backslash

**Finding:** Open redirect: the same-host check on the return URL does not reject `\`

**Evidence:** Lines 12-18: `$host = parse_url($back, PHP_URL_HOST);` is compared with `$_SERVER['HTTP_HOST']`, and `$back` is then sent as-is in `header('Location: ' . $back);`

**Impact:** With `?back=http://evil.example\@self.example/`, PHP `parse_url` returns the host `self.example`, so the check passes. The browser parses the `Location` value with the WHATWG URL parser, treats `\` as `/`, and navigates to `evil.example`. An attacker can use the login flow to send users to an external site.

**Fix:** Rejecting `\` alone is not enough, because values without a `parse_url` host (`http:evil.example`, `/<TAB>/evil.example`) also pass this check. Accept only same-site relative paths: a single leading `/` (not `//` or `/\`), followed by printable ASCII without `\`:

```php
if (!is_string($back) || !preg_match('#\A/(?![/\\\\])[\x21-\x5b\x5d-\x7e]*\z#', $back)) {
    $back = '/mypage';
}
```

**Severity:** major

**Confidence:** high
