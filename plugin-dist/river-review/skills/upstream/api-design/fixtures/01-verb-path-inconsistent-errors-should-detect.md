# Fixture 01 — Verb-based path and inconsistent error shape (Happy Path)

## Description

A new route file adds two endpoints under `src/routes/`. Both violate the skill's
Rule section: the paths are verb-based (`/fetchUser`, `/doLoginNow`) instead of
resource-oriented, and the two handlers return error bodies with different
shapes (`{ error }` vs `{ message, detail }`), so a client cannot branch on a
single contract. The Pre-execution Gate is satisfied because the diff touches
`**/routes/**` and adds endpoints.

## Input Diff

```diff
diff --git a/src/routes/user.ts b/src/routes/user.ts
new file mode 100644
--- /dev/null
+++ b/src/routes/user.ts
@@ -0,0 +1,19 @@
+import { Router } from 'express';
+
+export const router = Router();
+
+router.get('/fetchUser', async (req, res) => {
+  const user = await findUser(req.query.id);
+  if (!user) {
+    return res.status(404).json({ error: 'not found' });
+  }
+  return res.json(user);
+});
+
+router.post('/doLoginNow', async (req, res) => {
+  const session = await login(req.body);
+  if (!session) {
+    return res.status(400).json({ message: 'login failed', detail: 'bad credentials' });
+  }
+  return res.json(session);
+});
```

## Expected Behavior

- A finding on `src/routes/user.ts:5` (and/or `:13`) for verb-based paths, with
  the resource-oriented rename as the action (`/users/{id}`, `/sessions`).
- A finding on the error-body divergence between the two handlers, citing both
  lines, with "align on a shared error schema (code/message/detail)" as the action.
- No findings about Express version, TypeScript style, or logging — those are
  outside this skill's Rule and Non-goals.

<!-- expected:
findings:
  - severity: major
    reason: 動詞ベースのパス（/fetchUser, /doLoginNow）がリソース指向の RESTful 命名に反する
    anchor: src/routes/user.ts:5
  - severity: major
    reason: エラーボディの構造が同一ファイル内で不揃い（{error} と {message,detail}）
    anchor: src/routes/user.ts:15
-->
