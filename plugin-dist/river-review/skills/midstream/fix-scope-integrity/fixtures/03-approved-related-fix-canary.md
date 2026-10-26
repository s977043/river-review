# Test Case: Pre-Approved In-Scope Related Fix (False Positive Guard)

## Description

レビュー指摘対応で、当初スコープ内のバグ修正に不可欠な関連修正を追加した差分。さらに PR 本文で「バリデーション共通化のリファクタを同梱する」と事前宣言しており、受入基準も更新されている。指摘対応ループの文脈はあるが、スコープ拡大は正当（スコープ内の関連修正 + 事前承認済みリファクタ）で、前提破壊も無い。fix-scope-integrity はこの差分に対して findings を出してはならない should-not-detect canary。

## Input Diff

```diff
diff --git a/src/forms/signup.mjs b/src/forms/signup.mjs
index 1111111..2222222 100644
--- a/src/forms/signup.mjs
+++ b/src/forms/signup.mjs
@@ -38,5 +38,6 @@ export function buildSignupSchema() {
   return {
     name: { type: 'string', required: true },
-    age: { type: 'number', required: true },
+    // バグ修正: age 未入力時に required が効かない不具合を修正（当初スコープ内）
+    age: { type: 'number', required: true, nullable: false },
   };
 }
diff --git a/src/forms/validate.mjs b/src/forms/validate.mjs
new file mode 100644
index 0000000..3333333
--- /dev/null
+++ b/src/forms/validate.mjs
@@ -0,0 +1,6 @@
+// PR 本文で事前宣言済みのバリデーション共通化リファクタ
+export function assertRequired(schema, value) {
+  if (schema.required && (value == null || value === '')) {
+    throw new Error('required field is missing');
+  }
+}
```

## PR 本文 / Artifacts

- PR 本文: 「新規登録フォームの required バグ修正。**あわせてバリデーション共通化のリファクタを同梱する**（事前承認済み）」とスコープを宣言。
- 受入基準: 「required バグの修正」に加え「バリデーション共通化」が追記済み（更新で正当化）。
- コミット連鎖に `fix: レビュー指摘対応` あり（指摘対応ループの signal はある）。
- caller が依存する前提（`renderWidget` の error 契約等）は変更していない。

## Expected Behavior

本 skill は以下を満たすこと。

1. **findings を出さない**。`nullable: false` の追加は当初スコープ内のバグ修正に不可欠な関連修正であり scope creep ではない。`validate.mjs` の追加は PR 本文で事前宣言/事前承認され受入基準も更新済みのため正当なスコープ拡大。
2. 前提破壊が無いことを確認する（依存 caller の契約は不変）。Premise break 軸でも指摘しない。
3. 「スコープが広がっている気がする」等の一般論や、正当化済み拡大への question を出さない（false-positive-first / 低リスク PR での過剰出力の抑制）。
