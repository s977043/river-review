# Test Case: Explicit Next-Phase Deferral (Should NOT Trigger Finding)

`todo.md` と `test-cases.md` に「次フェーズで追記」と期限・担当付きで明示されたスコープ外項目があるケース。SKILL.md の False-positive guards に従い、指摘されないべき。

## Input Artifacts

### pbi-input.md

```markdown
# PBI: 通知メール文面の多言語対応（Phase 1: 日本語のみ）

## 目的

通知メールの文面を日本語で確定し、Phase 2 で英語版を追加できる基盤を用意する。

## 受け入れ条件

- 通知メールが日本語で送信される
- メール本文に件名テンプレートが適用される
- Phase 2: 英語版対応（本 Phase スコープ外）
```

### plan.md

```markdown
# 計画: 通知メール文面 Phase 1

## 方針

- 日本語文面のみを実装し、文面テンプレート機構は拡張可能な形で導入する。

## 受け入れ条件 (再掲)

- 日本語文面が送信される
- 件名テンプレート適用

## 作業範囲

- 文面テンプレートエンジン導入
- 日本語文面定義
- 単体テスト

## 未決事項

- 英語版文面の翻訳担当: 次フェーズで決定 (決定者: PM, 期限: Phase 2 開始時)
```

### todo.md

```markdown
# TODO

- [ ] テンプレートエンジン導入
- [ ] 日本語文面 `ja.md` 作成
- [ ] 単体テスト: 日本語送信
- [ ] 英語文面 `en.md` 作成 — **次フェーズで追記** (担当: PM, 期限: Phase 2)
```

### test-cases.md

```markdown
# Test Cases

| ID  | シナリオ                                                | 期待結果               |
| --- | ------------------------------------------------------- | ---------------------- |
| TC1 | 通知イベント発生 → メール送信                           | 日本語文面で送信される |
| TC2 | 件名テンプレート置換                                    | 件名に変数が反映される |
| TC3 | 英語版送信テスト — **次フェーズで追記** (期限: Phase 2) | 保留                   |
```

## Expected Behavior

The skill should NOT flag the "英語版" items as missing, because each is explicitly marked `次フェーズで追記` with owner + 期限 per SKILL.md False-positive guards.

Output should resemble `NO_ISSUES` or only `info`-level supplementary comments acknowledging the explicit deferral.
