# Fixture 02 — Boundary already defined in a referenced ADR (False-Positive Guard)

## Description

The diff is under `docs/architecture/`, so the path condition matches, and it
does add a dependency statement — the gate is satisfied. But every Checklist
item the skill would otherwise flag is already answered: responsibility,
Non-goals, and Owner are stated inline, the dependency direction matches the
project rule and its reason is given, the change impact is enumerated, and the
cross-boundary contract is delegated to an existing, linked ADR. This is the
skill's guard "既に参照先（ADR/図/既存ルール）で明確な場合は、重複指摘しない".

Repository context (not part of the diff):

```text
docs/adr/0031-order-events-contract.md (existing, unchanged) defines the
`order.confirmed` event schema, its versioning rule, the error model, retry
policy, and idempotency key.
```

## Input Diff

```diff
diff --git a/docs/architecture/order-export.md b/docs/architecture/order-export.md
new file mode 100644
--- /dev/null
+++ b/docs/architecture/order-export.md
@@ -0,0 +1,22 @@
+# Order Export
+
+## Responsibility
+
+Turns `order.confirmed` events into a nightly CSV for the finance team.
+
+## Non-goals
+
+Does not read the order database directly, and does not own order state.
+
+Owner: Platform team (on-call rota `platform-oncall`).
+
+## Dependencies
+
+- `Application/OrderExport` → `Infrastructure/ObjectStorage` (write the CSV;
+  direction follows the project rule Application → Infrastructure).
+
+## Change impact
+
+Finance nightly job (new consumer), object-storage cost (+2GB/month), no API or
+database change. The cross-boundary event contract is
+[ADR-0031](../adr/0031-order-events-contract.md) and is unchanged.
```

## Expected Behavior

- `findings: []` (a summary line may still be emitted; it is not a finding).
- The event contract, error model, retry policy, and idempotency are not restated
  here — they are delegated to a linked ADR, which the guard treats as clear.
  Re-raising them would be a duplicate finding.
- The dependency edge is single-directional and its reason is stated, so the
  依存方向 checklist passes.

<!-- expected:
findings: []
reason: 責務・Non-goals・Owner・依存方向とその理由・変更影響がインラインで明示され、境界を跨ぐ契約は ADR-0031 へ委譲済み（重複指摘の抑制条件に該当）
-->
