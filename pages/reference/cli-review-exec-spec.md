---
title: CLI Spec — `river review exec`
---

`river review exec` は、解決済みの入力アーティファクト（差分・テスト結果・lint / typecheck など）を受け取り、レビュー skill 群を実際に走らせて [Review Artifact](./review-artifact.md) を出力する CLI コマンドです。本ドキュメントはコマンドの引数・入力・出力・終了コードを spec として固定し、CI から安定して呼び出せる契約を定義します。

> 関連 Issue: #518（Task）/ #509（Capability）/ #507（Epic）
> 関連 spec: `river review plan`（並列 Issue #517 で別途作成）

## 責務分担（plan との関係）

| コマンド            | 主目的                                                                                         | 副作用                                        |
| ------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `river review plan` | 入力 artifact から実行計画（選択 skill / プランナー判断）のみを算出する。LLM 推論は最小限。    | レビュー skill は走らせない。                 |
| `river review exec` | `plan` の結果（または同等の解決処理）を受け、レビュー skill を実行して `findings` を生成する。 | 外部 LLM 呼び出し・Review Artifact 書き出し。 |

`exec` は `plan` を **内部的に呼び出してもよい** が、`--plan <path>` で外部から計画を渡された場合はそれを採用し、自分では計画を立て直さないことを契約とします。これにより plan の決定論性と exec の再現性を両立させます。

## Usage

```bash
river review exec [options]
```

### 代表例

```bash
# 1) 既定の検出（カレントディレクトリ + git）で実行する
river review exec

# 2) 入力 artifact を明示してCI から呼び出す
river review exec \
  --artifact diff=./artifacts/diff.patch \
  --artifact junit=./artifacts/junit.xml \
  --artifact lint=./artifacts/lint.json \
  --artifact typecheck=./artifacts/typecheck.txt \
  --output json --output-file ./artifacts/review-artifact.json

# 3) plan を別工程で算出し、それを再生する
river review plan --output json --output-file ./artifacts/plan.json
river review exec --plan ./artifacts/plan.json --output json --output-file ./artifacts/review-artifact.json

# 4) コスト見積もり超過時は実行しない
river review exec --max-cost 0.50
```

## 引数とオプション

### 入力選択

| オプション             | 型         | 既定値     | 説明                                                                                                                                                                                                                                                                                                                                                |
| ---------------------- | ---------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--artifact <id=path>` | 繰り返し可 | （未指定） | [Artifact Input Contract](./artifact-input-contract.md) の ID を明示して入力ファイルを指定する。`id` は contract の表に従う。                                                                                                                                                                                                                       |
| `--ensemble <dir>`     | string     | （未指定） | `<dir>` 直下の `*.md` を昇順マージして `review-external` artifact として渡す sugar。複数 reviewer 結果を Independent Review Synthesis skill ([#911](https://github.com/s977043/river-review/issues/911)) に流し込む用途。`--artifact review-external=...` が併用された場合は no-op + 警告。reviewer 名は CLI 引数ではなくファイル名で表現する設計。 |
| `--plan <path>`        | string     | （未指定） | 既存の plan JSON を入力として再生する。指定時は内部での plan 算出をスキップする。                                                                                                                                                                                                                                                                   |
| `--target <path>`      | string     | `.`        | リポジトリルート。`pwd` と異なる場合に指定する。                                                                                                                                                                                                                                                                                                    |

`--artifact` / 設定ファイル（自動検出）/ カレントディレクトリ検出の優先順位は contract に従います（CLI > config > 検出）。`--config` フラグは存在せず、設定ファイルはリポジトリ直下から自動検出されます。

### フェーズ / プランナー

| オプション          | 型                                        | 既定値      | 説明                                                                    |
| ------------------- | ----------------------------------------- | ----------- | ----------------------------------------------------------------------- |
| `--phase <value>`   | `upstream` \| `midstream` \| `downstream` | `midstream` | レビュー対象の SDLC フェーズ。Review Artifact の `phase` に転写される。 |
| `--planner <value>` | `off` \| `order` \| `prune`               | `off`       | プランナーモード。`--plan` を渡した場合はこのオプションは無視される。   |

### 実行制御

| オプション         | 型     | 既定値  | 説明                                                                                                                                                                |
| ------------------ | ------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--dry-run`        | bool   | `false` | 外部 LLM API を呼ばず、入力解決と plan のみを実行する。`status` は `ok` または `no-changes`。                                                                       |
| `--estimate`       | bool   | `false` | コスト見積もりのみを行う。skill 実行は行わず、見積結果を Review Artifact の `debug` に格納し `status` は `ok` とする。                                              |
| `--max-cost <usd>` | number | （無）  | 見積もりが上限を超えた場合に skill 実行を中断する（exit `1`）。`--estimate` と併用した場合は見積結果のみを出力し中断せず exit `0`（skill 実行は元々行わないため）。 |
| `--debug`          | bool   | `false` | 詳細ログを stderr に出す。Review Artifact の `debug` も拡充される。                                                                                                 |

### 出力

| オプション             | 型                   | 既定値  | 説明                                                                                                                                         |
| ---------------------- | -------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `--output <format>`    | `json` \| `markdown` | `json`  | 出力形式。`json` が machine-readable 契約（既定）、`markdown` は #976 実装済み、`text` は未実装（exit 3）。互換 alias: `--format <format>`。 |
| `--output-file <path>` | string               | -       | Review Artifact の書き出し先。未指定時は標準出力。`-` も標準出力として許容。                                                                 |
| `--no-write`           | bool                 | `false` | 標準出力にのみ書き出し、ファイルを生成しない。                                                                                               |

> 備考: `--format` は `--output` の互換 alias です。両者が同時に指定され値が不一致の場合は設定エラー（exit 3）となります。旧 spec の `--output <path>`（出力先）は撤回されました。現在の実装状況については[下記の非規範セクション](#実装状況非規範)を参照してください。

## 入力アーティファクト

`river review exec` は [Artifact Input Contract](./artifact-input-contract.md) の解決結果を消費します。`exec` スコープでは特に以下を使用します。

| Artifact ID                                                                      | 使用観点                                  | 欠損時挙動                                                            |
| -------------------------------------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------- |
| `diff`                                                                           | レビュー対象差分。すべての skill の前提。 | 未指定なら `git diff <mergeBase>..HEAD` で取得。空なら `no-changes`。 |
| `junit`                                                                          | テスト失敗観点 skill の入力。             | 該当 skill をスキップし `plan.skippedSkills` に記録。                 |
| `coverage`                                                                       | カバレッジ観点 skill の入力。             | 同上。                                                                |
| `lint`                                                                           | 静的解析（lint）観点 skill の入力。       | 同上。                                                                |
| `typecheck`                                                                      | 型検査観点 skill の入力。                 | 同上。                                                                |
| `pbi-input` / `plan` / `todo` / `test-cases` / `review-self` / `review-external` | 上流文脈系 skill の入力。                 | 同上（contract に従う）。                                             |

- 各 artifact の必須/任意・形式・サイズ目安は [Artifact Input Contract](./artifact-input-contract.md) を SSoT とし、本 spec では再掲しない。
- 解決した artifact 一覧は Review Artifact の `context` / `debug` に記録される。

PR 本文は artifact ではなく、実行時の環境から読み取る暗黙の入力です。`RIVER_PR_BODY` が空でなければその値を使い、無ければ `GITHUB_EVENT_PATH` が指すイベント JSON の `pull_request.body` を使います。PR 本文は plan に保存されないため、同じ plan を `--plan` で再生しても、実行環境が異なればプロンプトが変わり得ます。冒頭で述べた `exec` の再現性は、PR 本文には及びません。LLM を呼ぶ実行でのみ、PR 本文がプロンプトの「PR Description」節に入ります（4000 文字で切り詰め）。その場合、finding が `PR-DESCRIPTION:0` を対象とすることがあります。

## 出力（Review Artifact）

`river review exec` の出力は [Review Artifact スキーマ](./review-artifact.md)（`schemas/review-artifact.schema.json`、version `1`）に従う JSON です。`exec` が責任を持って埋めるフィールドの最小セットは次の通りです。

- `version`: 常に `"1"`。
- `timestamp`: 実行完了時の ISO 8601。
- `phase`: `--phase` の値。
- `status`: 後述の「終了ステータス」表に従う。
- `plan`: 採用した実行計画（`--plan` を渡した場合はその内容、無ければ内部算出結果）。
- `findings`: 実行された skill の指摘事項配列。`output.schema.json` の `issue` と互換。
- `context`: `repoRoot` / `defaultBranch` / `mergeBase` / `changedFiles` / `tokenEstimate` / `rawTokenEstimate` / `reduction` を埋める（取得不能なフィールドは省略）。
- `debug`: `--debug` 時または `--estimate` 時に詳細を格納する自由形式オブジェクト。

`status` と CLI 終了コードの対応は次節の通りです。

## 終了コード

CI から安定して判定できるよう、終了コードを以下の通り固定します。

| Exit | 用途                              | 代表的な状況                                                                                                                                                                                                                     |
| ---- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0`  | 成功                              | `status` が `ok` / `no-changes` / `skipped-by-label` のいずれかで、`--max-cost` 超過もない。                                                                                                                                     |
| `1`  | 失敗（ユーザー入力 / ランタイム） | 入力不正、必須 artifact 解決失敗、`git diff` 失敗、`--max-cost` 超過、内部例外。                                                                                                                                                 |
| `2`  | 設定エラー                        | 設定ファイル（自動検出）の読み込み失敗、未知の `--artifact id`、未知の `--phase` / `--planner` 値。                                                                                                                              |
| `3`  | 未実装 / 競合設定エラー（過渡的） | `--output` と `--format` が両指定かつ不一致、またはスキル実行・plan 再生・LLM 統合が未実装のビルドで `--plan` なし通常 exec を呼んだ場合。設定エラーとして扱い、実装完了後は exit 0 / 1 / 2 のいずれかに吸収される予定のコード。 |

`findings` の severity（`critical` / `major` / `minor` / `info`）は終了コードに直接は影響しません。CI 側で Review Artifact の `findings` を読んでゲート判定する運用を推奨します（[Stable Interfaces](./stable-interfaces.md) に準拠）。

> 備考: [Stable Interfaces](./stable-interfaces.md) の最小 CLI 契約では終了コードを `0` / `1` の 2 値に絞っています。本 spec の `2`（設定エラー）は `exec` サブコマンド固有の拡張であり、CI で `2` を未知扱いとした場合も `!= 0` として失敗扱いになるため後方互換を壊しません。exit 3 は過渡的なコードであり、実装が完了次第 exit 0 / 1 / 2 のいずれかに吸収される予定です。CI スクリプトで `$? -eq 3` に依存する場合は注意してください。

### `status` と終了コードの対応

| `status`           | Exit | 意味                                                        |
| ------------------ | ---- | ----------------------------------------------------------- |
| `ok`               | `0`  | 全 skill 実行が正常完了した（`findings` が空でも `ok`）。   |
| `no-changes`       | `0`  | 解決した差分が空。skill は実行されない。                    |
| `skipped-by-label` | `0`  | PR ラベル等の運用ルールにより exec を意図的にスキップした。 |
| `error`            | `1`  | 実行時エラー。詳細は `debug` および stderr。                |

## 失敗条件（fail conditions）

`exec` は次の条件で `status: error` + Exit `1` を返します。

- `--artifact` で指定されたパスが存在しない、または読み込めない。
- 必須 artifact（`diff` または fallback の `git diff`）が解決できない。
- `--plan` で指定された JSON がスキーマ違反である。
- skill 実行中に未捕捉例外が発生し、リトライ可能でない。
- `--max-cost` を超える見積もりとなった（`--estimate` との併用時は skill を実行しないため中断条件の対象外。`status: ok` + exit `0` を返す）。

`--artifact` / `--phase` / `--planner` の **構文エラー**（未知の値・不正なフォーマット）は Exit `2` とします。

## フォールバック動作

- **`diff` 未指定**: contract に従い `git diff <mergeBase>..HEAD` を内部実行する。`mergeBase` は `context.defaultBranch` から推定する。
- **任意 artifact 欠損**: 該当観点 skill を `plan.skippedSkills` に記録してスキップする。Exit には影響しない。
- **`--plan` 未指定**: `exec` 内部で `plan` 相当処理を実行する（`--planner` の値を尊重する）。
- **LLM 呼び出し失敗**: skill 単位にリトライする。リトライ後も失敗した skill は `plan.skippedSkills` に理由付きで記録し、`findings` に reporter 由来の `info` レベル通知を残す。**少なくとも 1 つの skill が正常完了**し、かつ exec 全体のパイプラインが継続可能であれば `status: ok` + exit `0` とする（部分的成功を許容）。すべての skill が失敗、または回復不能な内部例外が発生した場合のみ `status: error` + exit `1` とする。CI 側で部分失敗を検知したい場合は Review Artifact の `plan.skippedSkills` と `findings` を参照すること。

## 関連ドキュメント

- [Artifact Input Contract](./artifact-input-contract.md) — 入力アーティファクトの SSoT
- [Review Artifact](./review-artifact.md) — 出力スキーマ
- [Stable Interfaces](./stable-interfaces.md) — CLI / GitHub Actions の安定契約
- [Runner CLI Reference](./runner-cli-reference.md) — Runner CLI の使い方
- [Review Policy](./review-policy.md) — AI レビュー標準ポリシー

---

## 実装状況（非規範）

> **このセクションは規範的な契約ではありません。** 実装の現在地を示すスナップショットであり、実装が進むにつれて更新または削除されます。上記の契約テーブル（オプション・終了コード・アーティファクト）が常に正です。

### 実装済み（2026-05-29 時点）

- **CLI 引数パーサー / 出力契約の基盤**（#802 Phase 3 PR-3）: `river review exec` は `--plan` / `--artifact <id=path>` / `--output` / `--format` / `--output-file` 等を受理し出力契約を検証する。この parser 契約は [Artifact Input Contract](./artifact-input-contract.md) の artifact ID のみに依存し、PlanGate には依存しない（PlanGate は artifact 生成元の一例に過ぎない）。
- **`--dry-run`（`--plan` 併用なし）**（#802 Phase 3）: 外部 LLM・skill 実行を行わず、入力解決 + 決定論 plan のみを実行。`status` は `ok` / `no-changes`、`findings` は `[]`、Review Artifact v1 を出力して exit 0。
- **`--plan <file>` による plan 再生**（[PR #935](https://github.com/s977043/river-review/pull/935)）: plan ファイルを読み込み `generateReview` 経由で skill を実行し Review Artifact を出力する。

### 未実装（追跡中）

- **`--plan` なしの通常 `exec`（非 dry-run）**: skill 実行・artifact 読み込み・LLM 統合が未実装のビルドでは exit 3 を返す。進捗は該当 Issue で追跡すること。
- **`verify` サブフェーズ実行**: `exec` 内の verify ステップは未実装である。

> exit 3 は過渡的なコードです。上記の未実装パスの実装が完了次第、exit 0 / 1 / 2 のいずれかに吸収され、exit 3 は廃止されます。CI スクリプトで `$? -eq 3` を明示的に分岐している場合は注意してください。
