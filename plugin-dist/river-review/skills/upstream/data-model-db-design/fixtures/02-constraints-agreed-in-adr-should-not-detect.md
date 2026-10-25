# Fixture 02 — Constraints and migration plan agreed in a referenced ADR (False-Positive Guard)

## Description

The diff changes a schema file, adds a table definition with constraints, and
adds an index — the gate is satisfied on every condition. But each Checklist item
the skill would raise is already answered: the constraints are declared inline
with their business reason, the access path is stated and matched by the index,
and the migration, rollback, and retention rules are delegated to an existing,
linked ADR. This is the skill's guard「既に別 ADR/設計で合意済みの制約を参照している
だけなら、重複指摘しない（参照先が明確な場合）」.

Repository context (not part of the diff):

```text
docs/adr/0038-billing-retention.md (existing, unchanged) defines the
expand-contract migration sequence for billing tables, the rollback trigger, the
7-year retention requirement, the archival job schedule, and the audit-trail
requirement for charge rows.
```

## Input Diff

```diff
diff --git a/db/schema/billing.sql b/db/schema/billing.sql
--- a/db/schema/billing.sql
+++ b/db/schema/billing.sql
@@ -40,3 +40,22 @@ CREATE TABLE subscriptions (
   id BIGSERIAL PRIMARY KEY,
   status TEXT NOT NULL
 );
+
+-- Migration, rollback, retention, archival and audit rules for this table:
+-- docs/adr/0038-billing-retention.md (unchanged by this PR).
+CREATE TABLE subscription_charges (
+  id BIGSERIAL PRIMARY KEY,
+  -- FK is RESTRICT: a subscription with charges must not be deleted, because
+  -- charges are financial records retained independently of the subscription.
+  subscription_id BIGINT NOT NULL REFERENCES subscriptions (id) ON DELETE RESTRICT,
+  period_start DATE NOT NULL,
+  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
+  status TEXT NOT NULL,
+  -- Optimistic locking: concurrent billing attempts bump this and retry.
+  version INTEGER NOT NULL DEFAULT 0,
+  -- One row per subscription per billing period.
+  UNIQUE (subscription_id, period_start)
+);
+
+-- Serves the representative query: WHERE subscription_id = $1 ORDER BY period_start DESC.
+CREATE INDEX idx_charges_sub_period ON subscription_charges (subscription_id, period_start DESC);
```

## Expected Behavior

- `findings: []` (a summary line may still be emitted; it is not a finding).
- Primary key, foreign key with an explicit `ON DELETE` and its business reason,
  `NOT NULL`, `CHECK`, the uniqueness rule, and optimistic locking are all
  declared inline, so the 整合性と制約 checklist passes.
- The index matches the stated representative query's filter and sort order, so
  the 性能とインデックス checklist passes.
- Migration sequencing, rollback, retention, archival, and audit are not restated
  here — they are delegated to ADR-0038, which the guard treats as clear.
  Re-raising them would be a duplicate finding.
- The change creates a new table only; no existing table is altered and no
  irreversible operation is present, so no backfill finding is warranted.

<!-- expected:
findings: []
reason: 制約・参照整合性・ロック方針がインラインで理由付きで宣言され、代表クエリとインデックスが一致し、移行・ロールバック・保持要件は ADR-0038 へ委譲済み（重複指摘の抑制条件に該当）
-->
