# Fixture 02 — Generated API definition refresh only (False-Positive Guard)

## Description

The diff touches `**/api/**`, so the path condition of the Pre-execution Gate
matches, but the only change is a regenerated artifact: the `generatedAt`
timestamp and the generator version. No endpoint is added, changed, or removed,
and the design intent is unchanged. This is exactly the skill's False-positive
guard "自動生成された API 定義の更新のみで、設計意図に変化がない".

## Input Diff

```diff
diff --git a/src/api/generated/client.ts b/src/api/generated/client.ts
--- a/src/api/generated/client.ts
+++ b/src/api/generated/client.ts
@@ -1,7 +1,7 @@
 /**
  * AUTO-GENERATED — do not edit by hand.
- * generator: openapi-typescript 6.7.0
- * generatedAt: 2026-07-01T00:00:00Z
+ * generator: openapi-typescript 6.7.1
+ * generatedAt: 2026-08-01T00:00:00Z
  */
 export interface paths {
   '/users/{id}': { get: operations['getUserById'] };
```

## Expected Behavior

- `findings: []`.
- The existing paths (`/users/{id}`) are resource-oriented, and the operation id
  `getUserById` is an OpenAPI operation id, not a URL path — it must not be
  reported as a verb-based path.
- Because no endpoint was added, changed, or removed, the second Pre-execution
  Gate condition fails and the skill emits
  `NO_REVIEW: api-design — API定義/ルーティングの変更なし` rather than a finding.

<!-- expected:
findings: []
reason: 生成物のタイムスタンプ／ジェネレータ版のみの更新であり、エンドポイントの追加・変更・削除がないため Pre-execution Gate が不成立
-->
