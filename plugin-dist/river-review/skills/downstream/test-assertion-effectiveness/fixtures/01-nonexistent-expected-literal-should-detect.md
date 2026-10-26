# Test Case: 期待文字列が対象テンプレートに実在しない（Check 3 / should-detect）

## Description

新機能「比較表ダウンロード導線の出し分け」を追加する PR で、無料プランに導線が出ないことを `assertDontSee` で検証している。しかし期待文字列 `無料プランではご利用いただけません` はテンプレートに一度も存在せず、テンプレートが出力するのは `このプランではご利用いただけません` である。したがってこのアサーションは実装が壊れても常に PASS する。issue #1684 パターン1 に対応する。

## Input Diff

```diff
diff --git a/resources/views/comparison/show.blade.php b/resources/views/comparison/show.blade.php
index 1111111..2222222 100644
--- a/resources/views/comparison/show.blade.php
+++ b/resources/views/comparison/show.blade.php
@@ -28,3 +28,5 @@
   @if ($plan->allowsDownload())
     <a href="{{ route('comparison.download', $comparison) }}">比較表をダウンロード</a>
+  @else
+    <p class="notice">このプランではご利用いただけません</p>
   @endif
diff --git a/tests/Feature/ComparisonDownloadTest.php b/tests/Feature/ComparisonDownloadTest.php
index 3333333..4444444 100644
--- a/tests/Feature/ComparisonDownloadTest.php
+++ b/tests/Feature/ComparisonDownloadTest.php
@@ -40,2 +40,11 @@ class ComparisonDownloadTest extends TestCase
     }
+
+    public function test_free_plan_cannot_download(): void
+    {
+        $user = User::factory()->freePlan()->create();
+
+        $response = $this->actingAs($user)->get('/comparison/1');
+
+        $response->assertDontSee('無料プランではご利用いただけません');
+    }
 }
```

## 照合先 / Artifacts

- 照合先テンプレート: `resources/views/comparison/show.blade.php`（同一 diff に含まれる）。
- 検索語 `無料プランではご利用いただけません` は同ファイルに 0 件。実際の出力は `このプランではご利用いただけません`。
- PR 本文・テスト名・コメントに「削除された文言の回帰固定」を示す記述は無い。新機能の検証意図で書かれている。

## Expected Behavior

1. Check 3 として finding を 1 件出す。アンカーは `tests/Feature/ComparisonDownloadTest.php` の `assertDontSee` 行。
2. Evidence に照合先ファイルパスと検索語（ヒット 0 件）を明記し、第三者が同じ grep で再現できるようにする。
3. Fix / resolution として、期待値を実際の出力 `このプランではご利用いただけません` に合わせる最小修正を示す。
4. 「テンプレートに `@else` 分岐を追加したこと」自体は指摘しない（本 skill の対象はアサーションの有効性であり、実装の是非ではない）。

<!-- expected:
findings:
  - check: 3
    severity: major
    reason: assertDontSee の期待文字列が照合先テンプレートに 0 件で、実装が壊れても落ちない
-->
