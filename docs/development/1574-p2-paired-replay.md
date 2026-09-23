# Review Evolution Cycle P2 Paired replay（#1574）

> Status: P2 実装。P0 設計契約（`docs/development/1574-p0-design-contract.md`）を DoD として参照します。
> Source: issue #1574 採否コメント（comment ID 5064856987）の推奨実装順 P2。

## 1. 目的とスコープ

P2 は、同一の入力に対する baseline 構成と candidate 構成のレビュー結果を対にして比較し、人間が採否を判断するための材料を生成するフェーズです。実験条件は不変な Experiment Manifest として固定し、比較結果は profile 別の受入基準に対する観測値として報告します。

含むもの:

- 契約3 の immutable Experiment Manifest の生成と改変検知
- fingerprint ベースの paired 突合（新規検出 / 消失 / 変化なし / severity 変化）
- activation 確認（構成差と出力差の両方を観測する）
- held-out 集合を分けた集計
- 契約6 の profile 別受入基準の宣言と、その基準に対する観測結果の報告

含まないもの（明示的な非目標）:

- レビューの再実行。LLM / provider の呼び出しは一切行わない
- 自動 canary、自動 Keep / Rollback、自動昇格。採否コメントで保留と決定済みである
- しきい値の自動適用による昇格判定。`acceptance.decision` は常に `null` である
- Skill / Rule / Riverbed / gate / PR への書き込み。`writeEffects` は常に空である

## 2. 副作用の範囲（read-only を選んだ理由）

P2 は「実験の実行器」ではなく「実験の記録器と突合器」です。baseline と candidate のレビュー実行そのものは、既存の `river run` と CI の経路に委ねます。理由は次のとおりです。

- 再実行を P2 に取り込むと、observation フェーズが provider 課金と外部通信を持つことになる。P1 が確立した read-only の性質が失われる
- 実行経路を新設すると、既存の run 保存契約（`src/lib/result-store.mjs`）と二重管理になる
- 判断材料の生成に必要なのは「2 つの結果」であり、その生産手段は契約の対象外である

そのため本機能の入力は、すでに生成済みの run レコードを含む experiment spec ファイル 1 つです。副作用は標準出力への書き出しだけで、ファイル出力オプションは意図的に持たせていません。

## 3. データフロー

```text
experiment spec (JSON)
  ├─ baseline.runs[]  ─┐
  └─ candidate.runs[] ─┤
                       ├─▶ buildExperimentManifest()（不変・content-addressed）
                       │        └─▶ manifestId / experimentKey / manifestHash
                       │
                       ├─▶ pairFindings()（fingerprint 突合・入力順非依存）
                       │        └─▶ unchanged / changed / removed / added
                       │
                       ├─▶ metrics（overall と heldOut）
                       └─▶ evaluateAcceptance()（宣言された基準に対する観測値）
                                └─▶ stdout（JSON / Markdown）
```

## 3.1 Promotion handoff（#2408 / #2372-G1）

paired replay が `improvementCandidate` を含む場合、result は `promotionHandoff` を追加で返します。これは #1568 Judgment Promotion Loop へ渡すための**採用前の実験証拠**であり、採否 verdict ではありません。

`promotionHandoff` は、既存の観測値だけを再掲します。

- #1568 と同じ content-addressed `candidateId` と full `contentHash`
- Experiment Manifest の ID / hash と integrity 結果
- activation が観測できたか、および provenance / configuration の注意理由
- dataset pairing の警告
- acceptance が評価可能だったか
- profile ごとの `allRequiredSatisfied` / sample-size 状態 / failed metric / 観測不能 metric
- critical regression 件数
- independent verifier が実際に検証済みか
- terminal reason

candidate が宣言されていない場合、または Experiment Manifest の改変検知・current inputs との `experimentKey` 不一致がある場合は `promotionHandoff: null` です。後者は fail-closed です。candidate と別実験の manifest を同じ機械可読 handoff に結合すると、下流が integrity flag を見落としただけで証拠を誤帰属できるためです。既存 schemaVersion 1 artifact との互換性を維持するため、schema 上は optional field とします。

### post-adoption effectiveness とは分ける

`promotionHandoff` と `reviewPromotionEffectiveness` は同じ意味ではありません。

| Artifact / mechanism | 時点 | 観測対象 |
| --- | --- | --- |
| paired replay / `promotionHandoff` | promotion 採用前 | baseline と candidate の統制された実験差分 |
| `reviewPromotionEffectiveness` | approval / activation 後 | 実運用 feedback の recurrence / reversal |

採用前の replay metrics を `context.effectivenessHistory` へ直接混ぜません。G1 は read-only の証拠受け渡しまでとし、candidate への永続化や approve / reject / retarget / Keep / Rollback / Retire は行いません。後続の G2 で、Human-invoked な #1568 操作として接続します。

## 4. ファイル配置

| ファイル                            | 役割                                                          |
| ----------------------------------- | ------------------------------------------------------------- |
| `src/lib/paired-replay.mjs`         | manifest 生成・突合・受入評価の本体。I/O を持たない純関数群   |
| `src/lib/shadow-aggregate.mjs`      | P1。evidence provenance と candidate ID 導出を再利用する      |
| `src/lib/promotion-candidates.mjs`  | canonical JSON と candidate ID の SSoT（#1624）。再実装しない |
| `src/cli/commands/evolve.mjs`       | `river evolve replay` のハンドラ。spec の読み出しと出力のみ   |
| `schemas/paired-replay.schema.json` | 出力アーティファクトの JSON Schema                            |
| `tests/paired-replay.test.mjs`      | 契約準拠・決定性・退化ケース・read-only のテスト              |

## 5. CLI

```bash
river evolve replay --spec <file> [--expect-manifest <id|hash>] [--output json|text]
```

- `--spec`: experiment spec ファイルである（必須）
- `--expect-manifest`: 期待する `manifestId` / `experimentKey` / `manifestHash` を宣言する。不一致なら exit 1 になる
- `--output json`: 機械可読な結果を出力する（既定は Markdown）。`yaml` / `html` は reject する

exit code は次のとおりです。受入基準を満たさない場合でも 0 で終了します。P2 は gate ではなく観測であり、判断は人間が行うためです。

| 状況                                                                  | exit code |
| --------------------------------------------------------------------- | --------- |
| 正常終了（受入基準の充足・不充足を問わない）                          | 0         |
| spec の読み出し失敗・検証エラー                                       | 1         |
| manifest の改変検知・別実験の manifest                                | 1         |
| `--expect-manifest` の不一致                                          | 1         |
| `--spec` の未指定・未知のオプション・余分な位置引数・未対応の出力形式 | 1         |
| オプションの値欠落（例: `--spec` の後に値がない）                     | 1         |

最後の行は、当初「help を表示して exit 0」というリポジトリ既存の慣習に従っていましたが、#1709 Slice 2 で全コマンド横断の usage error 契約に統一されました。値を伴うオプションで値が欠落した場合、パーサは stderr にエラーと usage 要約を出し、`main()` は help 全文を stdout へ出さずに exit 1 で終了します。`--min` / `--month` / `river promote propose --cluster-key` も同じ挙動です。

`--min` と `--month` は aggregate 側のオプションであり、replay では reject します。replay の対象データは manifest が固定するため、後から絞り込めてはいけないからです。

## 6. Experiment Manifest（契約3）

manifest は契約3 が列挙する条件をすべて固定します。固定する項目は次のとおりです。

- baseline / candidate の commit SHA
- dataset hash と held-out hash
- evaluator / collector version
- provider / model / temperature
- Skill Registry commit
- trial ID と trial 件数
- activation 証跡
- 環境スナップショット
- metrics の分母
- terminal reason の語彙
- 各 side の証拠 provenance の要約（`provenance`・#1719）

不変性は 2 つの digest で担保します。

- `experimentKey`: 実験条件だけを対象にした hash である。作成時刻は含めないため、同一条件の再作成は同一の `manifestId` へ収束する
- `manifestHash`: `createdAt` と導出 ID を含めた全体の hash である。保存済み文書のどのフィールドを書き換えても検出できる

`manifestId` は `RR-EXP-<experimentKey の先頭12桁>` です。candidate の `RR-PC-` とは名前空間を分けています。

### evidence が内部で一貫しているかの検査（#1719）

同一 case に属する run の `source_commit_sha` が食い違う場合、`PairedReplayError` として実験を成立させません。1 つの case の run は「同じ入力を 1 つの構成でレビューした反復」であり、レビュー対象コミットが割れているなら、その case へ集約した finding は別のコードから生まれた観測値だからです。

#### side.commitSha とは突合しない

`side.commitSha` と `source_commit_sha` は名前空間が異なります。両者の等値を要求してはいけません。

| 値                             | 意味                                                                          | baseline と candidate の関係                 |
| ------------------------------ | ----------------------------------------------------------------------------- | -------------------------------------------- |
| `side.commitSha`               | 構成識別子である。`configurationDiffers` が provider / model と並べて比較する | **異なる**ことが前提である                   |
| `evidence[].source_commit_sha` | レビュー対象リポジトリの HEAD である（`getHeadSha`）                          | 同一 case なら**同じ値**になるのが自然である |

等値を要求すると、実データでは「常に拒否される」か「両側へ同じ sha を宣言して commit 次元を殺す」かの二択になります。したがって突合の対象は**証拠どうし**であり、宣言ではありません。

#### 検査の規則

- 検査の単位は **(side, case)** である。side 全体ではない。dataset は異なる時期・異なるリポジトリの case を含みうるため、side 全体で一意を求めると実データをほぼ全て拒否する
- case key を導出できない run は対象外である。case の同一性がない run には「同じ入力」という主張自体が存在しない
- `source_commit_sha` を持たない run は「未取得」として扱う。#1715 以前の run レコードは provenance を持たないため、欠落を不一致と読むと既存データセットを拒否してしまう
- 比較は小文字化して行い、短縮 sha は 7 桁以上の hex prefix であれば同一コミットとみなす。hex でない値は完全一致のみで比較する
- 違反は baseline と candidate をまとめて 1 回の例外で報告し、原因となった `review_run_id` をメッセージへ載せる
- `provenance.dirty`（#1718）は判定を緩める根拠にしない。dirty な run の sha はレビュー対象の変更を含まない HEAD を指すため、周囲と一致していても意味論的には弱い。件数の記録と警告で扱う

#### manifest が固定する派生値

各 side は、自らの証拠から導いた要約を `provenance` として固定します。宣言値ではなく**証拠からの派生値**です。

| フィールド                       | 意味                                                                                                         |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `sourceCommitSha`                | side の run が合意しているレビュー対象コミットである。複数 case で割れる場合と全件未取得の場合は null になる |
| `sourceCommitShaUnknownRunCount` | `source_commit_sha` を持たない run の件数である                                                              |
| `dirtyRunCount`                  | dirty な working tree で収集した run の件数である                                                            |
| `dirtyUnknownRunCount`           | dirty フラグそのものを持たない run の件数である                                                              |

#### hash 入力の扱い

`provenance` は `experimentKey` と `manifestHash` の入力に含めます。いずれも `artifact_sha256` の材料と同じ run レコードから決まる派生値であり、実行のたびに揺れる観測値ではないためです。同一の run レコードからは常に同一の `experimentKey` が導出されるという性質は保たれます。

ただし digest の**値そのもの**は、v1.68.0 までの版が作成した manifest と一致しません。保存済み manifest は自らの conditions から digest を再計算するため `verifyExperimentManifest` は通りますが、同じ spec を再実行すると `experimentKeyMatchesInputs` が false になります。CLI はこの分岐で「v1.68.0 以前の manifest は再生成が必要」というヒントを併記します。

schema 側では `provenance` を **optional** として追加しました。同じ `schemaVersion` のまま required 集合を非互換に変えると、以前の版が出力した artifact が invalid になってしまうためです。`schemaVersion` は 1 のまま据え置きます。

### terminal reason を manifest に書かない理由

契約3 は terminal reason を manifest の項目として挙げています。しかし終了理由は実行の結果であり、作成時には決まりません。結果を manifest へ書き戻すと不変性が壊れるため、次のように分けました。

- manifest は `terminalReasonVocabulary`（正規化語彙）を固定する
- 観測値 `terminalReason` は結果アーティファクト側に持つ

P2 が出せる値は `success`（1 件以上の case を対にできた）と `no_progress`（対にできた case が 0 件）の 2 つだけです。残りの語彙は loop を駆動する後続フェーズの担当です。

## 7. paired 突合

対応付けは finding fingerprint を鍵にします。fingerprint を持たない finding は突合せず、`unpairable` として件数だけ報告します。file や title で対応付けると、データが支持しない対応関係を発明することになるためです。これは契約5 が fingerprint なしの証拠を実験対象から外す方針とも揃っています。

| status      | 意味                                        |
| ----------- | ------------------------------------------- |
| `unchanged` | 両側にあり severity も同じである            |
| `changed`   | 両側にあるが severity が異なる              |
| `removed`   | baseline のみにある（candidate が落とした） |
| `added`     | candidate のみにある（candidate が足した）  |

比較対象は severity だけです。指摘文の言い回しは実行ごとに揺れるため、変化として扱うとノイズを signal として報告してしまいます。未知の severity は `.claude/rules/review-core.md` の fail-safe に合わせて `major` として読みます。

同一 fingerprint の finding が片側に複数ある場合は 1 件へ畳みます。このとき severity は**最大値**を採用します。先勝ちにすると勝者を決めるのが実質 file 名になり、`minor` の重複が `critical` を隠して regression が消えるためです。severity が食い違った重複の件数は `severityConflictsBaseline` / `severityConflictsCandidate` として別に報告します。

### run と run の対応付け（case key）

「同一の入力」の識別子として case key を使います。導出順は `caseId` → `<reviewedTarget>@<mergeBase>` です。どちらも解決できない run は対にしません。配列の位置で対にすると、無関係な 2 つのレビューを比較して差分を candidate のせいにしてしまうためです。

対にできなかった case は、材料の欠落として必ず可視化します。「3 case 中 1 case だけを比較した」結果を「dataset について regression なし」と読ませないためです。

- `pairing.unpairedCases` に片側だけの case key を出力する
- `pairing.datasetCaseCount` と `pairing.pairedCaseCount` を併記する
- `metrics.*.unpairedCaseCount` を集計し、acceptance criterion の metric としても宣言できる
- case 件数の呼び名は `pairedCaseCount` に一本化する。criterion として宣言できない別名を併記すると、評価器が無視する metric を宣言してしまう
- run ID の解決は P1 の `deriveReviewRunId`（契約2）を import して使う。同一実装を二重に持つと、片方だけが変わったときに気づけない
- 欠落があれば `pairing.warnings` に警告を立て、Markdown の Dataset coverage 節へ必ず出力する

### critical regression の定義

`criticalRegressionCount` は「baseline が critical で検出していた finding を candidate が失った、または severity を下げた」件数です。candidate が新しく critical を出した場合は `criticalAdditionCount` として別に数えます。真の検出なのか新しい誤検出なのかは、人間にしか判別できないためです。

## 8. profile 別受入基準（契約6）

profile ごとに metric・comparator・しきい値・required を宣言します。profile の単位（reviewMode か、対象リポジトリ×phase の組か）は契約6 の未決事項のままとし、名前だけを必須にしました。運用で数サイクル観測してから語彙を決めます。

- critical regression 0 は契約が定める floor のため、全 profile へ無条件に注入する。`source: 'contract-6'` として区別できる
- `minSampleSize` は宣言がなければ `null` を報告する。「代表10件」は smoke test の最低条件であり、既定値を置くと「満たした」と読まれてしまう
- `minSampleSize` の単位は `metrics.denominator`（`paired-finding` / `paired-case`）で決まる。語彙を閉じたのは、ラベルだけ変えて集計単位が変わらないと誤読を招くためである
- held-out 集合が宣言されていれば、受入評価は held-out 側で行う。candidate の導出に使った case で評価すると自己確認になるためである
- held-out に宣言できるのは**両側に存在する case key**だけとする。片側だけの key を許すと評価対象が空集合になり、全 metric が 0 で「必須条件を満たした」ように見える
- 評価対象の paired case が 0 件なら、全 criterion を `evaluable: false` と `satisfied: null` にする。空集合での vacuous pass を防ぐためである
- paired replay の入力から観測できない metric（precision / recall / cost / reversal）は `evaluable: false` と `satisfied: null` を返す。黙って充足扱いにはしない

### critical regression floor は宣言で緩められない

契約6 は「critical regression 0 を P2 の必須条件」と定めています。したがって SSoT は契約であり、spec の宣言ではありません。`criticalRegressionCount` の宣言は次のように扱います。

- floor（`lte 0` / `required: true` / `source: 'contract-6'`）を常に注入する
- 宣言側は**より厳しくする方向にだけ**有効とし、threshold は 0 でクランプする。件数に 0 未満の値はないため、結果として floor は常に `lte 0` になる
- 負の threshold（例: `-3`）も 0 へクランプする。クランプしないと「充足不能な必須基準」が生成され、どの実験も必須条件を満たせなくなる
- `required: false` の宣言は無視する。必須条件を宣言側から外せてはならないためである

## 8.1 improvementCandidate の入力検証（契約4）

experiment spec が `improvementCandidate` を宣言する場合、candidate ID は `river promote propose` と同一の導出へ渡します。同一の証拠から同一の ID が採番されなければ、実験と昇格候補が同じものだと判定できないためです。そのため入力側の正規化と検証も propose と共有します。

- `clusterKey` は `promotion-candidates.mjs` の `normalizeClusterKey` で正規化する。NFC 化してから `::` で分割し、**成分ごとに** trim して再結合する。全体を trim するだけだと、`"skill ::false_positive"` が propose 側と replay 側で別の ID になる
- `::` を持たない `clusterKey` は `PairedReplayError` として exit 1 にする。propose が構造上生成できない ID を実験側だけが採番してはならない
- `sourceFeedbackRefs` の各行は propose の `--input` と同じ `validateFeedbackEntryShape` を通し、`clusterKey` と一致しない行も拒否する。propose が拒否する材料から実験 ID を採番させないためである

### 自動適用しないことの担保

`acceptance.decision` は schema 上 `const: null`、`applied` と `autoPromotion` は `const: false`、`requiresHumanJudgment` は `const: true` です。全基準を満たした場合でも値は変わりません。テストは「全基準充足でも decision が null であること」を明示的に assert しています。

## 9. trust boundary（P2 でも全件 untrusted）

契約1 の未決事項である `trusted_by` の署名・検証方式は、P2 でも確定していません。CI attestation や署名記録の実装がない状態で trusted への昇格経路を開けると、被レビュー側が書き換え可能な run レコードで trusted を名乗れてしまいます。したがって次を維持します。

- `trust_level` は P1 の `evidenceTrustLevel` をそのまま再利用し、常に `untrusted` である
- `verification.trustedEvidenceCount` は schema が `const: 0` で検証する
- `verifier.independent` は自己申告として記録するが、`independentVerifierVerified` は常に `false` である
- `canaryEligible` は常に `false` である

trusted への昇格は、検証機構を実装するフェーズまで閉じたままにします。

## 10. activation 確認（DoD 4）

paired replay を ledger 比較と区別する要素として、activation を観測します。

- `configurationDiffers`: baseline と candidate の構成識別子（commit / provider / model / temperature / Skill Registry commit）が異なるか
- `observedDifference`: 突合結果に差分があるか
- `verified`: 上記 2 つがともに真であるか
- `sourceCommitShaCoverage`: 両側合計で、レビュー対象コミットを名指しできる run が何件あるか（`runCount` / `knownRunCount` / `unknownRunCount`・#1719）
- `crossSideSourceCommitSha`: baseline と candidate が導出した被レビューコミットが食い違っているか（`baseline` / `candidate` / `comparable` / `differs`・#1724）

構成が同一の replay を「regression なし」と読むと、candidate についての証拠がないのに安全だと誤読します。そのため未発火の場合は理由付きで報告します。

`sourceCommitShaCoverage` は報告専用であり、`verified` の判定式には入れていません。「どのコードをレビューしたのか名指しできる」という性質と、「構成が異なった」という事実は別の問いだからです。証拠の欠落は次の 4 つを `activationCheck.reasons`（および Markdown の Activation 節）へ出力し、沈黙させません。

- `source_commit_sha` を持たない run が存在する場合（#1715 以前の記録）
- dirty な working tree で収集した run が存在する場合（#1718 W1）
- dirty フラグ自体を持たない run が存在する場合（unknown を clean と同じ扱いにしない）
- 両側が別のコミットをレビューしていた場合（`crossSideSourceCommitSha.differs === true`・#1724）

`crossSideSourceCommitSha` も同じく報告専用です。#1719 の検査は (side, case) 単位の内部一貫性しか見ておらず、片側だけを後日 re-collect したデータセットはそこを素通りします。両側の導出値が食い違えば、diff の差は candidate 構成ではなく被レビューコード自体の差に由来しうるため、その可能性を記録します。ただし fail-closed にはしません。後日の re-collect は正当な実験手順であり、拒否すると #1720 が見送った副作用をそのまま招くからです。片側でも導出値が `null`（未取得、または複数コミットにまたがる側）なら `differs` は `false` ではなく `null` とし、「未取得」を「一致」と読み替えません。比較は側内の判定と同じ `resolveObservedSha` を再利用しており、短縮 sha の扱いも側内と同一です。

per-side の内訳は `manifest.<side>.provenance` にあります。両側合計を持つのは activation 側だけであり、同名フィールドの二重管理は避けています。いずれも manifest ではなく result 側に置いています。manifest へ入れると `conditions` に含まれ、既存 manifest の `experimentKey` / `manifestId` が動いて契約3 の不変性を壊すためです。

## 11. 次フェーズへの申し送り

- `trusted_by` の検証機構（CI attestation または署名記録）は依然として未実装である（契約1）
- profile 語彙と必要サンプル数の決め方は、本コマンドの出力を数サイクル観測してから確定する（契約6）
- 独立 verifier の実体（candidate の変更権限外で走る実行主体）は P3 以降の課題である
- 自動 canary と自動 Keep / Rollback は保留のままとし、最終処理は #1568 の lifecycle を利用する

## 12. 参照

- `docs/development/1574-p0-design-contract.md`: P0 設計契約 6 点
- `docs/development/1574-p1-shadow-aggregate.md`: P1 の read-only 集約
- issue #1574: Review Evolution Cycle Epic
- `src/lib/result-store.mjs`: run store の trust-boundary note
