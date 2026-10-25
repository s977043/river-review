# Test Case: Distribution-Context Link to docs/ (Should NOT Detect)

False-positive canary（[#1493](https://github.com/s977043/river-review/pull/1493)）:
`pages/`（Docusaurus 公開ルート）配下の公開ドキュメントが、Docusaurus のビルドに
含まれない repo ルートの `docs/` へ**絶対 GitHub URL** で参照している。`pages/` から
見て `docs/` はサイト外のパスであり、相対化すると公開サイトで 404 になるため、
`doc-hygiene` はこの絶対 URL を相対化する提案をしてはならない。

対になる反例（本パターンが「常に絶対 URL が正」という一律ルールではないことの根拠）:
[#1494](https://github.com/s977043/river-review/pull/1494) では `skills/`（plugin
バンドルに `docs/` が同梱される）から `docs/` への絶対 URL の相対化が **accepted**
されている。正誤はリンク元ディレクトリの配布経路で決まる。

## Description

- `pages/reference/loop-convergence-contract.md` は Docusaurus で公開される。
- 参照先 `docs/review/output-format.md` は Docusaurus のビルド対象外（サイト外）。
- 相対リンク（例: `../../docs/review/output-format.md`）に変換すると、公開サイトの
  URL 空間には `docs/` が存在しないため 404 になる。

## Input Diff

```diff
diff --git a/pages/reference/loop-convergence-contract.md b/pages/reference/loop-convergence-contract.md
index abc1234..def5678 100644
--- a/pages/reference/loop-convergence-contract.md
+++ b/pages/reference/loop-convergence-contract.md
@@ -40,0 +40,3 @@ verdict 写像は以下のとおりです。
+
+Unknown Coverage の出力受け皿の詳細は
+[docs/review/output-format.md](https://github.com/s977043/river-review/blob/main/docs/review/output-format.md) を参照してください。
```

## Expected Behavior

The skill should NOT flag this link:

1. 絶対 GitHub URL を相対リンクへ変更する提案をしない（`pages/` は Docusaurus 公開ルート、`docs/` は非配信 → 相対化で 404）。
2. 「repo 内リンクは常に相対化すべき」という一律の指摘をしない。配布経路（Docusaurus 公開 or plugin バンドル同梱）を先に確認する必要がある。

<!-- expected:
findings: []
reason: pages/（Docusaurus 公開ルート）から docs/（非配信パス）への絶対 GitHub URL は、相対化すると公開サイトで 404 になる意図的選択であり指摘対象外（#1493）。skills/→docs/ の相対化（#1494, accepted）とは配布文脈が逆であり、一律の変換ルールは適用しない
-->
