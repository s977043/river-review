# Test Case: Rendering-Context Links (Should NOT Detect)

False-positive canary（#1464）: `pages/` 配下の公開ドキュメントが、Docusaurus で
配信されない repo 内領域（`skills/`）へ**絶対 GitHub URL** で参照し、issue を
`[#N](URL)` 形式でリンクしている。どちらもレンダリング先の制約による意図的な
選択であり、`doc-hygiene` は相対化 / bare 化を指摘してはならない。

## Description

- 絶対 GitHub URL: 相対化すると Docusaurus 公開サイトで 404 になる（`skills/` は配信対象外）。
- `[#1463](URL)`: bare `#1463` の自動リンクは GitHub の issue / PR 本文だけの仕様で、
  レンダリングされた `.md` ではプレーンテキスト化する。

## Input Diff

```diff
diff --git a/pages/guides/add-new-skill.md b/pages/guides/add-new-skill.md
index abc1234..def5678 100644
--- a/pages/guides/add-new-skill.md
+++ b/pages/guides/add-new-skill.md
@@ -10,0 +10,3 @@ スキル定義の雛形は次を参照してください。
+
+雛形は [_template.md](https://github.com/s977043/river-review/blob/main/skills/_template.md) を参照します。
+この変更の経緯は [#1463](https://github.com/s977043/river-review/issues/1463) を参照してください。
```

## Expected Behavior

The skill should NOT flag either link:

1. 絶対 GitHub URL を相対リンクへ変更する提案をしない（`skills/` は Docusaurus 非配信 → 相対化で 404）。
2. `[#1463](URL)` を bare `#1463` へ簡約する提案をしない（rendered `.md` では非リンク化）。

<!-- expected:
findings: []
reason: pages/→repo 非公開領域への絶対 GitHub URL と [#N](URL) 形式は、Docusaurus / .md レンダリングの制約による意図的選択であり指摘対象外（#1464）
-->
