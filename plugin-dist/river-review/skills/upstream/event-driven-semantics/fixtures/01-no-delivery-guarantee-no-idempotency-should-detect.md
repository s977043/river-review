# Fixture 01 — Event design with no delivery guarantee, ordering, or replay policy (Happy Path)

## Description

An event design document adds a topic and a consumer. Four Checklist items of
this skill fail deterministically from the text alone:

1. **配信保証と重複** — the document never states the delivery guarantee, and the
   consumer applies a balance delta with no idempotency key or dedupe, so a
   redelivery double-applies the amount.
2. **順序とキー** — no partition key and no ordering assumption are stated, yet
   the consumer's stated logic (apply delta in arrival order) depends on order,
   and out-of-order or late arrival has no defined handling.
3. **スキーマ進化** — a field is removed in the same diff with no compatibility
   rule, no version, and no deprecation window or staged producer/consumer
   update.
4. **再処理/リプレイ** — replay, backfill, and poison-message handling are
   declared out of scope with no alternative named.

The Pre-execution Gate is satisfied: the path matches `docs/**/*event*.md`, and
the diff adds event and messaging definitions.

## Input Diff

```diff
diff --git a/docs/design/wallet-events.md b/docs/design/wallet-events.md
new file mode 100644
--- /dev/null
+++ b/docs/design/wallet-events.md
@@ -0,0 +1,16 @@
+# Wallet events
+
+## Topic
+
+`wallet.balance_changed` carries `{ walletId, deltaCents, occurredAt }`.
+The previous `balanceAfterCents` field is removed: consumers can compute it.
+
+## Consumer
+
+The Ledger service adds `deltaCents` to the stored balance as each message
+arrives.
+
+## Out of scope
+
+Replay, backfill, and poison-message handling are out of scope for this
+iteration.
```

## Expected Behavior

- A summary line first (`(summary):1: ...`), naming the new event and its
  consumer impact.
- A finding that no delivery guarantee is stated and the consumer applies a
  non-idempotent delta: under at-least-once delivery — the default for the
  messaging systems in use — a redelivery silently double-credits a wallet.
  Severity critical, with a paste-ready
  `保証: at-least-once / 冪等性: key=<>, dedupe=<>, 重複時: <扱い>` template.
- A finding that no partition key or ordering scope is declared while the
  consumer's arrival-order accumulation depends on ordering, and late or
  reordered arrivals have no stated resolution. Severity major, with a
  paste-ready `順序: key=<walletId>, 保証範囲=<同一キー内のみ> / 乱順: <扱い>`
  template.
- A finding on removing `balanceAfterCents`: a breaking schema change with no
  compatibility rule, no version, and no deprecation window or staged
  producer/consumer rollout. Severity critical.
- A finding that declaring replay, backfill, and poison messages out of scope
  leaves a stuck message with no recovery path once the topic is live. Severity
  major.
- A finding that no `eventId`/`correlationId` or consumer-lag monitoring
  assumption is stated, so duplicate application cannot be detected after the
  fact. Severity minor.
- At most 8 findings total, per the Rule.
- No findings recommending a specific broker — the skill's Non-goals exclude
  adjudicating Kafka vs SQS.

<!-- expected:
findings:
  - severity: critical
    reason: 配信保証が未記載のまま consumer が非冪等な差分加算を行っており、再配信で残高が二重反映される
    anchor: docs/design/wallet-events.md:10
  - severity: critical
    reason: balanceAfterCents の削除が破壊的スキーマ変更でありながら互換性ルール・version・deprecated 期間・段階更新手順が無い
    anchor: docs/design/wallet-events.md:6
  - severity: major
    reason: partition key と順序保証範囲が未宣言なのに consumer が到着順の累積に依存しており、乱順・遅延到着の扱いが定義されていない
    anchor: docs/design/wallet-events.md:10
  - severity: major
    reason: リプレイ・backfill・poison message を対象外と宣言しており、詰まったメッセージの復旧経路が存在しない
    anchor: docs/design/wallet-events.md:15
  - severity: minor
    reason: eventId/correlationId や consumer lag の監視前提が無く、重複反映を事後に検知できない
    anchor: docs/design/wallet-events.md:5
-->
