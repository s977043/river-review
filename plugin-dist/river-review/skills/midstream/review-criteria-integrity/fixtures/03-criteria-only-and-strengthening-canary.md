# Test Case: Criteria-Only PR, Strengthening, and Rule Relocation (False Positive Guard)

## Description

レビュー基準の見直しだけを行う PR。機能変更（実行されるコードの挙動を変える差分）は含まない。内容は (a) `.river/rules.md` から `.river/rules.d/security.md` への基準の移設、(b) required check の追加、(c) lint ルールの追加の 3 点で、いずれも弱体化ではない。review-criteria-integrity はこの差分に対して findings を出してはならない should-not-detect canary。

## Input Diff

```diff
diff --git a/.river/rules.md b/.river/rules.md
index 1111111..2222222 100644
--- a/.river/rules.md
+++ b/.river/rules.md
@@ -11,3 +11,2 @@ ## セキュリティ
 - 認証情報をログへ出力しない
 - 監査ログの改ざん防止を確認する
-- 外部入力を扱う関数には入力検証を必須とする
diff --git a/.river/rules.d/security.md b/.river/rules.d/security.md
new file mode 100644
index 0000000..3333333
--- /dev/null
+++ b/.river/rules.d/security.md
@@ -0,0 +1,4 @@
+# セキュリティ基準
+
+- 外部入力を扱う関数には入力検証を必須とする
+- 入力検証は境界層で行い、内部層では前提として扱う
diff --git a/.github/workflows/test.yml b/.github/workflows/test.yml
index 4444444..5555555 100644
--- a/.github/workflows/test.yml
+++ b/.github/workflows/test.yml
@@ -30,2 +30,4 @@ jobs:
       - name: Unit tests
         run: npm test
+      - name: Type check
+        run: npm run typecheck
diff --git a/eslint.config.mjs b/eslint.config.mjs
index 6666666..7777777 100644
--- a/eslint.config.mjs
+++ b/eslint.config.mjs
@@ -8,2 +8,3 @@ export default [
       'no-console': 'warn',
+      'no-implicit-coercion': 'error',
     },
```

## PR 本文 / Artifacts

- PR 本文: 「セキュリティ基準を `rules.d/` へ切り出し、型チェックの required check と lint ルールを 1 件追加する」と目的を宣言している。
- 機能変更は含まない（`src/**` に差分なし）。
- 移設先 `.river/rules.d/security.md` に、削除された基準と同等以上の記述がある。

## Expected Behavior

本 skill は以下を満たすこと。

1. **findings を出さない**。`.river/rules.md` の削除は `.river/rules.d/security.md` への移設であり、基準の総量は減っていない（削除側だけを見て弱体化と判定しない）。
2. required check の追加と lint ルールの追加は強化方向であり、弱体化ではない。
3. 機能変更が同一 PR に無いため、そもそも混在の条件を満たさない。基準変更のみの PR には指摘しない。
4. 「基準を触っている」だけを理由にした question を出さない（false-positive-first）。
