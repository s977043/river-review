# #1574 Model + Harness attribution / Gated Evolution Screening

> Status: Design addendum（docs-only）
> Issue: #2499
> Parent: #1574 Review Evolution Cycle
> Runtime impact: none

## 1. Decision

River Review の改善能力は、モデル単体ではなく **Model + Harness configuration** の組として観測する。

ただし、ここでいう `Harness` は新しい runtime object、schema、workflow engine、または SSoT を意味しない。River Review が既に所有する次の実行面を、能力帰属と実験設計のためにまとめて呼ぶ分析上の語彙です。

- prompt / instruction
- Skill / Reference / Rule
- tool / deterministic checker
- context packaging
- routing / reviewer selection
- execution policy / budget
- evaluation / verifier configuration

Model はこの envelope の一要素であり、Harness と別に version / provider / effort / temperature 等を固定・追跡する。

この補遺は Raven の設計から着想を得るが、Raven runtime、Raven schema、EverMind 固有 vocabulary を River Review の正本にはしない。

## 2. Why

Review Evolution Cycle はすでに、複数 run から candidate を作り、paired replay、Human approval、canary、post-adoption effectiveness を通して改善を検証する。

不足していたのは、改善結果を「モデルが良くなった」「Skill が効いた」のように単一要因へ早計に帰属しないための明示的な **change envelope** と、既存 gate 群を一続きの **gated screening** として読む契約です。

能力評価は次の単位で扱う。

```text
Review capability observation
= Model configuration
+ Harness configuration
+ fixed evaluation conditions
```

これは複数 surface を一度に変更してよい、という意味ではない。credit assignment を保つため、**1 candidate = 1 hypothesis = minimal change** を維持する。

## 3. Capability change envelope

各 Evolution candidate / experiment は、少なくとも「何を変えたか」と「何を固定したか」を区別できなければならない。

- `model`: provider / model / effort / temperature。Owner は Experiment Manifest / reviewer provenance
- `prompt`: system / review prompt / compiler output。Owner は prompt compiler / reviewer config
- `skill`: Skill / Reference / Rule。Owner は Skill Registry / #1568
- `tool`: deterministic checker / verifier tool。Owner は verifier / checker
- `context`: inputContext / artifact packaging / section cap。Owner は review context
- `routing`: selected reviewer / owner skill / ordering。Owner は planner / routing
- `policy`: execution policy / budget / stop condition。Owner は runtime policy
- `evaluation`: rubric / held-out set / evaluator。Owner は eval / paired replay

### Invariants

1. candidate は変更 surface を列挙する。
2. 比較対象で固定すべき surface は Experiment Manifest に pin する。
3. 同一 candidate で不要な複数 surface を同時変更しない。
4. Model を変更した場合も、prompt / skill / tool / context / routing / evaluator の差分を無視して「model improvement」と帰属しない。
5. Harness surface を変更した場合も、provider / model / effort 等が変わっていれば単独効果と断定しない。
6. attribution が曖昧な実験は adoption evidence ではなく exploratory evidence として扱う。

現行 schema へ即時に新しい `harness` object を追加しない。まず既存 provenance / manifest / candidate field から envelope を導出できるかを優先する。

## 3.1 Credit assignment / self-evaluation guards

Model + Harness を評価単位にする場合でも、改善原因を誤帰属しないために次を守る。

- **model-only claim** は、prompt / Skill / tool / context / routing / policy / evaluator が同一であることを確認できる場合だけ許す
- model-aware prompt compiler 等で model ごとに prompt が派生する場合、比較対象は model 単体ではなく **joint system change** として記録する。各 side の compiled prompt hash / profile を provenance に残す
- Harness surface の変更を評価するときは、provider / model / effort / temperature の差分を固定または明示する
- `evaluation` surface 自体を candidate にする場合、candidate evaluator が自分自身を acceptance 判定してはならない。凍結した reference evaluator、sealed held-out set、deterministic oracle、または独立 verifier を使う
- proposer / candidate implementation / verifier / final Human judgment の責務を可能な範囲で分離し、同一 agent の自己採点だけで adoption readiness を成立させない
- side 間で fixture / dataset / reviewed source commit がずれた場合、その差分を candidate 効果として扱わない

つまり「性能が上がった」ではなく、**どの条件差が観測結果へ寄与したと主張できるか**を experiment evidence の一部とする。

## 4. Existing artifact mapping

Raven 型の自己改善ループを River Review-native に読み替えると次の対応になる。

```text
Execution
  -> Review Artifact / saved run / feedback
Evidence / failure
  -> shadow aggregate / Riverbed evidence
Diagnosis
  -> observed pattern / cause hypothesis
Candidate
  -> ReviewImprovementCandidate
Controlled evaluation
  -> immutable Experiment Manifest + paired replay + held-out
Screening
  -> promotionHandoff + Human-invoked evidence attachment
Approval
  -> #1568 Human-owned promotion lifecycle
Adoption
  -> versioned Rule / Skill / Reference / test / routing change
Post-adoption measurement
  -> reviewPromotionEffectiveness / effectivenessHistory
Regression response
  -> needs_review / revise / supersede / retire
```

新しい lifecycle は作らない。

## 5. Gated Evolution Screening

Gated screening は単一の新 gate ではない。既存の複数契約を順序付きで合成した **adoption readiness protocol** とする。

### Gate A—Candidate integrity

- 1 candidate = 1 hypothesis
- content-addressed candidate ID
- source evidence / provenance を保持
- change envelope が説明可能

Fail: candidate を分割または evidence を追加する。自動 promotion しない。

### Gate B—Experiment integrity

- immutable Experiment Manifest
- baseline / candidate 条件を pin
- dataset / held-out hash を pin
- evaluator / collector / model configuration を pin
- activation evidence を記録

Fail: 実験結果を adoption evidence として扱わない。

### Gate C—Evaluation quality

- baseline / candidate paired comparison
- should-detect / should-not-detect を含む
- held-out が宣言されている場合は held-out を acceptance に使う
- evaluable でない metric は pass にしない
- critical regression = 0 を floor とする

Fail: Human approval へ進める根拠にしない。

### Gate D—Independence / trust

- proposer と verifier の論理的分離
- candidate の変更権限外で取得した trusted evidence を adoption の前提とする
- self-declared independence を verified independence と同一視しない

現状 P2 では `independentVerifierVerified=false` / `trust_level=untrusted` のため、paired replay 単独では canary eligibility を開かない。

### Gate E—Human approval

- replay evidence は `experimentHistory[]` に pre-adoption evidence として保持
- approve / reject / retarget は Human-owned
- security / compliance / privacy の境界を緩めない
- merge / release は Human-owned

全評価が良好でも `acceptance.decision=null`、`autoPromotion=false` を維持する。

### Gate F—Post-adoption effectiveness

adoption 後は replay metrics ではなく、実運用 feedback / recurrence / reversal を測定する。

- post-adoption evidence は `effectivenessHistory[]`
- threshold 超過時は `needs_review`
- keep / revise / supersede / retire は #1568 lifecycle を再利用
- pre-adoption replay metrics を effectiveness と混ぜない

## 6. Screening result vocabulary

新しい persisted enum は追加しない。設計上の読み方として次の3状態を使う。

- **exploratory**: attribution / activation / held-out / trust のいずれかが不十分
- **human-review-ready**: deterministic な screening 条件を満たし、Human が採否判断できる
- **post-adoption-observed**: Human approval 後に effectiveness evidence が得られている

これらは既存 `promotionStatus` の代替ではなく、文書上の解釈です。

## 7. Stop conditions

次の場合は改善を「成功」と扱わず停止・再設計する。

- activation が確認できない
- baseline / candidate 以外の条件差が attribution を壊す
- held-out が空、または acceptance が評価不能
- critical regression が1件以上
- verifier independence / trusted evidence が要求水準を満たさない
- cost / latency が budget を超える
- Human が scope / risk / evidence を不十分と判断する
- post-adoption effectiveness が悪化し `needs_review` へ戻る

## 8. Relationship to Agent Team Topology

River Review が扱う能力帰属は、上位の Agent Team Topology と矛盾しない。

```text
Model != Role
Model != Harness
Review != Verification
Effort != Autonomy
```

River Review の責務は、どの topology を選ぶべきかを自動決定することではなく、選択された構成の変更が本当に review outcome を改善したかを evidence で検証することにある。

## 8.1 Bounded authority / governance

自己改善 candidate は review quality を改善できても、自分自身の権限境界を自動拡張してはならない。

- tool write permission、network access、credential scope、sandbox boundary、repository mutation 権限の拡張は通常の Harness optimization と同列に自動採用しない
- approval rule、independence rule、critical-regression floor、Human-owned merge / release boundary を candidate が自分で緩める変更は禁止する
- evaluator を変更する candidate と、その candidate の adoption gate を変更する candidate を同一実験に混ぜない
- security / compliance / privacy / external side effect を増やす変更は、paired replay が良好でも Human review を必須とする
- rollback path を持たない変更は limited canary の候補にしない
- cost / token / latency の改善だけで correctness / coverage / safety の regression を相殺しない

Evolution loop が変更できるのは **能力の実装面**であり、最終 judgment authority ではない。

## 8.2 External evidence boundary

Raven / 外部 agent harness の benchmark は、この設計を考えるための参考 evidence であり、River Review candidate の adoption evidence ではない。

- 外部 benchmark の改善値を River Review の acceptance threshold へ転用しない
- 外部 system の成功を、River Review の Skill / routing / evaluator 改善の有効性証明にしない
- adoption は River Review-native な paired replay、held-out、independent verification、Human approval、post-adoption effectiveness で判断する
- 外部 source が更新・撤回されても、River Review の安全境界は本 repository の contract を SSoT とする

## 9. Non-goals

- Raven runtime / dependency の導入
- `Harness` という新しい canonical schema の導入
- モデルの自己再学習
- 無制限な prompt / Skill / Rule の自己書き換え
- 自動 approve / auto promotion / auto canary
- auto merge / auto release
- raw session transcript / hidden CoT の保存
- PlanGate / Human judgment の代替

## 10. Source inspiration

- [SBbit article](https://www.sbbit.jp/article/cont1/187266)
- [Raven paper](https://arxiv.org/abs/2609.33439)

採用するのは「Model 単体ではなく Model + Harness で能力を捉える」「candidate improvement を評価 gate を通してから採用する」という設計原則であり、実装・語彙・runtime dependency のコピーではない。
