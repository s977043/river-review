# Fixture 01 — Same state written from two boundaries with no source of truth (Happy Path)

## Description

A data-flow document adds a second writer for an existing entity. Four Checklist
items of this skill fail deterministically from the text alone:

1. **状態所有（Source of Truth）** — 同じ `orders.status` を注文サービスと配送サービス
   の 2 つの境界から更新する設計なのに、どちらが SoT かが明示されず、二重更新を許す
   理由もガードも無い。
2. **境界横断の書き込み** — 配送サービスからの書き込みが同期か非同期か、順序保証が
   あるかが書かれておらず、重複配信への対策（冪等性キー、upsert、dedupe）も無い。
   さらにイベントは at-least-once と明記されている。
3. **整合性と競合** — 強整合か最終整合かの選択も、同時更新の競合解決（楽観ロック、
   解決戦略、再試行方針）も無い。
4. **リカバリ** — 失敗イベントの再処理・リプレイ・DLQ・補償処理の前提が無い。

The Pre-execution Gate is satisfied: the path matches `docs/**/*flow*.md`, and
the diff adds a cross-boundary write to shared state.

## Input Diff

```diff
diff --git a/docs/design/order-flow.md b/docs/design/order-flow.md
--- a/docs/design/order-flow.md
+++ b/docs/design/order-flow.md
@@ -20,2 +20,10 @@
 注文サービスが `orders.status` を更新する。

+## 配送側からの反映
+
+配送サービスは出荷イベントを受け取ったら、自分で `orders.status` を `shipped` に
+更新する。イベント基盤は at-least-once 配信。
+
+同時に注文サービス側でもキャンセル操作で `orders.status` を書き換える。
+
+失敗したイベントについては特に決めていない。
```

## Expected Behavior

- A summary line first (`(summary):1: ...`), naming the new writer and the state
  it touches.
- A finding that `orders.status` is now written from two boundaries with no
  declared source of truth and no guard, so a cancel and a shipment racing on the
  same order silently produce a different final state depending on arrival order.
  Severity critical, with the
  `SoT: <エンティティ>=<所有者境界> / 更新元: <境界> / 反映: <同期/非同期> / 冪等性: <キー>`
  template.
- A finding that the delivery is declared at-least-once while no idempotency key,
  upsert, or dedupe strategy is defined, so a redelivered shipment event can
  overwrite a later state. Severity critical.
- A finding that neither the consistency model (strong vs eventual) nor the
  concurrent-update resolution (optimistic locking, resolution strategy, retry
  policy) is stated, so the user-visible behaviour under conflict is undefined.
  Severity major, with the
  `整合性: <強/最終> / 競合: <方針> / 失敗時: <再試行/補償/再処理>` template.
- A finding that failed events have no reprocessing, replay, DLQ, or compensation
  path, so a dropped shipment event leaves the order permanently stale. Severity
  major.
- At most 8 findings total, per the Rule.
- No general lecture on distributed-systems theory and no queue/DB tuning advice
  — the Non-goals exclude both.

<!-- expected:
findings:
  - severity: critical
    reason: orders.status を注文サービスと配送サービスの 2 境界から更新する設計なのに SoT が明示されず、二重更新を許す理由もガードも無い
    anchor: docs/design/order-flow.md:24
  - severity: critical
    reason: at-least-once 配信を前提としながら冪等性キー・upsert・dedupe のいずれも設計に無く、再配信で後続の状態を上書きしうる
    anchor: docs/design/order-flow.md:25
  - severity: major
    reason: 強整合／最終整合の選択と同時更新の競合解決（楽観ロック・解決戦略・再試行方針）が無く、競合時のユーザー体験が未定義
    anchor: docs/design/order-flow.md:27
  - severity: major
    reason: 失敗イベントの再処理・リプレイ・DLQ・補償処理の前提が無く、イベント欠落時に注文状態が恒久的にずれる
    anchor: docs/design/order-flow.md:29
-->
