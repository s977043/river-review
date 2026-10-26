# Fixture 02 — ADR that only records a reference to an agreed decision (False-Positive Guard)

## Description

The path is under `docs/adr/`, so the first gate condition matches. The diff
marks ADR-0031 as superseded and points at ADR-0060, where the decision, the
alternatives, the tradeoffs, and the follow-ups were already agreed. No new
decision content is introduced here. This is the skill's guard
"既に別 ADR で合意済みの内容を単に参照しているだけなら、重複指摘しない（参照先が明確な場合）".

Repository context (not part of the diff):

```text
docs/adr/0060-order-events-v2.md (existing, unchanged) contains Context,
Decision, two Alternatives with rejection reasons and tradeoffs, success
criteria, and dated Follow-ups with an owner.
```

## Input Diff

```diff
diff --git a/docs/adr/0031-order-events.md b/docs/adr/0031-order-events.md
--- a/docs/adr/0031-order-events.md
+++ b/docs/adr/0031-order-events.md
@@ -1,5 +1,8 @@
 # ADR-0031: Order event schema v1

-Status: Accepted
+Status: Superseded by [ADR-0060](./0060-order-events-v2.md)
+
+The decision, alternatives, tradeoffs, success criteria, and follow-ups for the
+successor are recorded in ADR-0060. No new decision is made in this file.

 ## Context
```

## Expected Behavior

- `findings: []`.
- The missing Alternatives / success criteria / Follow-ups belong to the
  successor ADR, which is linked explicitly. Demanding them here would duplicate
  the referenced decision, which the guard forbids.
- A status transition to `Superseded by <link>` is the documented lifecycle of an
  ADR, not a decision-quality defect.
- The second gate condition ("ADRの意思決定内容に実質的な変更を含んでいる") is not
  met, so `NO_REVIEW: adr-decision-quality — ADR関連ファイルの実質的変更なし` is an
  acceptable output as well; either way, no finding is emitted.

<!-- expected:
findings: []
reason: 意思決定の実体は ADR-0060 にあり、本差分は supersede の参照更新のみ（参照先が明確なため重複指摘の抑制条件に該当）
-->
