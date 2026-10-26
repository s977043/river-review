# Expected Output: Fallback — plan Artifact Missing

## Summary

Pre-execution Gate が不成立のため、このスキルはレビューを実行しない。

## Findings

```text
NO_REVIEW: plangate-plan-integrity — 計画アーティファクト（plan + 関連1つ以上）が揃っていない
```

### Gate 不成立理由

- `plan` artifact が入力に存在しない (pbi-input / todo / test-cases のみ)。
- SKILL.md「Pre-execution Gate」の 1 項目目「入力 artifact に `plan` が存在する」を満たさない。
