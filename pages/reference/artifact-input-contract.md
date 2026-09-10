---
title: Artifact Input Contract（アーティファクト入力コントラクト）
---

River Review は PlanGate などの上流ワークフローが生成する成果物（artifact）を **外部入力** として受け取り、レビュー・QA・W チェックを実行する review agent です。本ドキュメントは River Review が安定して読み取れる入力アーティファクトの契約（input contract）を定義します。

> 関連 Issue: #516（Task）/ #508（Capability）/ #507（Epic）

## 方針

- River Review は **artifact-driven** に動作し、PlanGate 内部コマンドや特定のディレクトリ構成に依存しない。
- 入力は **ファイルパスベース** で受け取り、内容形式（Markdown / JSON / XML / plain）のみを契約する。
- ファイルが存在しない場合の挙動（スキップ・デグレード・エラー）を各アーティファクトごとに定義する。
- 新たな artifact を追加する際は本ドキュメントを更新し、後方互換を維持する。

## 対象アーティファクト一覧

River Review が認識する入力アーティファクトは以下の通りです。列の意味は末尾の「凡例」を参照してください。

| ID                | ファイル名例         | 形式         | 必須/任意      | スキーマ / 参考                                     | 役割                                              |
| ----------------- | -------------------- | ------------ | -------------- | --------------------------------------------------- | ------------------------------------------------- |
| `pbi-input`       | `pbi-input.md`       | Markdown     | 任意（推奨）   | フリーフォーム                                      | PBI（Product Backlog Item）の入力仕様・背景       |
| `plan`            | `plan.md`            | Markdown     | 任意（推奨）   | フリーフォーム                                      | 実装計画・設計判断の記録                          |
| `design`          | —（既定なし）        | Markdown     | 任意（推奨）   | フリーフォーム                                      | 設計文書（アーキテクチャ・技術的前提）            |
| `todo`            | `todo.md`            | Markdown     | 任意           | フリーフォーム（チェックリスト）                    | 実装タスクと進捗                                  |
| `test-cases`      | `test-cases.md`      | Markdown     | 任意           | フリーフォーム（箇条書き／表）                      | テストケース設計                                  |
| `review-self`     | `review-self.md`     | Markdown     | 任意           | フリーフォーム                                      | 実装者によるセルフレビュー                        |
| `review-external` | `review-external.md` | Markdown     | 任意           | フリーフォーム                                      | 外部レビュー結果（既存の AI/人間レビュー）        |
| `diff`            | `diff.patch`         | unified diff | 必須（代替可） | `git diff` 互換                                     | レビュー対象の差分。未指定時は git から取得       |
| `junit`           | `junit.xml`          | XML          | 任意           | JUnit XML                                           | 単体/結合テストの結果                             |
| `coverage`        | `coverage.xml` など  | XML / JSON   | 任意           | Cobertura / LCOV / Istanbul JSON のいずれか         | カバレッジレポート                                |
| `lint`            | `lint.json` など     | JSON / plain | 任意           | ESLint JSON、stylelint JSON、または tool 固有 plain | Lint 実行結果                                     |
| `typecheck`       | `typecheck.txt` など | plain / JSON | 任意           | tsc `--pretty=false` または tool 固有 plain         | 型検査の実行結果                                  |
| `findings-pool`   | `findings-pool.json` | JSON         | 任意           | 本ドキュメントの `findings-pool` 節                 | 複数の Review Artifact から集約した findings 履歴 |
| `tdd-ledger`      | `tdd-ledger.json`    | JSON         | 任意           | 本ドキュメントの `tdd-ledger` 節                    | TDD の RED/GREEN/REFACTOR VERIFY フェーズ実行証跡 |

### 凡例

- **必須/任意**
  - `必須`: 指定がなければ River Review は実行を中断する。
  - `必須（代替可）`: 当該 artifact が存在しない場合、代替手段（例: `git diff` による自動取得）が利用される。
  - `任意`: 欠損してもレビューは継続。該当観点のレビューはスキップまたはデグレードする。
  - `任意（推奨）`: 欠損は許容されるが、レビュー品質が有意に低下する。
- **形式**: ファイル内容のエンコーディングおよび構文。複数形式に対応するものはカンマ区切りで併記する。
- **ファイル名例**: 後述「指定方法（入力チャネル）」の 3 番目、カレントディレクトリ検出で探索する既定ファイル名。`—（既定なし）` の artifact は既定探索の対象外であり、CLI 引数または設定ファイルによる明示供給だけで解決する。

## アーティファクト別の契約詳細

### `pbi-input` / `plan` / `todo` / `test-cases`

- **形式**: UTF-8 Markdown。見出し構造・箇条書きは自由。
- **サイズ目安**: 1 ファイルあたり 100KB 以下を推奨。上限を超える場合 River Review は差分最適化（要約・トリム）を適用する場合がある。
- **欠損時**: 該当 artifact を参照する skill はその観点をスキップし、`skippedSkills` にその旨を記録する。
- **PlanGate #810 連携（任意）**: PlanGate #810（Unknown Discovery）は assumption / unknown ledger（Assumptions・Known Unknowns・Blocking Unknowns 等の節）を出力する。River Review はこれを専用 artifact を新設せず `plan` artifact 内の追加セクションとして受け取る。欠損時の挙動は本節の「欠損時」と同一であり、PlanGate への依存は必須にしない。
- **`reviewSignals`（任意）**: レビュアー自動選択用の構造化シグナル。Markdown 本文ではなくレビュープランオブジェクトのフィールドとして供給する。詳細は次節を参照。

### `reviewSignals`（レビュープラン付随の任意シグナル）

`reviewSignals` は `--reviewers auto` のロール自動選択へ追加のヒントを与える任意の入力です。`plan.md` の Markdown 本文ではなく、**レビュープランオブジェクトのフィールド**として供給します（実装上の読み取り位置は `context.plan.reviewSignals`）。語彙は River Review 側で定義し、特定の上流ワークフローの形式には依存しません。

- **形式**: JSON オブジェクト。`stage` 文字列と、真偽値をとる signal キー群からなる。
- **供給チャネル**: プログラム的な埋め込み（`runLocalReview({ context })` へ渡すレビュープラン）。CLI フラグや専用ファイルとしては未公開である。
- **producer**: 本リポジトリ内に producer が存在せず、値の供給は host 側の責務である。PlanGate もその供給者の一例にすぎず、River Review は consumer として読むだけである。
- **欠損時**: 欠損が既定の状態である。`--reviewers auto` はファイル種別とリスク評価だけでロールを選び、`reviewSignals` 導入前と同じ挙動になる。

#### `stage` 語彙

| `stage`        | 追加されるロール               |
| -------------- | ------------------------------ |
| `requirements` | （追加なし）                   |
| `plan`         | `security-scanner`, `test-gap` |
| `design`       | `frontend-reviewer`            |
| `exec`         | `security-scanner`             |
| `verify`       | `test-gap`                     |
| `release`      | `security-scanner`             |

未知の `stage` 値は無視され、ロールは追加されません。

#### signal キー一覧

| signal キー            | 追加されるロール    |
| ---------------------- | ------------------- |
| `touchesAuth`          | `security-scanner`  |
| `changesPermissions`   | `security-scanner`  |
| `handlesSensitiveData` | `security-scanner`  |
| `databaseMigration`    | `security-scanner`  |
| `breakingChange`       | `security-scanner`  |
| `changesUi`            | `frontend-reviewer` |
| `changesUserFlow`      | `frontend-reviewer` |
| `deploymentChange`     | `ci-cd-reviewer`    |

- 値が truthy のキーのみ評価される。未知のキーは無視される。
- `changesPublicApi` / `changesCliInterface` / `changesInstallation` は devex Lens に相当し、専任ロールが不在なため意図的にどのロールへも写像しない。
- signal はロールを**追加するだけ**であり、既定で常に選ばれる `bug-hunter` を含め、既存の選択結果を減らさない。
- Lens との対応関係は [Reviewer Lens Taxonomy](../explanation/reviewer-lens-taxonomy.md) を参照してください。

供給例:

```json
{
  "reviewSignals": {
    "stage": "exec",
    "touchesAuth": true,
    "changesUi": true
  }
}
```

### `design`

設計文書を供給するアーティファクトです。Flow が宣言する `design` 入力は、同名の本 artifact ID として解決されます。

- **供給方法**: `--artifact design=<path>` または設定ファイルの `artifacts.design` で必ず明示供給する。カレントディレクトリ検出の既定ファイル名は持たない。
- **既定ファイル名を持たない理由**: `design` は `design-review` / `technical-review` の必須入力であり、必須入力へ既定束縛を置くと、作業ツリーに置かれているだけのファイルが供給済みだと宣言してしまうため（[Runner CLI Reference](./runner-cli-reference.md#entry-acceptance-scope)）。
- **形式**: UTF-8 Markdown。アーキテクチャ・設計判断・技術的前提を記述する。
- **サイズ目安**: 1 ファイルあたり 100KB 以下を推奨する。
- **必須入力とする Flow**: `design-review` / `technical-review`
- **任意入力とする Flow**: `plan-review` / `requirements-review` / `research-review`
- **欠損時（必須入力の Flow）**: 当該入力を未束縛として報告する。
- **欠損時（任意入力の Flow）**: 該当する観点をスキップする。
- **`stage` 語彙との区別**: 前掲の `stage` 語彙にある `design` は `reviewSignals.stage` が取る値であり、artifact ID と同じ語彙空間に属さない。名前が同じでも、両者に対応関係はない。

### `review-self` / `review-external`

- **形式**: UTF-8 Markdown。既存の AI reviewer（River Review 自身を含む）や人間レビュワーの出力をそのまま格納できる。
- **欠損時**: W チェック（二重レビュー）系 skill はスキップされる。
- **互換**: 出力の形式は [`schemas/output.schema.json`](../../schemas/output.schema.json) の `issue` 定義と互換性があると解釈される場合があるが、必須ではない。
- **参照**: W チェックの実践手順は [W チェック実践ガイド](../guides/w-check.md) を参照してください。

### `findings-pool`

- **形式**: UTF-8 JSON。複数の Review Artifact（`river review exec` / `river review verify` の実行履歴）から収集した `findings[]` を集約したもの。
- **サイズ目安**: 5 MB 以下を推奨（典型的には数百件の findings を想定）。超過する場合はローテーションや期間絞り込みを CLI 側で実施する。
- **スキーマ（暫定）**:

  ```json
  {
    "version": "1",
    "entries": [
      {
        "timestamp": "2026-04-17T00:00:00Z",
        "phase": "exec",
        "skillId": "plangate-plan-integrity",
        "severity": "major",
        "file": "path/to/file.ts",
        "line": 42,
        "message": "説明文",
        "source": "path/to/review-artifact.json"
      }
    ]
  }
  ```

  - `version`: 文字列 `"1"` 固定（将来の非互換変更時にバンプ）。
  - `entries[]`: 各 finding を 1 エントリとして展開した配列。
  - `entries[].phase`: `exec` または `verify`。
  - `entries[].skillId`: 当該 finding を生成した skill の ID。
  - `entries[].severity`: 外部語彙（`critical` / `major` / `minor` / `info`）。
  - `entries[].file` / `entries[].line`: finding の対象位置。差分外を指す finding では省略可。
  - `entries[].message`: finding の説明文。
  - `entries[].source`（任意）: 集約元となった Review Artifact のパス。provenance を保つために推奨。

- **生成方法**: CLI 側で複数の `review-artifact.json` を読み、その `findings[]` を `entries[]` に連結して構築する想定（実装は別途追跡中）。
- **欠損時**: `plangate-rule-promotion` など本アーティファクトを必要とする skill は Pre-execution Gate で `NO_REVIEW` を返し、昇格判定処理をスキップする。

### `tdd-ledger`

- **形式**: UTF-8 JSON。TDD（テスト駆動開発）の各フェーズ実行を記録した台帳。PlanGate などの上流ワークフローが exec 中に生成する想定。
- **役割**: RED / GREEN / REFACTOR VERIFY フェーズの実行コマンドと結果（exitCode）を記録し、TDD が宣言どおり正しい順序で行われた証跡を提供する。
- **スキーマ（暫定）**:

  ```json
  {
    "version": "1",
    "task": "TASK-1234",
    "phases": [
      {
        "phase": "tdd_red",
        "command": "npm test -- discount.test.ts",
        "exitCode": 1,
        "conclusion": "applyDiscount 未実装のため期待どおり失敗",
        "testCaseRefs": ["TC2"]
      },
      {
        "phase": "tdd_green",
        "command": "npm test -- discount.test.ts",
        "exitCode": 0,
        "conclusion": "最小実装で TC2 が pass",
        "testCaseRefs": ["TC2"]
      }
    ]
  }
  ```

  - `version`: 文字列 `"1"` 固定（将来の非互換変更時にバンプ）。
  - `task`（任意）: 対応するタスク識別子。
  - `phases[].phase`: `tdd_red` / `tdd_green` / `refactor_verify` / `verification` のいずれか。
  - `phases[].command`: 実行したテスト / 検証コマンド。
  - `phases[].exitCode`: コマンドの終了コード（`tdd_red` は `!= 0`、`tdd_green` / `refactor_verify` / `verification` は `0` が期待値）。
  - `phases[].conclusion`（任意）: そのフェーズの結論・失敗理由の説明。
  - `phases[].testCaseRefs`（任意）: 対応する `test-cases` の ID 配列。

- **欠損時**: `plangate-tdd-evidence` など本アーティファクトを必要とする skill は Pre-execution Gate で `NO_REVIEW` を返し、TDD 証跡レビューをスキップする。

### `diff`

- **形式**: unified diff（`git diff` 互換）。artifact として供給された差分では、バイナリ差分は無視される（`review plan|exec --base <ref>` で git から取得した場合は `git diff --name-only` を用いるため、binary と 100% rename も変更ファイル集合に含まれる）。
- **必須性**: レビュー対象差分は **必ずいずれかの手段で供給される必要がある**。artifact として指定が無い場合 River Review は `git diff <mergeBase>..HEAD` を内部で実行し、その結果を差分として扱う。
- **`--base` との優先順位**（#2046）: 明示指定した artifact（tier 1 CLI 引数 / tier 2 設定ファイル）は `review plan|exec --base <ref>` に優先する。ただし優先されるのは**そのパスにファイルが実在する場合**であり、実在しなければ `--base` の範囲が使われる（その旨を stderr で告知する）。tier 3 のディレクトリ自動検出（`diff.patch`）よりは `--base` が優先する。いずれの場合も、採用しなかった側を stderr の警告で告知する。
- **結果が空の場合**: 供給された差分（指定または fallback 実行結果）が空であれば、`status` を `no-changes` とし、レビュー skill は実行されない。

### `junit`

- **形式**: [JUnit XML](https://github.com/testmoapp/junitxml) 互換。ネストした `<testsuite>` を許容。
- **欠損時**: テスト成功/失敗観点の skill はスキップされる。

### `coverage`

- **形式**: Cobertura XML、LCOV、または Istanbul JSON のいずれか。
- **欠損時**: カバレッジ観点の skill はスキップされる。
- **注意**: カバレッジ閾値の判定は skill 側の責務であり、本契約はスキーマの受け渡しのみを規定する。

### `lint` / `typecheck`

- **形式**: 優先順に JSON（ESLint/stylelint/tsc JSON）→ plain テキスト。plain の場合、skill 側でツール名に応じた簡易パースを行う。
- **欠損時**: 静的解析観点の skill はスキップされる。

## 指定方法（入力チャネル）

River Review は以下の順でアーティファクトを解決します。

1. **CLI / GitHub Action の引数**（`river review plan` / `river review exec` CLI で定義済み）。例: `--artifact pbi-input=./path/to/pbi-input.md`
2. **設定ファイル経由**（`river review plan` / `river review exec` CLI で定義済み）。`.river-review.json` / `.river-review.yaml` / `.river-review.yml` 内の `artifacts` セクション。
3. **カレントディレクトリ検出**（フォールバック）。ワークスペース直下から上記の既定ファイル名を探索する。

どのチャネルも未指定の artifact については「欠損」と扱い、前節の「欠損時」挙動に従います。

## 後続システムとの接続

### CLI

- `river run` は解決した artifact 一覧を [Review Artifact](./review-artifact.md) の `context` / `debug` セクションに記録する。
- 解決失敗（必須 artifact の欠損）時は終了コード `1` を返す。参考: [Stable Interfaces](./stable-interfaces.md)。

### Skill

- 個別 skill は必要な artifact ID を宣言的に参照する（skill pack 設計として実装済み）。
- 未解決 artifact を要求する skill は自動的にスキップされ `plan.skippedSkills` に記録される。

### CI

> **⚠️ GitHub Action 制限（未実装）**
>
> `--artifact` および `--ensemble` フラグは GitHub Action の inputs として **まだ公開されていません**。
> 回避策として `dist/index.mjs` CLI を直接呼び出してください。具体的な呼び出し例は [W チェック実践ガイド](../guides/w-check.md) を参照してください。
> `artifact` 専用 input の追加は別途対応予定です（参考: `runners/github-action/action.yml`）。

- CI の失敗判定は `Review Artifact` の `status` と `findings` の severity を見る運用を推奨する。

## PlanGate 非依存性について

本契約は PlanGate を **一つの生成元候補** として扱い、以下を意図的に避けています。

- PlanGate 固有のディレクトリ構成（例: `plangate/<phase>/` 等）をデフォルトパスとして固定化すること。
- PlanGate の内部コマンドや実行モデルに依存する artifact 名の採用。
- PlanGate のバージョンと River Review の skill バージョンを同期させる前提。
- PlanGate 固有のシグナル形式を `reviewSignals` の契約として採用すること。`stage` 語彙と signal キーは River Review 側が定義し、PlanGate は供給者の一例として扱う。

これにより、PlanGate 以外のワークフローや手作業で生成した artifact でも River Review を利用可能にします。

## バージョン管理

- 本 contract はドキュメントバージョン `1` として管理する（将来、JSON スキーマ化した際は `version` フィールドを追加する）。
- artifact の追加・形式変更は SemVer のマイナーバンプ相当（後方互換を保つ）として扱い、削除はメジャーバンプ相当とする。

## 関連ドキュメント

- [Review Artifact](./review-artifact.md) — レビュー実行結果の出力スキーマ
- [Stable Interfaces](./stable-interfaces.md) — CLI / GitHub Actions の安定契約
- [Runner CLI Reference](./runner-cli-reference.md) — Runner CLI の使い方
- [Review Policy](./review-policy.md) — AI レビュー標準ポリシー
- [W チェック実践ガイド](../guides/w-check.md) — `review-self` / `review-external` を使った二重レビューの手順
