---
description: 'Set up River Review in the current project: create .river/rules.md, confirm plugin install, and check integration mode'
allowed-tools: Bash(ls:*), Bash(cat:*), Read, Write
---

## Task

River Review をこのプロジェクトでセットアップします。以下の手順を順に実行してください。

### Step 1: 現状確認

1. `.river/rules.md` が存在するか確認する。
2. `.river-review.json` / `.river-review.yaml` が存在するか確認する（CLI / GitHub Actions パスの設定ファイル）。
3. `package.json` の `scripts` に `review` 等のエントリがないか確認する。

```bash
ls -la .river/ 2>/dev/null || echo ".river/ が見つかりません"
ls .river-review.* 2>/dev/null || echo ".river-review.* が見つかりません"
```

### Step 2: .river/rules.md の生成

`.river/rules.md` がなければ作成する。
テンプレートは `<plugin root>/.river/rules.template.md` にある。Read ツールが環境変数を展開するとは限らないため、`${CLAUDE_PLUGIN_ROOT}` を含むパスをそのまま Read に渡さない。

1. Bash で `echo "$CLAUDE_PLUGIN_ROOT"` を実行し、出力された絶対パスを `<plugin root>` として Read する。
2. 出力が空のときに `.` を使ってよいのは、river-review リポジトリ内で動かす場合だけである。
3. それでもテンプレートを読めなければ、`.river/rules.md` を推測で作らない。「テンプレートが見つからない」と報告して止まる。

テンプレートの内容を `.river/rules.md` として Write ツールで保存する（親ディレクトリは自動作成される）。

作成後、ユーザーにプロジェクト固有のルール（アーキテクチャ方針、禁止パターン、セキュリティ要件）を記入するよう案内する。

### Step 3: 統合モードの確認

Adopter Playbook に基づいて、ユーザーに最適な統合モードを提示する:

| モード               | 用途                                       | 設定ファイル         |
| -------------------- | ------------------------------------------ | -------------------- |
| Plugin（このモード） | エージェント主導のインタラクティブレビュー | `.river/rules.md`    |
| GitHub Actions       | PR 自動レビュー                            | `.river-review.json` |
| CLI (`river run`)    | ローカルまたは任意の CI                    | `.river-review.json` |

現在は **Plugin モード**（インタラクティブレビュー）を使用中です。

### Step 4: インストール確認

Claude Code にプラグインが正しくインストールされているか確認:

```bash
# Claude Code でインストール済みの場合は以下で確認できる
cat "${CLAUDE_PLUGIN_ROOT}/package.json" 2>/dev/null | grep '"version"' || echo "プラグイン ROOT が設定されていません"
```

インストールされていない場合は以下を案内する:

```text
/plugin marketplace add s977043/river-review
/plugin install river-review@river-review-marketplace
/reload-plugins
```

### Step 5: 動作確認

セットアップが完了したら `/river-review:review-local` を実行して動作確認を行う。

## Output

以下のサマリを出力してください:

```text
## River Review セットアップ結果

- .river/rules.md: [作成済み / 既存 / 作成が必要]
- .river-review.json: [あり / なし（Plugin モードでは不要）]
- プラグイン: [インストール済み / 未インストール]
- 推奨次アクション: [具体的なステップ]
```
