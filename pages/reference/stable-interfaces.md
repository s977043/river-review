---
title: 安定インターフェース（CLI / GitHub Actions）
---

River Review は OSS として成長中であり、内部実装は変更される可能性があります。一方で、利用者が安心して導入できるように **安定した契約（stable contract）** を定義します。

破壊的変更（breaking change）は原則として **major version bump** が必要です。ただし何を破壊的変更と見なすかは、後述のコンポーネント安定性ラベルと Stable Contract の列挙で決まります。Beta のサーフェスなら、Stable Contract に載っていない要素の変更は minor 以下で入ります。

## 安定した契約（Stable Contract）

次の要素は「外部に公開されたインターフェース」として扱います。

- スキル定義（`schemas/skill.schema.json`）と、その意味論（severity/confidence など）
- GitHub Actions（`runners/github-action/action.yml`）のinputs / outputsと動作
- CLI（`river` / `river-review`）のコマンド/オプション
- CLI の gate 判定用の終了コード（`--fail-on` / `--warn-on` / `--gate` が返す `0` / `1` / `2` / `3`）
- PR コメントの idempotent 更新方式（marker）

CLI の項目はコマンド名とオプション名、およびその意味を指します。どの面がそのオプションを受理するかという範囲は含みません。受理範囲は CLI サーフェス全体のラベルである Beta に従います（後述の「バージョニング（破壊的変更の扱い）」を参照）。

終了コードは用途で粒度を分けています。CI がゲート結果として読む上記の値だけを Stable Contract に含めます。usage error（引数の解釈失敗）の終了コードは含めず、CLI サーフェス全体のラベルである Beta に従います。裁定の根拠は後述の「終了コードの安定性」にあります。

## コンポーネント安定性ラベル

各サーフェスの現在の安定性レベルを示します。

| ラベル           | 定義                                                              |
| ---------------- | ----------------------------------------------------------------- |
| **Stable**       | 破壊的変更にはメジャーバンプが必要。本番利用推奨                  |
| **Beta**         | マイナーバージョンで API が変わる可能性がある。非推奨化は事前通知 |
| **Experimental** | 予告なく変更・削除される可能性がある。評価目的での利用を推奨      |

| サーフェス                                                    | ラベル       | 備考                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GitHub Action                                                 | Beta         | v0.x のため breaking changes の可能性あり                                                                                                                                                                                                            |
| CLI (`river` コマンド)                                        | Beta         | サーフェス全体は Beta。Stable Contract に列挙した要素のみ Stable 扱い                                                                                                                                                                                |
| Skill Schema (`schemas/skill.schema.json`)                    | Beta         | CI バリデーション済み、フィールド拡張の可能性あり                                                                                                                                                                                                    |
| Flow Schema (`schemas/flow.schema.json`)                      | Experimental | #2013 で追加した contract。実行エンジンは未実装。`schemas/flow-entry-map.schema.json` と `flows/entry-map.json` も同じ Experimental 扱い                                                                                                             |
| Agent Contract (`schemas/agent-contract.schema.json`)         | Experimental | #2014 で追加した contract。実行エンジンは未実装                                                                                                                                                                                                      |
| Execution Manifest (`schemas/execution-manifest.schema.json`) | Experimental | #2015 で追加した contract。Review Artifact への連結は additive・optional。#2054 PR-4 以降、`river run --save` の `.river/runs/*.json` と `river review plan` / `review exec`（replay を含む）の artifact に `executionManifest` が末尾キーとして載る |
| Node API (`runners/node-api/`)                                | Experimental | `private: true`、npm 未公開                                                                                                                                                                                                                          |
| Agent Skills bridge                                           | Experimental | v0.9.0 で追加、成熟途上                                                                                                                                                                                                                              |
| Riverbed Memory                                               | Experimental | 設計フェーズ — 安定化は未定。利用前に最新の Issue を確認してください                                                                                                                                                                                 |

## CLI（`river`）リファレンス（最小）

### コマンド

- `river run <path>`: ローカルでレビューを実行する
- `river doctor <path>`: 設定/前提を診断し、ヒントを出す
- `river skills <path>`: skill ベースのレビューを実行する（サブコマンド `river skills import` / `river skills export` / `river skills list` で Agent Skills と相互変換）
- `river review plan`: 上流アーティファクトを解決して Review Artifact を出力する（[仕様](./cli-review-plan-spec.md)）
- `river runs list`: 保存済みレビュー実行（`.river/runs/`）の一覧を表示する
- `river runs diff <id1> <id2> [<id3>...]`: 保存済みレビュー実行の差分を表示する（3 件以上指定すると振動検知も行う）
- `river runs summary`: 保存済みレビュー実行の集計を表示する
- `river suppression add`: Riverbed Memory の suppression エントリを作成する
- `river eval`: レビュー fixtures の評価を実行する

### 主なオプション

- `--phase <upstream|midstream|downstream>`: レビューフェーズ（デフォルト: `midstream`）
- `--planner <off|order|prune>`: Planner モード（デフォルト: `off`）
- `--dry-run`: 外部 API を呼ばずに実行する
- `--offline`（別名 `--rules-only`）: API キーが設定されていても AI を呼ばず、決定論的な機械的チェックのみでレビューする（CI 不可用時に Auto-approve 判定をローカル再現する用途）
- `--debug`: デバッグ情報を出す
- `--explain`: 採用された skill / gate / config tier を人間可読で出す（stderr）
- `--estimate`: コスト見積もりのみ（レビューは実行しない）
- `--max-cost <usd>`: 見積もりが上限を超える場合に中断する
- `--output <text|markdown|json|yaml|html>`: 出力形式（GitHub Actions は `markdown` を使用、`yaml` は [YAML 出力](./output-format-yaml.md) を参照、`html` は自己完結型 HTML レポートで [HTML 出力](./output-format-html.md) を参照）
- `--context <list>`: 利用可能なコンテキスト（例: `diff,fullFile`）
- `--dependency <list>`: 利用可能な依存（例: `code_search,test_runner`）
- `--base <ref>`: 差分の基準となるブランチ / ref。`run` / `skills` / `review plan|exec|route` が同じ解決経路を共有し、差分を読まない面はこの flag を受理しない。どの面が受理するか、値の検証、usage error の exit code はいずれも Stable Contract の対象外であり、SSoT は [Runner CLI リファレンス](./runner-cli-reference.md)
- `--entry <name>`（Beta）: `review plan` と `review exec` が受理し、出力 artifact にレビュー Flow の pin（`flow`）と必須入力（`evidenceRequirements`）を追加する。`review exec` では Flow を走らせた各 step の結果（`steps`、Epic #2011 AC7 P2 では記録のみ）も追加する。flag と 3 フィールドは Stable Contract の対象外で、SSoT は [Runner CLI リファレンス](./runner-cli-reference.md#entry-acceptance-scope)
- `--baseline <path>`: 過去のレビュー JSON（findings 配列）と比較して回帰を表示する
- `--save`: レビュー実行をプロジェクトの result store（`.river/runs/`）に保存する
- `--reviewers <roles|auto>`: レビュアーロールをカンマ区切りで指定、または `auto` でシグナルに基づく自動選択（詳細: [runner-cli-reference.md の `--reviewers` セクション](./runner-cli-reference.md#--reviewers-フラグ)）

### 終了コード

findings に基づく exit code は `--fail-on` / `--warn-on` を指定した場合のみ 0 以外になります。**`--fail-on` を指定しない場合、findings があっても正常終了は `0` です。** なお usage error と実行エラーは、`--fail-on` の指定と無関係に `1` で終了します（#1709。下表の「入力不正」行に対応）。usage error には未知オプション・余剰 positional・オプション値の欠落や不正値が含まれます。

| exit code | 条件                                                                    | 説明                             |
| --------- | ----------------------------------------------------------------------- | -------------------------------- |
| `0`       | `--fail-on` 未指定 / `--advisory-only` / max severity < warn rank       | pass（常に 0）                   |
| `1`       | `--fail-on <sev>` 指定かつ max severity ≥ fail rank                     | fail（ブロック閾値以上）         |
| `2`       | `--warn-on <sev>` 指定かつ max severity ≥ warn rank かつ fail rank 未満 | warn（warn 閾値以上、fail 未満） |
| `1`       | 入力不正 / git 差分取得失敗 / スキル検証失敗 / `--max-cost` 超過など    | エラー終了                       |

severity の rank（低→高）: `info`=0 / `minor`=1 / `major`=2 / `critical`=3

自己修正ループでの停止条件・発散ガード・振動検知を含む詳細な利用契約は [ループ収束コントラクト](./loop-convergence-contract.md) を参照してください。

### 終了コードの安定性

終了コードは用途で 2 段階に分けて宣言します。

| 用途                                                                           | ラベル | 変更に必要な bump                              |
| ------------------------------------------------------------------------------ | ------ | ---------------------------------------------- |
| gate 判定（`--fail-on` / `--warn-on` / `--gate` が返す `0` / `1` / `2` / `3`） | Stable | major                                          |
| usage error（引数の解釈失敗）                                                  | Beta   | CLI サーフェス全体のラベルに従う（minor で可） |

gate 判定用の終了コードは CI のジョブ成否へ直結します。閾値の意味が黙って変わると、利用者は失敗を検知できません。そのため Stable Contract に含めます。変更には major version bump が必要です。なお `--gate` の `3` は ESCALATE（人間の承認が必要）を表します。`river review` 系では、ハンドラ層の設定エラーにも `3` を割り当てています（[`river review plan` 仕様](./cli-review-plan-spec.md)）。

usage error の終了コードはレビュー結果を含みません。表すのは「引数が受理されなかった」ことだけです。誤用の検出漏れを塞ぐたびに検出層と粒度が動きます。そのため CLI サーフェス全体の Beta ラベルへ従わせます。実例として #1709 では、引数エラーを exit 0 から exit 1 へ横断統一しました。粒度はさらに、parse 層の `1` とハンドラ層の設定エラーの `3` へ整理されています。この一連の変更は v1.71.0（#1735）と v1.72.0（#1746）という minor リリースで入りました。

## GitHub Actions（`river-review`）リファレンス（最小）

### inputs（安定）

定義は `runners/github-action/action.yml` を参照してください。

- `phase`: `upstream|midstream|downstream`
- `planner`: `off|order|prune`
- `target`: レビュー対象のリポジトリパス
- `comment`: PR コメントを投稿するか（`pull_request` のみ）
- `dry_run`: 外部 API を呼ばずに実行するか
- `debug`: デバッグ情報を出すか
- `estimate`: コスト見積もりのみ実行するか
- `max_cost`: 見積もりが上限を超える場合に中断する
- `node_version`: Action 実行に用いる Node.js バージョン

### inputs（Beta）

- `entry`: レビュー Flow の entry 名（`flows/entry-map.json` の `entries` キー）。指定時だけ `review plan --plan-only --entry <値>` を実行し、Review Artifact（`flow` と `evidenceRequirements` 付き）を出力する。未指定（既定）なら従来の `run` 経路のまま。値は書き換えず渡すだけで、Action 側に判断を置かない（ADR-009 D3）。`entry` 指定時は `gate` / `dry_run` / `estimate` / `max_cost` / `comment` / `inline_comments` を適用しない（plan-only はレビューを実行しないため、gate 対象と投稿対象のどちらも無い）。#2054 PR-5。SSoT は [Runner CLI リファレンス](./runner-cli-reference.md#entry-acceptance-scope)

### outputs（安定）

- `comment_path`: Actions runner の一時領域に出力した Markdown のパス（PR コメント投稿で使用）

### PR コメントの契約（idempotent）

- `<!-- river-review -->` marker を含むコメントを **更新** し、なければ新規作成する。
- コメント本文が長すぎる場合は末尾を切り詰める（上限あり）。

## Claude Code プラグインの hook（Beta）

`hooks/hooks.json` は 2 つの lifecycle hook を配布します。`PostToolUse`（Write / Edit 後に consumer 側の prettier を実行）と、#2054 PR-5 で加わった `Stop` です。`Stop` は `scripts/plugin-task-checkpoint-hook.sh` を呼び、`river review plan --plan-only --entry review-task` で Review Artifact を出力します。中立 trigger `task-checkpoint` の Claude Code adapter で、entry 名以外の判断を持ちません（ADR-009 D3）。

- LLM 呼び出しと課金はない（plan-only）
- 所要は 1〜7 秒（river-review 本体 repo で 3 回実測 5.0〜5.4 秒、別環境で 6.7 秒。大規模 repo では `timeout: 60` を超えて打ち切られうる）
- 成果物は `$TMPDIR/river-review-task-checkpoint/` に書き、作業ツリーには書かない。過去分を 20 件（`RIVER_TASK_CHECKPOINT_KEEP`）まで残して古いものを消す（保持は書き込み前に行うため、実行後は最大 21 件）
- CLI が無い（npm 未導入かつ plugin に `node_modules` が無い）場合と失敗時は exit 0 で skip し、セッションを止めない。hook は `CLAUDE_PLUGIN_ROOT/node_modules` を要求するため、npm パッケージを導入するか plugin ディレクトリで `npm ci` を実行する
- 止め方: 環境変数 `RIVER_TASK_CHECKPOINT_HOOK=0`、または `/plugin disable river-review@river-review-marketplace`

## バージョニング（破壊的変更の扱い）

次を変更する場合は、破壊的変更として major version bump を必要とします。

- `river` CLI のオプション名/意味の変更・削除
- gate 判定用の終了コード（`--fail-on` / `--warn-on` / `--gate` が返す `0` / `1` / `2` / `3`）の意味変更
- Action inputs / outputs の変更・削除
- スキルスキーマの必須フィールド変更、既存フィールドの意味変更

次は破壊的変更として扱いません。minor もしくは patch のリリースで入ります。

- usage error（引数の解釈失敗）の終了コードの変更（CLI サーフェス全体の Beta ラベルに従う）
- 値を消費しない面からのオプション受理範囲の縮小（#2065）。上の「オプション名/意味の変更・削除」はオプションそのものの削除を指す。受理をやめた面では、その flag を付けた呼び出し自体が usage error となり exit 1 で落ちる。ただし値は一度も読まれていなかったため、呼び出しから flag を外せば従来と同じ結果が得られる。移行が呼び出し側の 1 行修正で済むことを根拠に、こちらは破壊的変更として扱わない。影響を受ける面の一覧と移行手順は [Runner / CLI リファレンス](./runner-cli-reference.md#base-acceptance-scope) にある。後置サブコマンド語の解決（#2081）は例外である。`river skills --base main import` は flag を外しても `import/` のレビューには戻らず、`--base` を伴わない `river skills --output json import` も同じくサブコマンドとして動く。サブコマンド語と同名のディレクトリは `river skills ./import` と書く

Action は安定動作のため、`@main` ではなく **リリースタグへピン留め**することを推奨します（例: `@v1.22.0`）。

## スキーマのバージョニングポリシー

`schemas/` 配下の JSON Schema は `version` フィールド（例: `review-artifact.schema.json` の `"version": { "const": "1" }`）でバージョンを表します。

- 後方互換な追加（任意フィールドの追加、`enum` 値の追加など）は同一スキーマファイル内で行う。
- 破壊的変更（必須フィールド追加、既存フィールドの型/意味変更、`enum` 値の削除など）は次のいずれかの方針で行う。
  1. 新しいスキーマファイルとして作成する（例: `review-artifact.v2.schema.json`）。`version: const "2"` を割り当て、旧スキーマは最低 1 メジャーバージョン以上残置する。
  2. 既存スキーマで `oneOf` を用いて新旧バージョンを共存させる。`version` フィールドの値で分岐させ、消費者が単一の `$ref` で複数バージョンを処理できるようにする。

新スキーマを追加した場合は、対応するドキュメント（`pages/reference/_meta.json` 等）も更新してください。
