# Fixture 01 — Vendor added with no quota, timeout, or degraded mode (Happy Path)

## Description

A design document adds a third-party SaaS dependency on a request-critical path.
Four Checklist items of this skill fail deterministically from the text alone:

1. **SLA/クォータ/レート制限** — no quota, rate limit, or timeout is stated, and
   the document specifies unlimited retries, which amplify load exactly when the
   vendor is already failing.
2. **障害時** — no degraded mode is defined; the document says checkout blocks
   until the vendor answers, and the failure is not allowed to be absorbed.
3. **依存一覧と責任境界** — the vendor is named without its purpose per
   environment, responsibility scope, fallback, or a condition for disabling it.
4. **ロックイン/移行** — the vendor's proprietary token format is stored
   persistently, with no export path or abstraction and no stated reason for
   accepting the lock-in.

The Pre-execution Gate is satisfied: the path matches `docs/**/*design*.md`, and
the diff describes an external SaaS/API dependency.

## Input Diff

```diff
diff --git a/docs/design/tax-calculation.md b/docs/design/tax-calculation.md
new file mode 100644
--- /dev/null
+++ b/docs/design/tax-calculation.md
@@ -0,0 +1,15 @@
+# Tax calculation
+
+## Decision
+
+Checkout calls TaxCloudPro to compute tax for every cart. The call happens
+inline: checkout blocks until the vendor answers, and retries until it does.
+
+## Storage
+
+We persist the vendor's `tcp_jurisdiction_token` on the order row and pass it
+back on refunds.
+
+## Cost
+
+Billed per call; we expect this to be small.
```

## Expected Behavior

- A summary line first (`(summary):1: ...`), naming the added dependency and its
  impact.
- A finding on quotas and retries: no quota, rate limit, or timeout is stated,
  and unlimited retries on a synchronous checkout path amplify load during a
  vendor incident (retries × concurrent checkouts). Severity critical, with the
  paste-ready 外部依存 template (SLA / quota / timeout / retry / 障害時の縮退方針).
- A finding on the missing degraded mode: with checkout blocking on the vendor,
  a vendor outage becomes a full checkout outage, and no fallback, deferral, or
  manual path is defined. Severity critical.
- A finding on the dependency inventory: purpose per environment, responsibility
  boundary, and the condition under which the dependency can be disabled are all
  absent. Severity major.
- A finding on lock-in: persisting the vendor's proprietary token on the order
  row makes refunds depend on that vendor indefinitely, with no export path,
  no abstraction, and no stated reason for accepting the lock-in. Severity major,
  with a paste-ready `ロックイン: <要因> / 緩和: <抽象化/エクスポート> / 移行: <方針>`
  template.
- A finding that per-call cost is asserted as small with no volume assumption
  behind it, so no budget or alert threshold can be derived. Severity minor.
- At most 8 findings total, per the Rule.
- No findings arguing that a different vendor should be chosen — the skill's
  Non-goals exclude adjudicating vendor selection.

<!-- expected:
findings:
  - severity: critical
    reason: クォータ・レート制限・タイムアウトが未記載のまま同期チェックアウト経路で無制限リトライを規定しており、ベンダー障害時に負荷が増幅する
    anchor: docs/design/tax-calculation.md:6
  - severity: critical
    reason: 縮退モードが定義されておらず、ベンダー障害がそのままチェックアウト全停止になる（fallback・後回し・手動対応のいずれも無い）
    anchor: docs/design/tax-calculation.md:5
  - severity: major
    reason: 外部依存の用途・環境別の扱い・責任範囲・無効化条件が一覧として整理されていない
    anchor: docs/design/tax-calculation.md:1
  - severity: major
    reason: ベンダー独自トークンを注文行に永続化しており、返金がそのベンダーに恒久的に依存する（エクスポート経路も抽象化も受容理由も無い）
    anchor: docs/design/tax-calculation.md:10
  - severity: minor
    reason: 従量課金のコストを前提となる呼び出し量なしに「小さい」と断定しており、予算やアラート閾値を導出できない
    anchor: docs/design/tax-calculation.md:15
-->
