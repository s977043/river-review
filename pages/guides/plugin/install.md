# プラグインを導入する

River Review は Claude Code と Codex のプラグインとして配布されます。このページが導入手順の正本です。ほかのページには最短コマンドだけを載せ、詳細はここへリンクします。

通常のプラグイン利用では、**River Review 用の LLM API キーは不要**です。エージェント自身のモデルが Skill を適用します。

## Claude Code

### 1. マーケットプレイスを追加する

```text
/plugin marketplace add s977043/river-review
```

マーケットプレイス名は `river-review-marketplace` です（`.claude-plugin/marketplace.json` の `name`）。

### 2. プラグインをインストールする

```text
/plugin install river-review@river-review-marketplace
/reload-plugins
```

ターミナルから導入する場合は `claude plugin` サブコマンドを使います。

```bash
claude plugin marketplace add s977043/river-review
claude plugin install river-review@river-review-marketplace
```

`claude plugin install` の既定スコープは `user` です。ほかのスコープに入れる場合は `claude plugin install --help` で指定方法を確認してください。

### 3. 動作を確認する

```text
/river-review:review-local
```

コマンドは `/river-review:<name>` の形で名前空間化されます。配布物の一覧は [コマンド・エージェント・スキル](./commands-and-skills.md) を参照してください。

## Codex

### 1. マーケットプレイスを追加する

```bash
codex plugin marketplace add s977043/river-review
```

### 2. プラグインを追加する

`codex plugin add` は `PLUGIN@MARKETPLACE` 形式で指定します（`codex plugin add --help`）。マーケットプレイス名は `codex plugin marketplace list` で確認してください。

```bash
codex plugin marketplace list
codex plugin add river-review@<マーケットプレイス名>
```

### Codex で使えるもの

`.codex-plugin/plugin.json` が宣言するのは `skills`（`./skills/agent-skills/`）と `interface` メタデータだけです。`commands` と `agents` は宣言していません。このため Codex で使えるのは同梱スキルで、`/river-review:review-local` などのスラッシュコマンドと `river-review` サブエージェントは配布定義に含まれません。

マーケットプレイスを使わない場合の手動フォールバック（`scripts/setup-codex.sh` など）は [エージェントワークフロー](../agent-workflow.md#codex-cli) を参照してください。

## バージョンを固定する

再現可能な導入にしたい場合は、利用時点のリリースタグを固定してください。リリース一覧は [GitHub Releases](https://github.com/s977043/river-review/releases) にあります。

## 次に読む

- [最初のレビュー](../quickstart.md)
- [チームで使う準備](./team-setup.md)
- [更新・無効化・アンインストール](./update-and-uninstall.md)
- [トラブルシューティング](../troubleshooting.md#plugin)
