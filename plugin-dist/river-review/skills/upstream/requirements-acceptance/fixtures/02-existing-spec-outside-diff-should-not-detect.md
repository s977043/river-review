# Fixture 02 — Scoped clarification with criteria; older sections left alone (False-Positive Guard)

## Description

The diff changes a document matching `**/*requirements*.md` under `docs/`, so the
Pre-execution Gate is satisfied. The skill stays silent for two reasons, and
neither depends on the gate failing:

- What the diff adds is complete on its own terms: the new rule has testable
  acceptance criteria including exception cases, a stated non-functional bound,
  the PII handling it needs, and the open question carries an owner, a deadline,
  and the material required to decide it.
- The rest of the document — written earlier, unchanged here — is thinner, but
  the skill's guard is「差分外の既存仕様まで掘り返して問題視しない（今回の変更と
  直結する範囲に限定）」, so those older sections are out of scope for this review.

Repository context (not part of the diff):

```text
docs/product/member-bulk-import-requirements.md contains earlier sections
(「画面レイアウト」「将来的な拡張」) that have no acceptance criteria and no
non-functional requirements. They are untouched by this diff.
```

## Input Diff

```diff
diff --git a/docs/product/member-bulk-import-requirements.md b/docs/product/member-bulk-import-requirements.md
--- a/docs/product/member-bulk-import-requirements.md
+++ b/docs/product/member-bulk-import-requirements.md
@@ -40,2 +40,19 @@
 ## 取り込み時の重複判定

+本節で決めること: 同一メールアドレスの行が既存会員と衝突した場合の扱い。
+対象外: 電話番号の重複（本リリースでは判定に使わない）。
+
+受け入れ条件:
+
+- AC-11: Given 既存会員と同じメールアドレスの行がある, When 取り込みを実行する,
+  Then その行は作成せず skipped として結果 CSV に理由付きで出力される。
+- AC-12: Given 取り込み権限を持たない管理者, When 取り込みを実行する,
+  Then 403 を返し、ファイルは保存されない。
+- AC-13: Given 1 ファイル内に同一メールアドレスの行が 2 件ある, When 取り込みを実行する,
+  Then 先頭行のみ作成し、2 件目は duplicate-in-file として skipped になる。
+
+非機能: 1 ファイル 50,000 行まで、5 分以内に完了する。超過分は 400 で拒否する。
+PII: 結果 CSV にメールアドレスを含めるため、保持期間は 7 日、監査ログに実行者と件数を残す。
+
+未決 Q-9: 大文字小文字を区別しない照合にするか。判断材料: 既存会員のメール表記ゆれ件数。
+Owner: PM / 期限: 実装着手前レビュー（2026-09-12）。
```

## Expected Behavior

- `findings: []` (a summary line may still be emitted; it is not a finding).
- The added rule defines its scope and its explicit exclusion, so the 用語とスコープ
  checklist item is satisfied.
- Acceptance criteria are given in Given-When-Then form and cover the exception
  cases relevant to this rule (permission denied, in-file duplication), satisfying
  the 受け入れ条件 item including its exception-case requirement.
- The non-functional bound (row ceiling, completion time, over-limit behaviour)
  and the PII handling (retention period, audit log) are stated, satisfying 非機能.
- The remaining open question is recorded as open with decision material, owner,
  and deadline — the Non-goals state that an undecided point managed as undecided
  is not a defect.
- The document's older, thinner sections are not raised: they are outside this
  diff, which the guard excludes.

<!-- expected:
findings: []
reason: 差分が追加した規則はスコープ・対象外・Given-When-Then の受け入れ条件（例外系含む）・非機能上限・PII 保持と監査ログ・Owner と期限付きの未決まで揃っており、差分外の既存節は抑制条件により掘り返さない
-->
