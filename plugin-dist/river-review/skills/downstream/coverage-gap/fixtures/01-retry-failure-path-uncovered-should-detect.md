# Fixture 01 — New retry / timeout branches with only a happy-path test (Happy Path)

## Description

The diff changes `src/**` and adds execution branches (retry loop, timeout abort,
exhausted-retry error), so all three Pre-execution Gate conditions hold. The diff
does update a test file, so the skill is not silenced by mere test presence — but
the added test asserts only the success case, leaving the new failure paths without
assertions. That is the Heuristics bullets 「新しい条件分岐・ガードが追加されたのに
対応するテストがない」and「例外処理やエラーリターンに対するアサーションが
見当たらない」.

Note: this skill needs the repo-wide `tests` context and is registered in
`GRANDFATHERED_UNSUPPLIED_CONTEXT`, so this fixture describes the behaviour under a
configuration that supplies `tests` — the same assumption the SKILL.md header states.

## Input Diff

```diff
diff --git a/src/http/fetch-with-retry.ts b/src/http/fetch-with-retry.ts
new file mode 100644
--- /dev/null
+++ b/src/http/fetch-with-retry.ts
@@ -0,0 +1,15 @@
+export async function fetchWithRetry(url: string, attempts = 3, timeoutMs = 2000) {
+  let lastError: unknown;
+  for (let i = 0; i < attempts; i += 1) {
+    const controller = new AbortController();
+    const timer = setTimeout(() => controller.abort(), timeoutMs);
+    try {
+      return await fetch(url, { signal: controller.signal });
+    } catch (err) {
+      lastError = err;
+    } finally {
+      clearTimeout(timer);
+    }
+  }
+  throw new Error(`fetch failed after ${attempts} attempts`, { cause: lastError });
+}
diff --git a/src/http/fetch-with-retry.test.ts b/src/http/fetch-with-retry.test.ts
new file mode 100644
--- /dev/null
+++ b/src/http/fetch-with-retry.test.ts
@@ -0,0 +1,6 @@
+import { fetchWithRetry } from './fetch-with-retry';
+
+it('成功時にレスポンスを返す', async () => {
+  const res = await fetchWithRetry('https://example.test/ok');
+  expect(res.status).toBe(200);
+});
```

## Expected Behavior

- A finding anchored at `src/http/fetch-with-retry.ts:14` for the exhausted-retry
  `throw`: no test asserts the error, its message, or its `cause`.
- A finding anchored at `src/http/fetch-with-retry.ts:5` for the timeout/abort
  branch: the Actions section asks for タイムアウト / リトライ / フォールバックを
  モックし、意図した失敗動作を確認する.
- Each finding names the input example and the expected success/failure scenario,
  per the last bullet of the Actions section.
- No rewrite of the existing test suite and no chaos-testing design — both are
  Non-goals.

<!-- expected:
findings:
  - severity: major
    reason: リトライ枯渇時の throw に対するアサーションが無く、失敗経路が未カバー
    anchor: src/http/fetch-with-retry.ts:14
  - severity: major
    reason: タイムアウト（AbortController）分岐をモックした失敗系テストが無い
    anchor: src/http/fetch-with-retry.ts:5
-->
