---
title: river review plan CLI 仕様
---

`river review plan` は River Review が提供する CLI サブコマンドのうち、上流アーティファクトに対して **レビュー計画（plan）を生成・実行する** エントリポイントです。本ドキュメントは引数、入力アーティファクト、出力フォーマット、終了コード、severity 区分（fail / warn / advisory）、machine-readable 出力方針を定義します。

> 関連 Issue: #517（Task）/ #509（Capability）/ #507（Epic）
> 前提: 入力アーティファクトの契約は [Artifact Input Contract](./artifact-input-contract.md) に従う。

## 位置づけ

- `river review plan` は **PlanGate v6** をはじめとする上流ワークフローが生成した artifact を入力とし、レビュー計画（実行対象 skill の選定・順序）と、その計画に基づく実行結果を [Review Artifact](./review-artifact.md) スキーマで出力する。
- 既存の `river run` がローカル開発者向けの汎用エントリであるのに対し、`river review plan` は **CI / バッチ実行で安定した契約** を提供することを目的とする。
- 安定性ラベルは **Beta**（参考: [Stable Interfaces](./stable-interfaces.md)）。CLI オプションの追加は minor、削除/意味変更は major bump とする。

## Usage

```bash
river review plan [options]
```

### 最小例

```bash
# 入力 artifact をカレントディレクトリから自動検出してレビュー計画を実行
river review plan

# 明示的に artifact を指定し、JSON 出力をファイルへ書き出す
river review plan \
  --artifact pbi-input=./artifacts/pbi-input.md \
  --artifact plan=./artifacts/plan.md \
  --artifact diff=./artifacts/diff.patch \
  --output json \
  --output-file ./artifacts/review-artifact.json

# 計画のみを生成（実行しない）
river review plan --plan-only --output json
```

## 引数

### artifact 指定

| オプション               | 型     | 必須 | 説明                                                                                                                |
| ------------------------ | ------ | ---- | ------------------------------------------------------------------------------------------------------------------- |
| `--artifact <id>=<path>` | 反復可 | 任意 | [Artifact Input Contract](./artifact-input-contract.md) で定義された artifact ID とファイルパスのペア。複数指定可。 |
| `--artifacts-dir <path>` | string | 任意 | artifact 既定ファイル名を探索するベースディレクトリ。未指定時はカレントディレクトリ。                               |

artifact 解決の優先順位は Artifact Input Contract「指定方法（入力チャネル）」に従う（CLI 引数 → 設定ファイル → ディレクトリ自動検出）。

### 差分の解決

| オプション     | 型     | デフォルト                            | 説明                                                                                  |
| -------------- | ------ | ------------------------------------- | ------------------------------------------------------------------------------------- |
| `--base <ref>` | string | なし（未指定なら diff artifact のみ） | 差分の基準となるブランチ / ref。指定した ref と作業ツリーの差分をレビュー対象とする。 |

`--base` を指定しない場合、`review plan` は git を実行しない。差分は `diff` artifact からのみ供給され、artifact も無ければ `status` は `no-changes` になります（`river run` の自動検出とは挙動が異なります）。

`--base` と `diff` artifact の優先順位は次のとおり（#2046）。

- 明示指定した `diff` artifact（`--artifact diff=<path>` または設定ファイルの `artifacts.diff`）が `--base` に優先する。Artifact Input Contract の「artifact として指定が無い場合に git を実行する」宣言に従う
- ディレクトリ自動検出の `diff.patch` よりは `--base` が優先する
- どちらの向きでも、採用しなかった側を stderr の警告で告知する
- `--base` が採用された回は、解決した範囲を [Review Artifact](./review-artifact.md) の `context`（`repoRoot` / `defaultBranch` / `mergeBase` / `changedFiles`）に記録する
- 差分をまったく解決しなかった回（`--base` と `diff` artifact のどちらも無い場合、および `review exec --plan <file> --dry-run` の echo 経路）は `context` を出力しない。「範囲が空だった」と「範囲を見ていない」を区別できるようにするためである
- `review exec --plan <file> --dry-run` は差分を解決しないため `--base` を消費しない。この場合は stderr で告知する

`changedFiles` の導出元は供給元によって異なる。`--base` 由来では `git diff --name-only` の結果を使うため、rename と binary 変更も含まれる。`diff` artifact 由来では unified diff の parse 結果を使うため、`---` / `+++` ヘッダを持たないエントリ（100% rename・binary）は含まれない。

`--base` の値は前後の空白を除去したうえで `git rev-parse` により解決可否を検査する。解決できない ref と空白のみの値は終了コード `1` の usage error となる（黙って空の範囲をレビューしない）。対象が git リポジトリでない場合も終了コード `1` となる。この解決経路は `river run` / `river skills` とも共有する（#2051 / #2057）。詳細は [Runner CLI リファレンス](./runner-cli-reference.md) を参照。

### 計画制御

| オプション             | 型     | デフォルト  | 説明                                                                                        |
| ---------------------- | ------ | ----------- | ------------------------------------------------------------------------------------------- |
| `--phase <value>`      | enum   | `midstream` | `upstream` / `midstream` / `downstream`。レビューフェーズ。                                 |
| `--planner <value>`    | enum   | `off`       | `off` / `order` / `prune`。AI プランナーのモード。                                          |
| `--plan-only`          | flag   | false       | レビュー計画のみを生成し、skill を実行しない。`status` は `ok`、`findings` は空配列となる。 |
| `--include-skill <id>` | 反復可 | -           | 計画で必ず含める skill ID。                                                                 |
| `--exclude-skill <id>` | 反復可 | -           | 計画から除外する skill ID。                                                                 |
| `--max-cost <usd>`     | number | -           | 計画の見積もりコストが上限を超えた場合は実行せず終了コード `1` で終了する。                 |

### 出力制御

| オプション              | 型     | デフォルト | 説明                                                                                       |
| ----------------------- | ------ | ---------- | ------------------------------------------------------------------------------------------ |
| `--output <format>`     | enum   | `json`     | `json`（既定・machine-readable）/ `markdown`（人間向け、#976 実装済み）。`text` は未実装。 |
| `--output-file <path>`  | string | -          | 出力先ファイル。未指定時は標準出力。                                                       |
| `--summary-file <path>` | string | -          | 人間向けサマリ（Markdown）を別ファイルへ書き出す。`--output json` と併用する想定。         |
| `--quiet`               | flag   | false      | stdout への進捗ログを抑制（エラーは stderr に出力）。CI 用。                               |
| `--debug`               | flag   | false      | デバッグ情報を [Review Artifact](./review-artifact.md) の `debug` フィールドに含める。     |

> 備考（#802 Phase 3、2026-05-18）: `--output <format>` = 形式、`--output-file <path>` = 出力先という契約は `plan`/`exec`/`verify` で統一されており、グローバル `--output <mode>`（`river run`）と意味が一致します（[PlanGate CLI 安定化ロードマップ](./plangate-cli-roadmap.md) の決定）。`--format <format>` は review 系の互換 alias として受理されますが canonical は `--output` です。`--output` と `--format` が両指定かつ不一致の場合は設定エラー（exit 3）。
>
> 実装現況（#976 更新）: 後方互換のため `--output`/`--format` 未指定時は JSON を出力します。`json` 明示・`markdown` 明示はともに受理（`markdown` は #976 で実装）、`text` の明示指定は未実装エラー（exit 3）、`yaml` は review 契約外のため exit 3。

### 失敗判定の閾値

| オプション             | 型   | デフォルト | 説明                                                                                                  |
| ---------------------- | ---- | ---------- | ----------------------------------------------------------------------------------------------------- |
| `--fail-on <severity>` | enum | `critical` | `critical` / `major` / `minor` / `info`。指定 severity 以上の finding が 1 件でもあれば fail と判定。 |
| `--warn-on <severity>` | enum | `major`    | `--fail-on` には届かないが warn と扱う閾値。                                                          |
| `--advisory-only`      | flag | false      | severity に関わらず常に成功扱い（exit `0`）。発見事項は出力されるが CI を落とさない。                 |

severity の語彙は [`schemas/output.schema.json`](../../schemas/output.schema.json) と `.claude/rules/review-core.md` の severity マッピングに準ずる（`critical` / `major` / `minor` / `info`）。

## 入力アーティファクト

`river review plan` が認識する artifact は [Artifact Input Contract](./artifact-input-contract.md) の「対象アーティファクト一覧」と完全に一致する。対象 ID の集合と既定ファイル名は同契約を SSoT とし、本仕様では再掲しない（現時点で 12 種類）。

- artifact ID とファイル形式の追加・変更・削除は本仕様ではなく Artifact Input Contract 側で管理する。
- `diff` artifact が未指定で `git diff` フォールバックも空の場合、`status` を `no-changes` とし、skill は実行されない（exit `0`）。
- 必須 artifact の解決に失敗した場合は exit `1`（後述）。

## 出力フォーマット

### `--output text`（未実装）

人間が読める plain text 要約を想定するフォーマットだが、review namespace では**未実装**（明示指定すると exit 3）。人間向け表示には `--output markdown` を使用する。review namespace の既定は `--output json`。

### `--output markdown`（#976 実装済み）

GitHub Actions のコメント投稿などで利用する人間可読 Markdown を出力する（status / phase / planner mode、Selected/Skipped skills、findings がある場合は `## Findings` セクション）。`--summary-file` と同じレンダラ（`formatReviewPlanSummaryMarkdown`）を使用する。JSON は引き続き唯一の machine-readable 契約であり、Markdown は人間向けの派生表示。

### `--output json`（machine-readable / 安定契約）

[`schemas/review-artifact.schema.json`](../../schemas/review-artifact.schema.json) に準拠した JSON を出力する。

- スキーマバージョンは `version` フィールドで管理（現行 `"1"`）。
- `findings` 配列の各要素は `output.schema.json` の issue 定義と互換。
- `--debug` 指定時のみ `debug` セクションを含める。
- `--plan-only` 指定時は `findings` を空配列、`status` を `ok` とし、`plan.selectedSkills` のみが意味を持つ。

JSON 出力は **唯一の安定 machine-readable 契約** とする。後続パイプライン（Riverbed Memory 取り込み、評価、CI gate）は本 JSON のみを参照することを推奨する。

## Severity 区分（fail / warn / advisory）

| 区分       | 判定基準                                                                                              | 既定の振る舞い                             |
| ---------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| `fail`     | severity が `--fail-on` 以上（既定 `critical`）の finding が 1 件以上                                 | exit `1` で終了。CI を落とす。             |
| `warn`     | `--fail-on` 未満かつ `--warn-on` 以上（既定 `major`）の finding が 1 件以上                           | exit `2` で終了。CI 設定で扱いを選択可能。 |
| `advisory` | 上記いずれにも該当しないが finding が存在する（`minor` / `info` のみ、または `--advisory-only` 指定） | exit `0` で終了。情報提供のみ。            |

severity の内部語彙（`blocker` / `warning` / `nit`）と JSON スキーマ語彙（`critical` / `major` / `minor` / `info`）の対応は `.claude/rules/review-core.md` を参照する。JSON スキーマ語彙のうち `info` は内部語彙に直接対応するトークンを持たず、severity が未指定の finding（`.claude/rules/review-core.md` の「(なし)」列）に割り当てられる補助レベルで、現時点では内部語彙からの変換には使用されない。不明な severity 値は fail-safe として `major` に分類される。

## 終了コード

| Exit | 意味                                                                                                                                                                          |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0`  | 成功。`status` が `ok` / `no-changes` / `skipped-by-label` で、かつ fail / warn 判定なし。                                                                                    |
| `1`  | 失敗。`--fail-on` 閾値到達（`--advisory-only` 未指定時）、必須 artifact 欠損、計画/実行エラー、`--max-cost` 超過、いずれか。                                                  |
| `2`  | 警告のみ。`--warn-on` 閾値に達したが `--fail-on` には届かない finding が存在する。                                                                                            |
| `3`  | 設定エラー。ハンドラ層で検出する設定エラー（未対応の `--output` 値、`--output` と `--format` の不一致、設定ファイル読み込み失敗など）。parse 層の引数エラーはここに含まない。 |

`--advisory-only` を指定した場合、`fail` / `warn` 判定は無効化され、内部エラー（artifact 欠損・実行エラー）以外は常に exit `0`。

> 引数エラーの扱い（#1709）: parse 層が検出する引数エラー（未知オプション・余剰 positional・オプション値の欠落や不正値）は exit `1` です。exit `3` は、共有パーサを通過したあとにハンドラ層が検出する設定エラーに限られます。
>
> 実装現況（#976）: gate 判定は **opt-in** で、`--fail-on` / `--warn-on` / `--advisory-only` のいずれかを明示したときのみ exit `1` / `2` を返す。いずれも未指定なら従来どおり成功時 exit `0`（既存呼び出し・plangate-review workflow は非破壊）。フラグを与えたときの既定値は `--fail-on critical` / `--warn-on major`。判定は artifact の `findings[].severity` の最大値に基づく。

## CI / 後続システムとの接続

- **Review Artifact**: `--output json --output-file <path>` を CI の artifact upload で永続化することを推奨する。
- **GitHub Action**: `runners/github-action/action.yml` の inputs から本 CLI へのマッピングを提供する（未実装、別途対応予定）。
- **Riverbed Memory**: 取り込み入力としては JSON 出力のみを正とする（参考: [Riverbed Storage](./riverbed-storage.md)）。
- **PR コメント**: idempotent 更新（`<!-- river-review -->` marker）の方針は [Stable Interfaces](./stable-interfaces.md) を継承する。

## 互換性ポリシー

- `--artifact` で渡せる ID 集合は Artifact Input Contract に従い拡張される。
- フラグ追加は minor、フラグの削除・意味変更・既定値変更は major bump とする。
- gate 判定の exit code の意味（`0` / `1` / `2` / `3`）は **Stable Contract** として扱い、変更には major bump を要する。
- usage error（引数の解釈失敗）の exit code は Stable Contract に含めない。CLI サーフェス全体の Beta ラベルに従う。#1709 では引数エラーの検出層による粒度が変わった（parse 層は `1`、ハンドラ層の設定エラーは `3`）が、この変更は minor で入っている。用途別の裁定は [Stable Interfaces](./stable-interfaces.md) の「終了コードの安定性」が SSoT。
- JSON 出力スキーマの破壊的変更は [Review Artifact](./review-artifact.md) のバージョニングに従う。

## 関連ドキュメント

- [Artifact Input Contract](./artifact-input-contract.md) — 入力アーティファクトの契約
- [Review Artifact](./review-artifact.md) — 出力 JSON スキーマ
- [Stable Interfaces](./stable-interfaces.md) — CLI / GitHub Actions 安定契約
- [Runner CLI Reference](./runner-cli-reference.md) — Runner CLI（バリデータ）の使い方
- [Review Policy](./review-policy.md) — AI レビュー標準ポリシー
