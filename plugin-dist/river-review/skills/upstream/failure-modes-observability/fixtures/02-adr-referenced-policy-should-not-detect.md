# Fixture 02 — Failure policy already agreed in a referenced ADR (False-Positive Guard)

## Description

The diff touches `docs/**/*` and describes an external call, so the path
condition matches. But the failure modes, error contract, and observability are
already agreed in ADR-0042, and this diff only points at that ADR while adding
one endpoint to the same flow. This is the skill's False-positive guard
"失敗モード/観測性が別 ADR で既に合意され、差分が参照更新のみ".

Repository context (not part of the diff):

```text
docs/adr/0042-external-call-policy.md (existing, unchanged) defines:
  timeout 3s / 2 retries with exponential backoff / circuit breaker at 50% error rate
  error contract: { code, message, detail, requestId }
  observability: requestId correlation, `psp_call_duration_ms` histogram, SLO 99.5%
```

## Input Diff

```diff
diff --git a/docs/design/payment-refund.md b/docs/design/payment-refund.md
new file mode 100644
--- /dev/null
+++ b/docs/design/payment-refund.md
@@ -0,0 +1,10 @@
+# Payment refund flow
+
+`POST /payments/{id}/refund` calls the PSP refund endpoint.
+
+## Failure modes, error contract, observability
+
+This flow inherits the policy agreed in
+[ADR-0042](../adr/0042-external-call-policy.md) without exception:
+timeouts, retry/backoff, circuit breaker, error schema, and the requestId
+correlation and `psp_call_duration_ms` metric all apply unchanged.
```

## Expected Behavior

- `findings: []`.
- The timeout / retry / error-contract / observability items are not absent —
  they are inherited by an explicit reference to an existing ADR, which the
  guard treats as satisfied. Re-stating them here would be a duplicate finding.
- The skill must not demand that the values be repeated inline; the Rule asks
  that they be specified, not that they be duplicated per document.

<!-- expected:
findings: []
reason: 失敗モード・エラー契約・観測性が ADR-0042 で合意済みであり、本差分はその参照のみ（False-positive guard に該当）
-->
