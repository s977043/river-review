# Fixture 01 — Critical path made single-region with no SLO or failover (Happy Path)

## Description

An architecture document moves a request-critical service to a single region and
adds a cache in front of it. Four Checklist items of this skill fail
deterministically from the text alone:

1. **可用性目標と測定** — 重要パスの SLI/SLO（p99、エラー率）も、その計測方法・
   除外条件も定義されていない。「速くする」としか書かれていない。
2. **フェイルオーバーと復旧** — 障害時の切り替え手順（自動/手動）、判定メトリクス、
   RTO/RPO のいずれも無い。「手で戻す」とだけ書かれている。
3. **容量と冗長** — ピーク前提もスケール戦略も無く、リージョン冗長を明示的に捨てた
   のに段階的スケール案が無い。
4. **劣化モードと観測性** — キャッシュ不通時の挙動（バックプレッシャー、graceful
   degradation）が説明されておらず、異常時に見るべきメトリクス/ダッシュボード/
   アラートも列挙されていない。

The Pre-execution Gate is satisfied: the path is under `docs/architecture/**`,
and the diff adds statements about availability, redundancy, and recovery.

## Input Diff

```diff
diff --git a/docs/architecture/session-store.md b/docs/architecture/session-store.md
new file mode 100644
--- /dev/null
+++ b/docs/architecture/session-store.md
@@ -0,0 +1,12 @@
+# Session store
+
+## Decision
+
+セッション参照を高速化するため、セッションストアを単一リージョンに集約し、
+その手前にインメモリキャッシュを置く。速くすることが目的。
+
+## 冗長構成
+
+マルチリージョンはコストが見合わないため採用しない。
+
+障害が起きたら手で戻す。
```

## Expected Behavior

- A summary line first (`(summary):1: ...`), naming the availability, failover,
  and capacity impact of collapsing to a single region.
- A finding that no failover procedure exists: neither the trigger metric, nor
  whether the switch is automatic or manual, nor RTO/RPO are stated, while every
  request on the critical path now depends on one region. Severity critical, with
  the `Failover: trigger=<>, action=<>, verification=<logs>` template.
- A finding that no SLI/SLO is defined for the critical path, and no measurement
  method or exclusion condition exists, so the change cannot be evaluated as an
  improvement or a regression. Severity major, with the
  `SLO: service=<>, metric=p99 latency, target=<>, measurement=<dash>` template.
- A finding that region redundancy is dropped on a cost argument with no peak
  traffic assumption, headroom, or staged scaling alternative behind it.
  Severity major, with the `Capacity: peak=<>, headroom=<>, scaling=<policy>`
  template.
- A finding that the degraded behaviour when the cache is unavailable is
  unspecified, and the metrics, dashboards, and alerts to watch during an
  incident are not listed. Severity major.
- At most 8 findings total, per the Rule.
- No finding recommending a particular cloud provider or managed cache product —
  the Non-goals exclude infrastructure product selection.

<!-- expected:
findings:
  - severity: critical
    reason: 単一リージョン集約にもかかわらず切り替え手順・判定メトリクス・RTO/RPO が無く、障害時に復旧手段を選べない
    anchor: docs/architecture/session-store.md:12
  - severity: major
    reason: 重要パスの SLI/SLO と計測方法・除外条件が定義されておらず、改善か劣化かを評価できない
    anchor: docs/architecture/session-store.md:5
  - severity: major
    reason: ピークトラフィック前提・余裕・段階的スケール案が無いままコストのみを根拠にリージョン冗長を捨てている
    anchor: docs/architecture/session-store.md:10
  - severity: major
    reason: キャッシュ不通時の劣化挙動が未定義で、異常時に見るべきメトリクス・ダッシュボード・アラートも列挙されていない
    anchor: docs/architecture/session-store.md:6
-->
