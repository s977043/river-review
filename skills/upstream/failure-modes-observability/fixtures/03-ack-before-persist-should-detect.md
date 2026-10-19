# Fixture 03 — Success ACK before durable write (Should Detect)

## Description

Synthetic design-review case, **not a confirmed customer incident**. A new
account creation design acknowledges success before its durable write has
completed. It defines no recovery contract for write failure or duplicate
requests. This is a critical user journey; successful-looking output does not
establish that an account can be used. The diff touches docs and supplies diff
context, so the Pre-execution Gate holds.

## Input Diff

\`\`\`diff
diff --git a/docs/design/account-create.md b/docs/design/account-create.md
new file mode 100644
--- /dev/null
+++ b/docs/design/account-create.md
@@ -0,0 +1,12 @@
+# Account creation flow
+
+## Sequence
+
+1. Validate POST /accounts and generate an account ID.
+2. Return 200 { "status": "created", "accountId": "a-123" } immediately.
+3. Persist the account to the database asynchronously after the response.
+
+## Error handling
+
+The client may retry on network timeout.
+No further response or reconciliation is required.
\`\`\`

## Expected Behavior

- A major finding anchored to docs/design/account-create.md:6-7:
  success is acknowledged before durability, and the write can fail after
  the client has been told that the account exists.
- A major finding at docs/design/account-create.md:10-12:
  the failure/retry/idempotency contract is missing. A lost response, duplicate
  POST, and failed persistence have no defined reconciliation outcome.
- Ask whether the API promises completed account creation or only accepted
  work; require a matching response contract and observability.
- Do not claim an actual incident, a reproduced race, or that merely changing
  200 to 202 fixes it. An accepted-work response needs a durable acceptance
  boundary and a way to query eventual outcome.

<!-- expected:
findings:
  - severity: major
    reason: 永続化の完了前に成功を返しており、保存失敗時も成功したように見える
    anchor: docs/design/account-create.md:6
  - severity: major
    reason: リトライ時の冪等性と失敗した保存の回復・照合契約が無い
    anchor: docs/design/account-create.md:10
questions:
  - この応答は永続化完了を保証するのか、永続受付のみを意味するのか
-->
