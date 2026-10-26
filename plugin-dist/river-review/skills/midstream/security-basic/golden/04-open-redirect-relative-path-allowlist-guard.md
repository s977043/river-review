# Expected Output: False Positive Avoidance (Relative Path Allowlist)

No security findings.

**Rationale:** `preg_match('#\A/(?![/\\\\])[\x21-\x5b\x5d-\x7e]*\z#', $back)` accepts only a single leading `/` that is not followed by `/` or `\`, then printable ASCII without `\`. Absolute URLs (`http:evil.example`, `javascript:alert(1)`), scheme-relative forms (`//evil.example`, `/\evil.example`), and values with control characters (`/<TAB>/evil.example`) fall back to `/mypage`. Every accepted value resolves to the same origin, so the redirect stays on the same host.
