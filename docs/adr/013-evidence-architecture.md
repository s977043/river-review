# ADR-013: Evidence Architecture—Evidence / Projection / Decision / Authority を分離する

## Status

Proposed for Phase 0 of #2470.

本 ADR は Evidence Architecture の責務境界だけを固定する。
schema、runtime behavior、Judge、Gate、finding semantics、merge / release authority は変更しない。

## Context

River Review には、レビュー結果の正しさ・完全性・出自・人間向け表示・caller 向け signal を扱う複数の既存 contract がある。

- Reviewer / Lens: candidate finding の発見
- Deterministic Verifier: evidence / schema / scope の形式妥当性
- Finding Critic (#1978): finding claim の adversarial validation。runtime 配線は opt-in / evaluation-gated
- Evidence State (#2267 Phase 6): finding-level truth / epistemic state。owning helper は実装済み
- Semantic Precision (#1857 / ADR-007): materiality / disposition。architecture owner は定義済みだが、finding-level disposition の主経路実装は未完了
- Review Coverage (#2212): review execution completeness。runtime contract は実装済み
- Reviewer Independence: finder / verifier の logical execution separation。ADR受理時は helper-only（実装後の観測経路は D6 の追記を参照）
- Execution Manifest: execution provenance。additive / optional runtime contract
- Review Resolution (#2322 / ADR-011): author / human handling と後続 verification。ADR で owner / sidecar 方針は定義済みだが、Review Resolution sidecar schema は未実装
- Human Attention (#2368 / ADR-012): human-facing projection。L1 Decision Surface は実装済み
- Gate: caller-facing recommendation
- Host / Human: merge / irreversible execution / production promotion

個々の責務は分離されている一方、「Evidence をどこまで集約・投影し、どこから先を判断・実行 authority とするか」という横断 architecture contract は明文化されていない。

PlanGate で使った Certification View をそのまま River Review に移植すると、既存の Review Artifact / Gate / Decision Surface / Review Resolution と重複する。

River Review では、新しい Certificate subsystem を作らず、既存 contract 間の関係を **Evidence Architecture** として固定する。

## Decision

### D1—Evidence と Decision を分離する

Evidence は「何が確認できたか / 何が未確認か」を表す。

Decision は「その Evidence を見て何をするか」を表す。

```text
Evidence != Decision
```

Evidence layer は GO / NO-GO、merge、release、production promotion を所有しない。

### D2—Canonical artifacts を分散 SSoT のまま維持する

新しい monolithic Certificate / Super Review Artifact は作らない。

既存 machine-readable artifact / sidecar / manifest が、それぞれの責務の canonical source であり続ける。

現在存在する例:

- Review Artifact
- Review Coverage
- Execution Manifest
- Security Audit Run Record
- Finding Critic validation result（runtime では opt-in / evaluation-gated。Evidence State はその contract からの derived projection）

architecture owner は定義済みだが未実装の例:

- Review Resolution sidecar（ADR-011 / #2322。schema は Phase 1 候補であり、現時点では存在しない）

Evidence Architecture はこれらの current / future owner を概念的に接続するが、単一の authoritative artifact へ再統合しない。
未実装 owner を、runtime で利用可能な evidence source として扱ってはならない。

### D3—Finding-level Evidence State と run-level projection を分離する

Issue #2267 Phase 6 には、finding-level の derived epistemic projection があります。

```text
established
unresolved
refuted
```

これは次の問いに答える。

> Is this finding claim established by the current validation protocol?

本 ADR はこの語彙を再定義・拡張しない。

run / review 全体で Evidence / coverage / provenance を downstream に見せる derived view は、混同を避けるため **Review Evidence Projection** と呼ぶ。

```text
Evidence State Projection
= finding-level truth / epistemic state

Review Evidence Projection
= review-level visibility of existing evidence / uncertainty / provenance
```

### D4—Review Evidence Projection は Judge ではない

Review Evidence Projection は、既存 canonical state と既存 derived contract view を選択的に表示・集約する view です。

将来コード化する場合も pure deterministic projection を優先し、新しい保存先・mutable state・authority を持たせない。

入力候補:

```text
findings
+ evidence state
+ review coverage
+ reviewer independence
+ execution provenance
+ resolution / verification where available
```

表示候補:

```text
evidence state visibility
coverage / blind spots
verification availability
independence state
provenance
```

Review Evidence Projection は次を行わない。

- finding を新規発見しない
- finding truth を再判定しない
- severity / confidence を再評価しない
- Semantic Precision disposition を生成しない
- majority vote で truth を決めない
- Gate decision を生成しない
- merge / release を判断しない

```text
Projection != Judgment
```

### D5—truth / materiality / derived signals / authority を再統合しない

既存 responsibility order と derived signal の違いを維持する。

```text
Is it true?
  -> Finding Critic / Evidence State

Is it material?
  -> Semantic Precision

What is the top-level review verdict?
  -> decision
     auto-approve | human-review-recommended | human-review-required

What is the Layer-1 loop hint?
  -> suggestedLoopSignal
     derived from existing review state; not a GO/NO-GO gate

What should a loop-running host do?
  -> Gate
     derived recommendation from its existing inputs

Who executes / approves?
  -> Host / Human
```

`decision`、`suggestedLoopSignal`、`gate` は既存 contract のまま維持する。
Review Evidence Projection はこれらを再計算・統合・置換せず、必要な surface で参照・表示するだけです。

Review Evidence Projection はこれらの軸を1つの confidence scoreや総合判定へ潰さない。

#### Contract class を分離する

Evidence Architecture では、storage location ではなく責務で contract を分類します。

- **Domain evidence / observation**: findings、利用可能な `validation.finalStatus`、Review Coverage、Execution Manifest、将来の Review Resolution。producer が観測・記録した事実や domain state を保持する。未実装・未配線の owner は current input とみなさない。
- **Derived projection**: Evidence State、Review Coverage の owner-specific mapping、Human Decision Surface、将来の Review Evidence Projection。既存 state を再判定せず、用途別に見せ方を導出する。
- **Advisory signal**: `decision`、`suggestedLoopSignal`、Gate。caller が次の行動を決めるための machine-readable signal を導出する。
- **Enforcement adapter**: `--gate` や GitHub Action の `gate:`。既存 signal を process exit / CI status へ写像する。signal の意味や authority を新しく定義しない。
- **Execution authority**: Host / Human。merge、停止、継続、promotion、production 反映などの不可逆・外部影響を伴う実行を決定・執行する。

同じ Review Artifact 内に複数 class の値が格納される場合でも、責務が同一になるわけではありません。
保存場所の共有を理由に、projection が advisory signal を再計算したり、advisory signal が execution authority を獲得したりしてはいけません。

### D6—Reviewer Independence の現行保証を狭く扱う

`src/lib/reviewer-independence.mjs` の現行 contract が証明するのは次だけです。

```text
finderRunId != verifierRunId
```

これは logical execution separation であり、次を証明しない。

- different human
- different model
- different provider
- different prompt
- different source
- prompt / context isolation
- cryptographic identity
- correctness

したがって Review Evidence Projection は、distinct run IDs を「強い独立検証」へ拡大解釈してはならない。

**受理時点（Phase 5A）の観測:** `reviewer-independence.mjs` は helper-only で、runtime には未配線でした。この記述は当時の基準状態を記録しています。

**実装後の更新（2026-10-10確認、#2481 / PR #2501、#2543 / PR #2571）:** Finding Critic は既存の `evaluateReviewerIndependence()` を利用します。観測値は `src/lib/finding-critic-stage.mjs:buildExecutionIndependence` が生成します。

入力は orchestrator が事前割当てした verifier execution ID と、finding の `sourceExecutionIds[]` です。結果は `debug.findingCritic.executionIndependence[]` に保持されます。

Finding Critic は opt-in（既定 off）です。この値は debug observation であり、Review Artifact の必須・トップレベル independence field ではありません。利用可能性は呼び出し経路に依存します。

この更新の保証は **logical execution ID の比較**だけです。distinct ID は actor identity、別 provider/model、prompt/context isolation、trusted provenance を証明しません。finding correctness や independent adversarial verification の品質も証明しません。

Critic 未実行や ID 欠落を独立性の証明にせず、結果を severity・validation・`decision`・Gate・Human authority に昇格させません。Review Evidence Projection は既存の debug observation を参照できます。ただし、canonical finding truth や新たな判断権限として再解釈しません。

より強い actor / provider / model / prompt / signature provenance は #1760 の責務を再利用する。

### D7—Evidence count と independence を混同しない

複数 evidence が存在すること自体を、複数の独立確認として数えない。

少なくとも以下を独立 evidence の増加として自動計上しない。

- duplicate evidence
- derived evidence
- same execution
- source lineage が同一と判明している evidence

現行 contract で independence が不明な場合は unknown のまま保持する。

本 ADR は model / prompt / provider diversity を新しい correctness rule として追加しない。

これは「独立 evidence 数」を新しい metric / schema field として導入する決定でもない。
現時点では、既存 contract が証明できる以上の independence を推論・加算しない、という禁止事項だけを固定する。

### D8—Unavailable / Unknown / Partial を PASS に射影しない

以下を clean / established / complete 相当に変換しない。

- not executed
- timeout
- failed
- partial coverage
- missing evidence
- stale evidence
- unknown
- inconclusive

```text
absence of evidence
!=
evidence of absence
```

Evidence Projection が情報を圧縮する場合でも、不完全性と uncertainty は残す。

上記は新しい共通 enum を定義するものではない。
各状態は Review Coverage / Evidence State / Resolution / provider failure 等の owning contract の既存 vocabulary のまま保持します。
たとえば Review Coverage の owner 側 helper が `unknown` を導出することは既存 contract の責務です。
Review Evidence Projection は、それらを横断する新しい `unknown` / `stale` 共通語彙へ勝手に正規化しません。

### D9—Provenance before trust

Evidence は可能な範囲で既存 provenance へ遡れることを優先する。

候補:

- target / revision
- reviewer / verifier run
- source artifact
- execution context
- Execution Manifest
- freshness / carried-over state

新しい provenance schema を本 ADR では作らない。
既存 Execution Manifest / Review Record / #1760 の方向性を優先する。

### D10—Human-facing surface は既存 Human Attention Architecture を再利用する

ADR-012 が定義する以下を維持する。

```text
L1 — Decision Surface
L2 — Resolution Summary
L3 — Full machine-readable artifacts
```

Issue #2370 により、L1 Decision Surface は既存 renderer に実装済みです。

Review Evidence Projection の将来実装が必要になった場合も、別 presentation stack を作らず、既存 progressive-disclosure path を再利用する。

現行 `buildHumanDecisionSurface` は `decision` / `gate` / risk state / Review Coverage / blind spots を既存入力から直接投影しています。
したがって Review Evidence Projection を Decision Surface の必須中間層にはしません。
導入する場合も、evidence / uncertainty / provenance を補う optional additive input とし、既存 decision / gate / risk state はそれぞれの owner から直接参照できます。

```text
Visibility = complete
Attention = selective
```

Compression と Suppression は別概念です。

### D11—Gate は recommendation、execution は Host の責務

既存 Gate contract を維持する。

```text
River Review DERIVES the decision.
EXECUTION is the host's responsibility.
```

Gate は Review Evidence Projection の authority ではなく、既存入力から caller-facing recommendation を導出する別責務です。
現行 Gate は `decision` / loop signal だけでなく、risk action、blocking findings、review execution、strict block、coverage、LLM execution state などの独立入力も扱います。

`deriveGateDecision` 自体は pure derivation です。
一方、`--gate` や GitHub Action の `gate:` は、既存 Gate decision を exit code / CI status へ写像する opt-in enforcement adapter です。
これは Gate が merge / release authority を獲得することを意味しません。
不可逆な実行や外部 system への反映は引き続き Host / Human の責務です。

Gate の利用可否や一部入力は host / mode / opt-in 設定に依存します。
したがって Evidence Architecture は「常に Gate が存在する」ことも「すべての evidence が Gate に入る」ことも仮定しません。

Review Evidence Projection が Gate を上書きしたり、第二の Gate を持ったりしてはならない。

### D12—No majority vote

Reviewer / Verifier の出力数で truth を決めない。

例:

```text
deterministic FAIL
+ model PASS
+ model PASS

!= PASS by 2-to-1 vote
```

deterministic failure、unresolved evidence、coverage incompleteness 等は、それぞれの owning contract に従う。

## Target Architecture

```text
Review / Verification producers
├─ reviewer findings
├─ deterministic verification
├─ Finding Critic validation
├─ review execution results
├─ execution provenance
└─ author / human resolution where available
             ↓
Existing domain contracts / artifacts
├─ findings
├─ validation.finalStatus
│    └─ Evidence State projection
├─ Review Coverage
├─ reviewer run provenance
│    └─ Reviewer Independence helper
│       (not runtime-wired today)
├─ Execution Manifest
├─ Review Resolution
├─ decision
└─ suggestedLoopSignal
             │
        ┌────┴──────────────────────────────┐
        │                                   │
        v                                   v
Review Evidence Projection       Existing Gate derivation
(optional additive view)         decision / loop signal
        │                        + risk / execution /
        │                          coverage inputs when enabled
        │                                   │
        v                                   v
Existing Decision Surface                  Gate
also reads decision / gate / risk     derived recommendation
/ coverage / blind spots directly           │
        │                                   │
        └──────────────────┬────────────────┘
                           v
                      Host / Human
                    execution authority
```

この図は storage hierarchy を意味しない。
特に **Review Evidence Projection は Gate の入力層ではありません**。
Projection と Gate は existing domain contracts から別々に導出されます。
Decision Surface も Projection を必須経由せず、既存 state を直接参照できます。
Projection が `decision` / `suggestedLoopSignal` / Gate decision を生成・補正・上書きすることはありません。

## Relationship to Agent Team Topology

Evidence Architecture は Agent role taxonomy と異なります。

```text
Agent Team Topology
= who performs work

Evidence Architecture
= what evidence / uncertainty / provenance is preserved and projected

Decision / Authority Architecture
= who derives recommendations, who enforces local process control, and who owns irreversible execution authority
```

Model、Role、Evidence、Authority を1つの agent hierarchy に統合しない。

## Required invariants

Phase 1 以降の実装を検討する場合も最低限以下を守る。

1. Review Evidence Projection が既存 truth state を再計算しない
2. 未実装・未配線の owner を「利用可能な evidence」として捏造しない
3. Semantic Precision disposition を再計算しない
4. `decision` / `suggestedLoopSignal` / Gate decision を再計算・上書きしない
5. blocking / critical / major finding を projection で消さない
6. partial / timeout / unknown coverage を clean と表示しない
7. provenance link を失わない
8. same / unknown execution independence を independent と表示しない
9. top-N 外 finding も canonical / L2-L3 surface に残る
10. missing state を optimistic default にしない
11. projection failure が review bypass にならない
12. artifact 内の保存場所が同じでも contract class を統合しない
13. owner-specific derived vocabulary を横断共通 enum へ再定義しない
14. enforcement adapter が advisory signal の意味や authority を再定義しない

## Boundary validation

本 ADR の invariant は、実装前に次の failure case で再確認する。

### Failure scenario 1—Projection が判断を強める

例:

```text
coverage = partial
finding evidence = unresolved
projection = "ready"
```

この場合、設計違反です。
Projection は upstream state より強い truth / readiness / safety を生成してはならない。

### Failure scenario 2—Reviewer 数が correctness に変換される

例:

```text
deterministic FAIL
model A PASS
model B PASS
```

2 対 1 を根拠に PASS へ変換する実装は設計違反です。
producer 数と evidence independence / correctness は別軸として扱う。

### Failure scenario 3—Projection が Gate の第二入力体系になる

例:

```text
canonical state
  -> Review Evidence Projection
  -> new readiness score
  -> Gate override
```

Projection 由来の新しい総合 score / verdict で既存 Gate を補正する実装は設計違反です。
必要な Gate behavior change は Gate 自身の change class として別に設計・評価する。

### Reopen / exception condition

再検討には、具体的な downstream consumer の gap を再現可能な fixture / dogfood evidence で示す必要があります。
既存 canonical artifacts と existing derived signals だけでは、安全に必要情報を取得できないことを条件とします。

再検討時も、まず既存 owner の additive extension を検討する。
新しい vocabulary / Judge / Gate / authority を追加する場合は本 ADR の例外として暗黙導入せず、別 ADR / Issue で明示する。

### Soft-violation gray zone

以下は、情報を失わず semantic state を変えない限り許容できる。

- human-facing ordering
- deterministic grouping
- pointer / link の追加
- duplicate presentation の圧縮
- progressive disclosure

ただし、critical / major / incomplete coverage / uncertainty / provenance を不可視にする場合は単なる presentation optimization ではなく設計違反として扱う。

## Phase progression gates

後続 Phase は順番に進め、前段の evidence が無い状態で runtime 実装を先行させません。

```text
Phase 0 ADR merged
  ↓
Phase 1 ownership / surface mapping complete
  ↓
Concrete consumer gap reproduced
  ↓
Phase 2 projection candidate
  ↓
Contract tests + paired evaluation
  ↓
Phase 3 Decision Surface integration, only if beneficial
```

### Phase 1 exit criteria

Phase 1 は、少なくとも次を machine-readable field 単位で対応付けて完了とします。

- source owner
- current storage / artifact
- derived or observed
- current consumer
- missing / optional semantics
- current human-facing surface

mapping の結果、既存 Decision Surface と既存 artifacts だけで安全に要件を満たせる場合は Phase 2 へ進みません。

### Phase 2 entry criteria

Review Evidence Projection の runtime 実装は、次をすべて満たす場合だけ開始します。

1. 実際の consumer が特定されている
2. 現行 artifact / Decision Surface では不足する情報を fixture で再現できる
3. 不足を既存 owner の additive extension だけでは解決しにくい理由がある
4. expected projection を canonical input から決定論的に記述できる
5. Gate / `decision` / `suggestedLoopSignal` の変更を必要としない

条件を満たさない場合、Phase 2 は **NO_GO** ではなく **not needed** と判断します。

### Phase 3 entry criteria

Decision Surface へ接続する前に、baseline と candidate で次を確認します。

- critical / major visibility が低下しない
- incomplete coverage visibility が低下しない
- provenance pointer が失われない
- advisory signal が変化しない
- Human Attention 指標に改善がある、または明確な consumer usability gap が解消する

安全性が同等以上でも利用価値の改善が無い場合、integration は行いません。

## Rollout

### Phase 0—this ADR

- responsibility / ownership boundary
- terminology
- no behavior change
- no schema change

### Phase 1—existing surface mapping

既存 Review Artifact / sidecar / manifest と Decision Surface の mapping を文書化する。

runtime / schema の追加を必須条件としません。
この Phase 自体は docs / analysis を基本とし、Phase 2 entry criteria を満たすかどうかを判断するための evidence を作ります。

### Phase 2—machine-readable Review Evidence Projection, only if needed

Phase 2 entry criteria をすべて満たす concrete consumer gap が実測された場合だけ、pure deterministic な derived projection を検討する。

条件:

- additive
- no new truth vocabulary
- no new Judge
- no new Gate
- no authority
- existing canonical artifacts remain canonical

### Phase 3—Decision Surface integration

Phase 2 の必要性と Phase 3 entry criteria の両方を満たした場合だけ、既存 #2370 Decision Surface へ additive に接続します。

新しい top-level PR comment / presentation subsystem は作らない。

### Phase 4—paired evaluation

candidate が baseline より良いかを評価する。

Safety conditions:

```text
Gate result unchanged for equivalent canonical inputs
Critical/Major visibility >= baseline
False suppression = 0
Provenance loss = 0
Incomplete coverage visibility = 100%
```

Human Attention の改善は safety 条件と同時に満たす場合だけ採用理由にする。

Risk-based evidence / review routing は別 change class / 別 PR とする。

## Non-goals

- new Certificate subsystem
- new authoritative Certificate artifact
- new Review Artifact v2
- new finding lifecycle
- new Evidence State vocabulary
- new Judge / Decision Engine
- new Gate
- auto merge
- production promotion
- majority voting
- generic confidence score
- automatic independent-evidence counting from model count
- hidden chain-of-thought storage
- full reasoning trace persistence
- #1857 / #1978 / #2212 / #2322 / #2368 / #1760 の再実装

## Consequences

### Positive

- Review / Verification / Decision / Authority の境界が明示される
- Evidence が増えても第二の Judge を作らずに扱える
- Human Attention Architecture と provenance を同時に維持できる
- provider / agent topology に依存しない
- future machine-readable projection の必要性を実測後に判断できる

### Costs

- 複数 canonical artifacts を横断して読む必要がある
- provenance / independence の強度は既存 contract の成熟度に制約される
- run-level projection を実装する場合は各 contract の drift を防ぐ contract tests が必要になる

## Rejected Alternatives

### A. PlanGate Certification View をそのまま移植する

Rejected.

River Review には既に Gate / Decision Surface / Review Artifact / sidecar があり、Certificate を authoritative にすると第二の decision / SSoT を作るため。

### B. Review Artifact を Super Artifact に拡張する

Rejected for Phase 0.

責務別 artifact の ownership を崩し、更新頻度・versioning・consumer を不必要に結合するため。

### C. Reviewer 多数決で confidence を作る

Rejected.

evidence count と independence / correctness を混同するため。

### D. 新しい LLM summarizer / Judge を mandatory path に追加する

Rejected.

Human-facing projection のために新しい semantic judgment と failure mode を追加するため。

## References

- #2470—Evidence Architecture
- [ADR-007—Semantic Precision Pass](./007-semantic-precision-pass.md)
- [ADR-010—Security Audit Harness Integration](./010-security-audit-harness-integration.md)
- [ADR-011—Review Resolution Loop](./011-review-resolution-loop.md)
- [ADR-012—Human Attention Architecture](./012-human-attention-architecture.md)
- [Reviewer Independence implementation](../../src/lib/reviewer-independence.mjs)
- [Gate derivation](../../src/lib/gate-decision.mjs)
- [Gate exit / enforcement adapter](../../src/lib/gate-exit.mjs)
- [Review Coverage contract](../development/review-coverage-contract.md)
- [Stable interfaces](../../pages/reference/stable-interfaces.md)
- #1760—Reviewer Identity
- #1857—Semantic Precision
- #1978—Finding Critic
- #2212—Review Coverage
- #2267—Security Audit integration
- #2322—Review Resolution Loop
- #2368—Human Attention Architecture
- #2370—Decision Surface renderer
