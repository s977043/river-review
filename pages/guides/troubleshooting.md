# トラブルシューティング

よくある症状と、切り分けのための確認ポイントをまとめます。

関連: `pages/guides/faq.md`（よくある失敗の一覧）

## プラグイン {#plugin}

### コマンドやスキルが表示されない

1. インストール直後なら `/reload-plugins` を実行する。
2. コマンドは名前空間付きである。`/review-local` ではなく `/river-review:review-local` と入力する。
3. `claude plugin list` で `river-review` が導入済みかを確認する。無効化されている場合は `claude plugin enable river-review@river-review-marketplace` で有効化する。
4. Codex 向けの配布定義（`.codex-plugin/plugin.json`）は `skills` を宣言し、`commands` を宣言していない。スラッシュコマンドは Codex 向けの配布物に含まれない。詳細は [コマンド・エージェント・スキル](./plugin/commands-and-skills.md) を参照する。
5. Codex で導入済み・有効なのにスキルが使えない場合は、スキル一覧の予算超過を疑う。導入しているスキルが多いと、Codex はモデルに渡すスキル一覧を予算内に切り詰め、名前順で後ろにある `river-review:*` が一覧から落ちることがある。リポジトリの外で `codex debug prompt-input test` を実行し、`river-review:` で始まるスキルが出るかを確かめる。出ない場合は、使っていないプラグインを外すか、予算を上げる。予算を上げるときは、まず `codex -c skills.max_context_tokens=10000 debug prompt-input test` で出ることを確かめる（公式ドキュメントでは、明示する値の上限は 10,000 トークン）。確かめたら `~/.codex/config.toml` の `[skills]` に `max_context_tokens` を設定する。codex-cli 0.160.1 で確認した挙動である。

### 導入済みの版が古い

`claude plugin marketplace update river-review-marketplace` でマーケットプレイスを更新してから `claude plugin update river-review@river-review-marketplace` を実行します。更新の反映には再起動が必要です。最新の版は [GitHub Releases](https://github.com/s977043/river-review/releases/latest) で確認できます。

### 編集したファイルが勝手に整形される

PostToolUse hook がプロジェクトの prettier で変更ファイルを整形しています。挙動と止め方は [更新・無効化・アンインストール](./plugin/update-and-uninstall.md) を参照してください。

## CLI（`river run`）

### まず最初に（事前診断）

原因の切り分けが難しい場合は、まず `river doctor .` を実行して「設定の不足」や「差分取得の失敗」を確認してください。

### OpenAI API key が見つからない

- 症状（例）:
  - `LLM: OPENAI_API_KEY (or RIVER_OPENAI_API_KEY) not set`
  - `River Review doctor` の `OpenAI (review): not set`
- 対応:
  - `OPENAI_API_KEY` または `RIVER_OPENAI_API_KEY` を環境変数で設定すること
  - 外部送信を避けたい場合は `--dry-run` を利用すること

### Git リポジトリとして認識されない

- 症状: `Not a git repository: ...`
- 対応:
  - Git 管理下のディレクトリで実行すること
  - 必要なら `git init` / `git clone ...`

### スキル定義の読み込み/検証に失敗する

- 症状: `Skill configuration error: ...`
- 対応:
  - `npm run skills:validate` を実行してエラー詳細を確認すること
  - スキルスキーマの詳細は `pages/reference/skill-schema-reference.md` を参照すること

### ルール（`.river/rules.md`）が読めない

- 症状: rules ファイル読み込みエラー
- 対応:
  - `.river/rules.md` の存在と読み取り権限を確認すること（不要なら削除して無効化できる）

### 何がスキップされたのか分からない

- 対応:
  - `river run . --debug` を付けて、選択されたスキルとスキップ理由の出力を確認すること

### ローカル実行でファイルが検出されない

- 対応:
  - `git status` や `git diff` で差分を確認すること
  - `river run . --debug` で対象ファイル・ハンクのプレビューを確認すること

### レート制限エラー

- 対応:
  - OpenAI 側のレート制限に達していないか確認すること
  - しばらく待ってから再実行すること
  - 必要に応じて `--dry-run` でプロンプト/スキル選択のみ確認すること

## GitHub Actions

### レビューが実行されない / 権限エラー

- `permissions` が不足している可能性がある（例: `pull-requests: write`）
- `OPENAI_API_KEY` などの Secrets が正しく設定されているか確認すること

### 差分が検出されない

- `actions/checkout` の `fetch-depth: 0` を推奨する（merge-base を安定して取得するため）
