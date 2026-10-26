# Expected Output: Fallback — diff Empty

## Summary

Pre-execution Gate が不成立のため、このスキルはレビューを実行しない。

## Findings

```text
NO_REVIEW: plangate-exec-conformance — 差分または plan/todo/test-cases artifact が揃っていない
```

### Gate 不成立理由

- `diff` inputContext は提供されているが、差分が空。
- SKILL.md「Pre-execution Gate」の 1 項目目「inputContext に `diff` が含まれ、レビュー対象の差分が空でない」を満たさない。
