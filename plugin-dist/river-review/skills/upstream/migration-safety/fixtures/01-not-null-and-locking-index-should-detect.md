# Fixture 01 — NOT NULL without default, locking index, and an irreversible down (Happy Path)

## Description

A migration touches an existing, large table. Four Rule items of this skill fail
deterministically from the SQL alone:

1. **NOT NULL + default 無し** (Rule 3) — a `NOT NULL` column is added to a table
   the migration's own comment describes as holding 40M rows, with no default.
2. **ロック誘発** (Rule 2) — a plain `CREATE INDEX` on that same table blocks
   writes for the duration; the file is PostgreSQL, where
   `CREATE INDEX CONCURRENTLY` is the non-blocking form.
3. **backfill 安全性** (Rule 4) — the backfill is a single unbatched `UPDATE`
   over all 40M rows inside one transaction.
4. **ロールバック可逆性** (Rule 5) — the `down` drops a column the `up` populated
   from data it also deleted, so rolling back loses data, and nothing marks this
   as intentional.

The Pre-execution Gate is satisfied: the path is under `db/migrations/`, and the
diff contains `ALTER`/`CREATE`/`UPDATE` statements.

## Input Diff

```diff
diff --git a/db/migrations/20260812_add_orders_channel.sql b/db/migrations/20260812_add_orders_channel.sql
new file mode 100644
--- /dev/null
+++ b/db/migrations/20260812_add_orders_channel.sql
@@ -0,0 +1,16 @@
+-- orders currently holds ~40M rows (production, 2026-08).
+-- Engine: PostgreSQL 16.
+
+-- up
+BEGIN;
+ALTER TABLE orders ADD COLUMN channel TEXT NOT NULL;
+UPDATE orders SET channel = legacy_source;
+ALTER TABLE orders DROP COLUMN legacy_source;
+CREATE INDEX idx_orders_channel ON orders (channel);
+COMMIT;
+
+-- down
+BEGIN;
+DROP INDEX idx_orders_channel;
+ALTER TABLE orders DROP COLUMN channel;
+COMMIT;
```

## Expected Behavior

- A summary line first (`(migration-safety):1: [要約] ...`), naming the single
  most dangerous operation.
- A finding on `ADD COLUMN channel TEXT NOT NULL`: with 40M existing rows and no
  default, the statement fails outright or rewrites every row. Fix: add the
  column nullable (or with a default), backfill, then add the `NOT NULL`
  constraint — the expand-contract sequence of Rule 6. Severity critical.
- A finding on `UPDATE orders SET channel = legacy_source`: an unbatched update
  of 40M rows in one transaction holds locks, bloats WAL, and lags replicas. Fix:
  batch with a bounded key range and a per-batch commit. Severity critical.
- A finding on `DROP COLUMN legacy_source` in the same transaction as the
  backfill it reads from: the source of truth is destroyed before the new column
  is verified, and the `down` therefore cannot restore it — the rollback loses
  data with no comment marking the irreversibility as intentional. Severity
  critical.
- A finding on `CREATE INDEX idx_orders_channel`: on PostgreSQL this blocks
  writes to a 40M-row table for the build. Fix: `CREATE INDEX CONCURRENTLY`
  outside a transaction block. Severity major.
- Each finding states 操作 / 影響 / Fix, per the Output section.
- No findings about ORM-specific APIs — the skill's Non-goals delegate those to
  framework-specific skills, and this file is raw SQL.

<!-- expected:
findings:
  - severity: critical
    reason: 既存 40M 行のテーブルへ default 無しの NOT NULL 列を追加しており、失敗するか全行書き換えになる（expand-contract で段階化すべき）
    anchor: db/migrations/20260812_add_orders_channel.sql:6
  - severity: critical
    reason: 40M 行の backfill を単一トランザクションの無分割 UPDATE で実行しており、ロック保持・WAL 肥大・レプリケーション遅延を招く
    anchor: db/migrations/20260812_add_orders_channel.sql:7
  - severity: critical
    reason: backfill 元の legacy_source を同一トランザクションで DROP しており、down が channel を落とすだけでデータを復元できず不可逆（意図的である旨の明示も無い）
    anchor: db/migrations/20260812_add_orders_channel.sql:8
  - severity: major
    reason: PostgreSQL で 40M 行のテーブルへ CONCURRENTLY 無しの CREATE INDEX を実行しており、構築中の書き込みがブロックされる
    anchor: db/migrations/20260812_add_orders_channel.sql:9
-->
