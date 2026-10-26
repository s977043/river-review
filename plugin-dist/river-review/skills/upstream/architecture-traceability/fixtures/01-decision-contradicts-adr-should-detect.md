# Fixture 01 — Design contradicts an ADR, with a stale diagram and a dead link (Happy Path)

## Description

An architecture document changes a decision. Four Checklist items of this skill
fail deterministically from the text and the repository contents:

1. **ADR との整合** — the document adopts synchronous HTTP where the ADR it
   itself cites decided on asynchronous events, and it does not say the ADR will
   be updated.
2. **図との整合** — the same directory's C4 diagram still shows the event topic
   as the only edge between the two components; the diff does not touch it.
3. **仕様との整合** — the referenced spec path does not exist in the repository,
   and the component is called `OrderSync` here but `OrderBridge` in the diagram
   that this document links to.
4. **ドリフトの扱い** — the open item is recorded as a bare `TODO` with no owner
   and no due date.

The Pre-execution Gate is satisfied: the path is under `docs/architecture/`, and
the diff changes decisions, components, and contracts.

Repository context (not part of the diff):

```text
docs/adr/0021-order-fulfilment-integration.md (existing, unchanged) decides on
asynchronous events for Orders → Fulfilment.

docs/architecture/order-sync-c4.md (existing, unchanged) shows `OrderBridge`
publishing `order.confirmed` to Fulfilment as the only edge between the two.

docs/architecture/specs/ does not exist in the repository.
```

## Input Diff

```diff
diff --git a/docs/architecture/order-sync.md b/docs/architecture/order-sync.md
--- a/docs/architecture/order-sync.md
+++ b/docs/architecture/order-sync.md
@@ -1,13 +1,14 @@
 # Order Sync

-Integration between Orders and Fulfilment is asynchronous, per
-[ADR-0021](../adr/0021-order-fulfilment-integration.md).
+Integration between Orders and Fulfilment is now a synchronous HTTP call from
+`OrderSync` to Fulfilment, per
+[ADR-0021](../adr/0021-order-fulfilment-integration.md).

 ## Contract

-The `order.confirmed` event schema is in
-[the event catalogue](./events.md).
+The request/response schema is in
+[the sync API spec](./specs/order-sync-api.md).

 ## Open items

-None.
+TODO: decide the timeout and retry budget.
```

## Expected Behavior

- A summary line first (`(summary):1: ...`), naming the changed decision and the
  consistency impact.
- A finding that the document adopts synchronous HTTP while citing ADR-0021,
  whose decision is asynchronous events: the citation now contradicts the text,
  and no "ADR-0021 を更新する" statement accompanies the change. Severity major,
  with a paste-ready `この変更に対応する ADR-0021 を更新/Supersede する` line.
- A finding that `docs/architecture/order-sync-c4.md` still shows only the event
  topic edge between Orders and Fulfilment and is not updated by this diff, so
  the diagram and the body disagree on the dependency. Severity major.
- A finding that `./specs/order-sync-api.md` does not exist in the repository —
  a broken reference introduced by this diff. Severity major.
- A finding on the terminology drift: this document says `OrderSync` while the
  linked diagram says `OrderBridge` for the same component. Severity minor.
- A finding that the open item is a bare `TODO` with no owner and no due date, so
  the known drift is not tracked. Severity minor.
- At most 8 findings total, per the Rule.
- No findings about the wisdom of choosing synchronous over asynchronous — the
  skill's Non-goals exclude declaring the correct design.

<!-- expected:
findings:
  - severity: major
    reason: 同期 HTTP へ変更しながら非同期イベントを決定した ADR-0021 を引用したままで、ADR 更新の宣言も無い
    anchor: docs/architecture/order-sync.md:3
  - severity: major
    reason: 同ディレクトリの C4 図がイベントトピック経由のエッジのみを示したまま更新されておらず、本文と依存関係が食い違う
    anchor: docs/architecture/order-sync.md:3
  - severity: major
    reason: 参照先 ./specs/order-sync-api.md がリポジトリに存在せず、この差分で参照切れが持ち込まれている
    anchor: docs/architecture/order-sync.md:9
  - severity: minor
    reason: 同一コンポーネントの名称が本文の OrderSync と図の OrderBridge で揺れている
    anchor: docs/architecture/order-sync.md:3
  - severity: minor
    reason: 未決事項が担当・期限の無い TODO のまま残され、ドリフトのフォローアップが追跡できない
    anchor: docs/architecture/order-sync.md:14
-->
