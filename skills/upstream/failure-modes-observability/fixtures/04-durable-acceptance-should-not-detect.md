# Fixture 04 — Durable acceptance with explicit failure contract (Should Not Detect)

## Description

Synthetic negative case for the same account-creation concern. The design
states exactly what each acknowledgment means, protects duplicate retries,
defines failure outcomes, and specifies observability. A 202 acknowledgment
means **durable queue acceptance**, not completed database persistence.

This fixture is not a benchmark result and does not attest to a deployed
implementation. The Pre-execution Gate holds because a design diff is supplied.

## Input Diff

\`\`\`diff
diff --git a/docs/design/account-create.md b/docs/design/account-create.md
new file mode 100644
--- /dev/null
+++ b/docs/design/account-create.md
@@ -0,0 +1,21 @@
+# Account creation flow
+
+## Request and durable acceptance
+
+1. POST /accounts requires an Idempotency-Key scoped to the caller.
+2. Validate input and atomically persist the idempotency record plus queue job.
+3. Return 202 { "requestId": "r-123", "status": "accepted" } only after
+   durable acceptance succeeds. 202 never claims the account is created.
+4. If acceptance fails, return 503 with { code, message, requestId };
+   the caller may retry the same key with exponential backoff.
+5. Retrying the same key returns the stored acceptance/result, not a new job.
+
+## Processing, reconciliation, and observability
+
+6. The worker commits the account idempotently and marks the request complete.
+7. Failed processing is retried with bounded attempts; exhausted requests
+   become failed and are visible through GET /requests/{requestId}.
+8. A client that loses a 202 response retries the same key or queries status.
+9. Trace requestId across API, queue and DB; alert on terminal failures and
+   queue age against the documented SLO.
\`\`\`

## Expected Behavior

- No finding for ACK-before-persist: 202 explicitly means durable acceptance,
  not a completed account, and is emitted only after the durable handoff.
- No missing retry, idempotency, error-contract or observability finding:
  each is specified in the design.
- The review may seek implementation evidence separately. Do not assert this
  design was executed or proven correct from prose alone.
- An unconditional demand for synchronous DB commit, or a finding based solely
  on a 202 before worker completion, would be a false positive.

<!-- expected:
findings: []
reason: 202は永続受付のみを意味し、冪等性・後続失敗の照合・エラー契約・観測性が明示されている
-->
