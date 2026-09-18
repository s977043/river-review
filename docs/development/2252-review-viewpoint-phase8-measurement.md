# Review Viewpoint Phase 8 効果測定（#2252）

Phase 6 までで導入した Review Viewpoint の効果を、Phase 7（2〜3 skill への横展開）の判断材料として測定した記録です。

- 測定対象: `api-compatibility`（`viewpoints.yaml` を持つ唯一の skill）
- 測定コマンド: `node scripts/measure-review-viewpoints.mjs`
- 回帰ピン: `tests/review-viewpoint-activation-metrics.test.mjs`
- 測定日: 2026-09-18 / base commit `13cd8ebb`

## 測定方法

ラベルは `tests/fixtures/review-viewpoints/corpus.mjs` に人手で記述しています。各 fixture の diff を読み、obligation の question（「既存 consumer との後方互換性が維持されているか」など）に照らして、その obligation を提示すべきかどうかを判断した結果がラベルです。

- ラベルは実装（`detectApiCompatibilitySignals` / `observeReviewViewpoints` / `viewpoints.yaml`）から導出していない
- 測定は最終出力の比較ではなく、発火判定層である `runReviewViewpointStage` を直接呼んで行う
- 母数は fixture 15 本 × viewpoint 3 本 = 45 ラベルペア（うち positive 17）

### 自己整合でないことの確認（mutation）

ラベルが実装に追従していないことを、2 方向の変異注入で確認しました。

| 変異                                                                        | 結果                           |
| --------------------------------------------------------------------------- | ------------------------------ |
| `detectApiCompatibilitySignals` が出す `dto-field-removed` の kind 名を改名 | overall recall 88.2% → 29.4%   |
| 同モジュールの test パス除外（`TEST_PATH_RE`）を削除                        | overall precision 100% → 88.2% |

どちらも検知できたため、この corpus は違反を注入しても緑のままにはなりません。変異は測定後に復元済みです。

## 測定結果

### activation precision / recall

`node scripts/measure-review-viewpoints.mjs` の出力から転記しています。

```text
overall: precision 100.0% recall 88.2% (tp=15 fp=0 fn=2 tn=28)
  backward-compatibility:           precision 100.0% recall  87.5% (tp=7 fp=0 fn=1 tn=7)
  api-test-coverage:                precision 100.0% recall  87.5% (tp=7 fp=0 fn=1 tn=7)
  optional-field-consumer-handling: precision 100.0% recall 100.0% (tp=1 fp=0 fn=0 tn=14)
```

false activation は 0 件でした。negative 帯域として次の 6 本を用意しており、いずれも発火していません。

- 新規ファイル追加だけの diff
- test fixture 内の宣言だけを変える diff
- 内部型の変更だけの diff
- docs 変更だけの diff
- contract ファイルのコメント変更だけの diff
- contract 変更を含まない混在 diff

recall の欠落 2 件はいずれも同一 fixture `p09-request-dto-required-field-added` に由来します。request DTO へ必須フィールドを追加する変更は、既存の呼び出し側を壊すため後方互換性の確認義務があると人手で判断しましたが、カタログに対応する activation kind がありません。これは matcher のバグではなくカタログの被覆漏れです。

### finding 差分（off / observe / active）

| 指標                                   | 実測                                       |
| -------------------------------------- | ------------------------------------------ |
| off / observe / active の comment 集合 | 全 15 fixture で完全一致                   |
| observe の prompt 文字数差分           | 0（最大値）                                |
| active の prompt 文字数差分            | +512 〜 +775 文字（発火した 8/15 fixture） |

observe が prompt を 1 バイトも変えないことは実測で確認できました。

### latency 差分

`p08-mixed-diff-contract-plus-noise` に対する `generateReview`（dry-run）の中央値です。既定の n=15 では実行ごとのばらつきが差分と同程度になるため、`node scripts/measure-review-viewpoints.mjs --reps 200` を 3 回実行した値を載せます。

| mode    | median（--reps 200 を 3 回） |
| ------- | ---------------------------- |
| off     | 0.23 / 0.23 / 0.22 ms        |
| observe | 0.80 / 0.83 / 0.74 ms        |
| active  | 0.85 / 0.86 / 0.80 ms        |

off に対する増分は約 +0.6 ms です。なお同一プロセス内で測定を繰り返すと JIT が温まり、off 0.17 ms / observe 0.49 ms / active 0.52 ms まで下がります。絶対値は 1 ms 未満であり、LLM 呼び出しのある実レビューでは無視できる水準です。

## 測っていないもの

判断の前提として、次は測定していません。安全の根拠に使わないでください。

- **finding precision / recall（意味的レビュー層）**: この repo は API キー未登録で運用しており、LLM 層が実行されません。上表の comment 一致は dry-run fallback の比較であり、「LLM の指摘品質が悪化しない」ことの証拠にはならない
- **token delta**: prompt の文字数のみを測っている。トークン数は provider 依存のため換算していない
- **UNKNOWN rate / human escalation rate**: いずれも LLM 出力に依存するため未測定
- **Claude Code / Codex の cross-runtime parity**: 未測定
- **skill selection**: 測定では `api-compatibility` を選択済みとして固定している。`selectSkills()` が実際にこの skill を選ぶかは別問題であり、この測定には含まれない
- **diff の帯域**: corpus の diff は手書きの unified 形式のみである。`git diff --unified=0` と `diff --cc`（merge commit）は含んでいない
- **実コミット由来の母集団**: 0 本。すべて手書き fixture である

## 判断

### Phase 7（2〜3 skill への展開）

**進めてよい**と考えます。根拠は次のとおりです。

- false activation が 0/28 negative ペアであり、展開時に最も懸念される「観点のノイズ増加」が現時点の帯域では観測されていない
- 混在 diff（`p08` / `n06`）でも最小 diff と同じ判定であり、PR 単位の走査で結論が反転していない
- observe の prompt 差分が 0 のため、展開しても既定値のままなら利用者への影響が生じない

ただし次を条件とします。

- 展開する skill ごとに、同じ形式の人手ラベル corpus を先に用意する。カタログを足してから測るのでは、この測定の値が薄まるだけである
- `p09` と同型の「カタログに kind が無い」被覆漏れを、展開先でも negative ではなく knownMiss として明示する

### `mode` の既定値

**`off` のまま据え置く**ことを推奨します。根拠は次のとおりです。

- `observe` へ上げても得られるのは観測記録だけであり、利用者の出力は変わらない。一方で latency は約 +0.6 ms 増える
- 既定値を上げる判断に必要な finding precision / recall は未測定である。測れていない指標を根拠に既定値を動かすべきではない
- `active` は prompt が最大 +775 文字増えるため、finding 品質の実測なしに既定化する理由がない

既定値の引き上げは、API キーのある環境で finding precision / recall を実測できたあとに再検討する対象です。
