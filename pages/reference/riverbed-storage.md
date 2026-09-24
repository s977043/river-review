# Riverbed Memory ストレージ設計

Riverbed Memory は、過去の判断やパターンを LLM レビューに活用するための軽量ストレージです。v1 ではリポジトリ内の `.river/memory/index.json` という単一 JSON ファイルにエントリを追記する方式で動作します (`src/lib/riverbed-memory.mjs`)。

## ディレクトリ構成

```text
.river/memory/
  index.json
```

- `index.json`: エントリ配列とバージョンを保持する単一ファイル。`schemas/riverbed-index.schema.json` に準拠し、各エントリは `schemas/riverbed-entry.schema.json` に準拠する。

ディスク I/O は `loadMemory` / `appendEntry` / `queryMemory` / `supersede` / `expireEntries` などの関数を通じて行う。ファイルが存在しない場合は `{ entries: [], version: "1" }` を返す stateless fallback が効く。`expireEntries` は `expiresAt` が過ぎたエントリの `status` を `archived` に遷移させる。`expiresAt` が日時として解釈できない値のときは、アーカイブせず警告のみ出力する（解釈できない文字列は期限到達の根拠にならないため）。とくに `promotion_candidate` では `archived` が不可逆な終端状態であり、アーカイブが候補の破棄に等しくなる。

`expiresAt` が妥当かどうかの定義は `src/lib/expires-at.mjs` の `parseExpiresAt` 一箇所に置き、CLI の `--expires` が受理する値の集合と一致させる。RFC 3339 の `YYYY-MM-DD` と date-time だけを受理し、存在しない暦日（`2027-02-30` など）は拒否する。`Date` が読めてしまう `2026` や `2026-08-04 10:00` はここでは無効になり、期限の根拠として扱わない。

## エントリ仕様（抜粋）

- `id`: 一意な文字列（例: `adr-001`, `pattern-react-query`）
- `type`: `adr | review | wontfix | pattern | decision | eval_result | suppression | resurface`
- `content`: 本文。Markdown/テキストを想定
- `metadata`:
  - `createdAt` (ISO8601), `updatedAt` (任意)
  - `author`
  - `phase` (`upstream | midstream | downstream`, 任意)
    - `river run` などのレビューは、自分のフェーズと一致する `phase` のエントリだけを読み込む。ただし `phase` を持たない `suppression` エントリは全フェーズで読み込む（`river suppression add` は `phase` を書かない）
  - `tags`, `relatedFiles`, `links`, `summary`
- `context`: 任意の追加情報（PR 番号、関連 ADR ID など）
- `status`: `active | superseded | archived` (省略時 `active`、`archived` は `expireEntries` で遷移)

詳細は `schemas/riverbed-entry.schema.json` を参照してください。

## インデックス仕様（抜粋）

- `version`: スキーマバージョン（現在は `"1"`）
- `entries[]`: 上記エントリの配列

## 生成と利用の流れ

1. `npm run eval:all -- --persist-memory` を実行すると、eval 結果が `eval_result` エントリとして `.river/memory/index.json` に追記される。
2. 手動で追加する場合は `src/lib/riverbed-memory.mjs` の `appendEntry(indexPath, entry)` を呼び出す。古いエントリを論理的に置き換える場合は `supersede(indexPath, oldId, newId)`、期限切れエントリの一括アーカイブには `expireEntries(indexPath)` を使う。
3. レビュー時には `loadMemory` + `queryMemory` で該当エントリを検索し、プロンプトへ組み込む。
4. CI では `.github/workflows/riverbed-persist.yml` が GitHub Artifact 経由で `index.json` を 90 日間永続化する。

### ストレージポリシー

- リポジトリ直下の `.river/memory/index.json` をそのまま Git 管理する運用でも、`.gitignore` でローカル限定にする運用でも可。機微情報は記載しない。
- UTF-8 エンコード
- 破損ファイルは読み込み時に例外を投げる。レビュー実行時は stateless fallback で継続する

## サンプルデータ

`tests/fixtures/riverbed/` に ADR、wontfix、pattern の例を配置しています。スキーマを満たす最小構成の参考として利用できます。
