# Fixture 01 — Measured value never reaches persistence (Happy Path)

## Description

The diff introduces a new 起点→末端 path: a review-duration metric is computed and
stored on the in-memory session, and a failure is caught. It spans multiple layers
(計測 + 永続化 + 例外通知), so the Pre-execution Gate holds. Two typical 断点 from
the Rule section appear: the metric is written to memory but never flushed to the
store, and the `catch` swallows the error without notify / rethrow (silent skip).

## Input Diff

```diff
diff --git a/src/review/run.mjs b/src/review/run.mjs
--- a/src/review/run.mjs
+++ b/src/review/run.mjs
@@ -1,6 +1,13 @@
 import { metricsStore } from '../metrics/store.mjs';

 export async function runReview(session, input) {
+  const startedAt = Date.now();
   const result = await review(input);
+  session.metrics = { durationMs: Date.now() - startedAt, findings: result.findings.length };
+  try {
+    await notifyReviewers(result);
+  } catch {
+    // ignore
+  }
   return result;
 }
```

`code_search` result quoted as evidence: `rg "metricsStore" -n src/review/` returns
only the import at `src/review/run.mjs:1` — nothing calls `metricsStore.save()` on
this path, so the metric never leaves the session object.

## Expected Behavior

- A finding anchored at `src/review/run.mjs:6` (宣言: レビュー所要時間を計測して
  永続化する / 途切れ: `session.metrics` への代入止まりで `metricsStore` へ書かない),
  with the impact stated as 集計欠損.
- A finding anchored at `src/review/run.mjs:9` for the silent `catch`: the
  notification failure is neither re-thrown, retried, nor reported, so 通知不達が
  不可視化される.
- The 末端 side of the metric path is outside the diff, so the report must cite the
  `code_search` above rather than asserting the break from the diff alone — this is
  what the guard 「grep で確認した上でのみ指摘する」 requires.

<!-- expected:
findings:
  - severity: major
    reason: 計測値が session への書き込み止まりで metricsStore へ永続化されず、集計に到達しない（grep で保存呼び出し不在を確認済み）
    anchor: src/review/run.mjs:6
  - severity: major
    reason: 通知失敗を catch して通知・再送・再 throw のいずれも行わず握り潰している（silent skip）
    anchor: src/review/run.mjs:9
-->
