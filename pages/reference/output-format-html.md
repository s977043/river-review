---
id: output-format-html
title: HTML 出力フォーマット (自己完結型レポート)
description: River Review の HTML 出力形式と、コマンドごとの対応範囲。
---

River Review は `--output html` / `output_format: html` で自己完結型の HTML レポートを出力します。CSS は `<style>` としてインラインに展開され、外部のスタイルシートやスクリプトを読み込みません。CI のアーティファクトへ保存し、そのままブラウザで開く用途を想定しています。

## 対応コマンド

`--output` が受理する値は CLI 共通で `text|markdown|json|yaml|html` です。ただし `html` を実際に描画するコマンドは限られます。

| コマンド                                                                                     | `--output html` | 生成物                                                       |
| -------------------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------ |
| `river run <path>`                                                                           | 対応            | レビューレポート（判定バナー・スコア・指摘一覧・リスク評価） |
| `river runs diff <id1> <id2> [<id3>...]`                                                     | 対応            | Loop Dashboard（loop signal・churn・振動タイムライン）       |
| `river review plan` / `river review exec`                                                    | 拒否（exit 3）  | `json` または `markdown` を指定する                          |
| `river evolve aggregate` / `river evolve replay` / `river evolve verify-replay`              | 拒否（exit 1）  | `text` または `json` を指定する                              |
| `river skills <path>`                                                                        | 拒否（exit 1）  | `text` / `markdown` / `json` のいずれかを指定する            |
| 上記以外（`river review route`・`river runs list`・`river runs digest`・`river promote` 等） | 無視            | コマンドごとの既定の出力へフォールバックする                 |

拒否されるコマンドのメッセージは次のとおりです。

```text
$ river review plan --output html
Error: Unsupported output format "html" for river review. Expected: json | markdown (text not yet implemented).

$ river evolve aggregate --output html
Unsupported --output for evolve aggregate: html. Use: text | json

$ river skills . --output html
Unsupported --output for skills: html. Use: text | markdown | json
```

`river skills` は以前 `yaml` / `html` を受理しながら中身を JSON で返していました（#1705）。宣言と実挙動の不一致を解消するために拒否へ変更したので、JSON が欲しい呼び出し側は `--output json` を指定してください。

## CLI

River Review は npm パッケージを公開していません。CLI はリポジトリ内で `npm run river -- ...` として実行します。

```bash
npm run --silent river -- run . --output html > review-report.html
```

`river run` 実行ヘッダー（`River Review (local)` から始まる数行）は `text` 以外のすべての形式で標準エラーへ回ります（#1695）。`html` の標準出力は `<!DOCTYPE html>` で始まり `</html>` で終わるため、リダイレクトすればそのまま妥当な HTML ファイルになります。

`--silent` は `npm run` 自身のバナー行（`> river-review@x.y.z river`）を抑止するために必要です。バナーは npm が標準出力へ書くもので、River Review 側では制御できません。CLI を直接起動する場合は不要です。

```bash
./src/cli.mjs run . --output html > review-report.html
```

Loop Dashboard は保存済みの実行記録（`.river/runs/`）を 2 件以上指定して生成します。run ID を 3 件以上渡すと振動検知が働き、Oscillation timeline に推移が描画されます（2 件の場合は空になります）。こちらも標準出力は HTML のみです。

```bash
npm run --silent river -- runs diff <run-id-1> <run-id-2> --output html > loop-dashboard.html
```

## GitHub Action

```yaml
- uses: s977043/river-review/runners/github-action@v1.22.0
  with:
    output_format: html
```

Action は `river run` を呼び出し、その標準出力をそのまま PR コメント本文として投稿します。GitHub のコメントでは `<style>` などが除去されるため、HTML ドキュメントは意図したとおりに表示されません。Action で `html` を使う場合は `comment: false` を指定し、ジョブログやアーティファクトとして扱ってください。

## 出力例（レビューレポート）

`formatHtmlOutput` が生成する文書の構造です。インライン CSS は長いため省略しています。

```html
<!DOCTYPE html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>River Review Report — midstream</title>
    <style>
      /* インライン CSS（省略） */
    </style>
  </head>
  <body>
    <h1>River Review Report</h1>
    <p class="meta">
      Phase: <strong>midstream</strong> &nbsp;|&nbsp; Timestamp:
      <strong>2026-04-18T00:00:00Z</strong>
    </p>
    <div class="banner" style="background: #fff8e1; border-color: #f9a825">
      ! Human Review Recommended
    </div>
    <h2>Summary</h2>
    <div class="counts">
      <span class="count-chip" style="background: #d32f2f">critical: 0</span>
      <span class="count-chip" style="background: #e65100">major: 1</span>
      <span class="count-chip" style="background: #f9a825">minor: 0</span>
      <span class="count-chip" style="background: #1565c0">info: 0</span>
    </div>
    <h2>Score</h2>
    <div class="overall-wrap"><span class="overall">96/100</span></div>
    <table>
      <tr>
        <th>Axis</th>
        <th>Score</th>
        <th style="width: 200px">Bar</th>
      </tr>
      <tr>
        <td>パフォーマンス</td>
        <td style="text-align: right">80</td>
        <td>
          <div class="score-bg"><div class="score-bar" style="width: 80%"></div></div>
        </td>
      </tr>
    </table>
    <h2>Findings</h2>
    <table>
      <tr>
        <th>Severity</th>
        <th>File:Line</th>
        <th>Title</th>
        <th>Message</th>
        <th>Suggestion</th>
      </tr>
      <tr>
        <td><span class="sev" style="background: #e65100">major</span></td>
        <td><code>src/Repository/OrderRepository.php:128</code></td>
        <td>N+1 query in loop</td>
        <td><pre>Eager load relations</pre></td>
        <td><pre>Use with()</pre></td>
      </tr>
    </table>
  </body>
</html>
```

セクションは次の順で並びます。

- ヘッダー: `phase` と `timestamp`
- 判定バナー: `auto-approve` / `human-review-recommended` / `human-review-required` を色分けして表示する
- Summary: severity ごとの件数チップ
- Score: overall と 5 軸のスコアバー（軸ラベルは日本語）
- Findings: severity・`file:line`・title・message・suggestion の表（指摘ゼロなら「指摘事項なし。」）
- Risk Assessment: `plan.riskAssessment` がある場合のみ追加される

## 出力例（Loop Dashboard）

`river runs diff --output html` が生成する `formatLoopDashboardHtml` の文書は、レビューレポートとは別のセクション構成です。

- ヘッダー: 対象 run 数と run ID の連鎖
- `suggestedLoopSignal` バナー: `CONVERGED` / `REVISE_REQUIRED` / `ESCALATE_HUMAN` / `STOP_OSCILLATED` / `NO_SIGNAL`
- Churn: new / resolved / persisting / oscillated の件数チップ
- Oscillation timeline: 指摘ごとの `●`（present）と `○`（absent）の推移
- New findings / Resolved findings: severity・file・title の一覧

## 重要な注意事項

- **自己完結（single-file）**: CSS はインライン展開され、外部アセットの参照を持たない。1 ファイルのまま共有・保存できる。
- **HTML エスケープ**: finding 由来の文字列（file・title・message・suggestion・run ID）はすべてエスケープされる。レビュー対象のコードに `<script>` が含まれていても、レポートを開いたときにスクリプトとして実行されることはない。
- **スコアは参考値**: overall と 5 軸のスコアは YAML / JSON 出力と同じ scoring engine で決定論的に算出される。LLM による質的判断ではないため、単独でマージ可否を決めてはならない。詳細は [YAML 出力フォーマット](./output-format-yaml.md) の「Scoring モデル」を参照。
- **言語は日本語固定**: `<html lang="ja">` とスコア軸の日本語ラベルはハードコードされており、レビュー言語の設定では切り替わらない。

## 関連

- `src/lib/output-formatters/html.mjs` — `formatHtmlOutput` / `formatLoopDashboardHtml` の実装
- [YAML 出力フォーマット](./output-format-yaml.md) — scoring モデルと verdict の定義
- [安定インターフェース](./stable-interfaces.md) — `--output` を含む CLI オプションの一覧
- [ループ収束コントラクト](./loop-convergence-contract.md) — Loop Dashboard が描画する `suggestedLoopSignal` の定義
