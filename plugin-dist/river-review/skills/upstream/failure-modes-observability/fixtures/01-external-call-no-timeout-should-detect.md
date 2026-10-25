# Fixture 01 — Critical flow design without failure modes or observability (Happy Path)

## Description

A design document adds a payment flow that calls an external provider. The
document states the happy path only: no timeout value, no retry/backoff policy,
no idempotency key, no error contract, and no correlation id / metric for the
flow. Every Heuristic of this skill fires, and the Pre-execution Gate is
satisfied (the diff touches `docs/**/*` and `inputContext` includes `diff`).

## Input Diff

```diff
diff --git a/docs/design/payment-capture.md b/docs/design/payment-capture.md
new file mode 100644
--- /dev/null
+++ b/docs/design/payment-capture.md
@@ -0,0 +1,15 @@
+# Payment capture flow
+
+## Flow
+
+1. The API receives `POST /payments/{id}/capture`.
+2. The service calls the external PSP `POST https://psp.example.com/v2/capture`.
+3. On success it writes `payments.status = captured` and returns 200.
+
+## Response
+
+On success: `200 { "status": "captured" }`.
+
+## Rollout
+
+Behind the `payment_capture_v2` flag.
```

## Expected Behavior

- A finding on the external PSP call (`docs/design/payment-capture.md:6`):
  timeout, retry count, backoff, and fallback are unspecified, so the behaviour
  on a PSP 5xx or a hang is undefined. Payment capture is a money-moving flow,
  which the Rule names as critical → severity critical.
- A finding on the response section (`:10`): only the success body is defined;
  the 4xx/5xx error contract (code/message/detail/requestId) is missing, so a
  client cannot decide whether to retry.
- A question (per the skill's Questions section) about where idempotency is
  guaranteed — a retried capture must not double-charge.
- A finding that no correlation id, metric, or SLO/alert is defined for the flow.
- No findings about the feature-flag name, the Markdown style, or the choice of
  PSP — those are outside the Rule and inside Non-goals.

<!-- expected:
findings:
  - severity: critical
    reason: 外部 PSP 呼び出しのタイムアウト・リトライ・バックオフ・フォールバックが未定義（課金というクリティカルフロー）
    anchor: docs/design/payment-capture.md:6
  - severity: major
    reason: 成功時のレスポンスのみ定義され、4xx/5xx のエラー契約が欠落している
    anchor: docs/design/payment-capture.md:11
  - severity: major
    reason: 相関ID・メトリクス・SLO/アラートなど観測性の設計が含まれていない
    anchor: docs/design/payment-capture.md:1
questions:
  - リトライ時の二重課金を防ぐ冪等性キーはどこで担保しますか
-->
