# Test Case: マークアップ変更にアサーションが追従していない（Check 4 / should-detect）

## Description

同一 diff でテンプレートの文言が 2 つの `<span>` に分割されたが、その文言を検証する `assertSee` の期待値は連結文字列のまま据え置かれている。分割後の HTML には連結文字列が現れないため、このテストは次の実行で必ず失敗する。テストファイルも同一 diff で変更されている（別ケースの追加）にもかかわらず、期待値だけが追従していない点が検出条件である。issue #1684 パターン2 に対応する。

レビュー時点の CI が 2 コミット前の sha で緑だったため、CI の色は有効性の証明にならない。

## Input Diff

```diff
diff --git a/resources/views/comparison/show.blade.php b/resources/views/comparison/show.blade.php
index 1111111..2222222 100644
--- a/resources/views/comparison/show.blade.php
+++ b/resources/views/comparison/show.blade.php
@@ -14,3 +14,4 @@
-  <a href="{{ route('comparison.download', $comparison) }}">
-    <span>要件整理シート付き比較表をダウンロード</span>
-  </a>
+  <a href="{{ route('comparison.download', $comparison) }}">
+    <span class="badge">要件整理シート付き</span>
+    <span class="label">比較表をダウンロード</span>
+  </a>
diff --git a/tests/Feature/ComparisonDownloadTest.php b/tests/Feature/ComparisonDownloadTest.php
index 3333333..4444444 100644
--- a/tests/Feature/ComparisonDownloadTest.php
+++ b/tests/Feature/ComparisonDownloadTest.php
@@ -18,6 +18,13 @@ class ComparisonDownloadTest extends TestCase
     {
         $response = $this->actingAs($this->paidUser)->get('/comparison/1');

         $response->assertSee('要件整理シート付き比較表をダウンロード');
     }
+
+    public function test_download_link_points_to_signed_url(): void
+    {
+        $response = $this->actingAs($this->paidUser)->get('/comparison/1');
+
+        $response->assertSee(route('comparison.download', 1));
+    }
 }
```

## 照合先 / Artifacts

- 照合先テンプレート: `resources/views/comparison/show.blade.php`（同一 diff で変更済み）。
- 変更後のマークアップに連結文字列 `要件整理シート付き比較表をダウンロード` は存在しない（2 要素に分割）。
- PR 本文: 「比較表ダウンロード導線のラベルを 2 段組みに変更し、署名付き URL のテストを追加する」。期待値の据え置きを意図した記述は無い。

## Expected Behavior

1. Check 4 として finding を 1 件出す。アンカーは据え置かれた `assertSee('要件整理シート付き比較表をダウンロード')` の行。差分の `-` 行ではなく、変更されずに残っている既存アサーション行を対象とする。
2. Evidence として、同一 diff でテンプレート側が分割された `file:line` と、分割後に連結文字列が一致しなくなる事実を併記する。
3. Fix / resolution として、対象要素にスコープした検証（分割後の 2 要素をそれぞれ検証する、または対象 `<a>` 要素へスコープした正規表現）への置換を示す。
4. 新規追加された `assertSee(route(...))` は SUT 由来の値を検証しており有効なため指摘しない。
5. 「CI が緑だから問題ない」という理由で抑制しない。

<!-- expected:
findings:
  - check: 4
    severity: major
    reason: 同一 diff でマークアップが分割されたのに assertSee の期待値が連結文字列のまま据え置かれている
-->
