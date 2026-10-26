# Test Case: Unresolved Plan Assumption (should detect)

## Description

plan artifact に「上流 API はレート超過時に 429 を返す」という assumption が記録されているが、実装（差分）にも PR 本文にもその前提を確認・解消した証拠が無い。assumption-resolution-trace は plan 保有時に発火し、未解消の assumption を 1 件検出する。

## Input Diff

```diff
diff --git a/src/lib/rate-limit.mjs b/src/lib/rate-limit.mjs
new file mode 100644
index 0000000..4444444
--- /dev/null
+++ b/src/lib/rate-limit.mjs
@@ -0,0 +1,7 @@
+export async function callUpstream(client, payload) {
+  const res = await client.post('/ingest', payload);
+  if (res.status >= 500) {
+    throw new Error('upstream 5xx');
+  }
+  return res.body;
+}
```

## Artifacts

- plan: あり。`plan.md` の `#assumptions` に「上流 API はレート超過時に HTTP 429 を返すと仮定する。429 の場合は指数バックオフで再試行する」と記録されている。
- PR 本文: 429 の扱いへの言及なし。
- テスト: `tests/` に 429 応答経路のテストが無いことを grep で確認できる。

## Expected Behavior

本 skill は以下を満たすこと。

1. plan artifact があるため発火し（全評価）、未解消の assumption を 1 件検出する。
2. plan の該当前提（「429 を返すと仮定」）を引用し、`evidence_missing`（429 応答の処理経路・確認テストが diff・repo に無い。検索語 `429`）を示す。
3. `Severity: warning`（現在系の挙動・可逆・merge 前に解消証拠を残すべき）とし、resolution（429 処理経路を実装で確認する / 契約テストを追加する）を merge 前必須として添える。
4. plan / plan 整合そのもの（`plangate-plan-integrity` の領分）は指摘せず、「解消の証拠不在」に限定する。
