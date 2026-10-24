# Documentation policy

River Review の公式公開ドキュメントと、OSS リポジトリ内の開発資料の責務を定義します。

## 公開範囲と単一ソース

- **公式サイトのドキュメントの正（Single Source of Truth）は `pages/`** とする。Docusaurus は `pages/` を読み込む。
- **`docs/` は公式サイトに掲載しない開発・保守資料**とする。ただし River Review は公開 GitHub リポジトリであり、`docs/` も第三者から閲覧可能である。「非公開」や「機密」の意味ではない。
- 秘密情報、認証情報、未公開の個人情報を `docs/` を含むリポジトリにコミットしない。
- 公式サイトに掲載する情報は `pages/` に書き、内部検討の履歴や根拠は `docs/` に記録する。同内容の全文複製は避ける。
- 公開ページから `docs/` の不安定な実装メモへ読者を誘導しない。公開が必要な内容は `pages/` に説明を用意する。

## ファイルの配置

- `README.md` / `README.en.md`：短いプロジェクト紹介、初回導入、公式ドキュメントへの導線
- `pages/tutorials/`：順を追った初回利用チュートリアル
- `pages/guides/`：目的別の実行手順
- `pages/reference/`：CLI、Schema、Output contract 等の実装済み仕様
- `pages/explanation/`：コンセプト、背景、設計理由
- `docs/adr/`：Architecture Decision Records
- `docs/development/`：開発メモ、検証記録、振り返り
- `docs/review/`：レビュー基準、運用設計
- `docs/runbook/`：リリースや障害対応の手順
- `docs/migration/`：移行の設計、検証記録
- `docs/governance/` / `docs/policy/`：リポジトリの管理・運用方針
- `.github/`：GitHub が認識する OSS 管理文書、テンプレート、ワークフロー

`docs/ai/`・`docs/data/`・`docs/eval/`・`docs/growth/`・`docs/specs/`・`docs/use-cases/` 等の既存の分類は、用途に合致する限り維持します。単純なディレクトリ数の削減のための移動は行いません。

## 配置を決める判断順序

1. エージェント、プラグイン、ビルドツールが既定パスから読み込むか。Yes ならそのパスを維持する。
2. GitHub のコミュニティ・脆弱性報告等の標準文書か。Yes なら `.github/` を利用する。
3. 外部の利用者が安定した仕様・手順として参照するか。Yes なら `pages/` に置く。
4. GitHub 訪問者が導入前に必要とする要約か。Yes なら `README.md` または `README.en.md`。詳細は `pages/` に置く。
5. 開発者向けの設計履歴、探索結果、運用記録か。Yes なら `docs/` に分類する。

## 開発資料の読み方

- `docs/README.md` は設計・レビュー・Runbook の入口とする。各文書の正本を複製せず、参照先を示す。
- `docs/` の古い日付は自動的な廃止を意味しない。現行仕様か調査記録かは本文・Issue・実装で確認する。
- 歴史的な設計判断を消すために一括移動・一括削除しない。移動する場合は利用側のリンクと自動読み込みを個別に検証する。

## 互換性の確認

- 公開ページの URL と Docusaurus の doc ID は、原則維持する。変更する場合はリダイレクトと内部リンクを同じ PR で更新する。
- 日本語版を正本として対応する英語版 `*.en.md` を更新する。
- 既存のプラグインマニフェスト、GitHub Actions、CLI、エージェント指示ファイルのパスを破壊しない。
- Markdown の参照リンクと GitHub の Community files の認識を確認する。
- `npm run build`、`npm run check:links:local`、`npm run meta:validate`、`npm run check:bilingual`、`npm run check:doc-placement` を対象に応じて実行する。

## 例外

新しい分類や例外的な配置が必要な場合、PR 本文に理由・参照先・互換性上の注意を記録します。
