# Test Case: Deterministic Detector and Neighbor-Skill Territory (False Positive Guard)

## Description

機能変更を含む PR で、(a) テストに `.skip` と `@ts-ignore` を追加し、(b) workflow の `permissions` を拡大し、third-party action を tag 参照のまま追加している。これらは「品質の抑制」に見えるが、(a) は `src/lib/heuristic-review.mjs` の決定論検出器、(b) は `gha-workflow-security` の責務であり、review-criteria-integrity は重複指摘してはならない should-not-detect canary。差分にはレビュー基準・品質ゲートの定義そのものを弱める変更は含まない。

## Input Diff

```diff
diff --git a/tests/billing.test.mjs b/tests/billing.test.mjs
index 1111111..2222222 100644
--- a/tests/billing.test.mjs
+++ b/tests/billing.test.mjs
@@ -12,3 +12,4 @@ describe('calculateCharge', () => {
-  it('applies tax', () => {
+  // @ts-ignore
+  it.skip('applies tax', () => {
     expect(calculateCharge(order)).toBe(1100);
   });
diff --git a/.github/workflows/notify.yml b/.github/workflows/notify.yml
index 3333333..4444444 100644
--- a/.github/workflows/notify.yml
+++ b/.github/workflows/notify.yml
@@ -5,4 +5,6 @@ on:
 permissions:
-  contents: read
+  contents: write
+  pull-requests: write
 jobs:
+  # third-party action は tag 参照のまま
   notify:
diff --git a/src/billing/charge.mjs b/src/billing/charge.mjs
index 5555555..6666666 100644
--- a/src/billing/charge.mjs
+++ b/src/billing/charge.mjs
@@ -18,3 +18,3 @@ export function calculateCharge(order) {
-  const total = order.amount + computeTax(order);
+  const total = order.amount + computeTax(order) - resolveDiscount(order);
   return round(total);
 }
```

## PR 本文 / Artifacts

- PR 本文: 「割引の適用ロジックを追加し、通知 workflow を整備する」。
- `.river/rules.md` / `.river/rules.d/*` / `.river-review.{json,yaml,yml}` / `.river/memory/index.json` / lint 設定 / required check の定義には差分が無い。

## Expected Behavior

本 skill は以下を満たすこと。

1. **findings を出さない**。`.skip` と `@ts-ignore` は `src/lib/heuristic-review.mjs` の決定論検出器（`test-focus` / `ts-suppression` 相当）が既に検出するため、重複指摘しない。
2. workflow の `permissions` 拡大と third-party action の未ピン留めは `gha-workflow-security` の責務であり、本 skill からは指摘しない。workflow ファイルを見るのは required check の定義や品質ゲート job の削除という文脈のみである。
3. Check 1〜5 の対象パスに弱体化方向の差分が無いため、Pre-execution Gate が不成立となり `NO_REVIEW: review-criteria-integrity — レビュー基準・品質ゲートに触れる差分が無い、または弱体化の判定基準が discover できない` を返してもよい。いずれの場合も findings は 0 件とする。
4. 「品質を下げる変更が混ざっている」といった一般論の指摘や question を出さない（false-positive-first / 責務分界の遵守）。
