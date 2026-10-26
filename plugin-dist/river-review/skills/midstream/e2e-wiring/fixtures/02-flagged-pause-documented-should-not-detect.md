# Fixture 02 — The path is intentionally paused behind a flag (False-Positive Guard)

## Description

The Pre-execution Gate holds: the diff introduces a multi-layer 計測 → 永続化 path,
not a rename or a log-wording tweak. The skill runs. The persistence hop is present
but gated by a feature flag, and the diff states in-line that the sink is enabled
in the following release. That is the False-positive guard 「意図的に途中で止める
設計（feature flag で後続を保留中など）が差分内に明記されている場合は抑制」.

## Input Diff

```diff
diff --git a/src/review/run.mjs b/src/review/run.mjs
--- a/src/review/run.mjs
+++ b/src/review/run.mjs
@@ -1,7 +1,20 @@
 import { metricsStore } from '../metrics/store.mjs';
 import { flags } from '../config/flags.mjs';

 export async function runReview(session, input) {
+  const startedAt = Date.now();
   const result = await review(input);
+  const metrics = { durationMs: Date.now() - startedAt, findings: result.findings.length };
+  session.metrics = metrics;
+  // metrics sink は v1.9.0 で有効化する。フラグ OFF の間は永続化しない（意図的な保留）。
+  if (flags.metricsSink) {
+    await metricsStore.save(session.id, metrics);
+  }
+  try {
+    await notifyReviewers(result);
+  } catch (err) {
+    logger.error({ err }, 'notifyReviewers failed');
+    throw err;
+  }
   return result;
 }
```

## Expected Behavior

- `findings: []`.
- The persistence hop exists (`metricsStore.save`) and the flag gate is documented
  in the diff with the enabling version, so the pause is intentional design.
- The `catch` re-throws after logging, so it is not a silent skip.
- Asking for the flag to be removed would be a design opinion, which the Human
  Handoff section routes to a human rather than to a finding.

<!-- expected:
findings: []
reason: Pre-execution Gate は成立するが、永続化フックは実在し、フラグによる保留が有効化予定版とともに差分内に明記されているため False-positive guard「意図的に途中で止める設計が明記されている場合は抑制」に該当する。例外は log 後に再 throw されており silent skip ではない
-->
