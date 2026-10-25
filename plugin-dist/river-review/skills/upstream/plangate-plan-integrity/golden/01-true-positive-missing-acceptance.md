# Expected Output: Missing Acceptance Coverage

## Summary

(summary):1: pbi-input と plan の受け入れ条件は一致。受け入れ条件「非管理者ロール→403」が test-cases / todo に未反映。

## Findings

- `test-cases.md:1`: [severity=major] pbi-input / plan の受け入れ条件「非管理者ロール（管理者以外）が `/admin/users` にアクセスすると 403 を返す」が test-cases に未登録。TC1 (200) と TC2 (401) のみで 403 ケースが欠落。Fix: 異常系ケース「TC3: 非管理者ロールで `/admin/users` → 403」を追加。

- `todo.md:1`: [severity=minor] plan の作業範囲に「単体テスト」「統合テスト」があるが、todo に 403 ケースのテストタスクが無い。Fix: `- [ ] 単体テスト: 非管理者ロール → 403` と `- [ ] 統合テスト: 非管理者ロール → 403` を追記。
