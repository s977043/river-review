# River Review への貢献に感謝します

このプロジェクトをより良くするために時間を割いていただき、ありがとうございます。バグ報告、機能提案、ドキュメントの改善など、あらゆる形の貢献を歓迎します。
英語版は `CONTRIBUTING.en.md` を参照してください（英語はベストエフォートの翻訳です）。

## ⚖️ 行動規範 (Code of Conduct)

私たちは、すべての人が参加しやすい、オープンで友好的なコミュニティを目指しています。貢献にあたっては、私たちの[行動規範](CODE_OF_CONDUCT.md)を遵守してください。

## 💡 貢献を始めるには

貢献にはいくつかの方法があります。

### ✅ Issue 作成前の確認

- 既存 Issue（open/closed）を検索し、重複がないか確認してください
- ドキュメント（`README.md` / `pages/`）に既に答えや方針がないか確認してください
- 脆弱性の可能性がある場合は公開 Issue を作らず、`SECURITY.md` に従って非公開で報告してください

Issue テンプレートは `Issues → New issue` から利用できます（または [issues/new/choose](https://github.com/s977043/river-review/issues/new/choose)）。

### 🗂️ Issue の使い分け（目安）

- Bug: 期待動作と異なる挙動、例外、誤った出力など
- Feature/Enhancement: 新機能・改善提案（スキル追加、CLI/Action/Docs の改善など）
- Task: 具体的な作業項目（ロードマップ/運用改善/リファクタ等）
- Documentation: ドキュメントの追加・誤り修正
- Question: 相談・質問（軽い内容でも`question`ラベルを使ってIssueに投稿）

### 💬 Discussions とコミュニティ導線

質問・相談・アイデア出し・利用例の共有は Discussions を使ってください。まだ「やること」が固まっていない対話は Discussion から始め、対応方針が固まった段階で Issue 化します。Star のあとの次の一歩・Discussions カテゴリ・`good first issue` 候補は [docs/growth/community.md](docs/growth/community.md) に整理しています。

もしバグを発見した場合は、Issueを作成して報告してください。良いバグ報告には以下の情報が含まれます。

- **問題の概要**: 何が問題なのかを簡潔に説明してください。

- **再現手順**: 他の人が問題を再現できる具体的なステップを記述してください。

- **期待される動作**: 本来どうあるべきだったかを説明してください。

- **実際の動作**: 実際に何が起こったかを説明してください。

### ✨ 機能提案

新しいチェックリスト項目やエージェントのアイデアがある場合は、Issueを作成して提案してください。

- **明確なタイトル**: 提案内容がわかるようなタイトルを付けてください。

- **提案の背景**: なぜこの機能が必要なのか、どのような問題を解決するのかを説明してください。

### 📝 プルリクエストのプロセス

1. このリポジトリを**Fork**してください。
2. ローカルにクローンし、新しい変更のための**ブランチを作成**してください (`git checkout -b feature/your-feature-name`)。
3. 変更を行い、コミットしてください。コミットメッセージは分かりやすく記述してください。
4. ローカルでチェックを通してください（最低限 `npm test` と `npm run lint`）。
5. 作成したブランチをGitHubに**Push**してください (`git push origin feature/your-feature-name`)。
6. プルリクエストを作成してください。プルリクエストのテンプレートに従い、変更内容を詳細に説明してください。

プルリクエストは、小さく、目的にフォーカスしたものであることが理想です。

### コミットメッセージ規約

本リポジトリでは [Conventional Commits](https://www.conventionalcommits.org/) を採用しており、`commitlint` で自動検証します（設定: [`commitlint.config.js`](./commitlint.config.js)）。リリース自動化（release-please）がコミット種別を参照してchangelogを生成するため、規約に従うことが重要です。

代表的なコミット種別の例を示す。

```text
feat: レビュー結果に YAML 出力オプションを追加
fix: Vale の設定ファイルが見つからないときのエラー処理を修正
docs: GitHub Action の入力パラメータを README に追記
chore: eslint を v9 にアップグレード
```

### PR 提出後に期待できること

- **レビュー開始の目安**: 提出から 7 日以内にメンテナーが確認します（返答がない場合はコメントで催促してください）。
- **マージに必要な承認**: メンテナー 1 名以上の Approve が必要です。
- **CI ゲート**: 以下の必須チェックがすべて green にならないとマージできません。
  - Lint（`npm run lint` = Prettier フォーマットチェック / dash チェック / code hygiene / markdownlint / textlint）
  - Unit tests (22.x)
  - Skill schema validation
  - Meta consistency
  - Action dist freshness
  - Integration (CLI)
  - Blocked label guard
- **PR がクローズされる条件（マージなし）**: 著者から 30 日以上応答がない場合、スコープ外の変更が含まれる場合、または既存の作業と重複する場合はクローズすることがあります。クローズ前には理由をコメントで通知します。

### ✅ ローカルでのチェック（推奨）

初回は[開発ランブック](docs/runbook/dev.md)に従って、`.nvmrc` の Node.js と依存関係を用意してください。

```bash
npm test
npm run lint
```

変更内容に応じて、以下も実行してください:

- スキル（`skills/`）を変更した: `npm run skills:validate`
- Agent Skills（`skills/agent-skills/`）を変更した: `npm run agent-skills:validate`
- エージェント定義を変更した: `npm run agents:validate`
- トレース関連の機能を変更した: `npm run trace:validate`（OpenTelemetry 検証が必要な場合）

### 📎 関連ドキュメント

- レビューチェックリスト: `pages/contributing/review-checklist.md`

### 🔒 セキュリティへの配慮

コードを変更する際は、一般的なセキュリティ上の誤りを意識してください。

- **入力検証**: 外部から受け取るデータ（CLIオプション、ファイルパス等）は検証してから使用する
- **依存関係の脆弱性**: `npm audit` で既知の脆弱性がないか確認する（CI の nightly-audit でも自動チェックしている）
- **秘密情報**: APIキー・トークン等をコードや設定ファイルにハードコードしない（`.env*` はコミット禁止）
- **コマンドインジェクション**: シェルコマンドを組み立てる場合は引数をエスケープする

セキュリティ上の懸念がある場合は、公開 Issue ではなく `SECURITY.md` に従って非公開で報告してください。

## 🏷️ リリース（タグ発行）運用

このリポジトリは `release-please` により、リリース用の PR を `main` 向けに自動作成し、その PR をマージしたタイミングでタグ（例: `v0.1.2`）と GitHub Release を自動作成します。

- 通常の PR を `main` にマージしても、毎回タグは発行しません（リリース PR だけがタグ発行をトリガーします）。
- リリースを行う場合は、`release-please` が作成した Release PR を確認してマージしてください。

### 🧭 コーディング/運用ルール（要約）

- JS/Node は ESM を前提とし、テストは `npm test` で実行します。実行器の不安定さを避けるフラグは npm スクリプト側で管理します
- フォーマットは Prettier を使用します（`npm run lint` でチェック）
- `.env*` などの秘密情報はコミットしないでください（例示はダミー値を使ってください）
- ドキュメントサイトのソースは `pages/`（Docusaurus）です。`docs/` は内部/運用ドキュメントの置き場で、必要に応じて `pages/` から参照します
- `package-lock.json` は手動編集せず、依存関係を変更した場合は `npm install` で更新してください（`npm ci` はロックファイルに従うクリーンインストールです）

## 📚 Documentation contributions

River Review のドキュメントは [Diátaxis documentation framework](https://diataxis.fr/) に従っています。ドキュメントを追加・更新する際は、どのタイプに当てはまるかを決め、型に沿って書いてください。
日本語版（`.md`）をソース・オブ・トゥルースとし、英語版は同名の `.en.md` をベストエフォートで維持します。差分がある場合は日本語版を優先してください。

- Tutorial（チュートリアル）  
  学習指向のステップバイステップで、新しいユーザーが River Review で最初の成功体験を得られるようにするもの。  
  例: "First steps with River Review on GitHub Actions"

- How-to guide（ガイド）  
  具体的なゴール達成のためのレシピ。読者は基本を理解済みです。  
  例: "Add a custom review skill" / "Run River Review locally"

- Reference（リファレンス）  
  API、設定、スキーマなどを正確かつ可能な限り網羅的に説明するもの。  
  例: "GitHub Action inputs" / "skill YAML schema"

- Explanation（背景解説）  
  背景、設計判断、概念を説明するもの。  
  例: "Upstream/midstream/downstream model" / "Design principles of River Review"

レビューを円滑にするため、以下もお願いします。

- ファイルは該当するセクションに配置してください（例: `pages/tutorials/`, `pages/guides/`, `pages/reference/`, `pages/explanation/`）。英語版を追加する場合は、同じ場所に `.en.md` を付けたファイル名で配置してください。
- 選んだタイプを PR のタイトルまたは説明に明記してください（例:
  - Docs: Tutorial—Getting started with River Review
  - Docs: How-to—Add a custom skill
  - Docs: Reference—GitHub Action inputs
  - Docs: Explanation—River Review flow model）

## ✍️ ドキュメントスタイル（ダッシュ）

このリポジトリでは、ドキュメントのダッシュの扱いを次のように統一しています:

- 見出しや YAML front-matterの`title`など、文章の区切り用途のダッシュはem-dash（—）を用い、**前後のスペースは入れない**(例:`Part I—概要`)。
- 数値範囲（`0.0–1.0`のような場合）はen-dash（–）を利用し、そのままにする。
- コードブロックや YAMLの一部（値以外の要素）には自動変換を適用しない。

自動化:

- レポジトリには`scripts/fix-dashes.mjs`（node）という自動修正スクリプトを用意している。ローカルで実行する際は`npm run fix:dashes`を利用すること。
- CIとPRではVale（Prose Lint）を用い、Microsoft Dashesルールに従わせている。PR作成前にローカルでlinterを実行することを推奨する。

## 📜 帰属

このガイドは、[contributing.md template](https://gist.github.com/PurpleBooth/b24679402957c63ec426) や [opensource.guide](https://opensource.guide/how-to-contribute/) などの優れた先行事例を参考に作成されました。
