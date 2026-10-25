# Fixture 01 — PRD with undefined terms and no testable acceptance criteria (Happy Path)

## Description

A PRD adds a feature whose scope and acceptance are left to the implementer.
Four Checklist items of this skill fail deterministically from the text alone:

1. **用語とスコープ** — 「管理者」「一括」の定義が無く、対象データも対象外（やらない
   こと）も既存仕様との違いも書かれていない。
2. **受け入れ条件** — Given-When-Then のようなテスト可能な受け入れ条件が無い。
   「使いやすいこと」は観測できない。代表的な例外系（権限なし/入力不備/データなし/
   タイムアウト/競合）にも一切触れていない。
3. **非機能** — 期待性能（件数上限、レイテンシ）・可用性/SLO・コスト前提が無く、
   監査ログ・データ保持・PII の要求も無い。ただし CSV に個人情報が含まれる。
4. **依存とリスク** — 依存（既存の権限 API、CSV 取り込み基盤）も、未決事項の期限・
   意思決定者・判断材料も書かれていない。

The Pre-execution Gate is satisfied: the path matches `**/*prd*.md` under `docs/`,
and the diff adds requirement statements.

## Input Diff

```diff
diff --git a/docs/product/member-bulk-import-prd.md b/docs/product/member-bulk-import-prd.md
new file mode 100644
--- /dev/null
+++ b/docs/product/member-bulk-import-prd.md
@@ -0,0 +1,12 @@
+# 会員一括取り込み
+
+## やること
+
+管理者が会員情報を一括で取り込めるようにする。CSV をアップロードすると会員が
+作られる。氏名・メールアドレス・電話番号を含む。
+
+## 受け入れ
+
+使いやすいこと。速いこと。
+
+権限まわりは既存に合わせる。
```

## Expected Behavior

- A summary line first (`(summary):1: ...`), stating what this document decides
  and what it leaves undecided.
- A finding that no testable acceptance criteria exist: 「使いやすいこと」「速いこと」
  cannot be turned into a test, and no exception cases (no permission, malformed
  input, empty file, timeout, duplicate rows) are covered — so the feature cannot
  be verified as done. Severity major, with a paste-ready
  `Given <前提>, When <操作>, Then <期待結果>` 追記案 covering 3〜5 本. No
  `CriterionRefs:` label is attached to this finding, because no acceptance
  criterion exists to reference yet.
- A finding that「管理者」「一括」の定義と対象外（何をやらないか）が無く、既存の会員
  作成フローとの違いも書かれていないため、実装スコープが人によって変わる。
  Severity major.
- A finding that the CSV carries personal data (name, email, phone) while no PII
  handling, retention period, or audit-log requirement is stated. Severity major.
- A finding that no non-functional expectation exists — row-count ceiling,
  processing time, and the behaviour when the limit is exceeded are all unstated,
  so「速いこと」cannot be sized or tested. Severity major.
- A finding that「権限まわりは既存に合わせる」names no existing specification, so the
  dependency is unresolved rather than delegated. Severity minor.
- At most 8 findings total, per the Rule.
- No finding prescribing a UI design or an implementation approach — the
  Non-goals exclude adjudicating those.

<!-- expected:
findings:
  - severity: major
    reason: テスト可能な受け入れ条件が無く（「使いやすい」「速い」は観測不能）、権限なし・入力不備・データなし・タイムアウト・重複行などの例外系も未定義で、完了を検証できない
    anchor: docs/product/member-bulk-import-prd.md:10
  - severity: major
    reason: 「管理者」「一括」の定義と対象外（やらないこと）・既存の会員作成フローとの違いが無く、実装スコープが確定しない
    anchor: docs/product/member-bulk-import-prd.md:5
  - severity: major
    reason: 氏名・メールアドレス・電話番号という個人情報を扱うのに PII の取り扱い・保持期間・監査ログの要求が書かれていない
    anchor: docs/product/member-bulk-import-prd.md:6
  - severity: major
    reason: 件数上限・処理時間・上限超過時の挙動といった非機能要求が無く「速いこと」を見積も検証もできない
    anchor: docs/product/member-bulk-import-prd.md:10
  - severity: minor
    reason: 「権限まわりは既存に合わせる」が参照先の仕様を示しておらず、依存が委譲ではなく未決のまま残っている
    anchor: docs/product/member-bulk-import-prd.md:12
-->
