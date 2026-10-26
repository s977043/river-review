# Fixture 01 — Cross-service contract with no owner, no failure policy, no rollout (Happy Path)

## Description

An integration document introduces a new producer/consumer relationship. Four
Checklist items of this skill fail deterministically from the text alone:

1. **契約** — the payload is described in prose with no statement of which fields
   are required, no compatibility rule, and no version.
2. **Owner と責任境界** — neither producer nor consumer names an owner, an SLA
   assumption, or a contact point, and the document does not say where the
   producer's responsibility ends.
3. **失敗時の振る舞い** — retries are described as "the client retries" with no
   idempotency key, no duplicate-delivery handling, and no dead-letter or
   compensation policy, even though the operation charges money.
4. **ロールアウト/ロールバック** — the document states both sides ship together,
   with no dual-support window and no rollback condition.

The Pre-execution Gate is satisfied: the path matches
`docs/**/*integration*.md`, and the diff adds an interface and contract
description.

## Input Diff

```diff
diff --git a/docs/integration/refund-integration.md b/docs/integration/refund-integration.md
new file mode 100644
--- /dev/null
+++ b/docs/integration/refund-integration.md
@@ -0,0 +1,14 @@
+# Refund integration
+
+## Overview
+
+Billing calls the Payments service to issue refunds. The request carries the
+order id, an amount, and a reason string. The response carries a refund id.
+
+## Failure handling
+
+If the call fails, the client retries.
+
+## Rollout
+
+Billing and Payments deploy the change together in the same release.
```

## Expected Behavior

- A summary line first (`(summary):1: ...`), naming the producer, the consumer,
  and the contract change.
- A finding on the contract: required vs optional fields, field types, the
  compatibility rule, and a version are all absent, so two teams can implement
  divergent shapes from the same document. Severity major.
- A finding on ownership: no owner for either side, no SLA/SLO assumption, no
  contact point, and no statement of where the producer's responsibility ends.
  Severity major, with a paste-ready
  `Owner: producer=<team>, consumer=<team> / 互換性: <> / 移行: <>` template.
- A finding on failure handling: an unqualified retry on a money-moving operation
  with no idempotency key means a duplicated refund. Duplicate delivery, ordering,
  dead-lettering, and compensation are all undefined. Severity critical, with a
  paste-ready `失敗時: retry=<>, idempotency=<key>, DLQ=<>, 補償=<>` template.
- A finding on rollout: shipping both sides in one release leaves no dual-support
  window and no rollback condition, so rolling back either side breaks the other.
  Severity major.
- At most 8 findings total, per the Rule.
- No findings about which HTTP library or queue technology to use — the skill's
  Non-goals exclude implementation-level detail.

<!-- expected:
findings:
  - severity: critical
    reason: 送金を伴う操作に対して冪等キーが無いまま無条件リトライを規定しており、重複配信・重複返金の扱いと DLQ・補償方針が未定義
    anchor: docs/integration/refund-integration.md:10
  - severity: major
    reason: 必須/任意・型・互換性ルール・バージョンが未記載で、producer と consumer が異なる形を実装しうる
    anchor: docs/integration/refund-integration.md:5
  - severity: major
    reason: producer/consumer の Owner・SLA 前提・問い合わせ窓口・責任分界点がいずれも記載されていない
    anchor: docs/integration/refund-integration.md:1
  - severity: major
    reason: 両者を同一リリースで同時デプロイする前提で、両対応期間もロールバック条件も無い
    anchor: docs/integration/refund-integration.md:14
-->
