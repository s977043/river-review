# Experience Knowledge / Progressive Disclosure authoring contract

Issue: #2372 / #2376

## Purpose

River Review のレビュー結果・失敗経験・修正履歴から得た知見を、`SKILL.md` を肥大化させず再利用可能な判断資産へ変換するための authoring contract を定義する。

この契約は新しい Knowledge DB を導入しない。既存の Riverbed / Judgment Promotion Loop / Skill Registry / fixture / eval を使い、Experience Knowledge の保存先として `references/` を第一級に扱う。

## Asset boundaries

- `SKILL.md`: activation / responsibility / routing / hard guard / output contract。長い背景説明、大量の失敗事例、公式ドキュメントの写しは置かない。
- `references/`: experience knowledge / troubleshooting / examples / exceptions。常時必須の短い制約は隠さない。
- fixture / test: should-detect / should-not-detect の再現可能な証拠。背景説明だけの文章は置かない。
- rule: 全対象へ常時適用する短い制約。長い理由説明や局所的な例外は Reference へ分ける。
- Riverbed: observation / evidence / candidate / approval / lifecycle history。実行ロジックの正本にはしない。
- Docs / ADR: 設計理由、背景、運用方針。review runtime の詳細判断は Skill / Reference 側へ置く。

## Classification rule

判断資産を作るときは、最も決定論的で安価な保存先を先に検討する。

1. 機械的に判定できる → linter / static check
2. 入出力と期待結果が明確 → test / fixture
3. 常時適用する短い制約 → rule
4. phase / risk / artifact に応じて実行する判断 → skill
5. 反復した実戦知識・例外・troubleshooting → reference
6. 一度限りの判断 / suppression / exception → Riverbed
7. 設計理由・長期的な意思決定背景 → Docs / ADR
8. 人間の価値判断が本質 → human judgment のまま維持

`reference` は「skill に入りきらないもの」ではない。**実行契約ではないが、判断時に必要となる経験知**を置く。

## Reference eligibility

Judgment Promotion Loop 経由で Reference へ昇格する場合は、既存の promotion candidate evidence gate をそのまま使う。現行の自動候補生成は同種 feedback の反復 2 件以上を既定とし、この契約だけで単一事例の自動 promotion 経路を追加しない。

Reference の内容としては、次のような evidence を扱える。

- 複数の review / feedback で同じ判断が反復した
- 実障害・修正 PR・運用失敗で原因と対処が検証できた
- 公式手順だけでは解けなかった原因と対処が検証できた
- repository / team 固有の scope / exception がレビュー品質へ影響した

単一 incident の知見を直ちに共有する必要がある場合も、自動 candidate gate を迂回しない。まず Riverbed / incident doc 等へ evidence を残し、明示的な人間レビューを伴う変更として扱う。

単なる好み、未検証の推測、モデルの一度きりの回答は Reference に昇格しない。

## Required reference structure

新規 Reference は、内容に応じて次の情報を持つ。見出し名は完全一致でなくてよいが、意味上の欠落を避ける。

### Context / When to read

どの artifact / path / failure mode / task で読むか。

### Observation

何が実際に起きたか。推測ではなく evidence に結びつける。

### Judgment

次回同じ条件で何を判断・確認するか。

### Why

なぜその判断が必要か。公式仕様との差分や failure mechanism を短く記述する。

### Evidence / provenance

PR、finding fingerprint、fixture、incident、公式 source など、再確認できる出典。
秘密情報、認証情報、個人情報、raw session transcript、hidden CoT は保存しない。

### Scope

適用対象。path / phase / artifact / environment を必要な粒度で限定する。

### Exceptions

適用しない条件。false positive を避けるため、分かっている例外を明示する。

### Revalidation / lifecycle

再確認条件、期限、superseded 条件、volatile fact の更新元を記載する。

## Progressive Disclosure loading rule

`SKILL.md` は Reference の索引を持ち、実行時は依頼に最も近い Reference から読む。

- 最初に読む Reference は原則 1〜2 件
- すべての `references/` を一括ロードしない
- Reference が別領域を要求したときだけ追加ロードする
- 常に必要な判断は Reference に隠さず、短い hard guard を `SKILL.md` 側へ残す
- `SKILL.md` のサイズだけを目的に分割しない。context cost と責務境界の両方で判断する

現時点では Skill のファイルサイズを CI hard limit にしない。既存 Skill を一括分割せず、dogfood と paired replay で効果を確認してから段階的に薄くする。

## Official sources and volatile facts

Reference は公式ドキュメントの代替ではない。

- 公式仕様・API・料金・リージョン・モデル ID など変更しやすい事実は、利用時に公式情報を再確認する
- Reference には「公式どおりでは動かなかった理由」「repository 固有の差分」「再現済み workaround」を中心に残す
- 公式側が同じ troubleshooting を十分にカバーした場合は、Reference を削除・短縮・公式 source へのポインタへ変更する
- copied documentation を長期 SSoT にしない

## Workaround contract

Workaround を Reference に追加する場合は、最低限次を記録する。

- risk: 何を緩める / 迂回するか
- scope: どこだけで許容するか
- evidence: なぜ必要だと分かったか
- alternative: より安全な標準手段があるか
- removal condition: いつ削除できるか

security / compliance / privacy に関わる promotion は、既存の Human / PlanGate approval boundary を維持する。

## Good example

```markdown
# Repository layer outbound HTTP boundary

## Context / When to read

Repository 層から外部 HTTP client を呼ぶ変更をレビューするとき。

## Observation

複数 PR で Repository から HTTP client を直接呼び、domain と infrastructure の依存方向が崩れた。

## Judgment

外部通信は Gateway / Adapter 境界を経由する。Repository から transport client を直接参照しない。

## Why

通信方式の変更が domain-side repository contract へ漏れ、test double と failure handling が transport detail に依存するため。

## Evidence / provenance

- PR #123
- PR #146
- fixture: repository-layer-boundary-happy

## Scope

- src/repositories/**
- midstream diff review

## Exceptions

generated adapter は対象外。

## Revalidation / lifecycle

architecture boundary の ADR が更新された場合に再評価する。
```

## Bad examples

### Official documentation copy

AWS / framework docs を大量に転載し、更新元や repository 固有の判断がない。

### Unscoped workaround

「IAM は wildcard にする」のように risk / scope / removal condition なしで一般ルール化する。

### Hidden policy

全レビューで必須の禁止事項を Reference だけに置き、`SKILL.md` / rule からは見えなくする。

### Mega-reference

複数ドメインの知識を1ファイルに集約し、どの task でも全文ロードする。

## Promotion lifecycle

Experience Knowledge は既存 Judgment Promotion Loop に乗せる。

```text
Review / Feedback / Fix
  -> Riverbed evidence
  -> promotion_candidate
  -> target classification / human retarget
  -> human approval
  -> reference PR
  -> fixture / paired replay
  -> effectiveness review
  -> keep / revise / supersede / archive
```

原則は **1 hypothesis = 1 candidate = 1 target = 1 PR** とする。

Reference promotion でも candidate proposer と採用判断を分離し、source evidence / scope / exceptions を失わない。

## Evaluation

Reference を追加したこと自体を成果にしない。可能な範囲で次を比較する。

- recurring finding / repeated explanation の減少
- false positive / suppression の悪化有無
- missed issue の減少
- routing regression の有無
- token / cost / latency
- first-pass usefulness

判断にLLMが関与する場合は #1574 の paired replay / held-out / independent verification を優先する。critical regression は 0 を維持する。

## Relationship to current loops

- #743: 1 feedback を fixture / reference / suppression / routing 等へ返す inner loop
- #1568: recurring judgment を versioned asset へ昇格する promotion lifecycle
- #1574: multi-run aggregation / experiment / canary / effectiveness の outer loop
- #2372: Reference / Experience Knowledge を上記ループの正式な target として統合する

## Source inspiration

- [minorun365/agent-builder-skills](https://github.com/minorun365/agent-builder-skills)

採用しているのは repository 内容のコピーではなく、薄い `SKILL.md` + 必要時に読む `references/`、および「公式仕様ではなく実戦で詰まった知識を補完する」という設計原則です。
