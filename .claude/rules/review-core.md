---
description: River Reviewのレビュー基準（ローカルレビュー時に自動適用）
globs:
  - '**/*'
---

# レビュー基準

詳細な基準は以下のSSoTを参照すること:

- 重要度ラベルと出力形式: `docs/review/output-format.md`
- レビュー観点: `docs/review/viewpoints.md`
- レビューポリシー全体: `pages/reference/review-policy.md`
- severity 内部語彙と出力スキーマ対応の実体: `src/lib/finding-factory.mjs`

## Severityの語彙マッピング

内部語彙（LLMプロンプト）とJSON出力スキーマの対応:

| 内部語彙 | 出力スキーマ |
| -------- | ------------ |
| blocker  | critical     |
| warning  | major        |
| nit      | minor        |
| (なし)   | info         |

不明な値はfail-safeとして`major`に分類される。

## このルール固有の追加指示

- 差分に存在しないコードへの推測に基づく指摘は禁止
- 一般論だけのレビュー（具体的な差分への言及なし）は禁止
- PRの目的と無関係な指摘は禁止
- 批判的・攻撃的な口調は禁止

## カスタム静的解析の False-positive 責務分界（#1070）

プロジェクト固有のカスタム linter / 静的解析の誤検出（false-positive）は、AI レビューで都度判断させず **canary テスト（既知の誤検出パターン集）で機械的に担保**する。これにより、誤検出を一度修正しても再発に気づけるようにする。AI レビューと静的解析の責務を次のように分ける:

- **静的解析（カスタム linter 含む）**: 構文的・パターン的に決定論で判定できる領域を 100% 守る。誤検出は canary で回帰防止。
- **AI レビュー**: linter が見ない意味的整合性（設計・スコープ・受入基準の妥当性）に集中し、canary が守る領域を重複指摘しない。
