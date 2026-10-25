# Fixture 01 — No traffic assumption, retry amplification, unbounded cost (Happy Path)

## Description

A design document adds a fan-out enrichment step to a critical path. Four
Checklist items of this skill fail deterministically from the text alone:

1. **トラフィック前提** — 想定 QPS・ピーク・データ量・同時接続の前提が無く、成長率と
   その期間の前提も無い。「今と同じくらい」としか書かれていない。
2. **性能予算（Budget）** — 重要フローの p95/p99 目標も内訳も無い。さらに 1 リクエスト
   につき 5 並列呼び出し × 各 3 回リトライを規定しており、依存先が劣化した瞬間に
   負荷が 15 倍へ増幅する前提になっている。
3. **ボトルネックと限界** — 依存先（検索インデックス）の上限と劣化時のふるまいが無く、
   キュー溢れやレート制限時の落としどころ（backpressure）も無い。
4. **コスト** — コストドライバー（外部 API 課金、データ転送、ログ量）が列挙されず、
   コスト上限も監視もアラートも無い。

The Pre-execution Gate is satisfied: the path matches `docs/**/*design*.md`, and
the diff adds statements about performance, capacity, and cost assumptions.

## Input Diff

```diff
diff --git a/docs/design/search-enrichment.md b/docs/design/search-enrichment.md
new file mode 100644
--- /dev/null
+++ b/docs/design/search-enrichment.md
@@ -0,0 +1,14 @@
+# Search enrichment
+
+## 方式
+
+検索結果 1 件ごとに、外部の在庫 API を呼んで在庫数を付与する。1 リクエストあたり
+5 件を並列で呼び、失敗したら各 3 回までリトライする。
+
+## 前提
+
+トラフィックは今と同じくらいを想定する。
+
+## コスト
+
+外部 API は従量課金だが、多くはならないと見込む。
```

## Expected Behavior

- A summary line first (`(summary):1: ...`), naming the critical path and the
  assumptions the change introduces.
- A finding on retry amplification: 5 parallel calls × 3 retries per request means
  a dependency slowdown multiplies load by up to 15× exactly when the dependency
  is already failing, and no timeout or retry budget bounds it. Severity critical,
  with the `性能: p95=<ms>, p99=<ms>, timeout=<ms>, retry=<回数>` template.
- A finding that no traffic assumption exists — peak QPS, payload size, data
  growth rate, and the period they cover are all absent, so no capacity figure in
  this document can be checked. Severity major, with the
  `前提: peakQPS=<>, payload=<>, dataGrowth=<>, 期間=<>` template.
- A finding that the dependency's rate limit / quota and its behaviour under
  degradation are unstated, and no backpressure or shedding policy exists for
  queue overflow or rate-limit responses. Severity major.
- A finding that per-call billing is asserted to be small with no volume behind
  it: cost drivers are not enumerated and no budget cap, monitoring metric, or
  alert threshold can be derived. Severity major, with the
  `コスト: ドライバー=<>, 上限=<>, 監視=<メトリクス>` template.
- At most 8 findings total, per the Rule.
- No finding prescribing a specific cache implementation or query rewrite — the
  Non-goals exclude implementation-level tuning and infrastructure product
  choices.

<!-- expected:
findings:
  - severity: critical
    reason: 1 リクエストあたり 5 並列 × 各 3 回リトライで依存先劣化時に負荷が最大 15 倍へ増幅する前提になっており、タイムアウトもリトライ予算も無い
    anchor: docs/design/search-enrichment.md:6
  - severity: major
    reason: 想定 QPS・ピーク・データ量・成長率とその期間の前提が無く、容量の妥当性を検証できない
    anchor: docs/design/search-enrichment.md:10
  - severity: major
    reason: 依存する在庫 API の上限（レート制限/クォータ）と劣化時のふるまい、キュー溢れ時の backpressure・落としどころが無い
    anchor: docs/design/search-enrichment.md:5
  - severity: major
    reason: コストドライバーが列挙されず、呼び出し量の前提なしに従量課金を「多くならない」と断定しているため上限・監視・アラートを導出できない
    anchor: docs/design/search-enrichment.md:14
-->
