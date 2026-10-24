# チームで使う準備

`/river-review:setup-team` は、導入先プロジェクトに River Review のチーム用ルールを用意するコマンドです。このページの内容は `commands/setup-team.md` の手順に基づきます。

## 実行する

```text
/river-review:setup-team
```

## コマンドが行うこと

1. **現状確認**: `.river/rules.md` と `.river-review.json` / `.river-review.yaml` の有無、`package.json` の `scripts` に `review` などのエントリがあるかを確認する。
2. **`.river/rules.md` の生成**: ファイルがなければ、プラグイン同梱のテンプレート `.river/rules.template.md` から作成する。テンプレートを読めない場合は、推測でファイルを作らずに停止して報告する。
3. **統合モードの提示**: 下表の 3 つから用途に合うものを示す。
4. **インストール確認**と**動作確認**を行い、結果をサマリとして出力する。

| モード            | 用途                                       | 設定ファイル         |
| ----------------- | ------------------------------------------ | -------------------- |
| Plugin            | エージェント主導のインタラクティブレビュー | `.river/rules.md`    |
| GitHub Actions    | PR 自動レビュー                            | `.river-review.json` |
| CLI (`river run`) | ローカルまたは任意の CI                    | `.river-review.json` |

## `.river/rules.md` に書くこと

作成後、プロジェクト固有のルールを記入します。コマンドが案内する記入項目は、アーキテクチャ方針、禁止パターン、セキュリティ要件です。ファイルをリポジトリにコミットすると、チーム全員のレビューに同じ前提が渡ります。

Plugin モードでは `.river-review.json` は不要です。GitHub Actions や CLI を併用する場合の設定は [Adopter Playbook](../adopter-playbook.md) と [GitHub Actions ガイド](../github-actions.md) を参照してください。

## 関連ページ

- [プラグインを導入する](./install.md)
- [コマンド・エージェント・スキル](./commands-and-skills.md)
