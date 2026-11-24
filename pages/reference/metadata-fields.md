# メタデータ・フィールド

以下のフィールドを使用してスキルのメタデータを一貫させ、ルーティングを容易にする。

| フィールド     | 目的                                                                                                                                                                                   |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`           | 一意の識別子（`rr-xxxx` 形式を推奨）。                                                                                                                                                 |
| `name`         | レビューに表示される人間が読めるスキル名。                                                                                                                                             |
| `description`  | スキルが何をチェックするかの短い要約。                                                                                                                                                 |
| `category`     | ルーティングの第一キー: `core`、`upstream`、`midstream`、`downstream`。新規スキルではこちらを使用すること。                                                                            |
| `phase`        | `category` の後方互換エイリアス。新規スキルでは `category` を使用すること。列挙値は `upstream`、`midstream`、`downstream`（`core` は `category` のみ）。                               |
| `applyTo`      | スキルが検査すべきファイルのグロブパターン。                                                                                                                                           |
| `tags`         | オプションの分類（例: `security` や `performance`）。                                                                                                                                  |
| `severity`     | オプションの影響レベル: `info`、`minor`、`major`、`critical`。                                                                                                                         |
| `inputContext` | スキルが必要とする入力（`diff` / `fullFile` / `tests` / `adr` / `commitMessage` / `repoConfig` / `reviewSelf` / `reviewExternal` / `findingsPool` / `prDescription` / `qaEvidence`）。 |
| `outputKind`   | 生成される出力カテゴリ（`findings` / `summary` / `actions` / `tests` / `metrics` / `questions` / `review-audit`）。省略時は `findings` がデフォルトとなる。                            |
| `modelHint`    | モデル選択のヒント: `cheap` / `balanced` / `high-accuracy`。                                                                                                                           |
| `dependencies` | 必須ツール/リソース（例: `code_search`、`test_runner`、`adr_lookup`、`repo_metadata`、`coverage_report`、`tracing`、または `custom:*`）。                                              |
| `priority`     | プランナーなしで実行する際の順序ヒント（値が小さいほど優先）。                                                                                                                         |

`evaluationType`（`deterministic` / `heuristic` / `agentic`）と `deterministicGate` は、スキルを実行する評価層を宣言する任意フィールド。詳細は[スキルスキーマ概要](./skill-schema.md)を参照。

メタデータは front matter で管理する。指示の実行前に解析できる状態を保ち、すべての必須フィールドは `/schemas/skill.schema.json` を使用したチェックに合格させる。
