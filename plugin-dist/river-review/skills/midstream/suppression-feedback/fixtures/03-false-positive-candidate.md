# Test Case: False Positive Candidate (Minor Severity)

## Description

A `minor` severity finding looks plausibly like a misdetection: the diff is in a `tests/` file with deliberately mock-shaped data. The skill should suggest `feedbackType=false_positive` (rather than `accepted_risk`) for low-severity, test-context findings, and remind the reviewer that the HIGH_SEVERITY guard does **not** apply at `minor` severity, so manual handling is fine.

## Input Diff

```diff
diff --git a/tests/auth.test.ts b/tests/auth.test.ts
index 1234567..89abcdef 100644
--- a/tests/auth.test.ts
+++ b/tests/auth.test.ts
@@ -5,10 +5,12 @@ describe('Authentication', () => {
   it('should authenticate user with valid credentials', async () => {
     const testUser = {
       email: 'test@example.com',
-      password: 'test-password-123',
+      password: 'test-password-123-rotated',
       apiKey: 'test-api-key-mock-value',
+      sessionId: 'test-session-id-stub',
     };

     const response = await request(app)
       .post('/auth/login')
+      .set('Authorization', 'Bearer test-token-do-not-use-in-prod')
       .send(testUser);
```

## Companion finding (out of band)

`security-basic` raised:

```text
**Finding:** hardcoded credential in source
**Evidence:** tests/auth.test.ts:11 password='test-password-123-rotated'
**Fingerprint:** 4a2b9d1e6c8f0357
**Severity:** minor
**Confidence:** low
```

There is **no** existing suppression for this fingerprint.

## Expected Behavior

The skill should:

1. Recognize the diff is in a `tests/` file with `test-`-prefixed mock values, which is the canonical false-positive shape for credential checks.
2. Recommend `feedbackType=false_positive` (not `accepted_risk`) — the value is not a real risk; it is a misdetection.
3. Note that the HIGH_SEVERITY guard does **not** kick in at `minor` severity, so a `false_positive` suppression here is fine and will not bypass safety checks.
4. Provide the `river suppression add --feedback false_positive --rationale "test fixture, no production secret"` form as a concrete next step.
5. Severity of the skill's own finding stays `minor`; do not promote to `major`.
