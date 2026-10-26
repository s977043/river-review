# Expected Output: Planned But Missing

## Summary

(summary):1: 方針整合 0 / todo 網羅 1 / テスト整合 0 / 質問 0

## Findings

- `src/services/auth.ts:1`: [severity=blocker] [id=planned-but-missing] `todo.md` で `- [x]` 完了済みとマークされた「`src/services/auth.ts` にロック解除時刻のリセット処理を追加」に対応する差分が存在しない。完了宣言と実装の齟齬。Evidence — diff: `src/services/lockout.ts` のみ（auth.ts への変更なし）、todo: `- [x] src/services/auth.ts にロック解除時刻のリセット処理を追加`。Fix: auth.ts にリセット処理を実装するか、未完了なら `todo` のチェックを外す。
