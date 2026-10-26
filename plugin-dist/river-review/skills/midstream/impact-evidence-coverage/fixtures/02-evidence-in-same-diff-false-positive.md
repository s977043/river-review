# Test Case: Evidence Co-located in the Same Diff (False Positive Guard)

## Description

同じ失敗経路（retry + throw）を追加する差分だが、失敗系を観測した証拠（枯渇時に throw する失敗系テスト）が **同一 diff に同梱**されている。T41 観測の「証拠の diff 同梱を充足とみなす」判定規則を検証する should-not-detect canary。証拠が揃っているため、影響・失敗系のいずれについても本 skill は指摘してはならない。

## Input Diff

```diff
diff --git a/src/lib/fetch-with-retry.mjs b/src/lib/fetch-with-retry.mjs
index 1111111..2222222 100644
--- a/src/lib/fetch-with-retry.mjs
+++ b/src/lib/fetch-with-retry.mjs
@@ -1,3 +1,11 @@
 export async function fetchWithRetry(url, { attempts = 3 } = {}) {
-  return fetch(url);
+  let lastError;
+  for (let i = 0; i < attempts; i += 1) {
+    try {
+      return await fetch(url);
+    } catch (error) {
+      lastError = error;
+    }
+  }
+  throw new Error(`fetchWithRetry exhausted ${attempts} attempts: ${lastError?.message}`);
 }
diff --git a/tests/fetch-with-retry.test.mjs b/tests/fetch-with-retry.test.mjs
new file mode 100644
index 0000000..3333333
--- /dev/null
+++ b/tests/fetch-with-retry.test.mjs
@@ -0,0 +1,21 @@
+import assert from 'node:assert/strict';
+import { test } from 'node:test';
+import { fetchWithRetry } from '../src/lib/fetch-with-retry.mjs';
+
+test('throws after exhausting all attempts', async () => {
+  globalThis.fetch = async () => {
+    throw new Error('network down');
+  };
+  await assert.rejects(() => fetchWithRetry('https://x', { attempts: 2 }), /exhausted 2 attempts/);
+});
+
+test('returns on the first success without retry', async () => {
+  let calls = 0;
+  globalThis.fetch = async () => {
+    calls += 1;
+    return { ok: true };
+  };
+  const res = await fetchWithRetry('https://x', { attempts: 3 });
+  assert.equal(calls, 1);
+  assert.equal(res.ok, true);
+});
```

## Expected Behavior

本 skill は以下を満たすこと。

1. **findings を出さない**。失敗系の証拠（枯渇時 throw の失敗系テスト + 成功時 no-retry の境界テスト）が同一 diff に同梱されているため、Failure 軸は充足とみなす。
2. 充足と判断した根拠として、同梱テストの `file:line`（`tests/fetch-with-retry.test.mjs`）を挙げられること（過剰指摘の抑制が説明可能であること）。
3. 「テストが薄い」等の一般論や、証拠が揃っている軸への question を出さない（低リスク PR での過剰出力の抑制）。
