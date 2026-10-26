# Test Case: 新設ガードの検出力が実証されていない（Check 2 / should-detect）

## Description

ドキュメントページがサイドバーから到達できることを保証する新しいガードを追加し、CI に step として組み込む変更。PR 本文は「ガードを追加した。CI は緑」とだけ述べており、**検出すべき入力を注入して赤くなること**も、**正当な入力で緑のままであること**も示していない。

さらに実装は、走査結果が空のときに `orphans.length > 0` が偽となって成功で抜ける。つまり `pages/` が丸ごと消失しても、このガードは緑を返す。「0 件だから問題なし」と「0 件しか見ていない」が区別されていない典型的な vacuous pass である。走査件数の出力も無いため、走査範囲が黙って縮んでも気付けない。

## Input Diff

```diff
diff --git a/scripts/check-orphan-pages.mjs b/scripts/check-orphan-pages.mjs
new file mode 100644
index 0000000..3333333
--- /dev/null
+++ b/scripts/check-orphan-pages.mjs
@@ -0,0 +1,14 @@
+import { readdirSync, readFileSync } from 'node:fs';
+
+const pages = readdirSync('pages', { recursive: true }).filter((p) => p.endsWith('.md'));
+const sidebar = readFileSync('pages/_sidebar.md', 'utf-8');
+
+const orphans = pages.filter((p) => !sidebar.includes(p));
+
+if (orphans.length > 0) {
+  console.error('orphan pages: ' + orphans.join(', '));
+  process.exit(1);
+}
+
+console.log('sidebar reachability: OK');
+process.exit(0);
diff --git a/.github/workflows/ci.yml b/.github/workflows/ci.yml
index 4444444..5555555 100644
--- a/.github/workflows/ci.yml
+++ b/.github/workflows/ci.yml
@@ -30,2 +30,5 @@ jobs:
       - name: Run unit tests
         run: npm test
+
+      - name: Check orphan pages
+        run: node scripts/check-orphan-pages.mjs
```

## 照合先 / Artifacts

- PR 本文: 「サイドバーから到達できないページを検出するガードを追加した。CI は緑」。
- 差分にテスト・fixture は含まれない。孤立ページを意図的に注入した実行ログも、正当な入力で緑になることを示すログも PR に無い。
- 新設ガードは同一 PR の CI で 1 回実行され成功しているが、その実行で**何件を走査したか**は出力されていない。
- 追加された step は外部ツールの呼び出しではなく、リポジトリ独自の判定ロジックである（外部ツール委譲による抑制は適用されない）。

## Expected Behavior

1. Check 2 として finding を 1 件出す。アンカーは `scripts/check-orphan-pages.mjs` の判定行。
2. Evidence に「変異注入の証跡が差分・PR 本文のいずれにも無い」という事実を書く。「CI が緑」を検出力の証拠として扱わない。
3. **検出できない具体的な入力**を 1 つ示す（例: `pages/` を丸ごと削除すると走査結果が空になり、`orphans.length > 0` が偽で終了コード 0 になる）。
4. resolution として「孤立ページを注入した実行結果を貼る」「走査件数を出力させる」「対象 0 件のときに失敗させる」のいずれかを示す。
5. workflow の `permissions` や action の pin には触れない（`gha-workflow-security` の領分）。
6. `readdirSync` の同期 I/O や例外処理の欠如など、検出力に影響しない実装品質は指摘しない。

<!-- expected:
findings:
  - check: 2
    severity: major
    reason: 新設ガードに変異注入の証跡が無く、走査結果が空でも成功するため検出力が実証されていない
    anchor: scripts/check-orphan-pages.mjs:6
-->
