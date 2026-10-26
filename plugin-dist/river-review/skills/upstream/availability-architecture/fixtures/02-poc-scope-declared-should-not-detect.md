# Fixture 02 — Availability terms in a referenced runbook, PoC scope declared (False-Positive Guard)

## Description

The diff changes a document under `docs/architecture/**` and it does touch
availability, redundancy, and recovery wording, so both content conditions of the
Pre-execution Gate are satisfied. Two suppression paths apply at once and neither
depends on the gate failing:

- The document declares itself PoC scope with no production availability
  responsibility, which is the skill's guard「ドキュメントが PoC/実験系で、本番可用性
  を担保する責務が無いと明記されている場合は強度を下げる」.
- The production availability terms it does reference — SLO, failover trigger,
  RTO/RPO, capacity headroom, degraded mode — are maintained in an existing
  runbook that this diff links to and does not change.

Repository context (not part of the diff):

```text
docs/architecture/session-store-runbook.md (existing, unchanged) defines:
  SLO (99.95%/30d, p99 40ms, measured at the gateway, excluding client aborts),
  failover (trigger: 5xx rate > 2% for 3 min → automatic switch to the standby
  region; verification: gateway error-rate panel), RTO 5 min / RPO 60 s,
  capacity (peak 12k rps, 40% headroom, staged scale-out policy), and the
  degraded mode (cache miss falls through to the store; store unavailable →
  read-only sessions with a visible banner).
```

## Input Diff

```diff
diff --git a/docs/architecture/session-store-experiment.md b/docs/architecture/session-store-experiment.md
new file mode 100644
--- /dev/null
+++ b/docs/architecture/session-store-experiment.md
@@ -0,0 +1,13 @@
+# Session store: cache shape experiment (PoC)
+
+> スコープ: 本 PoC は社内検証環境のみで実施し、本番トラフィックは一切流さない。
+> 本番可用性を担保する責務は本ドキュメントに無い。
+
+## 目的
+
+キャッシュのキー形状 2 案について、検証環境でヒット率のみを比較する。
+
+## 本番の可用性要件
+
+SLO・フェイルオーバー条件・RTO/RPO・容量余裕・劣化モードは
+[運用 Runbook](./session-store-runbook.md) が正であり、本 PoC では変更しない。
```

## Expected Behavior

- `findings: []` (a summary line may still be emitted; it is not a finding).
- SLO, measurement definition, failover trigger and verification, RTO/RPO,
  capacity headroom, and degraded mode are not restated here — they are delegated
  to the linked runbook, which this diff leaves unchanged. Re-raising them would
  be a duplicate finding.
- The PoC scope is declared explicitly and bounded (internal verification
  environment, no production traffic), so the skill lowers its strength rather
  than demanding production availability artifacts, per the guard.
- No finding is raised about the missing SLO for the experiment itself: an
  experiment with no production traffic has no user-facing availability target
  to define.

<!-- expected:
findings: []
reason: 本番可用性の責務が無い PoC と明記されており（抑制条件に該当）、SLO・フェイルオーバー・RTO/RPO・容量・劣化モードは不変の運用 Runbook で管理され参照が明確
-->
