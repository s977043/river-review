# Test Case: Debug Output Bypasses Existing Redaction Invariant (Should Detect)

Reduced reproduction of the pattern found in PR #1529 (see `AGENT_LEARNINGS.md`
2026-07-12 エントリ3 and the `Origin / 由来` section in `SKILL.md`).

This test case should trigger a finding: a newly added debug output path
stores the raw, pre-redaction upstream response, even though the parsed /
display path already applies `redactSecrets` to the same data.

## Input Diff

```diff
diff --git a/src/lib/notification-dispatch.mjs b/src/lib/notification-dispatch.mjs
index 1111111..2222222 100644
--- a/src/lib/notification-dispatch.mjs
+++ b/src/lib/notification-dispatch.mjs
@@ -12,5 +12,8 @@ export async function dispatchNotification(payload) {
   const rawResponse = await callProvider(payload);
   const parsed = parseProviderResponse(rawResponse);
   const redacted = parsed.map((entry) => redactSecrets(entry));
+  // Debug aid for parse failures: keep the raw provider response so we can
+  // inspect it when parseProviderResponse() returns null.
+  debug.rawProviderResponse = rawResponse;
   return { entries: redacted, debug };
 }
```

## Expected Behavior

The skill should detect that `debug.rawProviderResponse` stores `rawResponse`
directly — bypassing the `redactSecrets` masking that the same diff already
applies to `parsed` via `redacted`. If `rawResponse` contains a secret, it
flows unmasked into `debug`, and from there into any future consumer (CI
logs, artifact export, etc.). The fix should be to redact at the storage
site: `debug.rawProviderResponse = redactSecrets(rawResponse);`.
