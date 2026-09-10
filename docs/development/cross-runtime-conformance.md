# Cross-Runtime Conformance（#2020 / Epic #2011 Phase 9）

同じ River Review Flow を Claude Code と Codex Plugin で実行したとき、runtime の差で Review Judgment の意味が変わっていないことを機械的に評価する仕組みです。

不変条件は 1 つだけです。

> Runtime Adapter MUST NOT redefine Review Judgment.

出力文面の一致は要求しません。#2020 の Non-goals は同一文面生成と model performance ranking を明示的に除外しています。

## 資産

| 対象          | パス                                            |
| ------------- | ----------------------------------------------- |
| ケース schema | `schemas/cross-runtime-conformance.schema.json` |
| データセット  | `tests/fixtures/cross-runtime/*.json`           |
| 比較器        | `tests/helpers/cross-runtime-conformance.mjs`   |
| 検証スイート  | `tests/cross-runtime-conformance.test.mjs`      |

1 ファイルが 1 ケースです。ケースは 1 組の pinned 実行条件と、runtime ごとの観測 2 件を持ちます。observations の件数は 2 件に固定したうえで、`contains` と `maxContains` によって claude / codex を各 1 件に固定しています。件数だけを縛ると同じ runtime の観測 2 件でも通ってしまい、それは pair ではないからです。

## Adapter binding の記録形

`observation.adapter` の `mechanisms` / `surfaces` / `fallbacks` は集合です。1 つの runtime は 5 つの論理 Agent を束縛しており、その mechanism は runtime 内で混在します。`agents/contracts/adapter-map.json` では claude が review-orchestrator と specialist-reviewer を `native-subagent`、残り 3 つを `skill` で束縛しています。単一値の `mechanism` ではこの実態を記録できません。

集合が `adapter-map.json` の記録内に収まることは `tests/cross-runtime-conformance.test.mjs` が突き合わせます。等値ではなく部分集合で検査するのは、`neg-unsupported-adapter-claim.json` が反実仮想の束縛（claude を codex と同型にする）を意図的に記録しているからです。禁じたいのは runtime が持たない束縛の捏造であり、実在する束縛の部分集合は正当なシナリオです。`RUNTIMES` と schema の runtime / capabilities / mechanism / fallback の語彙も、同じテストが `adapter-map.json` から導いた集合に固定します。

## 何を比べるか

比較は 2 層に分かれます。層を分ける理由は、許容できる差の性質が層ごとに違うからです。

### Deterministic 層

リポジトリのコードが pinned 入力から導く値です。host は関与しません。したがって host によって値が変わる事象そのものを「Adapter による judgment の再定義」と読みます。許容幅は置かず、完全一致で測ります。

比較対象は 12 フィールドです。

- routing の entry / resolvedFlow / resolvedFlowVersion
- selectedSkills（id と version の集合）
- referenceCoverage の required / referenced（集合）
- manifest の replayClass / blocks
- deterministicChecks（id と status の集合）
- gate の decision / reasonCode / inputsHash

集合として扱うフィールドでは記録順を正規化します。順序の違いを divergence とは呼びません。

`deterministicConformance` は「一致したフィールド数 ÷ 比較したフィールド数」です。

`manifest.pins` はこの 12 フィールドに含めません。pin の記録漏れは manifest completeness が担当する指標であり、同じ欠陥を 2 つの指標で二重に数えないためです。

### Agentic 層

model が生む judgment です。文面は記録しません。schema に message 相当のフィールドを置いていないので、比較が文面 diff に退化する余地がそもそもありません。

意味的同等性は次のように定義します。

- finding の同一性は `semanticKey` である。同じ欠陥を別の言い回しで書いた 2 件は一致とみなす
- 一致した finding どうしで taxonomy と severity の合意率を測る
- criterionCoverage は集合の一致率で測る
- completionState / unsupportedDoneClaim / humanEscalation は真偽の一致で測る

critical regression は「片方の runtime だけが critical に到達した」状態です。finding 自体が欠けている場合と、severity が下げられた場合の両方を数えます。どちらもレビューの防御力が host 依存になるからです。欠落型は `neg-critical-recall-gap.json`、降格型は `neg-critical-severity-downgrade.json` が守ります。

Human authority は 2 つの半分で測ります。agentic の `humanEscalation` の一致と、deterministic の `gate.decision` が `ESCALATE` かどうかの一致です。片方だけを動かした fixture ではもう片方が無検査で残るため、`neg-human-authority-drift.json` が agentic 側を、`neg-human-authority-gate-drift.json` が gate 側を担当します。`completionState` と `unsupportedDoneClaim` の不一致は `neg-completion-state-divergence.json` が守ります。

## Divergence の理由分類

閉じた語彙で分類します。宣言は主張であって判定ではありません。比較器は観測から理由を再導出し、根拠が伴わない主張は `unexplained` へ降格します。

| reasonClass          | 受理条件                                                         |
| -------------------- | ---------------------------------------------------------------- |
| `adapter-mechanism`  | adapter の mechanism が実際に異なる                              |
| `adapter-capability` | adapter の capabilities が実際に異なる                           |
| `model-variation`    | agentic 層で、かつ judgment authority に属さないフィールドである |
| `dataset-defect`     | pinned 入力と観測が実際に食い違っている                          |
| `unexplained`        | 上記のいずれにも当てはまらない残余                               |

Model 性能差と Adapter 差は、この受理条件で区別します。適用範囲には次の 2 つの制限を置いています。

- Deterministic 層で adapter 理由を受理するのは `deterministicChecks` と `manifest` だけである。routing / selectedSkills / gate は host 非依存のコードが導くので、そこでの差は説明ではなく違反そのものである
- `model-variation` を deterministic 層では受理しない。model で動く値はそもそも deterministic ではない

judgment authority のフィールド（critical recall / completionState / unsupportedDoneClaim / humanEscalation）では、model 理由と adapter 理由のどちらも受理しません。Promotion Gate が critical regression 0 と Human authority 維持を要求している以上、そこに言い訳を通せば gate の存在意義が消えます。

理由が分類されても、指標は緩みません。`neg-manifest-block-unresolved.json` がその独立性を示す fixture です。capability gap で説明できる差であっても deterministic conformance と manifest completeness は 100% を割り、Promotion Gate は fail のままです。

## Promotion Gate

Issue #2020 の 5 条件をそのまま評価します。

- deterministic conformance = 100%
- manifest completeness = 100%
- critical regression = 0
- unexplained divergence = 0
- Human authority unchanged

`positive fixture が pass し negative fixture が fail する`ことは検証スイートが個別に確認します。

比較器は `promotionDecision: null` と `requiresHumanApproval: true` を常に返します。集計は証拠であって承認ではありません。この結果を merge や release へ接続する配線は入れていません。

## 再現手順

```bash
export PATH=/opt/homebrew/opt/node@22/bin:$PATH
npm ci
node --test tests/cross-runtime-conformance.test.mjs
```

新しいケースを足す手順は次のとおりです。

1. 両 runtime で同じ entry / flow / policy / artifact set を実行する
2. 観測を `tests/fixtures/cross-runtime/<caseId>.json` に schema の形で記録する
3. `expected` はシナリオから手で書く。比較器の出力を写さない
4. 差がある場合は `declaredDivergences` に理由と根拠を書く
5. スイートを実行して、手書きの `expected` を比較器が再現することを確かめる

`expected` を比較器の出力から作ると、テストは実装のどんな挙動にも同意します。#1656 で支払った自己整合の罠と同じ形なので、そこだけは手で書きます。

## 実 LLM を呼ばずに成立する範囲

fixture は記録済みの観測です。比較器は model を呼ばないため、スイート全体が API キーなしで完走します。リポジトリは LLM eval を CI のオプション扱いにしているので、キーを要求する gate は gate になりません。

キーなしで成立するのは次の範囲です。

- Deterministic 層の 100% 一致検査
- manifest completeness の算出
- divergence 理由の再導出と分類
- Promotion Gate 5 条件の集計

キーが要るのは「観測を新しく採取する」段階だけです。採取と評価を分けたので、評価は常に決定論で回ります。

## Dogfood 記録（2026-09-03）

Claude Code と Codex CLI（`codex-cli 0.144.1`）で、同じリポジトリの同じファイルに対する deterministic な読み取りを実行しました。

| 観点                              | Claude Code                                              | Codex                   | 一致 |
| --------------------------------- | -------------------------------------------------------- | ----------------------- | ---- |
| `review-plan` の解決先            | `plan-review` / `0.1.0`                                  | `plan-review` / `0.1.0` | 一致 |
| `plan-review` の `stopConditions` | `["DETERMINISTIC_UNRUNNABLE","HUMAN_APPROVAL_REQUIRED"]` | 同左                    | 一致 |
| `plan-review` の `steps` 件数     | 11                                                       | 11                      | 一致 |

Codex 側は `codex exec --sandbox read-only` で実行しました。Claude Code 側は同じ JSON を直接読んで値を出しています。

adapter-map の記述も一次ソースへ突き合わせました。`agents/river-review.md` の frontmatter は `tools: Read, Grep, Glob, Bash` であり、`.codex-plugin/plugin.json` の `interface.capabilities` は `["Read"]` です。`agents/contracts/adapter-map.json` の capabilities 宣言はこの 2 つと整合しています。

実行できていない範囲は次のとおりです。

- Plan Review から PR Review までの 6 段を両 runtime で通す完全な dogfood は未実施である。API キーを使う意味的レビューが必要になる
- `node src/cli.mjs review plan . --plan-only --base origin/main` は commit 済みの差分を拾わず `status: "no-changes"` を返した。`review route` は `--base` を反映するため、両者で base の扱いが揃っていなかった（#2046 で解消済み。plan / exec も route と同じ経路で `--base` を解決する）
- したがって現時点の Promotion Gate 判定は fixture 上の評価であり、実運用の 9 ケース採取をもって置き換える必要がある

## src への持ち越し

比較器は現在 `tests/helpers/` にあります。#2020 の受入条件は「cross-runtime harness または再現可能な手順」なので、手順として成立させたうえで実装は据え置きました。製品面へ昇格させる場合に必要な変更は次のとおりです。

- `src/lib/cross-runtime-conformance.mjs` を新設し、`tests/helpers/cross-runtime-conformance.mjs` の比較ロジックを移す
- `src/cli.mjs` に conformance サブコマンドを足し、観測ファイル群から集計レポートを出せるようにする
- `flows/` を読むコードを `src/**` と `runners/**` に増やさない。observe mode の制約は `tests/flow-definitions.test.mjs` が検査している。ただし #2054 PR-3 以降、`flows/` を読む runtime モジュールは `src/lib/flow-loader.mjs` のみであり、同テストは offenders がこの 1 件と一致することを検査します（#2103）。

いずれも本 PR の対象外です。並行セッションの領域と重なるため、実装は行っていません。

## 既存 SSoT との関係

`src/lib/paired-replay.mjs` の `buildExperimentManifest` / `verifyExperimentManifest` は、baseline と candidate の**構成差**を pin する契約です。構成差の内訳は provider / model / temperature / commit です。finding は fingerprint で突き合わせます。変化させる軸が構成そのものなので、`configurationDiffers` は両者の相違を前提にします。

cross-runtime conformance が変化させる軸は host runtime であり、model を含む他の条件は同一に pin します。さらに比較対象は finding だけでなく routing / skill 選択 / reference coverage / gate 導出まで及びます。軸と比較面が両方とも違うので、paired replay の拡張ではなく別のケース schema と比較器を置きました。

一方で、再導出してよい概念は 1 つもありません。次の関数と定数は既存モジュールから import しています。

| 対象                                                                           | 出典                               |
| ------------------------------------------------------------------------------ | ---------------------------------- |
| `REPLAY_REQUIREMENTS` / `REPLAY_PINS` / `PROVENANCE_STATUS` / `REPLAY_CLASSES` | `src/lib/execution-manifest.mjs`   |
| `canonicalJson`                                                                | `src/lib/promotion-candidates.mjs` |
| `sha256Hex`                                                                    | `src/lib/shadow-aggregate.mjs`     |
