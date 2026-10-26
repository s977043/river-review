# Test Case: No Plan, Only Bare Issue Reference → Skip (False Positive Guard)

## Description

plan artifact が無く、PR 本文には計画 issue の bare 参照（`#1473` のみ）しかない。前提が inline 列挙されていないため、外部 issue 本文を取得・推測して assumption を捏造してはならない。T41 改善提案2 の分岐（bare 参照のみ → skip）を検証する should-not-detect canary。PlanGate 非依存で、plan 欠損時に発火しないことを担保する。

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

- plan: **なし**（PlanGate 非依存で動作すること）。
- PR 本文: 「関連: #1473」という bare 参照のみ。前提・open question の inline 列挙なし。

## Expected Behavior

本 skill は以下を満たすこと。

1. **`NO_REVIEW` を返し findings を出さない**。plan artifact が無く、PR 本文に前提が inline 列挙されていないため、Pre-execution Gate の「bare 参照のみ → skip」分岐に該当する。
2. bare な `#1473` 参照から外部 issue 本文を取得・推測して assumption を捏造しない。
3. `skippedSkills` に `{ id: 'assumption-resolution-trace', reasons: ['plan artifact missing; only a bare plan-issue reference'] }` 相当を記録し、解消には plan artifact か PR 本文への前提 inline 化が必要である旨を残す。
4. 仮に PR 本文に「前提: 上流 API は 429 を返す」等が inline 列挙されていれば、その項目のみ部分評価（`partialEvaluation: true`）する分岐に切り替わる（本 canary はその前段の skip を固定する）。
