# Fixture 02 — The failure paths are already covered (False-Positive Guard)

## Description

The Pre-execution Gate holds: the diff changes `src/**`, and the change affects the
execution path (a new retry branch), not just comments or documentation. The skill
therefore runs. The same diff adds tests that assert the timeout branch and the
exhausted-retry error, so the False-positive guard 「既存テストが同等の失敗経路を
十分にカバーしている」applies.

## Input Diff

```diff
diff --git a/src/http/fetch-with-retry.ts b/src/http/fetch-with-retry.ts
--- a/src/http/fetch-with-retry.ts
+++ b/src/http/fetch-with-retry.ts
@@ -1,11 +1,15 @@
 export async function fetchWithRetry(url: string, attempts = 3, timeoutMs = 2000) {
   let lastError: unknown;
   for (let i = 0; i < attempts; i += 1) {
+    const controller = new AbortController();
+    const timer = setTimeout(() => controller.abort(), timeoutMs);
     try {
-      return await fetch(url);
+      return await fetch(url, { signal: controller.signal });
     } catch (err) {
       lastError = err;
+    } finally {
+      clearTimeout(timer);
     }
   }
   throw new Error(`fetch failed after ${attempts} attempts`, { cause: lastError });
 }
diff --git a/src/http/fetch-with-retry.test.ts b/src/http/fetch-with-retry.test.ts
--- a/src/http/fetch-with-retry.test.ts
+++ b/src/http/fetch-with-retry.test.ts
@@ -3,3 +3,17 @@ it('成功時にレスポンスを返す', async () => {
   const res = await fetchWithRetry('https://example.test/ok');
   expect(res.status).toBe(200);
 });
+
+it('タイムアウトすると abort されて次の試行へ進む', async () => {
+  mockFetch.mockImplementationOnce(hangUntilAbort).mockResolvedValueOnce(okResponse);
+  const res = await fetchWithRetry('https://example.test/slow', 2, 10);
+  expect(res.status).toBe(200);
+  expect(mockFetch).toHaveBeenCalledTimes(2);
+});
+
+it('全試行が失敗すると cause 付きで throw する', async () => {
+  mockFetch.mockRejectedValue(new Error('ECONNRESET'));
+  await expect(fetchWithRetry('https://example.test/down', 2, 10)).rejects.toThrow(
+    'fetch failed after 2 attempts'
+  );
+});
```

## Expected Behavior

- `findings: []`.
- Every branch the diff adds — success, timeout/abort followed by a retry, and
  exhausted retries — has an assertion, including the error message.
- Demanding further cases（他のステータスコード、ジッタの分布など）would ignore the
  suppression condition, which the 不合格基準 lists as 抑制条件の無視.

<!-- expected:
findings: []
reason: Pre-execution Gate は成立するが、追加された分岐（タイムアウト再試行・リトライ枯渇時の throw）に対応するテストが同じ差分に揃っており、False-positive guard「既存テストが同等の失敗経路を十分にカバーしている」に該当する
-->
