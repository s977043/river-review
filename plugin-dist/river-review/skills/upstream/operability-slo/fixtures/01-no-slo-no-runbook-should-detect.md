# Fixture 01 — New on-call surface with no SLO, alert, or runbook (Happy Path)

## Description

An operations document introduces a nightly reconciliation job that customers
depend on, but defines nothing an on-call engineer could act on. Four Checklist
items of this skill fail deterministically from the text alone:

1. **SLO/SLI** — 重要フローの SLI（成功率・レイテンシ）も SLO（目標値）も無く、
   計測の定義（分母/分子、除外条件、期間）も無い。「だいたい朝までに終わる」だけ。
2. **監視/アラート** — 直後に見るべきメトリクス/ログ/ダッシュボードが無く、アラート
   条件（閾値、継続時間、抑制条件）も当番の初動も無い。
3. **切り分け** — 相関IDや主要属性（tenantId 等）のログ方針が無く、外部依存（対向の
   決済プロバイダ）の障害時にどこまでが自チームの責任範囲かも書かれていない。
4. **障害対応/ロールバック** — 失敗時にリトライするのか止めるのか縮退するのかの基準が
   無く、Runbook の最小要素（症状・確認手順・復旧手順・エスカレーション先）も無い。

The Pre-execution Gate is satisfied: the path matches `**/*operat*.md` under
`docs/`, and the diff is about operations and monitoring.

## Input Diff

```diff
diff --git a/docs/operations/nightly-reconciliation.md b/docs/operations/nightly-reconciliation.md
new file mode 100644
--- /dev/null
+++ b/docs/operations/nightly-reconciliation.md
@@ -0,0 +1,10 @@
+# Nightly reconciliation
+
+毎晩 2:00 に決済プロバイダの明細を取り込み、社内の売上テーブルと突合する。
+突合結果は翌営業日の請求に使う。
+
+だいたい朝までに終わる。
+
+失敗したら気づいた人が直す。
+
+外部プロバイダが落ちているときは、まあどうしようもない。
```

## Expected Behavior

- A summary line first (`(summary):1: ...`), naming the operated surface, the
  expectation it carries, and what is undecided.
- A finding that no runbook exists for a job that feeds next-day billing: the
  symptom, the check procedure, the recovery operation, and the escalation
  contact are all absent, and「気づいた人が直す」names no responsible party.
  Severity critical, with the
  `Runbook: 症状=<何が起きる>, 確認=<見るべきダッシュボード/ログ>, 復旧=<操作>, エスカレーション=<連絡先>`
  template.
- A finding that no SLI/SLO is defined and「だいたい朝までに終わる」has no measurable
  form — no completion deadline, success-rate definition, denominator/numerator,
  exclusion condition, or period. Severity major, with the
  `SLO: <対象フロー> / SLI=<指標定義> / 目標=<例: 99.9%/30d> / 計測=<どこで測る>`
  template.
- A finding that there is no alert: a silent overnight failure is only discovered
  by whoever happens to look, and no threshold, duration, suppression condition,
  or first on-call action is defined. Severity major.
- A finding that the boundary of responsibility for the payment provider's
  outages is asserted rather than defined ("どうしようもない"), and that no
  correlation id or key attribute logging policy exists to separate our failure
  from theirs. Severity major.
- At most 8 findings total, per the Rule.
- No finding recommending a specific monitoring product — the Non-goals exclude
  tool selection.

<!-- expected:
findings:
  - severity: critical
    reason: 翌営業日の請求に使うジョブに Runbook の最小要素（症状・確認手順・復旧手順・エスカレーション先）が無く、責任者も決まっていない
    anchor: docs/operations/nightly-reconciliation.md:8
  - severity: major
    reason: 重要フローの SLI/SLO が無く「だいたい朝までに終わる」が計測可能な形（完了期限・成功率定義・分母分子・除外条件・期間）になっていない
    anchor: docs/operations/nightly-reconciliation.md:6
  - severity: major
    reason: アラート条件（閾値・継続時間・抑制条件）と当番の初動が無く、夜間の無言失敗を検知できない
    anchor: docs/operations/nightly-reconciliation.md:8
  - severity: major
    reason: 外部決済プロバイダ障害時の責任範囲が定義されておらず、相関IDや主要属性のログ方針も無いため自他の障害を切り分けられない
    anchor: docs/operations/nightly-reconciliation.md:10
-->
