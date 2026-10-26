# Fixture 02 — Risks and open questions tracked in a referenced register (False-Positive Guard)

## Description

The diff changes a document under `docs/**/*design*.md` and it does touch
assumptions, risks, and open questions, so both content conditions of the
Pre-execution Gate are satisfied. But every Checklist item this skill would raise
is already answered: the assumption and its blast radius, the risk with its
mitigation and Owner, and the open question with its decision material, deadline,
and Owner all live in an existing risk register that this document links to and
does not change. This is the skill's guard「既にリスク/前提/未決が別ドキュメントで
管理され、参照が明確な場合は重複指摘しない」.

Repository context (not part of the diff):

```text
docs/architecture/risk-register.md (existing, unchanged) records for this design:
  - 前提 A-3「レガシー会員データに重複が無い」/ 崩れた場合: 統合先で会員IDが衝突し
    請求が二重に走る / 監視: 移行バッチの duplicate_key カウンタ
  - リスク R-7「旧IDでの参照が残存」/ 影響: 大 / 緩和: 旧ID→新ID の変換テーブルを
    6か月併存 / 検証: ステージングでの全件リプレイ PoC / Owner: 会員基盤チーム /
    期限: 2026-09-30
  - 未決 Q-2「退会済み会員を移行対象に含めるか」/ 判断材料: 法務の保持期間見解と
    退会済み件数 / Owner: PM / 期限: 設計凍結レビュー（2026-09-05）
```

## Input Diff

```diff
diff --git a/docs/design/member-unification.md b/docs/design/member-unification.md
--- a/docs/design/member-unification.md
+++ b/docs/design/member-unification.md
@@ -10,2 +10,10 @@
 会員基盤を新サービスへ統合する。

+## 前提・リスク・未決
+
+本設計の前提（A-3）、リスク（R-7）、未決事項（Q-2）は
+[リスク登録簿](../architecture/risk-register.md) で Owner・期限・緩和策・判断材料
+付きで管理しており、本ドキュメントでは再掲しない。本変更でこれらの内容は変わらない。
+
+移行完了の定義: 変換テーブル経由の参照が 30 日連続で 0 件になった時点で R-7 を
+クローズし、変換テーブルを削除する。
```

## Expected Behavior

- `findings: []` (a summary line may still be emitted; it is not a finding).
- The assumption's blast radius and monitoring signal, the risk's mitigation,
  validation plan, Owner and deadline, and the open question's decision material,
  Owner and deadline are all delegated to the linked register, which the guard
  treats as clear. Re-raising them would be a duplicate finding.
- The one thing this diff does add — the Follow-up tracking item — carries an
  explicit close-out condition (30 consecutive days of zero references), so the
  Follow-up checklist item is satisfied rather than open.
- No finding is raised for the open question being unresolved: the Non-goals
  exclude treating uncertainty itself as a defect once it is managed.

<!-- expected:
findings: []
reason: 前提・リスク・未決は Owner / 期限 / 緩和策 / 判断材料付きでリスク登録簿に管理され参照が明確（重複指摘の抑制条件に該当）、追加された追跡項目にも消し込み条件が明記されている
-->
