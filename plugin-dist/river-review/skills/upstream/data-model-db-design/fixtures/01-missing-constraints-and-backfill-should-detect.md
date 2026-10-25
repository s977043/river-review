# Fixture 01 — New table without integrity constraints and an unplanned migration (Happy Path)

## Description

A schema definition adds a table and an index. Three Checklist items of this
skill fail deterministically from the DDL alone:

1. **整合性と制約** — `subscription_id` is documented in the same file as
   pointing at `subscriptions.id`, yet no foreign key and no `ON DELETE`
   behaviour are declared, and the pair meant to be unique per period has no
   unique constraint. `amount_cents` is nullable although the comment calls it
   mandatory.
2. **移行とロールバック** — the file adds a `NOT NULL` column to the existing
   `invoices` table with no default and no backfill or staged-migration plan, and
   no rollback procedure for the accompanying `DROP`.
3. **性能とインデックス** — the only index added is on a low-cardinality status
   column that the file itself says is updated on every write, while the stated
   representative query filters by `subscription_id, period_start`.

The Pre-execution Gate is satisfied: the path matches `**/*schema*.sql`, and the
diff adds table definitions, constraints, indexes, and migration statements.

## Input Diff

```diff
diff --git a/db/schema/billing.sql b/db/schema/billing.sql
--- a/db/schema/billing.sql
+++ b/db/schema/billing.sql
@@ -40,3 +40,23 @@ CREATE TABLE subscriptions (
   id BIGSERIAL PRIMARY KEY,
   status TEXT NOT NULL
 );
+
+-- One row per subscription per billing period.
+-- subscription_id points at subscriptions.id.
+-- amount_cents is mandatory; every charge has an amount.
+-- status is updated on every billing attempt.
+CREATE TABLE subscription_charges (
+  id BIGSERIAL PRIMARY KEY,
+  subscription_id BIGINT,
+  period_start DATE,
+  amount_cents INTEGER,
+  status TEXT
+);
+
+-- Representative query:
+--   SELECT * FROM subscription_charges
+--   WHERE subscription_id = $1 AND period_start = $2;
+CREATE INDEX idx_charges_status ON subscription_charges (status);
+
+ALTER TABLE invoices ADD COLUMN charge_id BIGINT NOT NULL;
+ALTER TABLE invoices DROP COLUMN legacy_amount;
```

## Expected Behavior

- A summary line first (`(summary):1: ...`), naming the new table, the altered
  table, and the migration impact.
- A finding on the missing referential integrity: `subscription_id` has no
  foreign key and no `ON DELETE`/`ON UPDATE` behaviour despite the stated
  relationship, and there is no unique constraint on
  `(subscription_id, period_start)` despite the stated one-row-per-period rule.
  Severity major, with a paste-ready
  `制約: ... / 理由: ... / 例外: ...` template.
- A finding on `amount_cents` and `period_start` being nullable although the
  comment declares them mandatory. Severity major.
- A finding on `ALTER TABLE invoices ADD COLUMN charge_id BIGINT NOT NULL`: with
  existing rows and no default, the statement cannot succeed, and no backfill or
  staged migration (add nullable → backfill → constrain) is described. Severity
  critical.
- A finding on `DROP COLUMN legacy_amount`: an irreversible operation with no
  rollback condition or data-retention statement. Severity critical.
- A finding that the index does not serve the stated representative query, while
  indexing a column the file says is updated on every write. Severity minor.
- At most 8 findings total, per the Rule.
- No findings about SQL keyword casing or comment wording.

<!-- expected:
findings:
  - severity: critical
    reason: 既存行のある invoices へ default 無しの NOT NULL 列を追加しており、backfill や段階移行（列追加 → backfill → 制約化）の計画が無い
    anchor: db/schema/billing.sql:61
  - severity: critical
    reason: DROP COLUMN legacy_amount が不可逆操作でありながらロールバック条件もデータ退避方針も示されていない
    anchor: db/schema/billing.sql:62
  - severity: major
    reason: subscription_id に外部キーと ON DELETE/UPDATE の指定が無く、同ファイルが宣言する 1 期間 1 行の業務ルールに対応するユニーク制約も無い
    anchor: db/schema/billing.sql:50
  - severity: major
    reason: コメントで必須と宣言している amount_cents と period_start が NULL 許容のまま定義されている
    anchor: db/schema/billing.sql:52
  - severity: minor
    reason: 追加インデックスが記載の代表クエリ（subscription_id, period_start）のアクセスパスに対応せず、毎回更新される低カーディナリティ列に張られている
    anchor: db/schema/billing.sql:59
-->
