# Test Case: Fix Breaks a Previously-Holding Premise (should detect)

## Description

「エラー処理の責務が重複している」という設計レビュー指摘に対し、責務を `Widget` 側へ統合した。しかしこの統合は、既存の caller が依存していた「`renderWidget` は状態を持たず呼び出し側が error state を保持する」という成立済みの前提（"動いていた"状態）を壊し、caller 側の error 表示が動かなくなる連鎖の起点になっている。構造変更（シグネチャ変更）は伴わず、挙動レベルで前提が破壊されている。fix-scope-integrity は Premise break 軸で 1 件検出する。

## Input Diff

```diff
diff --git a/src/ui/widget.mjs b/src/ui/widget.mjs
index 1111111..2222222 100644
--- a/src/ui/widget.mjs
+++ b/src/ui/widget.mjs
@@ -10,3 +10,5 @@ export function renderWidget(props) {
-  // 呼び出し側が error state を保持する前提（caller が props.error を渡す）
-  return { view: draw(props), error: props.error };
+  // 責務統合: error state を Widget 内部で保持する
+  const error = detectError(props);
+  internalState.lastError = error;
+  return { view: draw(props) };
 }
```

## 参照コード / 依存 caller（変更なし）

```js
// src/ui/dashboard.mjs（変更なし・依存 caller）
const result = renderWidget({ ...props, error: this.errorState });
// 呼び出し側は result.error を読んで error バナーを描画する前提
if (result.error) showBanner(result.error); // ← result.error が undefined になり動かなくなる
```

## PR 本文 / Artifacts

- PR 本文: 「レビュー指摘（責務重複）への対応」。指摘対応ループの signal あり。
- 「この修正が依存する前提」の列挙なし・影響範囲確認の記録なし。
- 前提を変えること自体はタスクの目的として宣言されていない（責務重複の解消が目的で、caller 契約の変更は意図外）。

## Expected Behavior

本 skill は以下を満たすこと。

1. Premise break 軸を 1 件検出する（`renderWidget` が返す `error` を撤去したことで、`src/ui/dashboard.mjs` が依存していた「caller が result.error を読む」前提を破壊している）。
2. 依存 caller を grep 再現可能なアンカーで示す（例: `git grep -n "renderWidget(" src/` で caller を特定し、`result.error` 依存を確認）。
3. 構造変更（シグネチャ変更）を伴わない挙動レベルの前提破壊として記録し、`cross-file-leakage`（構造変更後の caller 残骸）の領分としては重複指摘しない。
4. `Severity: blocker`（"動いていた" error 表示経路の回帰を招く）とし、resolution（この修正が依存する前提を列挙し影響範囲を確認してから再提出）を添える。
5. 前提列挙が無いことを理由に指摘する（前提列挙・影響確認が残っていれば充足とみなす FP guard の裏返し）。
