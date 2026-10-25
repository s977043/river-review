# Fixture 02 — Ownership and idempotency fully specified inline (False-Positive Guard)

## Description

The diff changes a document under `docs/**/*flow*.md` and it does add a
cross-boundary write, so both content conditions of the Pre-execution Gate are
satisfied. The skill stays silent because every Checklist item it would raise is
answered in the diff itself or in the referenced ownership map that this change
does not touch: the source of truth is declared, the second boundary is
explicitly a reader-and-requester rather than a writer, delivery is
idempotency-keyed, the consistency model and conflict policy are stated, and the
failure path names a DLQ with a compensation step.

Repository context (not part of the diff):

```text
docs/architecture/state-ownership.md (existing, unchanged) records
`orders.status` with owner = order service, allowed transitions, the optimistic
locking column (`orders.lock_version`), and the rule that no other boundary may
write it directly.
```

## Input Diff

```diff
diff --git a/docs/design/order-flow.md b/docs/design/order-flow.md
--- a/docs/design/order-flow.md
+++ b/docs/design/order-flow.md
@@ -20,2 +20,15 @@
 注文サービスが `orders.status` を更新する。

+## 配送側からの反映
+
+`orders.status` の SoT は注文サービス（[状態所有マップ](../architecture/state-ownership.md)
+で管理、本変更では不変）。配送サービスはこれを直接書かず、出荷イベントを
+`ShipmentCompleted` として発行するだけにする。
+
+反映は非同期。注文サービスが購読側で、イベントの `shipmentId` を冪等性キーとして
+`processed_events` に upsert し、既処理なら破棄する（at-least-once 再配信を吸収）。
+更新は `orders.lock_version` の楽観ロックで行い、キャンセル済み注文への出荷反映は
+適用せず `ShipmentAfterCancel` を発行して補償処理へ回す（キャンセル優先）。
+
+整合性は最終整合で、UI では反映待ちを「出荷手続き中」と表示する。処理に 5 回失敗した
+イベントは DLQ へ送り、Runbook の再処理手順でリプレイする。相関IDは `orderId` を使う。
```

## Expected Behavior

- `findings: []` (a summary line may still be emitted; it is not a finding).
- Source of truth is declared and the second boundary is explicitly not a writer,
  so the dual-write concern does not exist here.
- At-least-once redelivery is absorbed by a named idempotency key and a processed-
  event upsert, and concurrent updates are resolved by optimistic locking with a
  stated precedence rule (cancel wins) and a compensation event.
- The consistency model is chosen (eventual) and its user-visible effect is
  described, satisfying the 整合性と競合 checklist item rather than leaving it open.
- Recovery is specified: a retry bound, a DLQ, and a replay procedure; tracking
  uses `orderId` as the correlation id, satisfying the 監査と追跡 item.

<!-- expected:
findings: []
reason: SoT が注文サービスと明示され配送側は書き込まない設計、冪等性キー・楽観ロック・優先規則・補償イベント・最終整合の選択・DLQ とリプレイ・相関IDまで揃っており全チェックリスト項目が充足している
-->
