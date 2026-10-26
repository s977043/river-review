# Test Case: Major Finding Without Suppression Entry

## Description

A `major` severity finding is detected by another midstream skill, and there is **no existing suppression entry** for the corresponding fingerprint in Riverbed Memory. The skill should explain the suppression vs. fix decision and surface the HIGH_SEVERITY guard so reviewers know that anything other than `accepted_risk` will not auto-suppress the finding on later PRs.

## Input Diff

```diff
diff --git a/src/api/users.ts b/src/api/users.ts
index 1234567..89abcdef 100644
--- a/src/api/users.ts
+++ b/src/api/users.ts
@@ -10,7 +10,11 @@ export async function getUserById(req: Request, res: Response) {
   const { id } = req.params;

   try {
-    const user = await db.query('SELECT * FROM users WHERE id = ?', [id]);
+    const user = await db.query('SELECT * FROM users WHERE id = ?', [id]);
+    if (!user) {
+      return res.status(404).json({ error: 'not found' });
+    }
     res.json(user);
   } catch (error) {
+    // upstream logger already records this; deliberately swallow
     res.status(500).json({ error: 'Internal server error' });
```

## Companion finding (out of band)

`logging-observability` has emitted (in the same PR):

```text
**Finding:** try / catch swallows the upstream error without re-throwing or logging
**Evidence:** src/api/users.ts:18
**Severity:** major
**Confidence:** medium
```

There is **no `type: 'suppression'` entry** in Riverbed Memory for this fingerprint.

## Expected Behavior

The skill should:

1. Recognize that a `major` finding has been raised in the same PR with no existing suppression.
2. Surface the HIGH_SEVERITY guard rule: `major`/`critical` findings can only be auto-suppressed via `feedbackType=accepted_risk`.
3. Frame the choice as `(a) implement the fix` vs. `(b) add a suppression with explicit rationale`, **not** "always suppress".
4. Quote the `river suppression add` CLI form with `--feedback accepted_risk` and require a non-empty `--rationale`.
5. Severity of the skill's own finding stays `minor` (this is a workflow nudge, not a security claim).
