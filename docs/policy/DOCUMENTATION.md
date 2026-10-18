# Documentation policy

River Review の公式公開ドキュメントと、OSS リポジトリ内の開発資料の責務を定義します。

## 公開範囲と単一ソース

- **公式サイトのドキュメントの正（Single Source of Truth）は `pages/`** です。Docusaurus は `pages/` を読み込みます。
- **`docs/` は公式サイトに掲載しない開発・保守資料**です。ただし River Review は公開 GitHub リポジトリなので、`docs/` も第三者から閲覧可能です。「非公開」や「機密」の意味ではありません。
- 秘密情報、認証情報、未公開の個人情報を `docs/` を含むリポジトリにコミットしてはいけません。
- 公式サイトに掲載する情報は `pages/` に書き、内部検討の履歴や根拠は `docs/` に書きます。同内容の全文複製は避けます。
- 公開ページから `docs/` の不安定な実装メモへ読者を誘導しないでください。公開が必要な内容は `pages/` に説明を用意します。

## ファイルの配置

| 場所 | 用途 |
| --- | --- |
| `README.md` / `README.en.md` | GitHub 上の短いプロジェクト紹介、最初の利用方法、公式ドキュメントへの導線 |
| `pages/tutorials/` | 初めての利用者向けの順を追ったチュートリアル |
| `pages/guides/` | 実現したい目的別の手順 |
| `pages/reference/` | 実装済み CLI・Schema・Output contract 等の仕様 |
| `pages/explanation/` | コンセプト、背景、設計上の理由 |
| `docs/adr/` | Architecture Decision Records |
| `docs/development/` | 開発メモ・検証記録・振り返り |
| `docs/review/` | レビュー基準と運用設計 |
| `docs/runbook/` | リリースや障害対応などの運用手順 |
| `docs/migration/` | 移行の設計と検証記録 |
| `docs/governance/` / `docs/policy/` | リポジトリの管理・運用方針 |
| `.github/` | GitHub が認識する OSS 管理文書、テンプレート、ワークフロー |

`docs/ai/`・`docs/data/`・`docs/eval/`・`docs/growth/`・`docs/specs/`・`docs/use-cases/` 等の既存の分類は、用途に合致する限り維持します。単純なディレクトリ数の削減のための移動は行いません。

## 配置を決める判断順序

1. その情報を外部の利用者が安定した仕様・手順として参照するか。Yes なら `pages/`。
2. GitHub への訪問者が導入前に必要とする要約か。Yes なら `README.md` または `README.en.md`。詳細は `pages/` に置く。
3. GitHub のコミュニティ・脆弱性報告等の標準文書か。Yes なら `.github/` を利用する。
4. 開発者向けの設計履歴、探索結果、運用記録か。Yes なら `docs/` に分類する。
5. エージェントやビルドツールの自動読み込み対象か。Yes なら認識される既定パスを維持し、見た目だけを理由に移動しない。

## 互換性の確認

- 公開ページの URL と Docusaurus の doc ID は、原則維持する。変更する場合はリダイレクトと内部リンクを同じ PR で更新する。
- 日本語版を正本として対応する英語版 `*.en.md` を更新する。
- 既存のプラグインマニフェスト、GitHub Actions、CLI、エージェント指示ファイルのパスを破壊しない。
- Markdown の参照リンクと GitHub の Community files の認識を確認する。
- `npm run build`、`npm run check:links:local`、`npm run meta:validate`、`npm run check:bilingual`、`npm run check:doc-placement` を対象に応じて実行する。

## 例外

新しい分類や例外的な配置が必要な場合、PR 本文に理由・参照先・互換性上の注意を記録します。
