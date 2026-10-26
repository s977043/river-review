# Expected Output: Explicit Out-of-Scope Item

## Summary

(summary):1: 方針整合 0 / todo 網羅 0 / テスト整合 0 / 質問 0

## Findings

NO_ISSUES

この差分セットは以下の理由で conformance 健全と判定される:

- `diff` は plan の「✅ 名前の前方一致検索 / ✅ ページング」に 1:1 対応 (`src/routes/users.ts`, `src/services/user-search.ts`, `tests/users-search.spec.ts`)
- 未実装項目「全文検索対応」は plan「❌ 本 PR のスコープ外 (別 PR #999)」および todo「→ 別 PR `#999`」で明示 → False-positive guards「本 PR のスコープ外」「別 PR で対応」適用
- 未実装項目「管理者向け高度フィルタ」は plan「❌ Phase 2」、todo「Phase 2」で明示 → 同上
- `TC3` のテスト欠如は test-cases「記録のみ（実装不要）」明示 → False-positive guards「記録のみ」適用
- `todo` の `[x]` 完了マーク 3 項目は実装差分が存在し齟齬なし
