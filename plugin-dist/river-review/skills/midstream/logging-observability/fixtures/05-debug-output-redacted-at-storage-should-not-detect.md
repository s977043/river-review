# Test Case: Debug Output Redacted At Storage Site (Should NOT Detect — Canary)

Reduced reproduction of the #1529 fix commit `ca7eaa3b` ("rawLlmOutput を格納時に
redactSecrets でマスクする"). Pairs with
`04-debug-output-bypasses-redaction-should-detect.diff` as the corrected form.

This test case should NOT trigger any findings.

## Input Diff

```diff
diff --git a/src/lib/notification-dispatch.mjs b/src/lib/notification-dispatch.mjs
index 1111111..2222222 100644
--- a/src/lib/notification-dispatch.mjs
+++ b/src/lib/notification-dispatch.mjs
@@ -12,5 +12,9 @@ export async function dispatchNotification(payload) {
   const rawResponse = await callProvider(payload);
   const parsed = parseProviderResponse(rawResponse);
   const redacted = parsed.map((entry) => redactSecrets(entry));
+  // Debug aid for parse failures: keep the raw provider response so we can
+  // inspect it when parseProviderResponse() returns null. Redact at the
+  // storage site so every future consumer receives the masked value.
+  debug.rawProviderResponse = redactSecrets(rawResponse);
   return { entries: redacted, debug };
 }
```

## Expected Behavior

The skill should recognize this as correct: the new debug output path applies
`redactSecrets` at the storage site (the assignment to `debug.rawProviderResponse`),
the same masking already applied to `parsed` via `redacted`. No new
unmasked-secret exposure path is introduced, so this must not be flagged.
