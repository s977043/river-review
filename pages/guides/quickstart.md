# クイックスタート (River Review)

River Review を最小構成で試すなら、**まずローカルの AI エージェントから始める**のが最短です。Skill をゼロから書いたり、CI 用 API キーを用意したりする必要はありません。

## Path A: Claude Code で 5 分で試す（推奨）

### 1. Marketplace を追加

```text
/plugin marketplace add s977043/river-review
```

再現可能な導入にしたい場合は、利用時点のリリースタグを固定してください。

### 2. プラグインをインストール

```text
/plugin install river-review@river-review-marketplace
/reload-plugins
```

### 3. 現在の差分をレビュー

```text
/river-review:review-local
```

より専門的な観点が必要なら、`river-review-security` / `river-review-performance` / `river-review-architecture` / `river-review-testing` などの同梱 Skill を利用できます。

> 通常のプラグイン利用では **River Review 用の追加 LLM API キーは不要**です。Claude Code 自身のモデルが Skill を適用します。

## Path B: Codex で試す

Codex は同じプラグインマーケットプレイスを利用します。

```text
codex plugin marketplace add s977043/river-review
```

マーケットプレイス追加後、`.codex-plugin/plugin.json` から River Review の専門 review skill が登録されます。セットアップの詳細や手動コピーインのフォールバックは [エージェントワークフロー](./agent-workflow.md) を参照してください。

## Path C: GitHub Actions で PR 後レビューを追加する

チーム共通の PR 後レビューを行う場合は GitHub Actions を追加します。この **ヘッドレス実行**では LLM provider の API キーが必要です。

```yaml
name: River Review
on:
  pull_request:
    branches: [main]

jobs:
  review:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
      issues: write
    steps:
      - uses: actions/checkout@v6
        with:
          fetch-depth: 0
      - uses: s977043/river-review/runners/github-action@v1
        with:
          phase: midstream
        env:
          OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

本番運用では `@v1` のような浮動メジャータグではなく、**利用時点の具体的なリリースタグへ固定**することを推奨します。詳細は [GitHub Actions ガイド](./github-actions.md) を参照してください。

## 次にやること

最初から独自 Skill を作る必要はありません。次の順序を推奨します。

1. [Starter Cookbook](./starter-cookbook.md) から既存 Skill / Skill Pack を選ぶ。
2. [2 段構えレビューゲート](./two-stage-review-gate.md) で「PR 前ローカル + PR 後 CI」にする。
3. 実行結果を [Run store / 回帰比較](./track-runs-and-regressions.md) で観測する。
4. 必要になった判断だけ [はじめてのスキル作成](../tutorials/creating-your-first-skill.md) で repo-owned Skill にする。
5. Skill を変更したら fixture / golden / regression eval で品質を維持する。

この順序なら「まず使う → 効果を見る → 必要な判断だけコード化する」と段階的に導入できます。
