# Test Case: Behavior change mixed into a refactor (should detect)

## Description

「合計計算を calcTotal() に抽出するリファクタ」と説明された diff に、丸め方式を `Math.floor` から `Math.round` へ変える公開挙動の変更が同じ hunk に紛れている。構造変更（抽出）と仕様変更（丸め方式）が混在し、PR 本文では区別されていない。behavior-structure-separation は Check 1 で 1 件検出する（issue 検証シナリオ Case 2「構造変更と仕様変更が混在」に対応）。

## Input Diff

```diff
diff --git a/src/order/total.ts b/src/order/total.ts
index 1111111..2222222 100644
--- a/src/order/total.ts
+++ b/src/order/total.ts
@@ -18,3 +18,7 @@ export function summarize(order: Order): Summary {
-  const total = Math.floor(order.items.reduce((a, i) => a + i.price * i.qty, 0));
-  return { total, count: order.items.length };
+  return { total: calcTotal(order), count: order.items.length };
+}
+
+function calcTotal(order: Order): number {
+  // 抽出（リファクタ）。ついでに丸めを round に変更
+  return Math.round(order.items.reduce((a, i) => a + i.price * i.qty, 0));
 }
```

## PR 本文 / Tests

- PR 本文: 「合計計算を calcTotal() に抽出するリファクタ。動作は変えていない」。
- 丸め方式変更（floor → round）についての記載はない。
- テスト: `calcTotal` を通す既存テストはあるが、丸め方式変更（境界値）を検証するテストは差分に無い。

## Expected Behavior

本 skill は以下を満たすこと。

1. Check 1（振る舞い変更と構造変更の分離）を 1 件検出する（`Math.floor` → `Math.round` の公開挙動変更が抽出リファクタに混在）。
2. behavior_change（丸め方式変更の位置）と structural_change（calcTotal 抽出）を対比で示す。
3. separation は mixed とし、Severity は major（回帰・互換リスク、Safety Net なし）とする。
4. Fix として仕様変更を別 PR へ分離する、または変更を検証するテストを追加する案を添える。
5. 公開 API 破壊的変更（api-compatibility）や完了主張反証（refactor-claim-audit）としては指摘しない。

<!-- expected:
findings:
  - check: 1
    severity: major
    reason: リファクタと称して丸め方式を floor→round に変更する公開挙動変更が抽出に混在。separation は mixed
-->
