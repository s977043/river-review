# Fixture 02 — Guarantees managed in a referenced AsyncAPI contract (False-Positive Guard)

## Description

The diff changes a document under `docs/design/` matching `*event*.md`, and it
adds a consumer to an event topic — the gate is satisfied. But every Checklist
item the skill would raise is already answered: delivery guarantee, ordering
key, idempotency, schema-evolution rule, replay policy, and DLQ handling all
live in an existing AsyncAPI contract that this document links to and does not
change. This is the skill's guard「契約が別ドキュメントで管理され、参照が明確な場合
は重複指摘しない」.

Repository context (not part of the diff):

```text
contracts/wallet-asyncapi.yaml (existing, unchanged) declares for
`wallet.balance_changed`: at-least-once delivery, `walletId` as the partition
key with ordering guaranteed within a key, `eventId` as the dedupe key with a
24h dedupe window, additive-only schema evolution with a 90-day deprecation
window, a 7-day replay window with the backfill procedure, and the DLQ topic
with its reprocessing runbook.
```

## Input Diff

```diff
diff --git a/docs/design/wallet-events.md b/docs/design/wallet-events.md
--- a/docs/design/wallet-events.md
+++ b/docs/design/wallet-events.md
@@ -8,9 +8,15 @@

 Delivery guarantees, ordering, dedupe, schema evolution, replay and DLQ for
 this topic are defined in
 [contracts/wallet-asyncapi.yaml](../../contracts/wallet-asyncapi.yaml)
 and are unchanged by this document.

 ## Consumers

 - Ledger — maintains the authoritative balance.
+- Notifications — sends a low-balance alert. Consumes the same topic under the
+  contract above: dedupes on `eventId`, treats the event as advisory (a missed
+  or duplicated alert is not a correctness failure), and needs no ordering
+  beyond the per-`walletId` guarantee the contract already provides. Adds no
+  field, changes no schema, and introduces no new failure mode: on error the
+  message follows the contract's existing DLQ path.
```

## Expected Behavior

- `findings: []` (a summary line may still be emitted; it is not a finding).
- Delivery guarantee, ordering key, dedupe key and window, schema-evolution rule,
  replay window, and DLQ handling are not restated here — they are delegated to
  the linked AsyncAPI contract, which the guard treats as clear. Re-raising them
  would be a duplicate finding.
- The diff adds a consumer without changing the schema or introducing a new
  failure mode, and it states the idempotency and ordering requirements the new
  consumer places on the existing contract, showing they are already met.
- Observability is inherited from the same unchanged contract, so no monitoring
  finding is warranted.

<!-- expected:
findings: []
reason: 配信保証・順序キー・dedupe・スキーマ進化・リプレイ・DLQ は不変の AsyncAPI 契約で管理され参照が明確、追加 consumer もその契約内に収まる（重複指摘の抑制条件に該当）
-->
