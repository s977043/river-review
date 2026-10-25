# Test Case: Test Contract Missing (Should Trigger Finding)

`test-cases.md` で宣言されたケースに対応するテストが `diff` に存在しないケース。SKILL.md Rule 3「テスト整合 (test-cases → diff / junit)」違反で `major` (warning) 指摘、finding-id `test-contract-missing` が期待される。

## Input Artifacts

### plan.md

```markdown
# 計画: 割引コード適用

## 方針

- チェックアウト時に割引コードを適用する。
- 有効期限切れコードは拒否する。

## 影響範囲

- `src/services/discount.ts` (新規)
- `src/services/discount.test.ts` (新規)
```

### todo.md

```markdown
# TODO

- [x] `src/services/discount.ts` 実装
- [x] 単体テスト追加
```

### test-cases.md

```markdown
# Test Cases

| ID  | シナリオ               | 期待結果         |
| --- | ---------------------- | ---------------- |
| TC1 | 有効なコード適用       | 価格が割引される |
| TC2 | 有効期限切れコード適用 | 拒否される       |
```

### diff

```diff
diff --git a/src/services/discount.ts b/src/services/discount.ts
new file mode 100644
index 0000000..4444444
--- /dev/null
+++ b/src/services/discount.ts
@@ -0,0 +1,6 @@
+export function applyDiscount(price, code, now = new Date()) {
+  if (code.expiresAt && now > new Date(code.expiresAt)) {
+    throw new Error('discount code expired');
+  }
+  return price * (1 - code.rate);
+}
diff --git a/src/services/discount.test.ts b/src/services/discount.test.ts
new file mode 100644
index 0000000..5555555
--- /dev/null
+++ b/src/services/discount.test.ts
@@ -0,0 +1,5 @@
+import { applyDiscount } from './discount';
+
+test('TC1: 有効なコードで価格が割引される', () => {
+  expect(applyDiscount(1000, { rate: 0.1 })).toBe(900);
+});
```

`test-cases.md` の TC2「有効期限切れコード適用 → 拒否される」に対応するテストが `discount.test.ts` に存在しない（TC1 のみ）。
