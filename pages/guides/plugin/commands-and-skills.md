# コマンド・エージェント・スキル

プラグインが配布するものの一覧です。配布定義は `.claude-plugin/plugin.json`（Claude Code）と `.codex-plugin/plugin.json`（Codex）です。

| 種類               | Claude Code | Codex                |
| ------------------ | ----------- | -------------------- |
| スラッシュコマンド | 配布する    | 配布定義に含まれない |
| サブエージェント   | 配布する    | 配布定義に含まれない |
| スキル             | 配布する    | 配布する             |

`.codex-plugin/plugin.json` は `skills` と `interface` だけを宣言し、`commands` と `agents` を宣言していません。

## コマンド（Claude Code）

`.claude-plugin/plugin.json` の `commands` に登録された 7 件です。説明は各 `commands/*.md` の frontmatter `description` を要約しています。

| コマンド                     | 内容                                                                                           |
| ---------------------------- | ---------------------------------------------------------------------------------------------- |
| `/river-review:setup-team`   | `.river/rules.md` の作成、プラグイン導入の確認、統合モードの確認                               |
| `/river-review:review-local` | 未コミットの変更をレビューし修正案を出す。未コミットの変更がなければ既定ブランチとの差分が対象 |
| `/river-review:review-team`  | 複数ロールの並列レビューを consensusLevel と Tech Lead レポートで統合する                      |
| `/river-review:challenge`    | 現在の変更に pre-mortem / war-game / logic-torturing の敵対的分析をかける                      |
| `/river-review:skill`        | `skills/` から最も合うスキル文書を読み込み、現在のタスクに適用する                             |
| `/river-review:check`        | レビュー前に lint / test を実行し、失敗とリスクを要約する                                      |
| `/river-review:pr`           | テンプレートに沿ってレビュー可能な PR 本文を下書きする                                         |

## エージェント（Claude Code）

| エージェント   | 定義                     | 内容                                                                                    |
| -------------- | ------------------------ | --------------------------------------------------------------------------------------- |
| `river-review` | `agents/river-review.md` | `river-review` スキルの手順に従い、観点別レビュアーロールを実行して指摘を差分と照合する |

## スキル（Claude Code / Codex）

`skills/agent-skills/` 配下の 12 件です。説明は各 `SKILL.md` の `description` を要約しています。

| スキル                        | 内容                                                                               |
| ----------------------------- | ---------------------------------------------------------------------------------- |
| `river-review`                | メインエントリポイント。意図分類から専門スキルの選択・実行・指摘の検証までを束ねる |
| `river-review-code`           | 一般コード品質。既定のフォールバック先                                             |
| `river-review-security`       | 通常のセキュリティレビュー（認証・認可、プライバシー設計など）                     |
| `river-review-security-audit` | リポジトリやサブシステムを対象にした明示的なセキュリティ監査                       |
| `river-review-performance`    | N+1 クエリ、メモリ効率、キャッシュ戦略、可観測性                                   |
| `river-review-architecture`   | 依存関係、境界設計、データモデル、API 設計                                         |
| `river-review-testing`        | テスト網羅性、命名、フレーキーテスト、カバレッジの欠落                             |
| `river-review-frontend`       | アクセシビリティ、デザインシステム準拠、UI 状態設計など                            |
| `river-review-docs`           | README / docs / AGENTS.md と実装の整合性                                           |
| `adversarial-review`          | Pre-mortem / War Game / Logic Torturing による敵対的レビュー                       |
| `review-team`                 | 6 つの専門レビュアーロールの並列実行と結果の統合                                   |
| `unknown-coverage-review`     | 差分や検証証拠に残る未確認事項（Unknown）の横断合成                                |

Claude Code ではスキルも `/river-review:<skill-name>` で呼び出せます。

## 必要なファイルを読めないときは停止する

エージェント・スキル・一部のコマンドは、プラグインのルート（`$CLAUDE_PLUGIN_ROOT`）を Bash で解決して同梱ファイルを読みます。解決できない、またはファイルを読めない場合は、推測や代替基準で処理を続けずに停止します。以前は黙って代替していた場面でも、現在は停止して理由を報告します。

| 対象                                                | 停止の条件                                     | 報告される内容                                                 |
| --------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------- |
| `river-review` エージェント / `river-review` スキル | `river-review` の `SKILL.md` を読めない        | 「Skill Registry が未解決のためレビューを実行できない」        |
| `/river-review:setup-team`                          | `.river/rules.template.md` を読めない          | 「テンプレートが見つからない」（`.river/rules.md` は作らない） |
| `/river-review:skill`                               | 他スキルから委譲されたスキル ID を解決できない | 未解決として記録し、キーワード検索や推測で補わない             |
| PR を対象にしたレビュー                             | `gh` が使えず、`git fetch` でも差分を取れない  | PR の diff を渡すよう依頼する                                  |

### 停止したときの確認手順

1. セッション内で Bash から `echo "$CLAUDE_PLUGIN_ROOT"` を実行し、絶対パスが出るか確認する。空であれば、プラグインとして読み込まれていない。
2. `claude plugin list` で `river-review@river-review-marketplace` が導入済みで有効になっているか確認する。無効なら `claude plugin enable`、古いなら `claude plugin update` を実行し、Claude Code を再起動する（[更新・無効化・アンインストール](./update-and-uninstall.md)）。
3. それでも解決しない場合は、アンインストールしてから[導入手順](./install.md)に沿って入れ直し、再起動後に 1. をもう一度確認する。
4. PR を対象にしたレビューで止まった場合は、`gh` を使えるようにするか、`git diff <base>...<head>` の出力を渡す。

`$CLAUDE_PLUGIN_ROOT` が空でもルートを代わりに使うのは、river-review リポジトリ自身の中で動かす場合だけです。

## 関連ページ

- [プラグインを導入する](./install.md)
- [AI エージェントから River Review を使う](../agent-workflow.md)
