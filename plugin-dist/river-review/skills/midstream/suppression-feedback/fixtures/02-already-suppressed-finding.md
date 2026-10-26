# Test Case: Already-Suppressed Finding (Avoid Duplicate Guidance)

## Description

A finding is detected whose 16-hex fingerprint already has an active `type: 'suppression'` entry in Riverbed Memory. The skill should **not** re-issue the suppression workflow guidance — that would be noise. The False-positive guards section of the SKILL says: "do not surface suppression workflow when the same fingerprint is already suppressed."

## Input Diff

```diff
diff --git a/src/lib/legacy-adapter.ts b/src/lib/legacy-adapter.ts
index 1234567..89abcdef 100644
--- a/src/lib/legacy-adapter.ts
+++ b/src/lib/legacy-adapter.ts
@@ -42,5 +42,6 @@ export function callLegacyService(payload: Payload): Promise<Result> {
   if (!payload?.userId) {
     throw new Error('missing userId');
   }
+  metrics.increment('legacy.calls');
   return legacyClient.invoke(payload);
 }
```

## Companion finding (out of band)

`logging-observability` raised:

```text
**Finding:** counter increment is not awaited; failure cannot be observed
**Evidence:** src/lib/legacy-adapter.ts:45
**Fingerprint:** 9f3c1a8b2d4e7f01
**Severity:** minor
**Confidence:** medium
```

Riverbed Memory contains an active entry:

```text
type: suppression
fingerprint: 9f3c1a8b2d4e7f01
feedbackType: accepted_risk
rationale: 'metrics client is fire-and-forget by design (PR #612)'
scope: file
files: ['src/lib/legacy-adapter.ts']
```

## Expected Behavior

The skill should:

1. Detect the active suppression entry for fingerprint `9f3c1a8b2d4e7f01` and the matching companion finding.
2. **Not** repeat the suppression-vs-fix workflow guidance. Re-emitting it duplicates user-facing noise.
3. Either return no findings, or return at most one `info` finding noting the existing suppression's rationale (one-line acknowledgement only).
4. If a finding is emitted, severity must not exceed `info`, and the message must reference the existing rationale rather than asking the reviewer to re-decide.
