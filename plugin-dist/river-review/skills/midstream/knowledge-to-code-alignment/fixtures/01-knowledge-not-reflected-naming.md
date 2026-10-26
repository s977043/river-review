# Test Case: New knowledge not reflected in naming/responsibility (should detect)

## Description

issue で「割引は会員ランクに依存する」という新しいドメイン知識を得て、割引率の計算をランク依存に変更した。しかし関数名・型名は一律割引時代の `flatDiscount` のまま流用されており、新知識（Knowledge Delta）が命名・責務へ反映されていない。knowledge-to-code-alignment は Check 1 で 1 件検出する。

## Input Diff

```diff
diff --git a/src/pricing/discount.ts b/src/pricing/discount.ts
index 1111111..2222222 100644
--- a/src/pricing/discount.ts
+++ b/src/pricing/discount.ts
@@ -14,3 +14,4 @@ export function flatDiscount(order: Order): number {
-  // 一律 10% 割引
-  return order.subtotal * 0.1;
+  // 会員ランクに応じた割引（issue #1573）
+  const rate = order.member.rank === 'gold' ? 0.2 : order.member.rank === 'silver' ? 0.15 : 0.1;
+  return order.subtotal * rate;
 }
```

## Knowledge Delta / 出典

- PR 本文: 「issue #1573 に基づき、割引は会員ランク（gold/silver/その他）に依存するよう変更する。従来は一律割引だった」。
- 従来コードの `flatDiscount` は「一律割引」という古い理解を表す名前。

## Expected Behavior

本 skill は以下を満たすこと。

1. Check 1（新知識の命名・責務への反映）を 1 件検出する（ランク依存に変わったのに関数名・型が `flatDiscount` のまま）。
2. Knowledge Delta の出典（PR 本文・issue #1573）を示す。
3. Fix として現在の理解を表す名前（例: `rankedDiscount`）への改名と、ランクを引数/型へ反映する案を添える。
4. 用語の一貫性（ubiquitous-language-naming）や振る舞い/構造の分離（behavior-structure-separation）としては指摘しない。

<!-- expected:
findings:
  - check: 1
    severity: minor
    reason: 新知識「会員ランク別割引」がコードの命名・責務（flatDiscount）へ反映されていない。Knowledge Delta の出典は PR 本文 / issue #1573
-->
