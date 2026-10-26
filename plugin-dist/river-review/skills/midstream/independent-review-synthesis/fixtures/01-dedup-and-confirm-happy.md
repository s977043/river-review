# Fixture 01 — Dedup + Confirm (Happy Path)

## Description

Two reviewers raise the same finding on `src/api/users.ts:13` (SQL injection).
The synthesis layer should dedup them, keep both reviewer names in
`Reviewers:`, validate evidence against the diff, and confirm the finding.

## Diff

```diff
diff --git a/src/api/users.ts b/src/api/users.ts
@@ -10,4 +10,4 @@ export async function getUserById(req: Request, res: Response) {
   const { id } = req.params;
   try {
-    const user = await db.query('SELECT * FROM users WHERE id = ?', [id]);
+    const user = await db.query(`SELECT * FROM users WHERE id = ${id}`);
     res.json(user);
```

## review-self

> Replaced parameterized query with template literal interpolation — known to expose SQL injection. Need to revert before merge.

## review-external

> Line 13 of src/api/users.ts: the new `db.query` call interpolates `id` directly into SQL. This is an injection vector; revert to placeholder.

## findings-pool

```json
[]
```

## Expected Behavior

- One confirmed finding under **Critical Issues** (or Major Issues per severity ceiling rule if evidence is partial; the diff snippet IS present so critical is allowed).
- `Reviewers: review-self, review-external`.
- `Severity: critical` is OK because evidence (the diff line) is grep-verifiable.
- `ValidatedStatus: confirmed`.
- `Merge Recommendation: block` (or `human-review`).
- **No** "majority vote" language in the summary.
