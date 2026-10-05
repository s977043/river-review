# Expected Output: False Positive Avoidance (Backslash Rejected)

No security findings.

**Rationale:** `preg_match('/\\\\|%5c/i', $back)` rejects values containing `\` or `%5C` before the `parse_url` host check, so `http://evil.example\@self.example/` falls back to `/mypage`. The remaining values are checked against `$_SERVER['HTTP_HOST']`, and the redirect stays on the same host.
