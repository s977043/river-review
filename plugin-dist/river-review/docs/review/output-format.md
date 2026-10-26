# レビュー出力形式（エージェント向け）

> **出典**: [pages/reference/review-policy.md](../../pages/reference/review-policy.md) Section 2 + 6
> エージェント・プロンプトから参照するための内部向け仕様。人間向けの詳細は出典を参照。

## 構造

### 1. Summary（要約）

- 変更内容の要点
- 主要な懸念事項
- 全体評価（良い点と改善点のバランス）

### 2. Comments（具体的指摘）

各指摘に以下を含める:

- **対象箇所**: `<file>:<line>`
- **問題点**: 何が問題か、なぜ問題か
- **影響**: 引き起こす可能性のある影響
- **重要度**: 下記の優先度ラベル

### 3. Suggestions（改善提案）

- 具体的な改善案・代替実装
- コード例やリファクタリング方向性

### 4. 補助セクション（任意 / #1196 S2）

レビューの判断材料を高めるため、必要に応じて以下を Summary の後に添える。いずれも**任意**で、finding スキーマ・severity 体系は変更しない（後方互換）:

- **Good Points（良い点）**: 妥当な設計判断・適切なテスト追加など、維持すべき点。レビューが指摘一辺倒に偏るのを防ぐ
- **Missing Tests（不足テスト）**: 追加すべきテスト観点（正常系で抜けている異常系・境界・回帰）。finding 化しにくい「テストの不在」を可視化する
- **Follow-up Issues（フォローアップ）**: 本 PR のスコープ外だが別途追跡すべき課題。Blocker でない Major を別 Issue で追う運用と接続する
- **Unverified / Residual Risk（未確認事項・残リスク）**: レビュー時点で検証しきれなかった前提・観測できなかった挙動・残る懸念を、finding とは別にレポート全体として明示する。判断の限界を後から追跡可能にする
  - **Unknown Coverage（残存 Unknown / evidence_missing / resolution）**: 残リスク節の下位構造。レビュー時点で残る Unknown を構造化して並べるブロックである。各 Unknown 項目は category・severity・blocking・evidence_missing（不足している証拠）・resolution（解消手順）を持つ。確認済みで受容したリスクと未確認のリスクを区別し、解消済み Unknown には根拠（evidence: リンク済み受入条件・テスト等）を関連付ける。verdict への写像は [loop-convergence-contract.md](../../pages/reference/loop-convergence-contract.md) の写像表に従う（新語彙は作らない）

> これらは人間/エージェントが読む要約セクションであり、機械可読な finding は引き続き Comments（severity 付き）で表現する。

### 5. 提示順と段階的開示（#1713）

出典 Section 2.5 に対応する。`--output markdown`（PR コメント本体）の並び順を次のように固定する:

1. **サマリー行**: 判定・重要度別の件数・スコア・フェーズを本文の先頭 1 行に置く
2. **要対応**: Critical / Major の指摘を常時展開する
3. **軽微・参考**: Minor / Info の指摘を `<details>` に畳む
4. **実行ログ**: 優先度サマリー・スコア内訳・選択/スキップスキルを `<details>` に畳んで最後に置く

制約:

- 折りたたみは省略ではない。`<details>` の中に指摘の全文を残し、要約・削除・打ち切りをしない
- `<summary>` には必ず件数を書く。`<summary>` の直後には空行を置く（GitHub が中の markdown を描画する条件）
- 重要度ラベルと finding フィールドは変更しない。段階的開示は表示だけの変更であり、severity・`decision`・`gate` を書き換えない
- `--output json` / `yaml` / `html` の成果物は影響を受けない
- ヘッドラインの件数・内訳と、✅ の安全宣言・各節の見出しは**同一の描画対象集合**から導く。判定とスコアは canonical な gate 側（`deriveRunGate` / `scoreReview`）に残す
- 上記は**描画側**の規約である。finding 本文には `<details>` などの生 HTML を書かない（描画側でエスケープされ、折りたたみにはならない）

scope の印（#1644 / #1915）:

- `scope` が `pre-existing` の finding は `file:line` の直後へ `_(pre-existing)_` を付ける。既定値である `in-diff` に印は付けない
- 解決済みの `scope` を示した finding では、本文に残るレビュアー自己申告の `Scope:` ラベルを落とす。1 つの指摘へ逆向きの scope を 2 つ並べない
- `scope` を持たない finding では自己申告が唯一の scope 情報なので、本文からは落とさない
- どの出力形式が `scope` の値をどう出すかは「Finding フィールド」節の `scope` 注記を出典とする。この節が定めるのは `--output markdown` の描画だけである

## 重要度ラベル

| ラベル   | 定義                                                         |
| -------- | ------------------------------------------------------------ |
| Critical | セキュリティ脆弱性、データ損失リスク、システムダウンの可能性 |
| Major    | 重大なバグ、パフォーマンス問題、設計上の大きな問題           |
| Minor    | 小さなバグ、可読性の問題、軽微な最適化の機会                 |
| Info     | 提案、参考情報、追加の検討事項                               |

> **ドキュメント実害は Major**（#1069）: 実行例（コマンド / コード）が動かない・正本と矛盾する記載・主要導線のリンク切れは、字面は軽微に見えても「公式手順が機能不全」となるため **Major** として扱う（Minor に落とさない）。表記ゆれ・誤字・体裁など実行に影響しないものは Minor。

## Finding フィールド

各指摘（finding）が持つフィールドの一覧。`id`・`ruleId`・`title`・`message`・`severity`・`phase`・`file` は必須。

| フィールド      | 型              | 必須 | 説明                                                                     |
| --------------- | --------------- | ---- | ------------------------------------------------------------------------ |
| `id`            | `string`        | Yes  | ランスコープ内のユニークな識別子。                                       |
| `ruleId`        | `string`        | Yes  | 指摘を生成したルール / スキルの識別子。                                  |
| `title`         | `string`        | Yes  | 指摘の短いタイトル。                                                     |
| `message`       | `string`        | Yes  | 問題の詳細説明。                                                         |
| `severity`      | `string`        | Yes  | 重要度。`critical` / `major` / `minor` / `info`。                        |
| `phase`         | `string`        | Yes  | SDLC フェーズ。`upstream` / `midstream` / `downstream`。                 |
| `file`          | `string`        | Yes  | 対象ファイルパス。                                                       |
| `line`          | `integer`       | No   | 指摘に関連する開始行番号。                                               |
| `lineEnd`       | `integer`       | No   | マルチライン指摘の終了行番号。                                           |
| `confidence`    | `string`        | No   | 指摘の信頼度。`high` / `medium` / `low`。                                |
| `status`        | `string`        | No   | ライフサイクルステータス。`open` / `suppressed` / `verified`。           |
| `evidence`      | `array<string>` | No   | 指摘を支持する証拠スニペットの配列。                                     |
| `reviewer`      | `string`        | No   | 指摘を生成したスキル / エージェントの識別子。                            |
| `suggestion`    | `string`        | No   | 修正や後続アクションのヒント。                                           |
| `scope`         | `string`        | No   | 指摘が差分の追加行に由来するか。`in-diff` / `pre-existing`。             |
| `criterionRefs` | `array<string>` | No   | 指摘が紐づく受け入れ条件 / テストケースの識別子。例: `AC-4`、`TC-7`。    |
| `artifactRefs`  | `array<string>` | No   | 指摘が紐づく artifact のアンカー。例: `plan.md#AC-4`、`todo.md#TASK-3`。 |

> `scope` は additive なメタデータです（#1644 Phase 1）。verifier がパース済み差分の追加行と finding の行範囲を突き合わせて決定論的に判定し、判定できない場合のみレビュアーの自己申告（`Scope:` ラベル）を採用します。追加行のみが `in-diff` であり、unified diff の context 行は `pre-existing` として扱います（行の許容幅は 0）。未指定・不明値は fail-safe の `in-diff` とし、指摘を目立たない側へ降格させません。severity やゲート判定を上書きしてはいけません。
>
> `scope` を出力する形式は JSON（`output.schema.json` が規定する成果物）・YAML・HTML の 3 つです。いずれも、finding が値を持つ場合にのみキーが現れます。欠損時に `null` や空文字は出しません。Markdown（`--output markdown`）だけは既定値の `in-diff` へ印を付けず、`pre-existing` のみ `_(pre-existing)_` と表示します（既定値は全 finding に付くため、印がノイズになります）。スキル駆動の `/review-team` レポートテンプレート（`commands/review-team.md`）も同じ印を使います。GitHub Action のインライン PR コメント経路（`runners/github-action/post-inline-comments.cjs`）は、`pre-existing` の finding をインラインへ投稿しません（#1644 残件 6）。投稿しなかった finding は、サマリーコメントの `<details>` へ message・evidence・suggestion まで全文で残します。Tech Lead の優先確認リストには Markdown と同じ `_(pre-existing)_` の印を付けます。Markdown 側の描画規約そのもの（印の位置と自己申告ラベルの扱い）は §5 が出典です。
>
> 解決済みの `scope` を表示する Markdown と HTML では、finding 本文に残るレビュアー自己申告の `Scope:` ラベルを描画時に落とします（#1915）。`resolveFindingScope` は機械判定を自己申告より優先するため、両者が食い違う状態は設計上ありえます（`debug.scopeStats.mismatch` が計測）。1 つの指摘へ逆向きの scope を 2 つ並べないための描画側の措置です。JSON と YAML では生の本文を保ちます。機械可読な成果物では自己申告が監査証跡であり、`scope` キーと突き合わせれば読み手が食い違いを検出できるためです。
>
> `criterionRefs` / `artifactRefs` は additive なトレーサビリティ用メタデータです（#1666 / #1545 Phase 2）。`Specification → AC → Task → Diff → Test/JUnit → Finding` のうち `Test/AC → Finding` の逆参照を成立させます。
>
> ID の名前空間を River Review は所有しません。上流 artifact の見出しや ID をそのまま文字列で保持し、採番も検証も行いません。artifact が欠損している場合はフィールドごと省略します（Pre-execution Gate の既存挙動を維持）。
>
> 充填の主担当は `skills/midstream/assumption-resolution-trace` と `skills/upstream/requirements-acceptance` です。汎用レビュープロンプトにも任意ラベルとして指示があります。値は finding メッセージの `CriterionRefs:` / `ArtifactRefs:` ラベルから抽出します。
>
> ラベルの記法は次のとおりです。値は空白を含まないトークンとし、区切りは `,` または `、` を使います。コロンは半角と全角のどちらでも構いません。ラベル名は大文字小文字を区別するため、`criterionRefs:` のような lowerCamel 表記はラベルとして扱いません。`https://` で始まる値も対象外です。値はバッククォートで囲んでも構いません（囲みは外して取り込みます）。
>
> 散文の中でラベル名に言及するときは `` `CriterionRefs:` `` のようにバッククォートで囲んでください。バッククォートはラベルの前置文字に含めていないため、囲めば構造ラベルとして解釈されません。囲まずに正規形で書くと、その位置でラベルとして解釈されます。
>
> ファイル参照との関係は fail-safe に倒しています。verifier は Evidence 中のファイル参照が差分に存在するかを確認しますが、ref フィールド内でアンカー（`plan.md#AC-4`）付きに書かれた参照だけを対象から除きます。`#` の無い裸のパスは Evidence の主張と区別できないため、ref ラベルを付けても差分照合の対象に残ります。
>
> これらを出力するのは JSON 形式（`output.schema.json` が規定する成果物）のみです。YAML / HTML 形式および PR コメントへの反映は対象外とします。severity やゲート判定を上書きしてはいけません。

## 禁止事項

- 差分に存在しないコードへの推測に基づく指摘
- 一般論だけのレビュー（具体的な差分への言及なし）
- PR の目的と無関係な指摘
- 批判的・攻撃的な口調
