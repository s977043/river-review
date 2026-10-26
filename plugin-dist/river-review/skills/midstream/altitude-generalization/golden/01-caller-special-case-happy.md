# Expected Output: Caller Special-Case on Shared Formatter

## Findings

- `src/lib/finding-formatter.mjs:51`: 共有 formatter `formatFinding` に3つ目の caller 専用分岐（`options.caller === 'markdown-exporter'`）を追加。既存の `sarif-writer` / `github-annotator` 分岐と合わせ同種の special-case が3つに増えている。Impact: caller が増えるたびに共有関数が肥大化し、呼び出し元固有の知識が共通層へ漏れて保守が難化。Fix: caller ごとの header 整形を宣言的な caller-config マップ（またはstrategy）へ寄せ、`formatFinding` は表引きに一般化する。Severity: minor / Confidence: high
