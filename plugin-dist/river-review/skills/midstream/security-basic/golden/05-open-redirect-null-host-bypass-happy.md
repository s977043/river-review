# Expected Output: Open Redirect via Null Host

**Finding:** Open redirect: the same-host check lets values without a `parse_url` host through, and some of them resolve to another host

**Evidence:** Lines 16-21: `if ($host !== null && $host !== $_SERVER['HTTP_HOST'])` skips the check when `parse_url` returns no host, and `$back` is then sent in `header('Location: ' . $back);`

**Impact:** Rejecting `\` and `%5C` does not close the bypass. `?back=http:evil.example` has no host for PHP `parse_url`, but the browser resolves it against the current page to `http://evil.example/`. `?back=/%09/evil.example` becomes `/<TAB>/evil.example` in `$_GET`; `parse_url` returns no host, while the WHATWG URL parser removes the tab and reads `//evil.example`. An attacker can use the login flow to send users to an external site.

**Fix:** Accept only same-site relative paths: a single leading `/` (not `//` or `/\`), followed by printable ASCII without `\`:

```php
if (!is_string($back) || !preg_match('#\A/(?![/\\\\])[\x21-\x5b\x5d-\x7e]*\z#', $back)) {
    $back = '/mypage';
}
```

**Severity:** major

**Confidence:** high
