# Test Case: Planned But Missing (Should Trigger Finding)

`todo.md` で `[x]` 完了済みとマークされた作業項目が `diff` に実装されていないケース。SKILL.md Rule 2「作業項目の網羅 (todo → diff)」違反で `critical` (blocker) 指摘、finding-id `planned-but-missing` が期待される。

## Input Artifacts

### plan.md

```markdown
# 計画: ログイン失敗時のロックアウト

## 方針

- 連続ログイン失敗が 5 回に達したアカウントを 15 分ロックする。
- 失敗カウントとロック解除時刻はユーザーレコードに保存する。

## 影響範囲

- `src/services/auth.ts`
- `src/services/lockout.ts` (新規)
```

### todo.md

```markdown
# TODO

- [x] `src/services/lockout.ts` にロックアウト判定を実装
- [x] `src/services/auth.ts` にロック解除時刻のリセット処理を追加
- [ ] 単体テスト追加
```

### test-cases.md

```markdown
# Test Cases

| ID  | シナリオ           | 期待結果           |
| --- | ------------------ | ------------------ |
| TC1 | 5 回連続失敗       | 15 分ロックされる  |
| TC2 | ロック中の成功試行 | 拒否される         |
| TC3 | ロック解除後の成功 | カウントがリセット |
```

### diff

```diff
diff --git a/src/services/lockout.ts b/src/services/lockout.ts
new file mode 100644
index 0000000..3333333
--- /dev/null
+++ b/src/services/lockout.ts
@@ -0,0 +1,12 @@
+export const MAX_ATTEMPTS = 5;
+export const LOCK_MINUTES = 15;
+
+export function isLockedOut(user) {
+  if (user.failedAttempts < MAX_ATTEMPTS) return false;
+  if (!user.lockedUntil) return false;
+  return Date.now() < new Date(user.lockedUntil).getTime();
+}
+
+export function registerFailure(user) {
+  user.failedAttempts = (user.failedAttempts ?? 0) + 1;
+}
```

`src/services/auth.ts` への「ロック解除時刻のリセット処理」(`- [x]` 完了済みマーク) に対応する差分が存在しない。
