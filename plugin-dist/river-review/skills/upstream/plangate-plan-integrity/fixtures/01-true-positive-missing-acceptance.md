# Test Case: Missing Acceptance Coverage (Should Trigger Finding)

この入力は、`plan.md` に記載された受け入れ条件「権限なしユーザーが操作すると 403 を返す」が `test-cases.md` にカバーされていないケース。`major` 指摘が期待される。

## Input Artifacts

### pbi-input.md

```markdown
# PBI: 管理画面のアクセス制御

## 目的

一般ユーザーが管理画面の管理 API を叩いた場合、認可エラーを返すことを保証する。

## 受け入れ条件

- 管理者ロールを持つユーザーは `/admin/users` にアクセスできる (200)
- 管理者ロールを持たないユーザーは `/admin/users` にアクセスできない (403)
- 未ログインユーザーは `/admin/users` にアクセスできない (401)
```

### plan.md

```markdown
# 計画: 管理画面アクセス制御

## 方針

- `@admin` ミドルウェアを導入し、`/admin/*` 配下に適用する。
- ロール判定は `user.role === 'admin'` で行う。

## 受け入れ条件 (再掲)

- 管理者ロール: 200
- 非管理者ロール: 403
- 未ログイン: 401

## 作業範囲

- ミドルウェア実装
- ルーティング設定
- 単体テスト
- 統合テスト
```

### todo.md

```markdown
# TODO

- [ ] `@admin` ミドルウェア実装
- [ ] `/admin/*` ルーティング適用
- [ ] 単体テスト: 管理者ロール → 200
- [ ] 統合テスト: 未ログイン → 401
```

### test-cases.md

```markdown
# Test Cases

| ID  | シナリオ                               | 期待結果 |
| --- | -------------------------------------- | -------- |
| TC1 | 管理者が `/admin/users` にアクセス     | 200      |
| TC2 | 未ログインで `/admin/users` にアクセス | 401      |
```

## Expected Behavior

The skill should detect:

1. 受け入れ条件「非管理者ロール→403」が `test-cases.md` に未登録（TC1 / TC2 のみで 403 ケースなし）
2. `todo.md` に 403 ケースの単体/統合テスト項目が無い（plan の作業範囲と不整合）
