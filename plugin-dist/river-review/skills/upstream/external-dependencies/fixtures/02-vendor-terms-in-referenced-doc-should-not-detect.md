# Fixture 02 — Vendor terms maintained in a referenced dependency register (False-Positive Guard)

## Description

The diff changes a document under `docs/**/*design*.md` and it does describe an
external SaaS dependency, so the gate is satisfied on both conditions. But every
Checklist item the skill would raise is already answered: quota, SLA, timeout,
retry budget, degraded mode, ownership, and the lock-in assessment all live in an
existing dependency register that this document links to and does not change,
and the diff states the degraded behaviour for this specific call site inline.
This is the skill's guard「外部依存の仕様が別ドキュメントで管理され、参照が明確な
場合は重複指摘しない」.

Repository context (not part of the diff):

```text
docs/architecture/dependency-register.md (existing, unchanged) lists
TaxCloudPro with: purpose per environment (sandbox in dev/staging, live in
prod), owner (payments team), contracted SLA (99.9%), quota (200 req/s) and the
rate-limit headers, the 800ms timeout, the retry budget (2 attempts, jittered
backoff, circuit breaker at 20% error rate), the disable switch
`TAXCLOUD_ENABLED`, the lock-in assessment (token format is vendor-specific;
accepted because the mapping table is exportable and re-derivable), and the
migration plan (dual-write to the internal rate table before any switch).
```

## Input Diff

```diff
diff --git a/docs/design/tax-calculation.md b/docs/design/tax-calculation.md
--- a/docs/design/tax-calculation.md
+++ b/docs/design/tax-calculation.md
@@ -3,7 +3,14 @@
 ## Decision

 Checkout computes tax via TaxCloudPro. SLA, quota, rate limits, timeout, retry
 budget, circuit breaker, owner, disable switch, lock-in assessment and the
 migration plan are maintained in
 [the dependency register](../architecture/dependency-register.md) and are
 unchanged by this document.
+
+## Degraded mode for this call site
+
+When the register's circuit breaker opens, checkout falls back to the internal
+rate table (`shipping_zone_rates`, refreshed nightly) and flags the order for
+recalculation. Tax is never estimated silently: the order carries
+`tax_source=fallback`, and the nightly reconciliation job corrects it.
```

## Expected Behavior

- `findings: []` (a summary line may still be emitted; it is not a finding).
- SLA, quota, rate limits, timeout, retry budget, circuit breaker, owner, disable
  switch, lock-in, and the migration plan are not restated here — they are
  delegated to the linked register, which the guard treats as clear. Re-raising
  them would be a duplicate finding.
- The one thing the diff does add — the degraded mode for this call site — is
  fully specified: the fallback source, the marker that keeps the degradation
  visible, and the correction path.
- Because the failure is neither silent nor unaccounted for, the "failures that
  cannot be tolerated" item of the 障害時 checklist is satisfied rather than open.

<!-- expected:
findings: []
reason: SLA・クォータ・タイムアウト・リトライ・Owner・無効化条件・ロックイン評価・移行方針は不変の dependency register で管理され参照が明確、追加された縮退モードもフォールバック元・可視化・是正経路まで明記（重複指摘の抑制条件に該当）
-->
