---
title: CLI Spec — `river review verify`
---

`river review verify` は、既に生成されたレビュー結果（`review-self` / `review-external`）と元の上流アーティファクト（`plan` / `diff` / `test-cases` など）を入力として受け取る CLI コマンドです。verify 系 skill を走らせて **W チェック（レビューの再監査）** を行い、既存レビューの抜け・誤検知・ハルシネーションを再点検し、META finding（レビューに対するレビュー）を [Review Artifact](./review-artifact.md) として出力します。本ドキュメントはコマンドの引数・入力・出力・終了コードを spec として固定し、CI から安定して呼び出せる契約を定義します。

> 関連 Issue: #575（Task）/ #509（Capability）/ #507（Epic）
> 関連 spec: `river review plan`（#517）/ `river review exec`（#518）/ `plangate-verification-audit`（skill spec は #577 で完了済み、`skills/upstream/plangate-verification-audit/SKILL.md`）

## 責務分担（plan / exec / verify の関係）

| コマンド              | 主目的                                                                                                                                              | 副作用                                        |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `river review plan`   | 入力 artifact から実行計画（選択 skill / プランナー判断）のみを算出する。LLM 推論は最小限。                                                         | レビュー skill は走らせない。                 |
| `river review exec`   | `plan` の結果（または同等の解決処理）を受け、レビュー skill を実行して `findings` を生成する。                                                      | 外部 LLM 呼び出し・Review Artifact 書き出し。 |
| `river review verify` | 既存レビュー結果と上流 artifact を入力とし、verify 系 skill のみを実行して既存 findings を再点検する（W チェック）。non-verify skill は実行しない。 | 外部 LLM 呼び出し・META finding の書き出し。  |

`verify` は `plan` を **内部的に呼び出してもよい** が、選択対象は verify 系 skill のみに制限され、非 verify skill は `plan.skippedSkills` に `not-verify-skill` 理由で記録されます。`exec` と `verify` は対象スコープが異なるため、`verify` から非 verify skill を再実行することは契約として禁止します。

## Usage

```bash
river review verify [options]
```

### 代表例

```bash
# 1) 既存の review-self / review-external を W チェックする
river review verify \
  --artifact review-self=./artifacts/review-self.md \
  --artifact review-external=./artifacts/review-external.md \
  --artifact plan=./artifacts/plan.md \
  --artifact diff=./artifacts/diff.patch \
  --output json --output-file ./artifacts/review-audit-artifact.json

# 2) plan を別工程で算出し verify 側で再生する
river review plan --phase upstream --output json --output-file ./artifacts/plan.json
river review verify --plan ./artifacts/plan.json \
  --artifact review-external=./artifacts/review-external.md

# 3) コスト見積もりのみ
river review verify --estimate \
  --artifact review-self=./artifacts/review-self.md

# 4) advisory モードで CI を落とさず監査のみ実施
river review verify --advisory-only \
  --artifact review-external=./artifacts/review-external.md
```

## 引数とオプション

### 入力選択

| オプション             | 型         | 既定値     | 説明                                                                                                                          |
| ---------------------- | ---------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `--artifact <id=path>` | 繰り返し可 | （未指定） | [Artifact Input Contract](./artifact-input-contract.md) の ID を明示して入力ファイルを指定する。`id` は contract の表に従う。 |
| `--plan <path>`        | string     | （未指定） | 既存の plan JSON を入力として再生する。指定時は内部での plan 算出をスキップする（verify 系 skill のみに絞られる契約は維持）。 |
| `--target <path>`      | string     | `.`        | リポジトリルート。`pwd` と異なる場合に指定する。                                                                              |

`--artifact` / 設定ファイル（自動検出）/ カレントディレクトリ検出の優先順位は contract に従います（CLI > config > 検出）。`--config` フラグは存在せず、設定ファイルはリポジトリ直下から自動検出されます。`review-self` および `review-external` の**いずれも解決できない場合**、`verify` は後述「失敗条件」に従い Exit `1` で中断します（一方のみ解決できた場合は解決できた方で W チェックを継続）。

### フェーズ / プランナー

| オプション          | 型                                        | 既定値     | 説明                                                                                |
| ------------------- | ----------------------------------------- | ---------- | ----------------------------------------------------------------------------------- |
| `--phase <value>`   | `upstream` \| `midstream` \| `downstream` | `upstream` | レビュー対象の SDLC フェーズ。W チェックは基本的に上流監査のため既定は `upstream`。 |
| `--planner <value>` | `off` \| `order` \| `prune`               | `off`      | プランナーモード。`--plan` を渡した場合はこのオプションは無視される。               |

### 実行制御

| オプション         | 型     | 既定値  | 説明                                                                                                                                                                |
| ------------------ | ------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--dry-run`        | bool   | `false` | 外部 LLM API を呼ばず、入力解決と plan のみを実行する。`status` は `ok` または `no-review-input`。                                                                  |
| `--estimate`       | bool   | `false` | コスト見積もりのみを行う。skill 実行は行わず、見積結果を Review Artifact の `debug` に格納し `status` は `ok` とする。                                              |
| `--max-cost <usd>` | number | （無）  | 見積もりが上限を超えた場合に skill 実行を中断する（exit `1`）。`--estimate` と併用した場合は見積結果のみを出力し中断せず exit `0`（skill 実行は元々行わないため）。 |
| `--debug`          | bool   | `false` | 詳細ログを stderr に出す。Review Artifact の `debug` も拡充される。                                                                                                 |

### 出力

| オプション             | 型                   | 既定値  | 説明                                                                                                                                         |
| ---------------------- | -------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `--output <format>`    | `json` \| `markdown` | `json`  | 出力形式。`json` が machine-readable 契約（既定）、`markdown` は #976 実装済み、`text` は未実装（exit 3）。互換 alias: `--format <format>`。 |
| `--output-file <path>` | string               | -       | Review Artifact の書き出し先。未指定時は標準出力。`-` も標準出力として許容。                                                                 |
| `--no-write`           | bool                 | `false` | 標準出力にのみ書き出し、ファイルを生成しない。                                                                                               |

> 備考（#802 Phase 3、2026-05-18 改訂）: 出力契約は `plan`/`exec`/`verify` で統一され、`--output <format>` = 形式、`--output-file <path>` = 出力先となります（[PlanGate CLI 安定化ロードマップ](./plangate-cli-roadmap.md) の決定）。グローバル `--output <mode>`（`river run`）と意味が一致します。`--format` は review 系の互換 alias として受理されますが canonical は `--output` であり、`--output` と `--format` が両指定かつ不一致なら設定エラー（exit 3）。旧 spec の `--output <path>`（出力先）は撤回されました。
>
> 実装状況（#802 Phase 3 PR-3、2026-05-18）: 現時点では **CLI 引数 / 出力契約の parser・dispatch foundation のみ実装**。`river review verify` は `--plan` / `--artifact <id=path>`（`review-self` / `review-external` 等）/ `--output` / `--format` / `--output-file` を受理し出力契約を検証するが、verify skill 実行・artifact 読み込みは未実装で exit 3 を返す。この parser 契約は [Artifact Input Contract](./artifact-input-contract.md) の artifact ID のみに依存し、**PlanGate には依存しない**。verify skill レイヤ（`plangate-verification-*`）は別レイヤであり parser 契約とは独立。

META finding の severity 語彙は [`schemas/output.schema.json`](../../schemas/output.schema.json) と `.claude/rules/review-core.md` の severity マッピングに準ずる（`critical` / `major` / `minor` / `info`）。不明な severity 値は fail-safe として `major` に分類される。severity に応じた fail / warn 判定は `exec` と同様に CLI では行わず、Review Artifact の `findings` を読んだ CI 側のゲートで判定する運用を推奨する。

## Skill 選択（verify ファミリー制限）

`verify` は実行対象を **verify 系 skill** に限定します。判定は次のいずれかを満たす skill を verify 系と見なすヒューリスティクスです。

- `id` が `plangate-verification-` で始まる（代表: `plangate-verification-audit`、spec は #577 で完了済み）。
- skill メタデータの `outputKind` に `review-audit` が含まれる。

非 verify skill は `plan.selectedSkills` には含めず、`plan.skippedSkills` に `reason: "not-verify-skill"` として記録します。Review Artifact を読む CI や Riverbed Memory 側で、`verify` 経由のレビュー監査であることを明示的に判別できるようにするためです。

## 入力アーティファクト

`river review verify` は [Artifact Input Contract](./artifact-input-contract.md) の解決結果を消費します。`verify` スコープで特に重要なのは既存レビュー結果と、そのレビューが依拠した上流 artifact の対応付けです。

| Artifact ID                       | 使用観点                                                        | 欠損時挙動                                                                                                                                                |
| --------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `review-self`                     | セルフレビュー結果。W チェックの主要対象。                      | `review-external` も解決できない場合、`status: no-review-input` + Exit `1`。                                                                              |
| `review-external`                 | 外部（AI/人間）レビュー結果。W チェックの主要対象。             | `review-self` も解決できない場合、`status: no-review-input` + Exit `1`。                                                                                  |
| `plan`                            | 上流の実行計画。レビューが前提とした設計意図の参照元。          | 任意。欠損時は該当観点 skill を `plan.skippedSkills` に記録しスキップ。                                                                                   |
| `diff`                            | レビュー対象差分。ハルシネーション検知に必要。                  | 未指定なら `git diff <mergeBase>..HEAD` で取得。空なら W チェックの意味が薄いが `no-changes` ではなく `ok` とし verify を継続（レビュー監査自体は可能）。 |
| `test-cases`                      | テスト観点と既存レビューの整合性検証に使用。                    | 任意。欠損時は該当観点 skill を `plan.skippedSkills` に記録しスキップ。                                                                                   |
| `pbi-input` / `todo` / `junit` 等 | 文脈補強に使用（contract の「対象アーティファクト一覧」参照）。 | 任意。欠損時は contract に従う。                                                                                                                          |

- `review-self` / `review-external` は **少なくとも一方が必須** である。両方とも解決できない場合は「失敗条件」の最初のケースに該当する。
- 各 artifact の必須/任意・形式・サイズ目安は [Artifact Input Contract](./artifact-input-contract.md) を SSoT とし、本 spec では再掲しない。
- 解決した artifact 一覧は Review Artifact の `context` / `debug` に記録される。

## 出力（Review Artifact）

`river review verify` の出力は [Review Artifact スキーマ](./review-artifact.md)（`schemas/review-artifact.schema.json`、version `"1"`）に従う JSON です。`verify` が責任を持って埋めるフィールドの最小セットは次の通りです。

- `version`: 常に `"1"`。
- `timestamp`: 実行完了時の ISO 8601。
- `phase`: `--phase` の値（既定 `upstream`）。
- `status`: 後述の「`status` と終了コードの対応」表に従う。
- `plan`: 採用した実行計画。`selectedSkills` は verify 系のみ、`skippedSkills` に `not-verify-skill` 等の理由を記録。
- `findings`: verify 系 skill が生成した **META finding** の配列。対象は既存 `review-self` / `review-external` の指摘品質（抜け・誤検知・ハルシネーション・根拠欠落など）であり、元コードへの直接指摘ではない点に留意する。各要素は `output.schema.json` の `issue` と互換。
- `context`: `repoRoot` / `defaultBranch` / `mergeBase` / `changedFiles` / `tokenEstimate` / `rawTokenEstimate` / `reduction` を埋める（取得不能なフィールドは省略）。
- `debug`: `--debug` 時または `--estimate` 時に詳細を格納する自由形式オブジェクト。

`status` と CLI 終了コードの対応は次節の通りです。

## 終了コード

CI から安定して判定できるよう、終了コードを以下の通り固定します。`exec` と同じ 3 値（`0` / `1` / `2`）の shape を採用します。

| Exit | 用途                              | 代表的な状況                                                                                                                                                     |
| ---- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0`  | 成功                              | `status` が `ok` / `skipped-by-label` のいずれかで、`--max-cost` 超過もない。                                                                                    |
| `1`  | 失敗（ユーザー入力 / ランタイム） | `review-self` / `review-external` が両方とも解決できない、必須 artifact 解決失敗、`--max-cost` 超過、内部例外。いずれも `status: error` として Exit `1` を返す。 |
| `2`  | 設定エラー                        | 設定ファイル（自動検出）の読み込み失敗、未知の `--artifact id`、未知の `--phase` / `--planner` 値。                                                              |

`findings` の severity（`critical` / `major` / `minor` / `info`）は終了コードに直接は影響しません。CI 側で Review Artifact の `findings` を読んでゲート判定する運用を推奨します（[Stable Interfaces](./stable-interfaces.md) に準拠）。

> 備考: [Stable Interfaces](./stable-interfaces.md) の最小 CLI 契約では終了コードを `0` / `1` の 2 値に絞っています。本 spec の `2`（設定エラー）は `exec` と共通の拡張であり、CI で `2` を未知扱いとした場合も `!= 0` として失敗扱いになるため後方互換を壊しません。

### `status` と終了コードの対応

| `status`           | Exit | 意味                                                                  |
| ------------------ | ---- | --------------------------------------------------------------------- |
| `ok`               | `0`  | 全 verify skill 実行が正常完了した（META `findings` が空でも `ok`）。 |
| `skipped-by-label` | `0`  | PR ラベル等の運用ルールにより verify を意図的にスキップした。         |
| `error`            | `1`  | 実行時エラー。詳細は `debug` および stderr。                          |

`verify` は `exec` と異なり **`no-changes` status を採用しません**。差分が空でも既存レビュー自体の監査は意味があるため、`status` は `ok`（Exit `0`）のまま verify を続行します。一方で、レビュー入力そのもの（`review-self` / `review-external`）が両方とも解決できない場合は監査対象が存在しない誤用と見なし、`status: error` + Exit `1` にマップします。

## 失敗条件（fail conditions）

`verify` は次の条件で `status: error` + Exit `1` を返します。

- `review-self` / `review-external` のいずれも解決できない。stderr に次のメッセージを出力する: `rr-cli-verify: review-self / review-external のいずれも解決できませんでした`。
- `--artifact` で指定されたパスが存在しない、または読み込めない。
- `--plan` で指定された JSON がスキーマ違反である。
- verify skill 実行中に未捕捉例外が発生し、リトライ可能でない。
- `--max-cost` を超える見積もりとなった（`--estimate` との併用時は skill を実行しないため中断条件の対象外。`status: ok` + exit `0` を返す）。

`--artifact` / `--phase` / `--planner` の **構文エラー**（未知の値・不正なフォーマット）は Exit `2` とします。

## フォールバック動作

- **`review-self` / `review-external` のいずれか一方のみ解決**: 解決できた方のみを対象として W チェックを継続する（Exit `0` の対象）。
- **`plan` / `test-cases` 未指定**: 該当観点 skill を `plan.skippedSkills` に記録しスキップ。Exit には影響しない。
- **`diff` 未指定**: contract に従い `git diff <mergeBase>..HEAD` を内部実行する。`mergeBase` は `context.defaultBranch` から推定する。
- **`--plan` 未指定**: `verify` 内部で `plan` 相当処理を実行し、verify 系 skill のみを選択対象とする（`--planner` の値を尊重する）。
- **LLM 呼び出し失敗**: skill 単位にリトライする。リトライ後も失敗した skill は `plan.skippedSkills` に理由付きで記録し、`findings` に reporter 由来の `info` レベル通知を残す。**少なくとも 1 つの verify skill が正常完了**し、かつパイプラインが継続可能であれば `status: ok` + exit `0` とする（部分的成功を許容）。すべての verify skill が失敗、または回復不能な内部例外が発生した場合のみ `status: error` + exit `1` とする。
- **非 verify skill が plan 候補に混入した場合**: `plan.skippedSkills` へ `reason: "not-verify-skill"` で記録し、実行はしない。Exit への影響はない。

## 安定性と互換性

- 安定性ラベルは **Internal**（参考: [Stable Interfaces](./stable-interfaces.md)）。`river` CLI は npm 未公開で配布経路を持たない。
- フラグの追加・削除・意味変更・既定値変更はいずれも Stable Contract の対象外であり、minor 以下のリリースで入る。
- 上表の終了コードは gate 判定用ではない（`verify` は gate 判定を行わない）ため Stable Contract の列挙に含まれず、意味変更も minor 以下で入る。Stable Contract が保証するのは gate 判定用の終了コード `0` / `1` / `2` / `3` であり、利用者はそこへ GitHub Action 経由で到達する。
- usage error（引数の解釈失敗）の終了コードは上表の対象外とし、CLI サーフェス全体の Internal ラベルに従う。用途別の裁定は [Stable Interfaces](./stable-interfaces.md) の「終了コードの安定性」が SSoT。
- `status` 値は Review Artifact のフィールドであり、その意味変更は下記の Review Artifact のバージョニングに従う。
- JSON 出力スキーマの破壊的変更は [Review Artifact](./review-artifact.md) のバージョニングに従う。

## 関連ドキュメント

- [CLI Spec — `river review plan`](./cli-review-plan-spec.md) — 計画専用コマンドの仕様
- [CLI Spec — `river review exec`](./cli-review-exec-spec.md) — レビュー実行コマンドの仕様
- [Artifact Input Contract](./artifact-input-contract.md) — 入力アーティファクトの SSoT
- [Review Artifact](./review-artifact.md) — 出力スキーマ
- [Stable Interfaces](./stable-interfaces.md) — CLI / GitHub Actions の安定契約
- [Review Policy](./review-policy.md) — AI レビュー標準ポリシー
