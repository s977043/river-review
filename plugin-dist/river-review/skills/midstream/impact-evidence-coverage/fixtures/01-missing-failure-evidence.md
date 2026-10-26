# Test Case: Missing Failure-Mode Evidence (should detect)

## Description

新しい失敗経路（retry + throw）を追加した差分だが、失敗系を観測した証拠（失敗系テスト・境界テスト）が同一 diff にも既存テストにも無い。影響は現在系の挙動に及び可逆のため Blocking ではないが、merge 前に証拠を残すべきケース。impact-evidence-coverage は Failure 軸の `evidence_missing` を 1 件検出する。

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
```

## PR 本文 / Artifacts

- テストの追加なし（`tests/` に fetch-with-retry の失敗系テストが無いことを grep で確認できる）。
- PR 本文にリトライ回数の境界・失敗時挙動を観測した記録なし。

## Expected Behavior

本 skill は以下を満たすこと。

1. Failure 軸の `evidence_missing` を 1 件検出する（リトライ枯渇時の throw を観測した失敗系・境界テストが差分・repo に無い）。
2. `Severity: warning`（現在系の挙動・可逆・merge 前に証拠追加すべき）とし、resolution（attempts 枯渇時に throw する失敗系テストを追加）を merge 前必須として添える。
3. 探索した検索語（例: `fetchWithRetry` を `tests/` に grep）を明示し、証拠の別在を棄却した根拠を示す。
4. テストの欠落そのもの（`coverage-gap` / `test-existence` の領分）としてではなく「証拠の不在」として記録し、重複指摘しない。
