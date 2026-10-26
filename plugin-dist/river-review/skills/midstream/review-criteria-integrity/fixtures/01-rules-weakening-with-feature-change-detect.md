# Test Case: Review Rule Deletion Mixed With a Feature Change (should detect)

## Description

外部入力を扱うハンドラを新規追加する PR で、同時に `.river/rules.md` から「外部入力には入力検証を必須とする」基準を削除している。削除の理由は PR 本文・コミットメッセージのどこにも書かれていない。review-criteria-integrity は Check 1（レビュールールの削除・弱体化）で 1 件検出する。

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
diff --git a/src/api/webhook.mjs b/src/api/webhook.mjs
new file mode 100644
index 0000000..3333333
--- /dev/null
+++ b/src/api/webhook.mjs
@@ -0,0 +1,5 @@
+export async function handleWebhook(request) {
+  const payload = await request.json();
+  await persist(payload.event, payload.body);
+  return { ok: true };
+}
```

## PR 本文 / Artifacts

- PR 本文: 「Webhook 受信ハンドラを追加する」とだけ書かれている。`.river/rules.md` の変更には言及していない。
- コミットメッセージ: `feat: webhook ハンドラを追加する`。ルール削除の理由・代替の担保は記載なし。
- 基準の移設先は無い（`.river/rules.d/` に同等の記述は追加されていない）。

## Expected Behavior

本 skill は以下を満たすこと。

1. Check 1 を 1 件検出する（`.river/rules.md` から入力検証必須の基準が削除され、同一 PR で外部入力ハンドラを追加している）。
2. 変更前の基準を差分内のアンカーで示す（`.river/rules.md:13` の削除行）。
3. 混在する機能変更を `file:line` で示す（`src/api/webhook.mjs:1` 付近の新規ハンドラ）。
4. 移設・リネームによる見かけ上の削除でないことを確認する（`.river/rules.d/` に同等記述が無い）。
5. `Severity: blocker`（その PR 自身の審査を素通りさせる）とし、resolution（別 PR へ分離する、または削除理由と代替の担保を PR 本文に明記する）を添える。
6. 意図を断定せず、混在という構造と宣言が見当たらない事実のみを述べる。
