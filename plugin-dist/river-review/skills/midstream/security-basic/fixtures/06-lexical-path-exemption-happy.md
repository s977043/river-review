# Test Case: Lexical Path Exemption Skips Masking (Happy Path)

## Description

This test verifies that an exemption deciding by the lexical shape of a value is checked for non-canonical forms.
The new branch skips masking when a config value starts with `/tmp/` or `/home/`, on the assumption that such a value is a path and not a secret.
The regex has no anchor at the end and does not reject `..`, so values that only start like a path also skip masking.

- `/tmp/../token=sk_live_abc`: matches `^/tmp/` and is printed unmasked.
- `/home//x;API_KEY=sk_live_abc`: an empty segment and a second assignment on the same line still match.

No test pins that these forms stay masked.

## Input Diff

```diff
diff --git a/src/config/mask.js b/src/config/mask.js
index 1234567..89abcde 100644
--- a/src/config/mask.js
+++ b/src/config/mask.js
@@ -3,5 +3,8 @@ const SECRET_KEYS = /(token|secret|password|api_key)/i;
 export function maskValue(key, v) {
   if (typeof v !== 'string') return null;
+  if (/^\/(tmp|home)\//.test(v)) {
+    return null; // looks like a path: skip masking
+  }
   if (SECRET_KEYS.test(key) || v.length >= 20) {
     return v.slice(0, 4) + '****';
   }
```

## Expected Behavior

The skill should:

1. Detect the exemption on lines 5-7 (`if (/^\/(tmp|home)\//.test(v))`)
2. Explain that non-canonical forms (`..` segments, `//`, `%2F`, a second assignment on the same line) also match and skip masking
3. Suggest anchoring and canonicalizing the value before the exemption, and tests pinning that those forms stay masked
4. Set severity to "major"
