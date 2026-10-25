# Test Case: 期待値が対象要素にスコープされていない（Check 5 / should-detect）

## Description

外部リンクに `rel="nofollow"` を付与する変更に対し、`assertSee('rel="nofollow"')` で検証している。しかし共通レイアウトのフッターが常時 `rel="nofollow"` を出力するため、検証対象の外部リンクから `rel` を除去してもこのアサーションは PASS する。issue #1684 パターン3 に対応する。

## Input Diff

```diff
diff --git a/resources/views/articles/show.blade.php b/resources/views/articles/show.blade.php
index 1111111..2222222 100644
--- a/resources/views/articles/show.blade.php
+++ b/resources/views/articles/show.blade.php
@@ -22,3 +22,3 @@
   @foreach ($article->externalLinks as $link)
-    <a href="{{ $link->url }}" target="_blank">{{ $link->title }}</a>
+    <a href="{{ $link->url }}" target="_blank" rel="nofollow noopener">{{ $link->title }}</a>
   @endforeach
diff --git a/tests/Feature/ArticleExternalLinkTest.php b/tests/Feature/ArticleExternalLinkTest.php
index 3333333..4444444 100644
--- a/tests/Feature/ArticleExternalLinkTest.php
+++ b/tests/Feature/ArticleExternalLinkTest.php
@@ -12,2 +12,11 @@ class ArticleExternalLinkTest extends TestCase
     }
+
+    public function test_external_links_are_nofollow(): void
+    {
+        $article = Article::factory()->withExternalLink('https://example.com')->create();
+
+        $response = $this->get("/articles/{$article->slug}");
+
+        $response->assertSee('rel="nofollow"', false);
+    }
 }
```

## 照合先 / Artifacts

- 照合先テンプレート: `resources/views/articles/show.blade.php`（同一 diff）と共通レイアウト `resources/views/layouts/app.blade.php`（diff 外・`code_search` で到達可能）。
- 検索語 `rel="nofollow"` は `resources/views/layouts/app.blade.php` のフッターリンクにも 3 件ヒットする。ページ共通で常時出力される。
- 検証対象は記事本文の外部リンクのみだが、アサーションは応答全体を対象にしている。

## Expected Behavior

1. Check 5 として finding を 1 件出す。アンカーは `assertSee('rel="nofollow"', false)` の行。
2. Evidence として、共通レイアウト側で同じトークンが出力される `file:line` と、そこに到達するのに使った検索語を明記する。
3. Impact として「検証対象の外部リンクから `rel` を除去しても PASS する」ことを述べる。
4. Fix / resolution として、対象要素にスコープした検証（`assertSeeInOrder` での前後関係固定、対象 `href` を含む正規表現、または DOM 選択ベースの検証）への置換を示す。
5. テンプレート側で `noopener` を併記したことは指摘しない（アサーション有効性の観点外）。

<!-- expected:
findings:
  - check: 5
    severity: major
    reason: 共通レイアウトが常時出力するトークンを応答全体に対して assert しており、対象要素から除去しても PASS する
-->
