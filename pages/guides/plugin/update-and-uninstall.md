# 更新・無効化・アンインストール

このページのコマンドは Claude Code 2.1.309 と codex-cli 0.160.1 の `--help` 出力で形を確認したものです。

## Claude Code

| 操作                     | コマンド                                                        |
| ------------------------ | --------------------------------------------------------------- |
| マーケットプレイスの更新 | `claude plugin marketplace update river-review-marketplace`     |
| プラグインの更新         | `claude plugin update river-review@river-review-marketplace`    |
| 無効化                   | `claude plugin disable river-review@river-review-marketplace`   |
| 再度有効化               | `claude plugin enable river-review@river-review-marketplace`    |
| アンインストール         | `claude plugin uninstall river-review@river-review-marketplace` |
| 導入済みの一覧           | `claude plugin list`                                            |

- `claude plugin update` の反映には再起動が必要である（`--help` の説明による）。
- `uninstall` の既定スコープは `user` である。別スコープに入れた場合は `-s, --scope` で指定する。`--keep-data` を付けると `~/.claude/plugins/data/{id}/` を残す。
- セッション内からは `/plugin disable river-review@river-review-marketplace` でも無効化できる（[安定インターフェース](../../reference/stable-interfaces.md)）。

## Codex

| 操作                     | コマンド                                                  |
| ------------------------ | --------------------------------------------------------- |
| マーケットプレイスの更新 | `codex plugin marketplace upgrade [MARKETPLACE_NAME]`     |
| アンインストール         | `codex plugin remove river-review@<マーケットプレイス名>` |
| マーケットプレイスの削除 | `codex plugin marketplace remove <名前>`                  |

`codex plugin marketplace upgrade` は `MARKETPLACE_NAME` を省略すると、設定済みの Git マーケットプレイスをすべて更新します（`--help` の説明による）。

`codex plugin --help` に無効化のサブコマンドはありません。

## hook が作業ツリーを書き換える

Claude Code 版は `hooks/hooks.json` で 2 つの hook を配布します。

### PostToolUse（自動整形）

Write / Edit / MultiEdit の後に `scripts/plugin-format-hook.sh` が動き、**導入先プロジェクトの prettier で変更ファイルを `--write` 整形します**。作業ツリーのファイルが書き換わります。

- 対象拡張子は `js` `jsx` `ts` `tsx` `cjs` `mjs` `json` `md` `yml` `yaml` である。
- 編集したファイルのパスが hook 入力から取れれば、そのファイルだけを整形する。取れなければ `git diff --name-only HEAD` の変更ファイル全体を整形する。
- prettier はプロジェクトに入っているものだけを使い（`npx --no-install`）、インストールはしない。prettier・npx・git のどれかが無ければ何もせず終了する。
- プロジェクトに `.claude/hooks/format.sh` があれば、そちらに任せて何もしない。
- prettier の終了コードは無視される。整形が走ったことは検証が通った証拠にならない。

### Stop（タスクチェックポイント）

`scripts/plugin-task-checkpoint-hook.sh` が Review Artifact を `$TMPDIR/river-review-task-checkpoint/` に出力します。作業ツリーには書きません。環境変数 `RIVER_TASK_CHECKPOINT_HOOK=0` で止められます。

詳細は [安定インターフェース](../../reference/stable-interfaces.md) を参照してください。

### hook を止めたい場合

PostToolUse hook だけを個別に止める設定は配布物にありません。整形を避けたい場合はプラグインを無効化してください。

## 関連ページ

- [プラグインを導入する](./install.md)
- [トラブルシューティング](../troubleshooting.md#plugin)
