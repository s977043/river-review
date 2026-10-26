# Test Case: Undocumented New Dependency (Should Trigger Finding)

`plan.md` に記載のない新規依存 `redis` パッケージが `diff` に追加されているケース。SKILL.md Rule 1「方針整合 (plan → diff)」違反で `major` (warning) 指摘が期待される。

## Input Artifacts

### plan.md

```markdown
# 計画: 商品詳細キャッシュ

## 方針

- 商品詳細の取得レイテンシを改善するため、アプリケーション層にインメモリ LRU キャッシュを導入する。
- 依存追加は **lru-cache** のみとする。外部ストア（Redis 等）は本 PR のスコープ外。

## 影響範囲

- `src/services/product.ts`
- `src/services/cache.ts` (新規)

## 非スコープ

- 外部キャッシュストア (Redis / Memcached) の導入は別 PR で扱う
```

### todo.md

```markdown
# TODO

- [ ] `lru-cache` 依存追加
- [ ] `src/services/cache.ts` 実装
- [ ] `src/services/product.ts` キャッシュ呼び出し
- [ ] 単体テスト追加
```

### test-cases.md

```markdown
# Test Cases

| ID  | シナリオ               | 期待結果                 |
| --- | ---------------------- | ------------------------ |
| TC1 | 初回取得 → 2回目ヒット | 2 回目は DB 呼び出し無し |
| TC2 | TTL 経過後の取得       | DB 再取得                |
```

### diff

```diff
diff --git a/package.json b/package.json
index 1111111..2222222 100644
--- a/package.json
+++ b/package.json
@@ -20,6 +20,8 @@
   "dependencies": {
     "express": "^4.19.0",
     "lru-cache": "^10.2.0",
+    "redis": "^4.6.0",
+    "ioredis": "^5.4.0",
     "pg": "^8.11.0"
   },
 }
diff --git a/src/services/cache.ts b/src/services/cache.ts
new file mode 100644
index 0000000..3333333
--- /dev/null
+++ b/src/services/cache.ts
@@ -0,0 +1,16 @@
+import { LRUCache } from 'lru-cache';
+import Redis from 'ioredis';
+
+const redis = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
+
+export const cache = new LRUCache<string, unknown>({
+  max: 500,
+  ttl: 60_000,
+});
+
+export async function getCached(key: string) {
+  const fromLocal = cache.get(key);
+  if (fromLocal) return fromLocal;
+  const fromRedis = await redis.get(key);
+  return fromRedis ? JSON.parse(fromRedis) : null;
+}
```

## Expected Behavior

The skill should detect:

1. `redis` および `ioredis` の新規依存が `plan.md` 方針「依存追加は lru-cache のみ」と非スコープ「外部キャッシュストアは別 PR」に違反 → `warning` (major)
2. `todo` に Redis 関連タスクが無いにもかかわらず `src/services/cache.ts` が Redis を参照 → 作業項目の網羅違反
