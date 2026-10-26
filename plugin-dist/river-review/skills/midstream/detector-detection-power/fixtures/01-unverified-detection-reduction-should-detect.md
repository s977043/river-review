# Test Case: 検出件数の減少を根拠なく改善と報告している（Check 1 / should-detect）

## Description

ドキュメント内部リンクの検査器 `scripts/check-doc-links.mjs` で、参照先の解決に使うキー集合を広げる変更。PR 本文は「誤検出を潰した」「79 → 42 件に減少」と改善として主張しているが、減った 37 件の内訳も、各件が誤検出であった理由も示されていない。

追加された 3 つのキー（小文字化・拡張子を落とした basename・slug 化）は、**実際のリンク解決規則が受理しないキー**を解決集合に混ぜている。したがって減少分には、誤検出の除去だけでなく**実ツールでは壊れている参照を「解決済み」と誤判定した見逃し**が含まれうる。件数の減少それ自体は、誤検出の除去と検出力の低下のどちらでも起こるため、改善の証拠にならない。

## Input Diff

```diff
diff --git a/scripts/check-doc-links.mjs b/scripts/check-doc-links.mjs
index 1111111..2222222 100644
--- a/scripts/check-doc-links.mjs
+++ b/scripts/check-doc-links.mjs
@@ -18,6 +18,9 @@ function buildResolvableKeys(files) {
   const keys = new Set();
   for (const file of files) {
     keys.add(file.relativePath);
     keys.add(file.title);
+    keys.add(file.title.toLowerCase());
+    keys.add(basename(file.relativePath, extname(file.relativePath)));
+    keys.add(slugify(file.title));
   }
   return keys;
@@ -52,3 +55,3 @@ async function main() {
   const broken = findBrokenLinks(files, keys);
-  console.log('broken links: ' + broken.length);
+  console.log('broken links: ' + broken.length + ' (was 79)');
   process.exit(broken.length > 0 ? 1 : 0);
```

## 照合先 / Artifacts

- PR 本文: 「リンク検査の誤検出を潰した。79 件 → 42 件に減少。残りは既知の外部リンク切れのみ」。
- PR 本文・コード内コメントのいずれにも、**減った 37 件の一覧**は無い。誤検出であった理由も 1 件も示されていない。
- 追加テスト・追加 fixture は差分に無い。既存テストは解決集合の内容を検証していない。
- 実際のリンク解決規則（`src/lib/resolve-link.mjs`）は `relativePath` と `title` の完全一致のみを解決する。小文字化・basename・slug は受理しない。
- スコープ縮小（対象ディレクトリの除外・別検査器への移管）の宣言は PR に無い。

## Expected Behavior

1. Check 1 として finding を 1 件出す。アンカーは `scripts/check-doc-links.mjs` の解決キー追加行。
2. Evidence に「PR 本文の減少主張」と「減った分の内訳が示されていないという事実」の両方を書く。件数を自分で推定して断定しない。
3. **検出されなくなる具体的な入力**を 1 つ示す（例: 実在しないページを大文字混じりの表記で参照した場合、小文字化キーが偶然一致して検出されない）。示せないなら question に落とす。
4. resolution として「減った 37 件を列挙し 1 件ずつ誤検出である理由を示す」または「追加キーを実際の解決規則と一致するものだけに絞る」を示す。
5. `console.log` の文言変更（`(was 79)` の追加）自体は指摘しない。出力整形は検出ロジックではない。
6. 「解決集合を Set で持つ設計」など、検出力と無関係な実装の一般論を指摘しない。

<!-- expected:
findings:
  - check: 1
    severity: major
    reason: 解決キーの拡張で検出が減ったが、減った分の内訳と誤検出である根拠が示されないまま改善として主張されている
    anchor: scripts/check-doc-links.mjs:22
-->
