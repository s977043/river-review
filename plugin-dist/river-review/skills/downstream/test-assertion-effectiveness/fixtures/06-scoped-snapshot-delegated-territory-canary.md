# Test Case: 追従済み期待値・スコープ済み検証・委譲先の領分（Check 4 / 5 / 6 の抑制条件 / canary）

## Description

マークアップ変更にアサーションが正しく追従し、期待値が対象要素へスコープされ、例外検証も明示的に固定されている should-not-detect canary。あわせて、決定論検出器および `vitest-mock-isolation` の領分（`.skip` / 空の `catch {}` / un-awaited `.resolves`）と正当な snapshot テストを差分に含め、本 skill が重複指摘しないことを固定する。

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
+  <a href="{{ route('comparison.download', $comparison) }}" rel="nofollow">
+    <span class="badge">要件整理シート付き</span>
+    <span class="label">比較表をダウンロード</span>
+  </a>
diff --git a/tests/Feature/ComparisonDownloadTest.php b/tests/Feature/ComparisonDownloadTest.php
index 3333333..4444444 100644
--- a/tests/Feature/ComparisonDownloadTest.php
+++ b/tests/Feature/ComparisonDownloadTest.php
@@ -18,6 +18,17 @@ class ComparisonDownloadTest extends TestCase
     {
         $response = $this->actingAs($this->paidUser)->get('/comparison/1');

-        $response->assertSee('要件整理シート付き比較表をダウンロード');
+        $response->assertSeeInOrder(['要件整理シート付き', '比較表をダウンロード'], false);
+        $response->assertMatchesRegularExpression(
+            '#<a href="[^"]*comparison/1/download"[^>]*rel="nofollow"#',
+            $response->getContent()
+        );
     }
+
+    public function test_download_rejects_a_free_plan_user(): void
+    {
+        $this->expectException(AuthorizationException::class);
+
+        $this->actingAs($this->freeUser)->get('/comparison/1/download');
+    }
 }
diff --git a/tests/ui/ComparisonCard.test.tsx b/tests/ui/ComparisonCard.test.tsx
index 5555555..6666666 100644
--- a/tests/ui/ComparisonCard.test.tsx
+++ b/tests/ui/ComparisonCard.test.tsx
@@ -4,0 +4,12 @@ import { ComparisonCard } from '../../src/ui/ComparisonCard';
+  it('matches the rendered markup', () => {
+    const { container } = render(<ComparisonCard comparison={fixture} />);
+    expect(container.firstChild).toMatchSnapshot();
+  });
+
+  it.skip('supports the legacy layout', () => {
+    expect(render(<ComparisonCard variant="legacy" />)).toBeTruthy();
+  });
+
+  it('loads the comparison', () => {
+    expect(loadComparison(1)).resolves.toMatchObject({ id: 1 });
+  });
```

## 照合先 / Artifacts

- 照合先テンプレート: `resources/views/comparison/show.blade.php`（同一 diff で変更済み）。
- 検索語 `要件整理シート付き` と `比較表をダウンロード` はいずれも変更後のテンプレートに存在する。
- 検索語 `rel="nofollow"` は共通レイアウトにも出現するが、テスト側は `href` を含む正規表現で対象 `<a>` 要素へスコープしている。
- snapshot ファイル `tests/ui/__snapshots__/ComparisonCard.test.tsx.snap` は同一 diff で更新されている。

## Expected Behavior

本 skill は findings を 1 件も出さないこと。

1. **Check 4 として指摘しない**: マークアップの分割に対し、期待値が `assertSeeInOrder` の 2 要素へ正しく追従している。据え置きは無い。
2. **Check 5 として指摘しない**: `rel="nofollow"` は共通レイアウトにも現れる汎用トークンだが、`href` を含む正規表現で対象要素にスコープされているため、対象 `<a>` から `rel` を除去すればテストは落ちる。
3. **Check 6 として指摘しない**: `expectException` により、例外が投げられなかった場合にテストが落ちる仕組みが成立している。
4. **snapshot テストを指摘しない**: `toMatchSnapshot` のみのテストは、それ自体を理由に指摘しない（Non-goals）。
5. **委譲先の領分を指摘しない**: `it.skip` は決定論検出器（`disabled-test`）、un-awaited な `expect(...).resolves` は `vitest-mock-isolation` の責務であり、本 skill からは出力しない。
6. 一般論の指摘や question を出さない（false-positive-first / 責務分界の遵守）。

<!-- expected:
findings: []
-->
