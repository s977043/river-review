# Fixture 02 — Contract reference repointed, terms unchanged (False-Positive Guard)

## Description

The diff changes a document under `docs/integration/`, so the path condition
matches and the gate is satisfied. But the diff only repoints an existing link
to the contract's new location: the contract itself, ownership, failure policy,
and rollout are all defined in the referenced documents, which are unchanged.
This is the skill's guard「参照先の契約ドキュメントが明確で、差分が参照更新のみの
場合は重複指摘しない」.

Repository context (not part of the diff):

```text
docs/contracts/refund-v2.md (existing, unchanged) holds the request/response
schema, required vs optional fields, the additive-only compatibility rule, the
version, the deprecation window for v1, producer/consumer owners with their
SLOs, the idempotency key and duplicate-refund handling, the DLQ policy, the
compensation flow, and the dual-support window with its rollback trigger.

docs/contracts/refund.md was moved to docs/contracts/refund-v2.md in an earlier,
already-merged PR; this diff only fixes the referrer.
```

## Input Diff

```diff
diff --git a/docs/integration/refund-integration.md b/docs/integration/refund-integration.md
--- a/docs/integration/refund-integration.md
+++ b/docs/integration/refund-integration.md
@@ -3,7 +3,7 @@
 ## Contract

 Billing (producer) calls Payments (consumer) to issue refunds. The full
-contract is [refund.md](../contracts/refund.md): schema, required fields,
+contract is [refund-v2.md](../contracts/refund-v2.md): schema, required fields,
 compatibility rule, versioning, owners and SLOs, idempotency and duplicate
 handling, DLQ and compensation, and the dual-support window with its rollback
 trigger.
```

## Expected Behavior

- `findings: []` (a summary line may still be emitted; it is not a finding).
- The diff changes a path, not a term: the contract's schema, compatibility rule,
  owners, failure policy, and rollout plan are unchanged and live in the linked
  document, so re-raising any of them would be the duplicate finding the guard
  forbids.
- The new link target exists, so this is a reference repair rather than a broken
  reference.
- No producer, consumer, field, guarantee, or version changed, so there is no
  compatibility impact to assess.

<!-- expected:
findings: []
reason: 差分は移動済み契約ドキュメントへの参照更新のみで、スキーマ・Owner・失敗時方針・ロールアウトは参照先で不変（重複指摘の抑制条件に該当）
-->
