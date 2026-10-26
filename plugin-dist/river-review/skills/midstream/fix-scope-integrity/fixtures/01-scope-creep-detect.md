# Test Case: Scope Creep Accumulated Across Review-Response Loop (should detect)

## Description

「既存フォームをそのまま移植する」限定スコープで始めた新規登録フォームの修正が、レビュー指摘対応の3往復目で移植元に無い値域制限（min/max バリデーション）を新規側にだけ追加した。個別の指摘（値域を絞れ）は技術的に妥当だが、移植スコープからは逸脱している。fix-scope-integrity は Scope creep 軸で 1 件検出する。

## Input Diff

```diff
diff --git a/src/forms/signup.mjs b/src/forms/signup.mjs
index 1111111..2222222 100644
--- a/src/forms/signup.mjs
+++ b/src/forms/signup.mjs
@@ -38,5 +38,5 @@ export function buildSignupSchema() {
   return {
     name: { type: 'string', required: true },
-    age: { type: 'number', required: true },
+    age: { type: 'number', required: true, min: 18, max: 120 },
   };
 }
```

## 参照コード / 移植元

```js
// src/forms/legacy-signup.mjs（移植元 / 変更なし）
export function buildLegacySignupSchema() {
  return {
    name: { type: 'string', required: true },
    age: { type: 'number', required: true }, // 値域制限なし
  };
}
```

## PR 本文 / Artifacts

- PR 本文: 「既存フォーム（legacy-signup）をそのまま移植する」とスコープを宣言。
- コミット連鎖: `feat: 移植` → `fix: レビュー指摘対応(1)` → `fix: レビュー指摘対応(2)` → `fix: 値域制限を追加(レビュー指摘対応3)`。指摘対応ループの signal あり。
- 受入基準の更新なし。値域制限の事前承認・前提列挙なし。

## Expected Behavior

本 skill は以下を満たすこと。

1. Scope creep 軸を 1 件検出する（移植元 `src/forms/legacy-signup.mjs` に無い `min: 18, max: 120` を指摘対応で新規側にだけ追加している）。
2. 当初基準を grep 再現可能なアンカーで示す（例: 移植元に range 制限が無いことを `git grep -n "min:\|max:" src/forms/legacy-signup.mjs` がヒット0で確認）。
3. 技術的正しさ（値域を絞るのは妥当）とスコープ整合性を分離し、`妥当だが対象外` として指摘する。
4. `Severity: warning`（現在系の挙動を変える out-of-scope 制約・merge 前に分離/正当化すべき）とし、resolution（別 PR へ分離するか受入基準を更新して正当化）を添える。
5. 隣接 skill の領分（1コメント triage・caller 残骸・plan 前提解消・完了主張）としては指摘しない。
