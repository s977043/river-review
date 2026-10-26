# Fixture 02 — Local-only developer tool, SLO kept in a referenced doc (False-Positive Guard)

## Description

The diff changes a document matching `**/*operat*.md` under `docs/`, so the
Pre-execution Gate is satisfied. The skill stays silent because both suppression
paths hold at once and neither depends on the gate failing:

- The subject is a developer-machine-only helper with no production surface, and
  the document says so, which is the skill's guard「運用対象外（PoC/ローカルのみ）と
  明記されている場合は、SLO などの要求を過剰に強制しない」.
- The production reconciliation job's SLO, alerting, triage policy, and runbook
  live in an existing operations document that this diff links to and does not
  change.

Repository context (not part of the diff):

```text
docs/operations/nightly-reconciliation.md (existing, unchanged) defines the SLI
(records reconciled / records received, excluding provider-side 5xx), the SLO
(99.5% completed by 06:00 JST, measured monthly), the alert (job not finished by
06:00, or mismatch rate > 0.2% for 15 min, suppressed during declared provider
maintenance), the first on-call action, the correlation id (`batchId`,
`tenantId`), the responsibility boundary against the payment provider, and the
runbook (symptom, checks, recovery, escalation to the payments on-call).
```

## Input Diff

```diff
diff --git a/docs/operations/reconciliation-local-tool.md b/docs/operations/reconciliation-local-tool.md
new file mode 100644
--- /dev/null
+++ b/docs/operations/reconciliation-local-tool.md
@@ -0,0 +1,14 @@
+# Reconciliation diff viewer (local only)
+
+> スコープ: 開発者のローカル環境でのみ実行する調査補助ツール。本番・ステージングの
+> どちらにもデプロイせず、運用対象外。当番も SLO も持たない。
+
+## 使い方
+
+ローカルに落とした突合結果のダンプ 2 つを読み込み、差分を表示するだけ。
+外部への通信もデータの書き戻しも行わない。
+
+## 本番ジョブの運用
+
+SLO・アラート条件・当番の初動・相関ID・責任範囲・Runbook は
+[夜間突合の運用ドキュメント](./nightly-reconciliation.md) が正であり、本変更では変えない。
```

## Expected Behavior

- `findings: []` (a summary line may still be emitted; it is not a finding).
- The tool is declared out of operational scope (local only, never deployed, no
  on-call, no SLO) and it neither writes data nor talks to anything, so demanding
  an SLO, alert, or runbook for it would be the over-enforcement the guard
  excludes.
- The SLI/SLO definition, alert thresholds with suppression, first on-call
  action, correlation ids, responsibility boundary, and runbook are delegated to
  the linked operations document, which this diff leaves unchanged. Re-raising
  them would be a duplicate finding.
- No triage finding is raised for the missing correlation id in the tool: it
  reads local dumps only, so there is no cross-service request to correlate.

<!-- expected:
findings: []
reason: ローカル実行のみ・運用対象外と明記されており（抑制条件に該当）、本番ジョブの SLO・アラート・当番初動・相関ID・責任範囲・Runbook は不変の運用ドキュメントで管理され参照が明確
-->
