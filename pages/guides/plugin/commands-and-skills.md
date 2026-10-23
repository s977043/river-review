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

## 関連ページ

- [プラグインを導入する](/guides/plugin/install)
- [AI エージェントから River Review を使う](/guides/agent-workflow)
