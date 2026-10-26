# Fixture 01 — Design that rests on unstated capacity and ordering assumptions (Happy Path)

## Description

A design document introduces an in-process cache and a fire-and-forget
invalidation path. Assuming the change caused an incident six months later, the
causal chains reconstruct deterministically from the document text:

1. **スケーラビリティの壁** — the cache is declared unbounded and per-process,
   and the document states the process count will grow with traffic. Memory
   growth is proportional to distinct keys, which the document never bounds.
2. **データ破損・不整合** — invalidation is published without ordering or
   acknowledgement, so a stale write can overwrite a newer value.
3. **運用不能** — the document names no way to observe hit rate, staleness, or to
   disable the cache, so there is no rollback short of a redeploy.

The Pre-execution Gate is satisfied: the path matches `docs/**/*design*.md`, the
diff carries design decisions, and it is neither mechanical nor test-only.

## Input Diff

```diff
diff --git a/docs/design/order-read-cache.md b/docs/design/order-read-cache.md
new file mode 100644
--- /dev/null
+++ b/docs/design/order-read-cache.md
@@ -0,0 +1,21 @@
+# Order read cache
+
+## Decision
+
+Each API process keeps an in-process map of order id → serialized order.
+Entries are never evicted: an order is small and the working set is bounded by
+the number of orders customers actually look at.
+
+## Invalidation
+
+On write, the writer publishes an `order.changed` notification on the existing
+pub/sub topic and returns immediately. Each process deletes its entry when the
+notification arrives. No acknowledgement is collected.
+
+## Capacity
+
+We run 6 API processes today and will scale them with traffic.
+
+## Rollout
+
+Ship enabled everywhere in one release.
```

## Expected Behavior

- A summary line first (`(pre-mortem):1: [要約] ...`), naming the single largest
  risk in one sentence.
- A failure scenario for the unbounded per-process cache: the broken assumption
  is that the looked-at working set stays small; the chain is working-set growth
  → per-process heap growth → OOM restarts across all 6+ processes at once →
  cold-start latency spike. Verification: run with a synthetic key space an order
  of magnitude larger and observe RSS.
- A failure scenario for unacknowledged, unordered invalidation: the broken
  assumption is that the notification always arrives after the write and exactly
  once; the chain is reorder or loss → an entry that is never deleted → an order
  served stale indefinitely, with no TTL to heal it.
- A failure scenario for the missing kill switch: the broken assumption is that
  the cache can be turned off quickly; with no flag and no metric, detection and
  rollback both require a redeploy.
- Each scenario states 崩れる前提 / 因果連鎖 / 検証方法, per the Output format.
- At most 5 scenarios, per the Rule, with speculation marked as speculation.
- No findings about Markdown style, heading order, or naming conventions.

<!-- expected:
findings:
  - severity: critical
    reason: 無制限・プロセス毎のキャッシュが「参照される作業集合は小さい」という未検証の前提に依存し、プロセス増加と併せて OOM 再起動へ連鎖する
    anchor: docs/design/order-read-cache.md:7
  - severity: critical
    reason: 無応答・無順序の invalidation 通知が失われる／前後する場合に古い値が恒久的に残り、TTL が無いため自己修復しない
    anchor: docs/design/order-read-cache.md:12
  - severity: major
    reason: ヒット率・陳腐化の観測手段と無効化フラグが無く、障害検知もロールバックも再デプロイ待ちになる
    anchor: docs/design/order-read-cache.md:21
-->
