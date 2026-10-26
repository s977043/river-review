# Fixture 02 — New-table constraints and a declared contract phase (False-Positive Guard)

## Description

The diff is under `db/migrations/` and contains `CREATE`, `ALTER`, and `DROP`
statements, so the gate is satisfied on every condition. Three of this skill's
guards then apply in turn:

- 「新規テーブル作成内の index/制約追加は既存行へのロックが無いため指摘しない」 —
  the index and constraints are created on a table this same migration creates,
  which holds no rows.
- 「破壊的操作が『別 PR で deprecate 済み／expand-contract の contract フェーズ』
  と明示されている場合は指摘しない」 — the `DROP COLUMN` is labelled as the
  contract phase, with the expand and migrate phases named and already shipped.
- 「小規模テーブルが diff／文脈から確実な場合はロック懸念を断定しない」 — the
  altered table's size is stated in the file as a bounded lookup table.

## Input Diff

```diff
diff --git a/db/migrations/20260812_shipping_zones_contract.sql b/db/migrations/20260812_shipping_zones_contract.sql
new file mode 100644
--- /dev/null
+++ b/db/migrations/20260812_shipping_zones_contract.sql
@@ -0,0 +1,23 @@
+-- Engine: PostgreSQL 16.
+
+-- up
+-- (1) New table: no existing rows, so constraints and indexes take no lock.
+CREATE TABLE shipping_zone_rates (
+  id BIGSERIAL PRIMARY KEY,
+  zone_id BIGINT NOT NULL REFERENCES shipping_zones (id) ON DELETE RESTRICT,
+  rate_cents INTEGER NOT NULL CHECK (rate_cents >= 0)
+);
+CREATE INDEX idx_zone_rates_zone ON shipping_zone_rates (zone_id);
+
+-- (2) contract phase of expand-contract. expand (add shipping_zones.rate_cents,
+-- nullable) shipped in 20260701_expand.sql; migrate (dual-write + backfill +
+-- verification) shipped in 20260715_migrate.sql and has been complete in
+-- production since 2026-07-22. No reader references legacy_rate any more.
+-- shipping_zones is a bounded lookup table: 84 rows.
+ALTER TABLE shipping_zones DROP COLUMN legacy_rate;
+
+-- down
+-- Irreversible by design: legacy_rate is superseded by rate_cents, whose values
+-- were verified equal before this contract step. Restoring the dropped column
+-- would recreate a duplicate source of truth. Recovery path is PITR.
+ALTER TABLE shipping_zones ADD COLUMN legacy_rate INTEGER;
```

## Expected Behavior

- `findings: []` (a summary line may still be emitted; it is not a finding).
- The `NOT NULL`, `CHECK`, foreign key, and index all land on a table created in
  the same migration, so no existing row is locked or rewritten — the new-table
  guard applies.
- The `DROP COLUMN` is explicitly the contract phase of a completed
  expand-contract sequence, with the prior migrations named and the cutover date
  stated, so the destructive-operation guard applies.
- The irreversible `down` is data-transforming and is marked as intentional with
  its reasoning and a recovery path, which Rule 5 and the guard both permit.
- Table size is stated (84 rows), so a lock concern must not be asserted — the
  guard directs uncertainty to `questions`, and here there is no uncertainty.

<!-- expected:
findings: []
reason: 制約・index は同一移行で新規作成したテーブル上（既存行なし）、DROP は完了済み expand-contract の contract フェーズと明示、不可逆な down も理由と復旧経路付きで明示、対象テーブル規模も 84 行と確定（いずれも抑制条件に該当）
-->
