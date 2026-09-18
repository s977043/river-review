# Review Viewpoint Phase 8 効果測定（#2252）

Phase 6 までで導入した Review Viewpoint の効果を、Phase 7（2〜3 skill への横展開）の判断材料として測定した記録です。

- 測定対象: `api-compatibility`（`viewpoints.yaml` を持つ唯一の skill）
- 測定コマンド: `node scripts/measure-review-viewpoints.mjs`
- 回帰ピン: `tests/review-viewpoint-activation-metrics.test.mjs`
- 測定日: 2026-09-18 / base commit `13cd8ebb`

> **この文書の前半（Phase 8a）の測定値は、production の入力分布を代表しません。** PR #2307 時点の corpus は手書きの unified diff 15 本のみで、`--unified=0` と combined diff（`@@@`）を含んでいませんでした。その後 PR #2308（#2294）が combined diff の hunk 本体を parse するようになり、同じ diff でも parse 結果が変わっています。現時点で有効な母集団は後述の「Phase 8b」節、有効な数値は「Phase 8c」節です。前半は Phase 8a 当時の記録として残しています。

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
- **diff の帯域（Phase 8a 時点）**: corpus の diff は手書きの unified 形式のみであった。`git diff --unified=0` と `diff --cc`（merge commit）は含んでいない。この 2 帯域は後述の Phase 8b で追加した
- **実コミット由来の母集団（Phase 8a 時点）**: 0 本であった。Phase 8b で 7 本追加した

## Phase 8b: 入力帯域の拡張（2026-09-18）

Phase 8a の corpus は手書きの unified diff 15 本だけでした。`pages/reference/artifact-input-contract.md` の差分供給 8 経路のうち、経路 5 / 7 / 8 は context 幅を規定せず、combined diff も正規の入力として受け取ります。そこで Phase 7 へ進む前に、母集団を次の 3 帯域へ広げて測り直しました。

- 測定日: 2026-09-18 / base commit `cf69daed`
- 追加した生成器: `scripts/build-review-viewpoint-band-diffs.mjs`
- 生成物: `tests/fixtures/review-viewpoints/band-diffs.generated.mjs`（手で編集しない）

### 母集団の内訳

| 区分                                              | fixture 数 |
| ------------------------------------------------- | ---------- |
| 合計                                              | 40         |
| source: handwritten（Phase 8a）                   | 15         |
| source: generated-git（使い捨て repo）            | 18         |
| source: repo-commit（本 repo の実コミット）       | 7          |
| band: default（`-U3`）                            | 26         |
| band: u0（`--unified=0`）                         | 9          |
| band: cc（`--cc`）                                | 5          |
| positive ラベル（発火すべき）を含む fixture       | 19         |
| negative ラベル（発火すべきでない）のみの fixture | 21         |

ラベルペアは 40 fixture × viewpoint 3 本 = 120 で、うち positive は 42 ペアです。

帯域別の diff の出どころは次のとおりです。

- `generated-git`: 使い捨ての git repository を `os.tmpdir()` に作り、同一の意味的変更を `git show -U3` / `git show -U0` / `git show --cc` の 3 通りで採取した実 git 出力である。6 シナリオ × 3 帯域 = 18 本
- `generated-git` の `--cc` については、同じマージを逆方向（親の順序を入れ替え）からも採取して 6 本追加した。理由は後述の「combined diff は親の順序で結果が変わる」節に書いている
- `repo-commit`: 本 repo の実コミット（`dc238b88` / `91299986` / `15594086` / `0841e238` / `96b9821a`）から `git show` で採取した。2026-04 から 2026-09 に散らしてあり、diff parse 層を変更した直近の作業に母集団が偏らないようにしている
- `cc` 帯域には、本 repo の実マージ `96b9821a`（package.json の衝突解決）も 1 本含む

ラベルは Phase 8a と同じ規律にもとづき、人手で付けています。「その帯域の diff テキストに何が残るか」ではなく「意味的にどの obligation を提示すべきか」で決めているため、帯域が情報を落とせばそれは recall 欠落として現れます。

### PR #2308 前後での parse 挙動の実測

Phase 8a の測定値が古くなった理由を、両方の実装に同じ入力を通して確かめました。入力は `b01-response-dto-field-removed` の `--cc`（第 1 親側）です。

```text
base(8eef8f4f) {"path":"src/api/user.ts","hunkCount":0,"hunkLineCount":0,"addedLines":[],"signals":[]}
head(cf69daed) {"path":"src/api/user.ts","hunkCount":1,"hunkLineCount":7,"addedLines":[4],"signals":[]}
```

`8eef8f4f` は v1.116.0 のリリース commit で、`f63ed779`（#2308）がその直後にあたります。combined diff の hunk 本体は base では 0 件、head では 7 行に変わりました。この入力では `signals` は両方 0 件ですが、前節のとおりマージの向きが逆であれば head 側は発火します。つまり **#2308 の着地によって、同じ diff に対する viewpoint の発火結果が変わりうる状態になっています**。Phase 8a の corpus はこの帯域を 1 本も含んでいなかったため、この変化は測定値に現れませんでした。

### 拡張後の測定結果

`node scripts/measure-review-viewpoints.mjs` の出力から転記しています。

```text
overall: precision 100.0% recall 69.4% (tp=34 fp=0 fn=15 tn=89)
  backward-compatibility: precision 100.0% recall 75.0% (tp=15 fp=0 fn=5 tn=26)
  api-test-coverage: precision 100.0% recall 75.0% (tp=15 fp=0 fn=5 tn=26)
  optional-field-consumer-handling: precision 100.0% recall 44.4% (tp=4 fp=0 fn=5 tn=37)

## Activation by input band
  default: precision 100.0% recall 84.6% (tp=22 fp=0 fn=4 tn=49)
  u0: precision 100.0% recall 55.6% (tp=5 fp=0 fn=4 tn=15)
  cc: precision 100.0% recall 50.0% (tp=7 fp=0 fn=7 tn=25)

## Activation by corpus source
  handwritten: precision 100.0% recall 88.2% (tp=15 fp=0 fn=2 tn=28)
  generated-git: precision 100.0% recall 67.9% (tp=19 fp=0 fn=9 tn=44)
  repo-commit: precision n/a recall 0.0% (tp=0 fp=0 fn=4 tn=17)
```

precision は全帯域で 100% のままで、false activation は 138 ペア中 0 件です。combined diff 帯域でも false activation は 0 件でした（#2308 で `@@@` の hunk 本体が matcher から見えるようになったことの主たるリスクはここにありますが、現時点では顕在化していません）。一方で recall は帯域を広げると 88.2% から 69.4% へ下がりました。

### 3 帯域の判定一致

同一の意味的変更を 3 帯域で表現し、発火した viewpoint 集合が一致するかを見た結果です。

```text
DISAGREE b01-response-dto-field-removed: default=[api-test-coverage,backward-compatibility] u0=[api-test-coverage,backward-compatibility] cc=[]
DISAGREE b02-requiredness-tightened: default=[api-test-coverage,backward-compatibility] u0=[api-test-coverage,backward-compatibility] cc=[]
DISAGREE b03-optional-field-added: default=[optional-field-consumer-handling] u0=[optional-field-consumer-handling] cc=[]
DISAGREE b04-contract-named-outside-api-path: default=[api-test-coverage,backward-compatibility] u0=[] cc=[]
AGREE    b05-contract-file-comment-only: default=[] u0=[] cc=[]
AGREE    b06-internal-type-field-removed: default=[] u0=[] cc=[]
```

（上表の `cc` は親の順序が第 1 親側の採取です。逆方向は次節を参照してください。）

positive 側の 4 シナリオがすべて不一致でした。どちらの層の問題かを切り分けた結果は次のとおりです。

**`cc` 帯域の 0 件は viewpoint 層（signal 検出器）の問題であり、parse 層は正しく動いています**。`parseUnifiedDiff` に combined diff を通すと、`path` / `oldPath` / `addedLines` はいずれも正しく解決されました（`b01` の `--cc` で `addedLines` は `[4]`）。落ちているのは `src/lib/api-compatibility-signals.mjs` 側です。同モジュールは `hunk.lines` の先頭 1 文字だけを prefix とみなし、`line.startsWith('-')` と `line.slice(1)` で判定します。2 親の combined diff では prefix が 2 列になります。削除行は `" -  legacyName: string;"` の形で届くため先頭が空白と読まれ、変更として扱われません。

**`u0` 帯域の `b04` の欠落も viewpoint 層の問題です**。同モジュールの宣言ベースのフォールバックは hunk 単位でスコープされており、`interface CheckoutResponse {` が hunk 内に含まれることを要求します。`--unified=0` では宣言行が context として運ばれないため、api / dto / contract 以外のパスにある契約は検出できません。パスで判定できる `b01` から `b03` は `u0` でも既定帯域と一致しました。

いずれも本 PR の対象外（測定のみのスコープ）のため、検出器は変更していません。

### combined diff は親の順序で結果が変わる

combined diff は、変更マーカーをその変更が由来する親の列に置きます。したがって同じマージを逆方向から読むと、マーカーは列 1 と列 2 のあいだを移動します。同じマージ・同じ解決内容を両方向から採取して比較した結果です。

```text
DISAGREE b01-response-dto-field-removed: firstParent=[] reverse=[api-test-coverage,backward-compatibility]
DISAGREE b02-requiredness-tightened: firstParent=[] reverse=[api-test-coverage,backward-compatibility]
DISAGREE b03-optional-field-added: firstParent=[] reverse=[optional-field-consumer-handling]
DISAGREE b04-contract-named-outside-api-path: firstParent=[] reverse=[api-test-coverage,backward-compatibility]
AGREE    b05-contract-file-comment-only: firstParent=[] reverse=[]
AGREE    b06-internal-type-field-removed: firstParent=[] reverse=[]
```

positive の 4 シナリオすべてで、**同一の意味的変更がマージの向き次第で発火したりしなかったりします**。マーカーが列 1 にあれば `line.startsWith('-')` が偶然成立して検出でき、列 2 にあれば context と読まれて落ちます。`cc` 帯域の recall 50.0% は、この当たり外れがちょうど半々になっているという意味であり、「半分は正しく動く」という意味ではありません。negative の 2 シナリオはどちらの向きでも 0 件で、false activation は発生していません。

この挙動も parse 層ではなく検出器側に由来します。`parseUnifiedDiff` は両方向とも同じ内容を返しています。

### 実コミット帯域が示したもの

`repo-commit` の positive 4 ペアはすべて欠落しました。`runners/node-api/src/types.ts` の `ReviewOptions` と `SkillSelectionResult` へ optional field を追加した実コミットが対象です。検出器の v1 は、パスが `api` / `dto` / `contract` のいずれかで始まるセグメントを含むか、宣言名が `Dto` / `Request` / `Response` / `Api` / `Contract` / `Schema` で終わることを要求します。`node-api/` はセグメント頭が `api` ではなく、`ReviewOptions` / `SkillSelectionResult` はどの接尾辞にも当たりません。手書き fixture はこの 2 条件を満たす名前だけで書かれていたため、Phase 8a では見えていませんでした。

### 自己整合でないことの確認（mutation、拡張後）

拡張後の corpus に対して、3 方向の変異を注入しました。

| 変異                                         | 結果                                                                               |
| -------------------------------------------- | ---------------------------------------------------------------------------------- |
| `dto-field-removed` の kind 名を改名         | overall recall 64.3% → 26.2%                                                       |
| test パス除外（`TEST_PATH_RE`）を削除        | overall precision 100% → 93.1%                                                     |
| `declarationScoped` を無条件に `true` へ固定 | default 帯域は 84.6% のまま、`u0` 帯域が 55.6% → 0.0%、handwritten は 88.2% のまま |

3 番目は Phase 8b で追加した帯域だけが検知した変異です。Phase 8a の手書き corpus だけでは緑のままであったため、追加した帯域が実際に効いている証拠にあたります。変異はいずれも測定後に復元済みです。

### mode 比較（拡張後）

| 指標                                   | 実測                                        |
| -------------------------------------- | ------------------------------------------- |
| off / observe / active の comment 集合 | 全 46 fixture で完全一致                    |
| observe の prompt 文字数差分           | 0（最大値）                                 |
| active の prompt 文字数差分            | +512 〜 +775 文字（発火した 22/46 fixture） |

latency は最も重い fixture（`p08-mixed-diff-contract-plus-noise`）で測っており、その fixture は Phase 8b で変えていないため再測定していません。

### Phase 8b で測っていないもの

- **`--cc` の 3 親以上（octopus merge）**: 帯域として採取していない。`@@@@` 以上のハンクヘッダは未測定である
- **combined diff の positive を含む実コミット**: 本 repo の履歴に、TypeScript の契約変更を含む `--cc` 非空のマージが無い。`git log --merges` 上位 200 件のうち `--cc` が非空なのは 3 件で、いずれも package.json / package-lock.json の衝突である。`cc` 帯域の positive は使い捨て repo の実 git 出力で代替している
- **`repo-commit` の negative 帯域の広さ**: docs のみ 1 本、union 拡張 1 本、package.json のマージ 1 本にとどまる
- **意味的レビュー層**: Phase 8a と同じく API キー未登録のため未測定である

## Phase 8c: 検出器の帯域対応（PR #2314、2026-09-18）

Phase 8b が示した 2 つの穴を `src/lib/api-compatibility-signals.mjs` 側で塞いだあとの再測定です。corpus は Phase 8b から 1 本も変えていません（46 fixture × viewpoint 3 = 138 ラベルペア）。base commit は `a7cb83ba` です。

### 直した 2 点

- **combined diff の marker 列**: `line.startsWith('-')` / `line.startsWith('+')` を、hunk の `parentCount` 幅の列読みに置き換えた。`parentCount` は `parseUnifiedDiff`（`src/lib/diff-processor.mjs`）が決める値をそのまま使っており、列幅を検出器側で推測していない。判定規則は parse 層の `classifyCombinedBodyLine` と同じで、いずれかの列が `-` なら removed、いずれかが `+` なら added とする
- **`--unified=0` の宣言スコープ**: hunk ヘッダ末尾に git が出す囲みの宣言（`@@ -3 +2,0 @@ interface CheckoutResponse {`）を宣言ベースフォールバックの探索対象に加えた。context 行が 1 行も無い `--unified=0` では、宣言はここにしか現れない。ヘッダはその hunk の囲みを指すので、フォールバックが hunk スコープである性質は変わっていない

### 再測定結果

`node scripts/measure-review-viewpoints.mjs` の出力から転記しています。

```text
overall: precision 100.0% recall 87.8% (tp=43 fp=0 fn=6 tn=89)
  backward-compatibility: precision 100.0% recall 95.0% (tp=19 fp=0 fn=1 tn=26)
  api-test-coverage: precision 100.0% recall 95.0% (tp=19 fp=0 fn=1 tn=26)
  optional-field-consumer-handling: precision 100.0% recall 55.6% (tp=5 fp=0 fn=4 tn=37)

## Activation by input band
  default: precision 100.0% recall 84.6% (tp=22 fp=0 fn=4 tn=49)
  u0: precision 100.0% recall 77.8% (tp=7 fp=0 fn=2 tn=15)
  cc: precision 100.0% recall 100.0% (tp=14 fp=0 fn=0 tn=25)

## Activation by corpus source
  handwritten: precision 100.0% recall 88.2% (tp=15 fp=0 fn=2 tn=28)
  generated-git: precision 100.0% recall 100.0% (tp=28 fp=0 fn=0 tn=44)
  repo-commit: precision n/a recall 0.0% (tp=0 fp=0 fn=4 tn=17)
```

Phase 8b との差（いずれも上表とその前節の表からの転記であり、暗算ではありません）:

| 指標              | Phase 8b | Phase 8c |
| ----------------- | -------- | -------- |
| overall precision | 100.0%   | 100.0%   |
| overall recall    | 69.4%    | 87.8%    |
| `default` recall  | 84.6%    | 84.6%    |
| `u0` recall       | 55.6%    | 77.8%    |
| `cc` recall       | 50.0%    | 100.0%   |

false activation は 138 ペア中 0 件のままです。`default` 帯域は 1 件も変わっていません。

### 親の順序への依存が消えたこと

同じマージを両方向から読ませた比較は、全 6 シナリオで一致しました。

```text
## Combined-diff parent order (same merge, both directions)
  AGREE    b01-response-dto-field-removed: firstParent=[api-test-coverage,backward-compatibility] reverse=[api-test-coverage,backward-compatibility]
  AGREE    b02-requiredness-tightened: firstParent=[api-test-coverage,backward-compatibility] reverse=[api-test-coverage,backward-compatibility]
  AGREE    b03-optional-field-added: firstParent=[optional-field-consumer-handling] reverse=[optional-field-consumer-handling]
  AGREE    b04-contract-named-outside-api-path: firstParent=[api-test-coverage,backward-compatibility] reverse=[api-test-coverage,backward-compatibility]
  AGREE    b05-contract-file-comment-only: firstParent=[] reverse=[]
  AGREE    b06-internal-type-field-removed: firstParent=[] reverse=[]
```

3 帯域の判定一致（`default` / `u0` / `cc`）も全 6 シナリオで AGREE になりました。

一致するだけなら「何も発火しない検出器」でも満たせるため、回帰ピンでは positive 4 シナリオが**空でない同じ集合**で一致することも検査しています。

### 自己整合でないことの確認（mutation、Phase 8c）

| 変異                                      | 結果                                                                             |
| ----------------------------------------- | -------------------------------------------------------------------------------- |
| 列幅を `parentCount` 無視の 1 固定に戻す  | `cc` recall 100.0% → 50.0%、両方向比較が 4 シナリオで DISAGREE、テスト 6 本 fail |
| hunk ヘッダの囲み宣言を読む分岐を削除する | `u0` recall 77.8% → 55.6%、テスト 3 本 fail                                      |

どちらも検知できました。変異は測定後に復元済みです（`git diff` で確認）。

### Phase 8c で残した穴

- **`repo-commit` 帯域の positive 0/4**: `ReviewOptions` / `SkillSelectionResult` は契約の形をしているが、検出器の名前条件（`Dto|Request|Response|Api|Contract|Schema`）とパス条件のどちらにも当たらない。#2314 の範囲外であり、`KNOWN_MISSES` として明示したまま残している
- **`p09`（request DTO への必須フィールド追加）**: カタログに対応する kind が無い被覆漏れで、検出器側の問題ではない
- **3 親以上の octopus merge（`@@@@` 以上）**: 列読みは `parentCount` 幅を使うため原理的には同じ規則で動くが、帯域として採取しておらず未測定である
- **`\ No newline at end of file` の扱い**: combined と単一親で parse 層の扱いが非対称である（#2309）。本 PR では触っていない

## 判断

### Phase 7（2〜3 skill への展開）

Phase 8a では「進めてよい」、Phase 8b では「検出器側の帯域対応を先に片付ける」と結論していました。Phase 8c でその前提条件を満たしたため、**進めてよい**に戻します。以下の Phase 8b 時点の根拠は、当時の判断の記録として残しています。

- false activation は 138 ペア中 0 件で、展開時に最も懸念される「観点のノイズ増加」は広げた母集団でも観測されていない。combined diff 帯域でも 0 件である。precision は判断材料として据え置ける
- 一方 recall は 88.2% から 69.4% へ下がり、`cc` 帯域は 50.0%、`u0` 帯域は 55.6% である。skill を 2〜3 本に増やすと、同じ帯域の穴が skill の本数だけ複製される
- 穴は 2 か所に局在しており、いずれも `src/lib/api-compatibility-signals.mjs` の 1 ファイルにある。combined diff の prefix 列と、宣言ベースフォールバックの hunk スコープである
- combined diff ではマージの向きで結果が変わる。同じ変更が再現性なく検出されたりされなかったりする状態を、skill の本数だけ増やすのは避けたい
- 実コミット帯域で positive が 0/4 であったことは、検出器の名前・パス条件が実在のコードより狭いことを示す。横展開はこの狭さも複製する

したがって次を条件としていました。1 つ目は Phase 8c で満たしています。

- ~~横展開の前に、combined diff の prefix 列と `--unified=0` での宣言スコープを検出器側で扱えるようにする。少なくとも `cc` 帯域が親の順序に依存しなくなること~~ → Phase 8c で対応済み（`cc` recall 100.0%、両方向一致）
- 展開する skill ごとに、同じ形式の人手ラベル corpus を先に用意する。カタログを足してから測るのでは、この測定の値が薄まるだけである
- 新規 corpus は最初から 3 帯域で用意する。既定帯域だけで測ると、この 2 つの穴は最後まで見えない
- `p09` と同型の「カタログに kind が無い」被覆漏れを、展開先でも negative ではなく knownMiss として明示する

### `mode` の既定値

**`off` のまま据え置く**ことを推奨します。根拠は次のとおりです。

- `observe` へ上げても得られるのは観測記録だけであり、利用者の出力は変わらない。一方で latency は約 +0.6 ms 増える
- 既定値を上げる判断に必要な finding precision / recall は未測定である。測れていない指標を根拠に既定値を動かすべきではない
- `active` は prompt が最大 +775 文字増えるため、finding 品質の実測なしに既定化する理由がない

既定値の引き上げは、API キーのある環境で finding precision / recall を実測できたあとに再検討する対象です。
