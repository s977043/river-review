# Test Case: SQL Injection Detection (Happy Path)

## Description

This test verifies that the skill correctly identifies SQL injection vulnerabilities in code diffs.

## Input Diff

```diff
diff --git a/src/api/users.ts b/src/api/users.ts
index 1234567..89abcdef 100644
--- a/src/api/users.ts
+++ b/src/api/users.ts
@@ -10,7 +10,7 @@ export async function getUserById(req: Request, res: Response) {
   const { id } = req.params;

   try {
-    const user = await db.query('SELECT * FROM users WHERE id = ?', [id]);
+    const user = await db.query(`SELECT * FROM users WHERE id = ${id}`);
     res.json(user);
   } catch (error) {
     res.status(500).json({ error: 'Internal server error' });
```

## Expected Behavior

The skill should:

1. Detect the SQL injection vulnerability on line 13
2. Provide evidence (the vulnerable code)
3. Explain the impact
4. Suggest a fix (use parameterized queries)
5. Set severity to "major" and confidence to "high"
