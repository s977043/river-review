# Fixture 01 — Assumptions, risks, and open questions left unowned (Happy Path)

## Description

A design document adds a section that states assumptions, risks, and open
questions, but none of them are managed. Four Checklist items of this skill fail
deterministically from the text alone:

1. **Assumptions（前提）** — the assumption「レガシー側の会員データは重複が無い」は
   明示されているが、崩れたときに何が壊れるかが書かれていない。
2. **Risks（リスク）** — 移行リスクが「あるかもしれない」と列挙されるだけで、緩和策
   （mitigation）も検証計画（spike/PoC）も無い。
3. **Open Questions（未決事項）** — 未決が 2 件挙がっているが、Owner も期限も判断材料
   も無い。
4. **Follow-up（追跡）** — TODO が消し込み条件（完了定義）なしで置かれている。

The Pre-execution Gate is satisfied: the path matches `docs/**/*design*.md`, and
the diff adds statements about assumptions, risks, and open decisions.

## Input Diff

```diff
diff --git a/docs/design/member-unification.md b/docs/design/member-unification.md
--- a/docs/design/member-unification.md
+++ b/docs/design/member-unification.md
@@ -10,2 +10,12 @@
 会員基盤を新サービスへ統合する。

+## 前提とリスク
+
+レガシー側の会員データは重複が無い前提で移行する。
+
+移行にはリスクがあるかもしれない。旧IDでの参照が残っている可能性がある。
+
+未決: 退会済み会員を移行対象に含めるか。
+未決: 旧システムの停止時期。
+
+TODO: 権限マッピングをあとで詰める。
```

## Expected Behavior

- A summary line first (`(summary):1: ...`), naming the newly added assumptions,
  risks, and open questions.
- A finding that the「重複が無い」前提 has no stated blast radius: 崩れた場合に何が
  壊れるか（統合先での ID 衝突なのか、二重請求なのか）が無いため、監視すべき兆候も
  導出できない。Severity major, with the `前提: <内容> / 崩れた場合: <影響> / 監視: <兆候>`
  template.
- A finding that the migration risk is stated without mitigation or a validation
  plan, so it cannot be tracked or closed. Severity major, with the
  `リスク: <内容> / 影響: <大> / 緩和: <案> / Owner: <役割> / 期限: <>` template.
- A finding that both open questions lack Owner, deadline, and the information
  needed to decide — they are recorded but not managed. Severity major, with the
  `未決: <問い> / 判断材料: <必要情報> / Owner: <役割> / 期限: <>` template.
- A finding that the TODO has no completion condition, so it cannot be closed out.
  Severity minor.
- At most 8 findings total, per the Rule.
- No finding demanding that the open questions be resolved now — the Non-goals
  state that unresolved items are to be managed as unresolved, not treated as
  defects.

<!-- expected:
findings:
  - severity: major
    reason: 前提「重複が無い」が崩れた場合の影響（何が壊れるか）と監視すべき兆候が書かれていない
    anchor: docs/design/member-unification.md:14
  - severity: major
    reason: 移行リスクが列挙されるだけで緩和策も検証計画（spike/PoC）も無く、追跡・消し込みができない
    anchor: docs/design/member-unification.md:16
  - severity: major
    reason: 未決事項 2 件に Owner・期限・判断材料が無く、記録されているだけで管理されていない
    anchor: docs/design/member-unification.md:18
  - severity: minor
    reason: TODO に消し込み条件（完了定義）が無く、いつ完了したと言えるかが決まらない
    anchor: docs/design/member-unification.md:21
-->
