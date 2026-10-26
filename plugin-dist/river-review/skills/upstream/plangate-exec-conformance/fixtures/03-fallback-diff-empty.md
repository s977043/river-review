# Test Case: Fallback — diff Empty (Should Return NO_REVIEW)

`diff` が空の入力。SKILL.md の Pre-execution Gate「inputContext に diff が含まれ、レビュー対象の差分が空でない」を満たさず、`NO_REVIEW` を返すべき。

## Input Artifacts

### plan.md

```markdown
# 計画: 認証リフレッシュトークン追加

## 方針

- アクセストークンの有効期限を 15 分に短縮し、リフレッシュトークンで更新する仕組みを導入する。

## 影響範囲

- `src/auth/token.ts`
- `src/auth/refresh.ts` (新規)
```

### todo.md

```markdown
# TODO

- [ ] リフレッシュトークン発行
- [ ] リフレッシュ API
- [ ] 既存アクセストークン TTL 変更
```

### test-cases.md

```markdown
# Test Cases

| ID  | シナリオ                         | 期待結果            |
| --- | -------------------------------- | ------------------- |
| TC1 | 有効なリフレッシュトークンで更新 | 新しい access token |
| TC2 | 期限切れリフレッシュトークン     | 401                 |
```

### diff

```diff

```

(空の差分 — ファイル変更なし)

## Expected Behavior

`diff` が空のため、Pre-execution Gate が成立せず、`NO_REVIEW` を返す。

期待出力:

```text
NO_REVIEW: plangate-exec-conformance — 差分または plan/todo/test-cases artifact が揃っていない
```
