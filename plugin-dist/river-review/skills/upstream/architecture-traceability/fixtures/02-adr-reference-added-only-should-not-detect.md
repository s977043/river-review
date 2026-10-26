# Fixture 02 — Reference to an existing ADR added, consistency preserved (False-Positive Guard)

## Description

The diff is under `docs/architecture/`, and it changes text about a decision and
a contract, so the gate is satisfied on every condition. But nothing drifts: the
diff only records where the already-made decision lives, the decision text
matches ADR-0021, the diagram is unchanged because no component, dependency, or
boundary changed, the component name matches the diagram, and the one open item
carries an owner and a due date. This is the skill's guard「明確に "既存 ADR への
参照追加のみ" で、整合性が保たれている場合は重複指摘しない」.

Repository context (not part of the diff):

```text
docs/adr/0021-order-fulfilment-integration.md (existing, unchanged) decides on
asynchronous events for Orders → Fulfilment and states the trade-off.

docs/architecture/order-sync-c4.md (existing, unchanged) shows `OrderBridge`
publishing `order.confirmed` to Fulfilment — the same single edge the body
describes.

docs/architecture/events.md (existing, unchanged) holds the `order.confirmed`
schema and its versioning rule.
```

## Input Diff

```diff
diff --git a/docs/architecture/order-sync.md b/docs/architecture/order-sync.md
--- a/docs/architecture/order-sync.md
+++ b/docs/architecture/order-sync.md
@@ -1,12 +1,15 @@
 # Order Sync

-Integration between Orders and Fulfilment is asynchronous.
+Integration between Orders and Fulfilment is asynchronous, decided in
+[ADR-0021](../adr/0021-order-fulfilment-integration.md). `OrderBridge`
+publishes `order.confirmed`; see [the C4 view](./order-sync-c4.md).

 ## Contract

 The `order.confirmed` event schema is in
 [the event catalogue](./events.md).

 ## Open items

-None.
+- Confirm the retention window for replayed events — owner: @platform-oncall,
+  due 2026-09-30, tracked in #1799.
```

## Expected Behavior

- `findings: []` (a summary line may still be emitted; it is not a finding).
- The added text restates the decision ADR-0021 already holds and links to it;
  it introduces no decision of its own, so there is nothing for the ADR to fall
  out of step with. Re-raising it would be the duplicate finding the guard
  forbids.
- No component, dependency, or responsibility changed, so the unchanged C4 view
  is correct rather than stale, and the name `OrderBridge` matches it.
- The event schema and versioning rule are delegated to the event catalogue, and
  both links resolve to files that exist.
- The single open item carries an owner, a due date, and an issue reference, so
  the ドリフトの扱い checklist passes.

<!-- expected:
findings: []
reason: 既存 ADR-0021 への参照追加のみで決定内容は不変、図・用語・契約参照も一致し、未決事項は担当と期限付きで追跡されている（重複指摘の抑制条件に該当）
-->
