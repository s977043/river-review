# Test Case: Explicit Out-of-Scope Item (Should NOT Trigger Finding)

`plan.md` に「本 PR のスコープ外」と明記された項目の未実装。SKILL.md False-positive guards により指摘されないべき。

## Input Artifacts

### plan.md

```markdown
# 計画: ユーザー検索 API v1

## 方針

- `/users/search` エンドポイントを追加し、名前の前方一致検索を提供する。

## 影響範囲

- `src/routes/users.ts`
- `src/services/user-search.ts` (新規)
- `tests/users-search.spec.ts` (新規)

## スコープ

- ✅ 名前の前方一致検索
- ✅ ページング（limit/offset）
- ❌ **本 PR のスコープ外**: 全文検索対応 (別 PR `#999` で対応)
- ❌ **本 PR のスコープ外**: 管理者向け高度フィルタ (Phase 2)
```

### todo.md

```markdown
# TODO

- [x] ルート定義
- [x] サービス実装
- [x] 単体テスト
- [ ] ~~全文検索対応~~ → 別 PR `#999` で対応
- [ ] ~~管理者向け高度フィルタ~~ → Phase 2
```

### test-cases.md

```markdown
# Test Cases

| ID  | シナリオ                            | 期待結果             |
| --- | ----------------------------------- | -------------------- |
| TC1 | `/users/search?q=ta` → 前方一致結果 | 200 + JSON list      |
| TC2 | `limit=10&offset=20` の動作         | ページング反映       |
| TC3 | 全文検索 — **本 PR のスコープ外**   | 記録のみ（実装不要） |
```

### diff

```diff
diff --git a/src/routes/users.ts b/src/routes/users.ts
index aaaaaaa..bbbbbbb 100644
--- a/src/routes/users.ts
+++ b/src/routes/users.ts
@@ -10,4 +10,12 @@ router.get('/users/:id', async (req, res) => {
   res.json(user);
 });

+router.get('/users/search', async (req, res) => {
+  const q = String(req.query.q ?? '');
+  const limit = Number(req.query.limit ?? 20);
+  const offset = Number(req.query.offset ?? 0);
+  const results = await searchUsersByPrefix(q, { limit, offset });
+  res.json(results);
+});
+
 export default router;
diff --git a/src/services/user-search.ts b/src/services/user-search.ts
new file mode 100644
index 0000000..ccccccc
--- /dev/null
+++ b/src/services/user-search.ts
@@ -0,0 +1,8 @@
+import { db } from '../db.js';
+
+export async function searchUsersByPrefix(q: string, opts: { limit: number; offset: number }) {
+  return db.query(
+    'SELECT id, name FROM users WHERE name LIKE $1 ORDER BY name LIMIT $2 OFFSET $3',
+    [q + '%', opts.limit, opts.offset]
+  );
+}
diff --git a/tests/users-search.spec.ts b/tests/users-search.spec.ts
new file mode 100644
index 0000000..ddddddd
--- /dev/null
+++ b/tests/users-search.spec.ts
@@ -0,0 +1,15 @@
+import { describe, it, expect } from 'vitest';
+import request from 'supertest';
+import { app } from '../src/app.js';
+
+describe('/users/search', () => {
+  it('returns prefix matches', async () => {
+    const res = await request(app).get('/users/search?q=ta');
+    expect(res.status).toBe(200);
+  });
+
+  it('honors limit/offset', async () => {
+    const res = await request(app).get('/users/search?limit=10&offset=20');
+    expect(res.status).toBe(200);
+  });
+});
```

## Expected Behavior

The skill should NOT flag:

- 全文検索未実装 — `plan.md` の「❌ 本 PR のスコープ外: 全文検索対応」と `todo.md` の「→ 別 PR `#999`」が明示されているため、False-positive guards「本 PR のスコープ外」に該当
- 管理者向け高度フィルタ未実装 — 同上「Phase 2」明示
- TC3 テスト実装の欠如 — `test-cases.md` で「記録のみ（実装不要）」と明示されているため抑制

実装範囲（TC1, TC2）は plan / todo / test-cases と一致しており、`NO_ISSUES` または質問のみの出力を期待。
