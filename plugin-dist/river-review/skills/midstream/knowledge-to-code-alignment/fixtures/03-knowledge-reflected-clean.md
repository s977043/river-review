# Test Case: New knowledge fully reflected, constraints preserved (should NOT detect)

## Description

「割引は会員ランクに依存する」という新知識に対し、関数名・型・境界を現在の理解へ更新し（Check 1・Check 2 を満たす）、既存の BOM 除去制約（ADR-012）は保全している（Check 3 を満たす）。新知識が命名・責務・境界へ正しく反映され、過去の設計判断も失っていないため、findings は空となる。

## Input Diff

```diff
diff --git a/src/pricing/discount.ts b/src/pricing/discount.ts
index 1111111..2222222 100644
--- a/src/pricing/discount.ts
+++ b/src/pricing/discount.ts
@@ -10,3 +10,6 @@ import type { Order, MemberRank } from './types';
-export function flatDiscount(order: Order): number {
-  return order.subtotal * 0.1;
-}
+// 会員ランク別割引（issue #1573）。ランク→割引率の対応は 1 箇所に集約する
+const RANK_DISCOUNT_RATE: Record<MemberRank, number> = { gold: 0.2, silver: 0.15, standard: 0.1 };
+
+export function rankedDiscount(order: Order): number {
+  return order.subtotal * RANK_DISCOUNT_RATE[order.member.rank];
+}
```

## Knowledge Delta / 出典

- PR 本文: 「issue #1573 に基づき割引を会員ランク依存へ変更。従来の一律割引 `flatDiscount` は `rankedDiscount` へ改名し、ランク→率の対応を型付きテーブルに集約する」。
- ADR-012 の BOM 除去制約は `src/import/csv.ts` にそのまま残しており、本 diff は触れていない。

## Expected Behavior

本 skill は以下を満たすこと。

1. Check 1: 新概念「ランク別割引」が名前（`rankedDiscount`）・型（`Record<MemberRank, number>`）へ反映されている → 指摘しない。
2. Check 2: ランク→率の対応がコメントだけでなく型付きテーブル（コード構造）へ反映され、境界が現在の理解を表現している → 指摘しない。
3. Check 3: ADR-012 の制約に触れておらず設計知識の消失がない → 指摘しない。
4. findings は空（`findings: []`）。

<!-- expected:
findings: []
reason: 新知識が命名（rankedDiscount）・型・境界へ反映され、ADR-012 の制約も保全されている。3 Check すべてを満たすため指摘なし
-->
