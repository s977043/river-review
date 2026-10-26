# Expected Output: Test Contract Missing

## Summary

(summary):1: 方針整合 0 / todo 網羅 0 / テスト整合 1 / 質問 0

## Findings

- `src/services/discount.test.ts:1`: [severity=warning] [id=test-contract-missing] `test-cases.md` の TC2「有効期限切れコード適用 → 拒否される」に対応するテストが差分に存在しない（`discount.test.ts` は TC1 のみ）。`applyDiscount` は期限切れで throw する実装だが、その挙動を検証するテストが欠落している。Evidence — diff: `src/services/discount.test.ts:3-5`（TC1 のみ）、test-cases: `| TC2 | 有効期限切れコード適用 | 拒否される |`。Fix: 期限切れコードで `applyDiscount` が throw することを検証する TC2 のテストを追加する。
