# Fixture 02 — Risks and mitigations already recorded in the ADR (False-Positive Guard)

## Description

The diff is an ADR under `docs/adr/`, carries a real design decision, and is not
a mechanical or test-only change — the gate is satisfied. But each failure
category this skill prioritizes is already named in the document together with
the assumption it rests on and the mitigation that bounds it. This is the
skill's guard「すでにADRやデザインドキュメントでリスクと緩和策が明記されている項目は重複指摘しない」.

Repository context (not part of the diff):

```text
docs/runbook/order-cache.md (existing, unchanged) holds the disable procedure
and the alert thresholds this ADR references.
```

## Input Diff

```diff
diff --git a/docs/adr/0042-order-read-cache.md b/docs/adr/0042-order-read-cache.md
new file mode 100644
--- /dev/null
+++ b/docs/adr/0042-order-read-cache.md
@@ -0,0 +1,26 @@
+# ADR-0042: Order read cache
+
+## Decision
+
+Cache serialized orders in a shared Redis instance with a 60s TTL, capped at
+2GB with an LRU eviction policy.
+
+## Risks and mitigations
+
+- **Unbounded growth**: assumption is that the working set fits in 2GB. If it
+  does not, LRU evicts rather than exhausting memory, and the TTL bounds the
+  worst case regardless. Verified by replaying one week of production read keys
+  against a 2GB instance (peak 1.1GB).
+- **Stale reads after a write**: assumption is that a 60s window of staleness is
+  acceptable for this endpoint. Product signed off; the write path additionally
+  deletes the key, so the TTL is the fallback, not the primary path. Loss of the
+  delete degrades to at-most-60s staleness rather than permanent staleness.
+- **Redis unavailable**: reads fall through to the database. Capacity for the
+  uncached read rate is the pre-cache baseline, which the current cluster
+  already served.
+- **Rollback**: `ORDER_CACHE_ENABLED=false` disables reads and writes without a
+  deploy. Procedure and alert thresholds: docs/runbook/order-cache.md.
+
+## Rollout
+
+1% → 25% → 100%, holding 24h at each step, rolling back on cache error rate >1%.
```

## Expected Behavior

- `findings: []` (a summary line may still be emitted; it is not a finding).
- Memory growth, stale reads, dependency failure, and rollback are each stated
  with the assumption they rest on and the mitigation that bounds them, so
  re-raising any of them would be the duplicate finding the guard forbids.
- Every failure the skill would reconstruct degrades to a bounded outcome the
  document already names — losing the delete degrades to 60s staleness, not
  permanent staleness; exceeding the cap evicts, not OOMs.
- The staged rollout with a stated rollback trigger answers the 運用不能 category.

<!-- expected:
findings: []
reason: 容量・陳腐化・依存障害・ロールバックの各リスクが崩れる前提と緩和策付きで ADR に明記され、無効化手順は runbook へ参照委譲済み（重複指摘の抑制条件に該当）
-->
