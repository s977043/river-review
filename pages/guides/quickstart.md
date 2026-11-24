# クイックスタート (River Review)

River Review を最小構成で試すなら、**まずローカルの AI エージェントから始める**のが最短です。Skill をゼロから書いたり、CI 用 API キーを用意したりする必要はありません。

## Path A: Claude Code でローカル差分を試す（推奨）

導入手順の詳細（ターミナルからの導入、Codex、版の固定）は [プラグインを導入する](./plugin/install.md) にまとめています。所要時間は環境によって異なり、実測前の「5分で完了」は保証しません。

> **導入前に確認:** Claude Code 版の PostToolUse hook は Write / Edit / MultiEdit の後に導入先の Prettier を `--write` 実行することがあり、作業ツリーを書き換えます。整形 hook だけを個別無効化する配布設定はありません。無効化・削除しても既存のファイル変更は自動復元されません。Stop hook は CLI が利用でき、レビュー計画が成功した場合に限り一時領域へチェックポイントを出力します。実行条件を満たさない場合は成功コードでスキップするため、生成の有無を別途確認してください。まず使い捨ての Git リポジトリで試し、[副作用・無効化・アンインストール](./plugin/update-and-uninstall.md) を読んでから導入してください。

### 0. レビュー対象の差分を準備

既存の Git リポジトリで **tracked ファイルの未コミット差分**を用意してください。未追跡ファイルのみでは `review-local` の対象になりません。差分がない場合は既定ブランチとの比較にフォールバックし、`git fetch origin` を試みる場合があります。操作前後で `git status --porcelain=v1 --untracked-files=all`、`git diff`、`git diff --cached` を比較すると、副作用を確認できます。

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

### 4. 終了・解除

Claude Code からの無効化は `/plugin disable river-review@river-review-marketplace`、ターミナルからは `claude plugin disable river-review@river-review-marketplace` を使います。完全削除は `claude plugin uninstall river-review@river-review-marketplace` です。詳しくは [更新・無効化・アンインストール](./plugin/update-and-uninstall.md) を参照してください。

より専門的な観点が必要なら、`river-review-security` / `river-review-performance` / `river-review-architecture` / `river-review-testing` などの同梱 Skill を利用できます。

> 通常のプラグイン利用では **River Review 用の追加 LLM API キーは不要**です。Claude Code 自身のモデルが Skill を適用します。

## Path B: Codex で試す

Codex もマーケットプレイスから導入します。

```text
codex plugin marketplace add s977043/river-review
codex plugin marketplace list
codex plugin add river-review@river-review-marketplace
```

Codex で使えるのはプラグインの同梱スキルです。マーケットプレイス名は配布例です。`codex plugin marketplace list` の登録名が異なる場合は読み替えてください。CLI の版による相違があるため、追加後は [導入ガイド](./plugin/install.md) に沿ってスキルが利用可能か確認してください。Claude Code 専用の `/river-review:review-local` コマンドは Codex の配布定義に含まれません。アンインストールは [更新・無効化・アンインストール](./plugin/update-and-uninstall.md) を参照してください。

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
