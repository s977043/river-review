# Expected Output: Lockfile Integrity Hash

## Summary

機密候補に見える高エントロピー文字列はすべて SRI ダイジェスト（lockfile integrity）であり秘密ではないため、このスキルは指摘しない。

## Findings

NO_ISSUES

この差分は以下の理由で機密混入なしと判定される:

- `integrity: sha512-...` は npm パッケージの内容ハッシュ（Subresource Integrity ダイジェスト）であり、公開情報。高エントロピーだが秘密ではない → False-positive guards「ハッシュ・UUID への難癖をしない」適用
- `resolved` は公開 registry の URL であり秘密ではない
- 追加行に API キー / トークン / 秘密鍵 / .env 実値 / 個人パスは存在しない

補足: `package-lock.json` は secret-scan の frontmatter `exclude` グロブ（`**/package-lock.json`, `**/*.lock` 等）により midstream skill-dispatcher の per-file 実行経路では本来除外され、LLM 呼び出し自体が発生しない。
