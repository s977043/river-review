# AI エージェントから River Review を使う

> **どのエントリポイントを使うか**
> 第一の（インストール不要の）エントリポイントは、同梱の **skill ルーティングレビュー** です。プラグインを導入し、`river-review` エージェントに diff のレビューを依頼する（または skill を読み込ませる）だけで動きます。Claude Code のセッションコンテキストを自動で渡したい場合は `/review-local`、ヘッドレスな委譲レビューにはサブエージェント（`agents/river-review.md`）を使ってください。`river` CLI（`river run .`）は **任意の高速化手段** で、プラグインとは別配布、かつ現時点では npm 未公開です。

## 概要

River Review は、暗黙知を versioned / repo-owned な Skill（Skill Registry）として共有資産に変える 3 つの主軸で構成されます。第 1 に AI エージェントのレビュー能力を強化する **capability pack**（通常 LLM キー不要）。第 2 にレビュースキル（**Skill Registry**）。第 3 にレビュー用エージェントと観点別レビュアーの **review team**（`reviewer-orchestrator.mjs` による並列実行 + connected-components マージ、`--reviewers auto`）に verdict 付き critic を組み合わせた仕組みです。本ページは、この 3 主軸を各 AI エージェントからどう呼ぶかを扱います。

River Review は **Claude Code / Codex プラグイン** として配布されます。第一のエントリポイントは、同梱の **skill ルーティングレビュー**（`river-review` オーケストレーターエージェント + `skills/agent-skills/` 配下の専門 skill）で、外部ツールを必要としません。skill を読み込める AI エージェント（Claude Code / Cursor / Codex CLI / GitHub Copilot ほか）であれば利用できます。

`river` CLI は構造化された findings を得るための **任意の高速化手段** です。プラグインとは別配布で、**現時点では npm 未公開**のため、必須の手順ではありません。

---

## 任意: `river` CLI

`river` CLI が `PATH` 上にある場合、以下のコマンドでレビューを高速化できます。これらは任意で、上記の skill ルーティングレビューには不要です。

```bash
# ローカルの diff をレビュー
river run .

# 自動チーム選択（diff の内容でロールを自動決定）
river run . --reviewers auto

# dry-run（API キー不要）
river run . --dry-run

# JSON 形式で出力
river run . --output json
```

### `--reviewers auto` の仕組み

`auto` を指定すると、diff の内容を解析してレビュアーロールを自動選択します。常に `bug-hunter` が含まれ、以下のシグナルに基づいて追加ロールが加わります。

| シグナル                                                                                             | 追加されるロール   |
| ---------------------------------------------------------------------------------------------------- | ------------------ |
| config / schema / migration / infra ファイルが変更されている、またはリスク評価済みファイルが存在する | `security-scanner` |
| test ファイルが変更されている、または app ファイルが 3 件以上ある                                    | `test-gap`         |

どのロールが選択されたかは、JSON 出力の `autoSelectedRoles` フィールドで確認できます。

```json
{
  "autoSelectedRoles": ["bug-hunter", "security-scanner", "test-gap"]
}
```

### チャンク分割と重複排除

複数のロール（`auto` を含む）でレビューする場合、大きな diff は自動的にチャンクに分割され、ロール × チャンクで並列実行されます。各実行から得られた findings は、最終 ID を割り当てる前にチャンク・ロール間で重複排除されます。このため、同一箇所の重複指摘は 1 件に統合されます（実装: `src/lib/reviewer-orchestrator.mjs` の `splitDiffIntoChunks` / `deduplicateFindings`）。

---

## エージェント別の呼び出し方

| エージェント   | 呼び出し方                                | 専用定義ファイル                           |
| -------------- | ----------------------------------------- | ------------------------------------------ |
| Claude Code    | Bash ツール / `/review-local` / sub-agent | `agents/river-review.md`                   |
| Cursor         | Terminal タブ / `@terminal`               | —                                          |
| Codex CLI      | `codex exec "river run ."`                | `templates/agent-workflow/codex/AGENTS.md` |
| GitHub Copilot | ターミナルで直接実行                      | `.github/agents/river-review.agent.md`     |
| その他         | シェルで `river run .`                    | `agents/examples/river-review.agent.yaml`  |

### Claude Code

Bash ツール経由で実行できます。

```bash
river run . --reviewers auto
```

スラッシュコマンドとサブエージェントも利用できます。

```text
/review-local
```

```text
river-review に現在の diff をレビューしてもらってください
```

専用定義: `agents/river-review.md`

### Cursor

Cursor の Agent モードからターミナルコマンドとして呼び出せます。

```bash
river run . --reviewers auto
```

プロジェクトルートに `.cursorrules` をコピーしてください。

```bash
cp templates/agent-workflow/cursor/.cursorrules .cursorrules
```

### Codex CLI

```bash
codex exec "river run . --reviewers auto"
```

Codex は Claude Code と同じプラグインマーケットプレイスに対応しています（両者は同一の `.claude-plugin/marketplace.json` を共有します）。推奨の導入方法はマーケットプレイスの追加です。

```bash
codex plugin marketplace add s977043/river-review
```

Codex は skills と interface メタデータをリポジトリ同梱の `.codex-plugin/plugin.json`（Codex ネイティブ manifest）から読み込みます。マーケットプレイス追加で専門レビュー skill がネイティブ登録されるため、追加のセットアップは不要です。

マーケットプレイスを使わない場合は、フォールバックが 2 つあります。1 つは `scripts/setup-codex.sh` の実行です（`AGENTS.md` 案内と `skills/agent-skills/` 一式を references 込みで冪等に vendoring します）。もう 1 つは専用定義 `templates/agent-workflow/codex/AGENTS.md` をプロジェクトの `AGENTS.md` へマージまたは追記する方法です。いずれもコミット前に River Review を自動実行できます。

### GitHub Copilot

`.github/agents/river-review.agent.md` が定義済みです。ターミナルで `river run .` を実行するか、Copilot に「`river run .` を実行してレビュー結果を確認して」と指示してください。

### その他のエージェント

シェルコマンドが実行できる環境であれば、`river run .` をそのまま呼び出せます。

---

## Agent Skills（エージェント横断の skill 定義）

`skills/agent-skills/` に**エージェント非依存の skill 定義**があります。どのエージェントにも渡せます。

| Skill                       | 用途                                                        |
| --------------------------- | ----------------------------------------------------------- |
| `river-review`              | メインレビュー（intent 分類 → 専門 skill へのルーティング） |
| `river-review-code`         | コードレビュー特化                                          |
| `river-review-security`     | セキュリティレビュー                                        |
| `river-review-performance`  | パフォーマンスレビュー（N+1 / 最適化）                      |
| `river-review-testing`      | テストカバレッジ                                            |
| `river-review-architecture` | アーキテクチャレビュー                                      |
| `adversarial-review`        | 逆張りレビュー（前提を疑う）                                |
| `river-review-docs`         | ドキュメント整合性レビュー（README / 翻訳 / 用語）          |

エージェントに skill を渡す際は、`skills/agent-skills/<skill-name>/SKILL.md` を読み込ませてください。

---

## W チェック（複数 AI の結果を統合する）

複数のエージェントのレビュー結果を統合したい場合は、W チェックを使ってください。詳細は [W チェック実践ガイド](./w-check.md) を参照してください。

---

## 関連ページ

- [クイックスタート](./quickstart.md)
- [GitHub Actions セットアップ](./github-actions.md)
- [W チェック実践ガイド](./w-check.md)
