# Fixture 02 — Budgets in a referenced capacity plan, PoC scope declared (False-Positive Guard)

## Description

The diff changes a document under `docs/**/*design*.md` and it does touch
performance and cost wording, so both content conditions of the Pre-execution
Gate are satisfied. Two suppression paths apply and neither depends on the gate
failing:

- The document declares itself PoC / not operated in production, which is the
  skill's guard「PoC/運用対象外と明記されている場合は、必須要件としては扱わず
  “確認” に留める」.
- The production traffic assumptions, latency budget, dependency limits, and cost
  drivers it references live in an existing capacity plan that this diff links to
  and does not change.

Repository context (not part of the diff):

```text
docs/design/search-capacity.md (existing, unchanged) states: peak 3,200 rps,
average payload 4 KB, 8%/month growth over 12 months; p95 180 ms / p99 400 ms
with a per-hop breakdown; inventory API quota 500 rps with a 250 ms timeout and
a 1-retry budget under a circuit breaker at 10% error rate; queue overflow sheds
enrichment and returns un-enriched results; cost drivers (external API calls,
egress, log volume) with a monthly cap and an 80%-of-cap alert.
```

## Input Diff

```diff
diff --git a/docs/design/search-enrichment-poc.md b/docs/design/search-enrichment-poc.md
new file mode 100644
--- /dev/null
+++ b/docs/design/search-enrichment-poc.md
@@ -0,0 +1,13 @@
+# Search enrichment: batching shape PoC
+
+> スコープ: 本 PoC は開発環境の固定データセットに対してのみ実行し、本番運用対象外。
+> 本番トラフィックもコストも発生しない。
+
+## 目的
+
+在庫付与のバッチ粒度 2 案について、開発環境でレイテンシの相対差のみを測る。
+
+## 本番の前提
+
+ピーク QPS・成長率・p95/p99 予算・依存 API の上限とタイムアウト・backpressure・
+コストドライバーと上限は [容量計画](./search-capacity.md) が正であり、本 PoC では変更しない。
```

## Expected Behavior

- `findings: []` (a summary line may still be emitted; it is not a finding).
- Traffic assumptions, the latency budget and its breakdown, the dependency quota
  with timeout and retry budget, the backpressure policy, and cost drivers with a
  cap and alert are all delegated to the linked capacity plan, which this diff
  leaves unchanged. Re-raising them would be a duplicate finding.
- The PoC scope is declared explicitly and bounded (development environment,
  fixed dataset, no production traffic and no billed cost), so the skill keeps
  these items as confirmations rather than mandatory requirements, per the guard.
- No cost finding is raised for the PoC itself: it incurs no metered usage, so
  there is no cost driver to cap or alert on.

<!-- expected:
findings: []
reason: 本番運用対象外の PoC と明記されており（抑制条件に該当）、トラフィック前提・性能予算・依存上限・backpressure・コストドライバーと上限は不変の容量計画で管理され参照が明確
-->
