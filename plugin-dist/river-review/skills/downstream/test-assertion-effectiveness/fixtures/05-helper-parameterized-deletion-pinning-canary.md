# Test Case: ヘルパー経由 assert・パラメタライズド・削除の回帰固定（Check 1 / 2 / 3 の抑制条件 / canary）

## Description

一見すると「アサーションが無い」「入力自身を assert している」「存在しない文字列を検証している」ように読めるが、いずれも正当なテスト形である should-not-detect canary。Check 1・Check 2・Check 3 の抑制条件がそれぞれ成立することを固定する。

## Input Diff

```diff
diff --git a/tests/support/assertions.mjs b/tests/support/assertions.mjs
index 1111111..2222222 100644
--- a/tests/support/assertions.mjs
+++ b/tests/support/assertions.mjs
@@ -1,0 +1,5 @@
+export function assertChargeMatches(actual, expected) {
+  expect(actual.total).toBe(expected.total);
+  expect(actual.currency).toBe(expected.currency);
+  expect(actual.taxIncluded).toBe(true);
+}
diff --git a/tests/billing/charge.test.mjs b/tests/billing/charge.test.mjs
index 3333333..4444444 100644
--- a/tests/billing/charge.test.mjs
+++ b/tests/billing/charge.test.mjs
@@ -1,2 +1,20 @@
 import { describe, it, expect } from 'vitest';
 import { calculateCharge } from '../../src/billing/charge.mjs';
+import { assertChargeMatches } from '../support/assertions.mjs';
+
+describe('calculateCharge', () => {
+  it('applies tax to a standard order', () => {
+    assertChargeMatches(calculateCharge({ amount: 1000 }, 0.1), {
+      total: 1100,
+      currency: 'JPY',
+    });
+  });
+
+  it.each([
+    { amount: 0, rate: 0.1, total: 0 },
+    { amount: 1, rate: 0.1, total: 1 },
+    { amount: 999, rate: 0.08, total: 1079 },
+  ])('rounds $amount at rate $rate to $total', ({ amount, rate, total }) => {
+    expect(calculateCharge({ amount }, rate).total).toBe(total);
+  });
+});
diff --git a/tests/Feature/LegacyBannerTest.php b/tests/Feature/LegacyBannerTest.php
index 5555555..6666666 100644
--- a/tests/Feature/LegacyBannerTest.php
+++ b/tests/Feature/LegacyBannerTest.php
@@ -8,2 +8,10 @@ class LegacyBannerTest extends TestCase
     }
+
+    /** 撤去済みキャンペーンバナーが再掲載されないことを固定する回帰テスト（#1512 で撤去） */
+    public function test_removed_campaign_banner_never_reappears(): void
+    {
+        $response = $this->get('/');
+
+        $response->assertDontSee('春の乗り換えキャンペーン実施中');
+    }
 }
```

## 照合先 / Artifacts

- 共通ヘルパー: `tests/support/assertions.mjs`（同一 diff に含まれ、`expect` を 3 件実行する）。
- 照合先テンプレート: `resources/views/home.blade.php`。検索語 `春の乗り換えキャンペーン実施中` は 0 件（#1512 で撤去済み）。
- テストの docblock に「撤去済み」「回帰テスト」と撤去 issue 番号が明記されている。

## Expected Behavior

本 skill は findings を 1 件も出さないこと。

1. **Check 1 として指摘しない**: `it('applies tax to a standard order')` の本体に `expect` は現れないが、アサーションは `assertChargeMatches` ヘルパーへ切り出されており、同一 diff でその実体を確認できる（抑制条件「ヘルパー経由の assert」）。
2. **Check 2 として指摘しない**: `it.each` の入力テーブルは定数の羅列だが、各ケースは `calculateCharge` を通った結果を assert している（抑制条件「パラメタライズドテスト」）。期待値 `total` が入力から自明に見えることを恒真と誤認しない。
3. **Check 3 として指摘しない**: `assertDontSee('春の乗り換えキャンペーン実施中')` の期待文字列は照合先に 0 件だが、docblock が「撤去済み文言の回帰固定」であることを明示している（抑制条件「削除の回帰固定」）。この形は期待文字列が存在しないことこそが期待どおりである。
4. 「アサーションが弱い」「テストが薄い」といった一般論の指摘や question を出さない（false-positive-first）。

<!-- expected:
findings: []
-->
