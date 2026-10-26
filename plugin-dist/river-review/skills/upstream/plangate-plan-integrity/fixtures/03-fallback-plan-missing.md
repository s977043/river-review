# Test Case: Fallback — plan Artifact Missing (Should Return NO_REVIEW)

`plan` artifact が欠損した入力。SKILL.md の Pre-execution Gate により `NO_REVIEW` が返るべき。

## Input Artifacts

### pbi-input.md

```markdown
# PBI: 検索機能の刷新

## 目的

検索レイテンシを改善し、検索結果の関連度を上げる。

## 受け入れ条件

- P95 レイテンシ 200ms 以下
- 検索結果の正解率 80% 以上
```

### todo.md

```markdown
# TODO

- [ ] Elasticsearch 導入
- [ ] インデクシングバッチ実装
- [ ] 検索 API 実装
```

### test-cases.md

```markdown
# Test Cases

| ID  | シナリオ           | 期待結果        |
| --- | ------------------ | --------------- |
| TC1 | 一般検索クエリ実行 | P95 < 200ms     |
| TC2 | 関連度ソート確認   | 正解率 80% 以上 |
```

## Expected Behavior

`plan` artifact がないため、Pre-execution Gate が成立せず、`NO_REVIEW` を返す。

期待出力:

```text
NO_REVIEW: plangate-plan-integrity — 計画アーティファクト（plan + 関連1つ以上）が揃っていない
```
