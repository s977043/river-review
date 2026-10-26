# Test Case: Config Threshold Relaxation and a New Suppression Entry (should detect)

## Description

決済ロジックを変更する PR で、同時に `.river-review.json` の `review.severity` を `strict` から `relaxed` に引き下げ、`.river/memory/index.json` に suppression entry を新規追加している。緩和の理由・適用範囲・再強化の条件はどこにも書かれていない。review-criteria-integrity は Check 2（実行時コンフィグの閾値・ゲート緩和）と Check 3（suppression entry の新規追加）で検出する。

## Input Diff

```diff
diff --git a/.river-review.json b/.river-review.json
index 1111111..2222222 100644
--- a/.river-review.json
+++ b/.river-review.json
@@ -2,4 +2,4 @@
   "review": {
     "language": "ja",
-    "severity": "strict"
+    "severity": "relaxed"
   },
diff --git a/.river/memory/index.json b/.river/memory/index.json
index 3333333..4444444 100644
--- a/.river/memory/index.json
+++ b/.river/memory/index.json
@@ -1,2 +1,12 @@
 {
+  "suppressions": [
+    {
+      "id": "sup-2026-0001",
+      "context": {
+        "fingerprint": "a1b2c3d4",
+        "feedbackType": "false_positive",
+        "scope": "global"
+      }
+    }
+  ],
   "entries": []
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

- PR 本文: 「割引の適用ロジックを追加する」とだけ書かれている。config と suppression の変更には言及していない。
- コミットメッセージ: `feat: 割引適用を追加する`。緩和の理由・適用範囲・再強化条件は記載なし。
- `review.severity` を戻す予定や期限を示す記述は、設定ファイル内のコメントにも存在しない。

## Expected Behavior

本 skill は以下を満たすこと。

1. Check 2 を検出する（`review.severity` が `strict` から `relaxed` へ引き下げられ、同一 PR に決済ロジックの機能変更がある）。
2. Check 3 を検出する（`.river/memory/index.json` に suppression entry が新規追加され、同一 PR の機能変更と混在している）。
3. 変更前の値を差分内のアンカーで示す（`.river-review.json` の `"severity": "strict"` 削除行）。
4. 混在する機能変更を `file:line` で示す（`src/billing/charge.mjs:18` 付近）。
5. severity を較正基準に従って付ける（閾値引き下げは merge 前に分離または宣言すべき `warning`）。
6. suppression entry の **種別選択の妥当性**（`false_positive` が適切かどうか、HIGH_SEVERITY guard の扱い）には踏み込まない。それは `suppression-feedback` の責務である。
7. resolution を添える（基準変更を別 PR へ分離する、または緩和理由と再強化条件を PR 本文に明記する）。
8. 指摘上限（Check ごとに最大 2 件、全体で最大 5 件）を超えない。
