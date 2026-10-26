# Test Case: Formatting SSoT Conflict (Should NOT Detect)

False-positive canary（#1451）: フォーマッタ（`prettier`）管理下の表に行を
追加した差分。列幅・末尾スペース・整列は `prettier --check` が通る限り正典であり、
`existing-pattern-conformance` は手動整形（列幅ズレ・末尾スペース調整）を指摘して
はならない。手動整形の提案は逆に prettier の整形結果を壊す。

## Description

既存表と同じ整形規約（`prettier --check` pass）に沿って 1 行追加している。
列幅が視覚的にズレて見えても、フォーマッタが決める体裁であり指摘対象外。

## Input Diff

```diff
diff --git a/pages/reference/commands.md b/pages/reference/commands.md
index abc1234..def5678 100644
--- a/pages/reference/commands.md
+++ b/pages/reference/commands.md
@@ -3,2 +3,3 @@
 | `/check` | 品質チェックを実行する |
 | `/pr`    | PR 説明の下書きを作る  |
+| `/preflight` | 作業前に重複・陳腐化を確認する |
```

## Expected Behavior

The skill should NOT flag:

1. 表の列幅ズレを指摘して末尾スペースの調整を提案しない（整形は `prettier` の SSoT）。
2. 追加行を既存行と手動で桁揃えする提案をしない（`prettier --check` が通れば正典）。

<!-- expected:
findings: []
reason: 表・スペーシングの体裁はフォーマッタ（prettier）が整形 SSoT であり、prettier --check 通過時は手動整形を指摘しない（#1451）
-->
