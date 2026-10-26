# Expected Output: Lexical Path Exemption Skips Masking

**Finding:** The new masking exemption decides by the lexical shape of the value, and non-canonical forms also hit it

**Evidence:** Lines 5-7: `if (/^\/(tmp|home)\//.test(v)) { return null; }` skips masking for any value that only starts with `/tmp/` or `/home/`

**Impact:** `/tmp/../token=sk_live_abc` and `/home//x;API_KEY=sk_live_abc` match the regex and are printed unmasked. The check does not reject `..` segments, empty segments, `%2F`, or a second assignment on the same line, and no test pins that these forms stay masked.

**Fix:** Canonicalize the value and match the whole string before exempting it, and add tests for the non-canonical forms:

```js
if (/^\/(tmp|home)(\/[\w.-]+)+$/.test(v) && !v.split('/').includes('..')) {
  return null;
}
```

**Severity:** major

**Confidence:** medium
