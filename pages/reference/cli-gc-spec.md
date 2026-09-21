---
title: CLI Spec — `river gc`
---

`river gc` は River Review の **決定論的ガベージコレクション** エントリポイントです。レビューパイプラインの外側で動くメンテナンス CLI であり、`.river/memory/`・`artifacts/evals/`・`artifacts/review-artifact*.json`・一時ファイルなどの古い成果物を、再現可能なルールで削除（または候補としてフラグ）します。`river review *` とは責務が分かれますが、CI から安定して呼び出せるよう CLI エルゴノミクスだけは揃えています。

> 関連 Issue: #576（Task）/ #509（Capability）/ #507（Epic）
> 関連 workflow: `.github/workflows/weekly-gc.yml`

## 位置づけ

- `river gc` を **レビュー CLI として扱わない**。`river review plan` / `river review exec` / `river review verify` の姉妹コマンドではなく、それらが生成した成果物を回収するためのメンテナンス CLI として独立している。
- 決定論の意味は「同じファイルシステム状態・同じ retention policy・同じ基準日 (`--now`) を与えると、常に同じ削除対象集合が得られる」こと。順序の曖昧さはパスの昇順（lexicographic）で解消する。
- 安定性ラベルは **Internal**。`river` CLI は npm 未公開で配布経路を持たない。フラグの追加・削除・意味変更と既定値の変更はいずれも Stable Contract の対象外であり、minor 以下のリリースで入る。既定値は次のとおり:
  - `--retention-days` 既定値 `90`
  - `--max-entries` 既定値 `1000`
  - `--max-size-mb` 既定値 `500`

## Usage

```bash
river gc [options]
```

### 代表例

```bash
# 1) 既定は dry-run。何が消えるかだけを表示し、実際には削除しない
river gc

# 2) 実際に削除する（CI / weekly workflow などで使用）
river gc --force

# 3) CI から machine-readable な結果を受け取る
river gc --force --json --output-file ./artifacts/gc-result.json

# 4) memory と evals だけを対象にして、30 日より古いものを dry-run で確認
river gc --scope memory --scope evals --retention-days 30

# 5) 重要な一時ファイルを除外する
river gc --force --exclude 'artifacts/keep/**'
```

## 引数とオプション

### Retention（保持ポリシー）

| オプション              | 型     | 既定値 | 説明                                                                                              |
| ----------------------- | ------ | ------ | ------------------------------------------------------------------------------------------------- |
| `--retention-days <N>`  | number | `90`   | artifact メタデータの `timestamp`（無ければ mtime）を基準に N 日より古いエントリを削除対象。      |
| `--max-entries <N>`     | number | `1000` | 対象 scope ごとのエントリ数が N を超えた場合、古い順に N 件まで残して削除対象。                   |
| `--max-size-mb <N>`     | number | `500`  | 対象 scope ごとの合計サイズが N MB を超えた場合、古い順に削除対象（合計が N MB 以下になるまで）。 |
| `--now <iso-timestamp>` | string | 実時刻 | 決定論的再現・テスト用に基準時刻を固定する。`timestamp` 比較に使用される。                        |

`--retention-days` / `--max-entries` / `--max-size-mb` は **union** で評価される。いずれか 1 つでもヒットしたファイルは削除対象に入る。全部に引っかかっても 1 回しか削除されない。

### Scope（対象範囲）

| オプション         | 型                                                      | 既定値 | 説明                                                                       |
| ------------------ | ------------------------------------------------------- | ------ | -------------------------------------------------------------------------- |
| `--scope <value>`  | `memory` / `evals` / `review-artifacts` / `tmp` / `all` | `all`  | 繰り返し可。複数指定した場合は union。`all` は 4 scope すべてを含む。      |
| `--exclude <glob>` | string                                                  | -      | 繰り返し可。削除対象から除外するパス glob。`.gitignore` と同じ glob 構文。 |

`--exclude` に一致したパスは retention policy の判定結果にかかわらず **常に保持** される。除外されて保持されたファイルは `removed[]` に現れず、`keptSummary` のカウントのみに影響する。

### Mode（動作モード）

| オプション  | 型   | 既定値                      | 説明                                                                                      |
| ----------- | ---- | --------------------------- | ----------------------------------------------------------------------------------------- |
| `--dry-run` | flag | `--force` 未指定時は `true` | 削除候補を列挙するだけで、実際には削除しない。exit `0`。                                  |
| `--force`   | flag | `false`                     | 実際に削除する。`--dry-run` と同時指定した場合は **`--dry-run` が優先**される（安全側）。 |

`--force` を指定しない限り、`river gc` は **破壊的操作を行わない**。CI で本番削除を実行する際は必ず `--force` を明示する。

### Output（出力）

| オプション             | 型     | 既定値  | 説明                                                                                           |
| ---------------------- | ------ | ------- | ---------------------------------------------------------------------------------------------- |
| `--json`               | flag   | `false` | 機械可読な計画 / 結果 JSON（後述）を stdout に出力する。指定時は人間向け要約を stderr に回す。 |
| `--output-file <path>` | string | -       | `--json` の出力先。指定時は stdout に書かずファイルへ書き込む。                                |
| `--quiet`              | flag   | `false` | 人間向け要約を抑止する。`--json` と併用すると sterr への要約も消える。エラーは常に stderr。    |
| `--debug`              | flag   | `false` | 詳細ログを stderr に出す。JSON 出力の `errors[]` に補足情報が増えることがある。                |

## GC 対象

各 scope が対象とするパスと除外基準は次の通り。

| Scope              | 対象ディレクトリ / パターン                                 | 含まれるもの                       | 明示的に除外されるもの                                 |
| ------------------ | ----------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------ |
| `memory`           | `.river/memory/**`                                          | インデックス / 埋め込み / 会話履歴 | `.river/memory/index.json`（最新インデックス本体）     |
| `evals`            | `artifacts/evals/**`                                        | 評価ラン結果・スナップショット     | `artifacts/evals/latest/**`（最新 run への symlink）   |
| `review-artifacts` | `artifacts/review-artifact*.json` / `artifacts/review-*.md` | Review Artifact / 人間向け要約     | `artifacts/review-artifact.schema.json`（schema 本体） |
| `tmp`              | `.river/tmp/**`・`artifacts/.tmp/**`                        | CLI 実行が残した中間ファイル       | なし（空ディレクトリは保持）                           |

- `memory` の「インデックス本体」「`evals/latest`」「schema ファイル」のように、**それを消すと復元不能になる単一ソース** は、どの retention policy にヒットしても削除しない（hard guard）。
- 削除は「ファイル単位」で行い、空になったディレクトリは削除しない（symlink / 相対参照を壊さないため）。

## Output JSON

`--json` 指定時に出力される結果 JSON のシェイプは次の通り。

```text
{
  "version": "1",
  "mode": "dry-run" | "force",
  "scopes": ["memory", "evals", ...],
  "retention": { "days": N, "maxEntries": N, "maxSizeMb": N },
  "removed": [
    { "path": "...", "sizeBytes": N, "reason": "age" | "count" | "size" },
    ...
  ],
  "keptSummary": {
    "memory":           { "count": N, "sizeBytes": N },
    "evals":            { "count": N, "sizeBytes": N },
    "review-artifacts": { "count": N, "sizeBytes": N },
    "tmp":              { "count": N, "sizeBytes": N }
  },
  "errors": [
    { "path": "...", "message": "..." }
  ]
}
```

### フィールド定義

| フィールド    | 型       | 説明                                                                                                                 |
| ------------- | -------- | -------------------------------------------------------------------------------------------------------------------- |
| `version`     | string   | スキーマバージョン。現行は `"1"`。破壊的変更時に bump。                                                              |
| `mode`        | string   | `"dry-run"` または `"force"`。`--force` 指定時のみ `force`。                                                         |
| `scopes`      | string[] | 解決後の対象 scope 一覧（`all` は展開される）。                                                                      |
| `retention`   | object   | 適用された retention knob。フラグ未指定時は既定値がそのまま入る。                                                    |
| `removed`     | array    | 削除された（または dry-run で削除候補となった）ファイル。`reason` は最初にヒットしたポリシー名のみを記録する。       |
| `keptSummary` | object   | scope ごとに「削除されなかった」エントリの件数と合計サイズ。`--exclude` で保護されたファイルもここにカウントされる。 |
| `errors`      | array    | ファイル単位の失敗（削除失敗・統計取得失敗など）。`errors` が空でない場合でも他ファイルの削除は継続する。            |

- `removed[]` は **パス昇順（lexicographic）** で並ぶ。これが決定論の根拠のひとつとなる。
- `removed[].reason` が `age` / `count` / `size` のいずれかに該当し、かつ同時に複数のポリシーにヒットした場合は、優先順位 `age` > `count` > `size` で最初にヒットしたものを記録する。

## 終了コード

| Exit | 意味                                                                                                                                                                                                                           |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `0`  | 成功。dry-run と force のどちらでも、`errors` が空なら `0`。                                                                                                                                                                   |
| `1`  | ランタイム失敗。削除エラー・IO エラー・権限エラー等のランタイム障害が `errors` に 1 件以上含まれる場合。                                                                                                                       |
| `2`  | 設定エラー。未知の `--scope` 値、不正な glob、`--retention-days` / `--max-entries` / `--max-size-mb` の数値パース失敗、相互排他違反など。引数バリデーションは起動時に完結するため、この種のエラーは skill 実行前に検出される。 |

`--dry-run` と `--force` を両方指定した場合は前述のとおり `--dry-run` が優先されるため、それ自体は設定エラーにならない。

### mode と exit の対応

| mode      | errors | Exit | 意味                                                             |
| --------- | ------ | ---- | ---------------------------------------------------------------- |
| `dry-run` | 空     | `0`  | 削除候補のみ列挙。副作用なし。                                   |
| `dry-run` | 非空   | `1`  | 列挙途中で IO エラーが発生（例: 権限不足）。                     |
| `force`   | 空     | `0`  | 列挙した全ファイルを削除成功。                                   |
| `force`   | 非空   | `1`  | 一部削除に失敗。成功した削除はロールバックしない（冪等性優先）。 |

## 決定論保証

`river gc` は次の条件を満たす限り決定論的に振る舞います。

1. **同じファイルシステム状態**: 対象 scope 配下のファイル集合、それぞれの `timestamp` メタデータ（無ければ mtime）、サイズが同一。
2. **同じ retention policy**: `--retention-days` / `--max-entries` / `--max-size-mb` の値が同一。
3. **同じ基準時刻**: `--now` が同一（未指定ならシステム時刻に依存するため非決定論的）。

この 3 条件を満たすとき、`removed[]` の **内容・順序・`reason`** が完全に一致する。

- タイブレーク規則: `timestamp` が同じファイルが複数ある場合は **パス昇順（lexicographic）** で古いものから並べる。`--max-entries` / `--max-size-mb` の境界判定もこの順序で行う。
- `--exclude` の glob は解決時に正規化し、マッチ判定も lexicographic に行う。

## CI / `weekly-gc.yml` との接続

CI からの標準呼び出し契約:

```bash
river gc --force --json --output-file ./artifacts/gc-result.json
```

- `artifacts/gc-result.json` は workflow の artifact upload で永続化することを推奨。
- exit `0` は「retention policy を適用した結果として正常終了」を意味し、**削除件数が 0 でも `0`** を返す（「掃除することが無かった」も成功）。
- exit `1` / `2` が返った場合は `weekly-gc.yml` が失敗 Issue を自動起票する運用に接続する（詳細は workflow 側のロジックに従う）。
- 現行の `.github/workflows/weekly-gc.yml` はまだ `river gc` 本体を呼んでおらず、lint / structure test / build を代理で実行している。本 spec は `river gc` 実装後に workflow を接続するための **前提契約** として機能する。

## 関連ドキュメント

- [Artifact Input Contract](./artifact-input-contract.md) — 入力 artifact の SSoT（GC 対象 scope の前提となる）
- [Review Artifact](./review-artifact.md) — `review-artifacts` scope が扱う出力スキーマ
- [Riverbed Memory](./riverbed-storage.md) — `memory` scope が扱う永続ストレージ
- [Stable Interfaces](./stable-interfaces.md) — CLI / GitHub Actions 安定契約
- [`river review exec`](./cli-review-exec-spec.md) / [`river review plan`](./cli-review-plan-spec.md) — レビュー CLI（GC とは責務が分かれる）
