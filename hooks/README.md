# 共通hookスクリプト

ツール非依存の共通スクリプトを格納するディレクトリーです。
各AIコーディングツールからラッパー経由で呼び出されます。

## スクリプト一覧

| スクリプト                               | 用途                                                                                                                     | 呼び出し元                                                                     |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `format.sh`                              | 変更ファイルにPrettierを実行                                                                                             | `.claude/hooks/format.sh`                                                      |
| `hooks.json`                             | プラグイン配布用 hook 定義（`PostToolUse` と `Stop`）                                                                    | プラグインインストール先（Claude Code）                                        |
| `scripts/plugin-format-hook.sh`          | プラグイン同梱の自己完結フォーマッター（リポジトリ上は `hooks/` ではなく `scripts/` 配下）                               | `hooks.json`（`${CLAUDE_PLUGIN_ROOT}/scripts/plugin-format-hook.sh`）          |
| `scripts/plugin-task-checkpoint-hook.sh` | `Stop` 時に `river review plan --plan-only --entry review-task` で Review Artifact を出力する adapter（`scripts/` 配下） | `hooks.json`（`${CLAUDE_PLUGIN_ROOT}/scripts/plugin-task-checkpoint-hook.sh`） |

### `plugin-format-hook.sh` の defer 挙動

`plugin-format-hook.sh` は、インストール先プロジェクトに `.claude/hooks/format.sh` が存在する場合、二重整形を避けるために何もせず exit 0 で抜けます（river-review リポジトリ自身を開発する際の二重実行を防ぐための条件）。そのため、インストール先が独自に `.claude/hooks/format.sh` を持つ場合、プラグイン同梱のフォーマッターは意図的に no-op になります（プロジェクト側のフォーマッターが優先されます）。

## 各ツールでの強制方法

| 強制ポイント | 全ツール共通              | Claude Code              | Copilot             |
| ------------ | ------------------------- | ------------------------ | ------------------- |
| フォーマット | `npm run format`          | PostToolUse hook（自動） | VS Code保存時       |
| Lint         | `npm run lint`            | `/check`コマンド         | `/review`プロンプト |
| テスト       | `npm test`                | `/check`コマンド         | CI                  |
| スキル検証   | `npm run skills:validate` | CI                       | CI                  |

## 設計方針

- **npm scripts**が最大公約数（全ツールから実行可能）
- **CI（GitHub Actions）** が最終防衛線
- **ツール固有hooks**は追加の自動化レイヤー
- 共通スクリプトはこの`hooks/`に配置し、ツール固有設定からはラッパーとして呼び出す

詳細は[docs/agent-layers.md](../docs/agent-layers.md)の「③ 強制層」を参照してください。
