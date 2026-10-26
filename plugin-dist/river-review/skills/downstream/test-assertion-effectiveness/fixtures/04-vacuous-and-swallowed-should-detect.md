# Test Case: アサーション不在・恒真・失敗の握り潰し（Check 1 / 2 / 6 / should-detect）

## Description

課金計算モジュールに 3 つのテストを追加した PR。1 件目はアサーションが無く SUT を呼ぶだけ、2 件目は mock に設定した戻り値を SUT を通さず assert している恒真ケース、3 件目は `catch` 節にログ出力があるだけで再 throw も明示的な失敗もせず、例外が起きても PASS する。3 件とも実装が壊れても落ちない。

## Input Diff

```diff
diff --git a/src/billing/charge.mjs b/src/billing/charge.mjs
index 1111111..2222222 100644
--- a/src/billing/charge.mjs
+++ b/src/billing/charge.mjs
@@ -8,2 +8,5 @@ export function calculateCharge(order, taxRate) {
+  if (order.amount < 0) {
+    throw new RangeError('amount must be non-negative');
+  }
   return Math.round(order.amount * (1 + taxRate));
 }
diff --git a/tests/billing/charge.test.mjs b/tests/billing/charge.test.mjs
index 3333333..4444444 100644
--- a/tests/billing/charge.test.mjs
+++ b/tests/billing/charge.test.mjs
@@ -1,2 +1,23 @@
 import { describe, it, expect, vi } from 'vitest';
 import { calculateCharge } from '../../src/billing/charge.mjs';
+import { fetchTaxRate } from '../../src/billing/tax.mjs';
+
+describe('calculateCharge', () => {
+  it('handles a standard order', () => {
+    const order = { amount: 1000 };
+    calculateCharge(order, 0.1);
+  });
+
+  it('uses the configured tax rate', () => {
+    const spy = vi.spyOn({ fetchTaxRate }, 'fetchTaxRate').mockReturnValue(0.1);
+    expect(spy()).toBe(0.1);
+  });
+
+  it('rejects a negative amount', () => {
+    try {
+      calculateCharge({ amount: -1 }, 0.1);
+    } catch (err) {
+      console.log('expected error', err.message);
+    }
+  });
+});
```

## 照合先 / Artifacts

- SUT: `src/billing/charge.mjs`（同一 diff）。
- テスト名・コメント・PR 本文に「完走すること自体を検証する smoke test である」旨の記述は無い。
- 共通ヘルパー・カスタムマッチャー・`expect.extend` はこのテストファイルおよび setup ファイルに存在しない。

## Expected Behavior

1. Check 1 として `it('handles a standard order')` を指摘する。SUT を呼ぶのみでアサーションが無く、例外時しか落ちない。
2. Check 2 として `expect(spy()).toBe(0.1)` を指摘する。mock に設定した戻り値をその mock 自身から取り出しており、`calculateCharge` を通っていないため SUT の挙動に依存しない。
3. Check 6 として `it('rejects a negative amount')` を指摘する。`catch` 節に `console.log` があるだけで再 throw も `expect.unreachable()` も無く、例外が投げられなくなっても PASS する。`expect.assertions(1)` や `expect(() => ...).toThrow(RangeError)` への置換を Fix として示す。
4. `vi.spyOn` の未復元（`afterEach` / `restoreMocks` の不在）は `vitest-mock-isolation` の領分であり、本 skill からは指摘しない。
5. `catch` 節が空ではない（`console.log` がある）ため、決定論検出器 `silent-catch` の重複指摘には当たらない。空の `catch {}` であれば本 skill は黙る。

<!-- expected:
findings:
  - check: 1
    severity: major
    reason: SUT を呼び出すのみでアサーションが 1 つも無く、例外時しか落ちない
  - check: 2
    severity: major
    reason: mock に設定した戻り値をその mock 自身から取り出して assert しており SUT を通っていない
  - check: 6
    severity: major
    reason: catch 節が再 throw も明示的失敗もせず、例外が投げられなくなっても PASS する
-->
