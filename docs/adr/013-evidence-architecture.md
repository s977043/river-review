# ADR-013: Evidence Architecture—Evidence / Projection / Decision / Authority を分離する

## Status

Proposed for Phase 0 of #2470.

本 ADR は Evidence Architecture の責務境界だけを固定する。
schema、runtime behavior、Judge、Gate、finding semantics、merge / release authority は変更しない。

## Context

River Review には、レビュー結果の正しさ・完全性・出自・人間向け表示・caller 向け signal を扱う複数の既存 contract がある。

- Reviewer / Lens: candidate finding の発見
- Deterministic Verifier: evidence / schema / scope の形式妥当性
- Finding Critic (#1978): finding claim の adversarial validation
- Evidence State (#2267 Phase 6): finding-level truth / epistemic state
- Semantic Precision (#1857 / ADR-007): materiality / disposition
- Review Coverage (#2212): review execution completeness
- Reviewer Independence: finder / verifier の logical execution separation
- Execution Manifest: execution provenance
- Review Resolution (#2322 / ADR-011): author / human handling と後続 verification
- Human Attention (#2368 / ADR-012): human-facing projection
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

例:

- Review Artifact
- Review Coverage
- Execution Manifest
- Security Audit Run Record
- Review Resolution sidecar
- Finding Critic validation result / Evidence State

Evidence Architecture はこれらを概念的に接続するが、単一の authoritative artifact へ再統合しない。

### D3—Finding-level Evidence State と run-level projection を分離する

#2267 Phase 6 は既に finding-level の derived epistemic projection を持つ。

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

Review Evidence Projection は既存 canonical state を選択的に表示・集約する derived view である。

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

### D5—truth / materiality / caller action を再統合しない

既存 responsibility order を維持する。

```text
Is it true?
  -> Finding Critic / Evidence State

Is it material?
  -> Semantic Precision

What should caller do?
  -> Gate

Who executes / approves?
  -> Host / Human
```

Review Evidence Projection はこれらの軸を1つの confidence scoreや総合判定へ潰さない。

### D6—Reviewer Independence の現行保証を狭く扱う

`src/lib/reviewer-independence.mjs` の現行 contract が証明するのは次だけである。

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

#2370 により L1 Decision Surface は既存 renderer に実装済みである。

Review Evidence Projection の将来実装が必要になった場合も、別 presentation stack を作らず、既存 progressive-disclosure path の入力として追加する。

```text
Visibility = complete
Attention = selective
```

Compression は Suppression ではない。

### D11—Gate は recommendation、execution は Host の責務

既存 Gate contract を維持する。

```text
River Review DERIVES the decision.
EXECUTION is the host's responsibility.
```

Gate は Review Evidence Projection の authority ではなく、既存入力から caller-facing recommendation を導出する別責務である。

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
Evidence Sources
├─ deterministic verification
├─ reviewer findings
├─ adversarial verification
├─ Evidence State
├─ Review Coverage
├─ Reviewer Independence
└─ Execution Manifest / provenance
          ↓
Canonical machine-readable artifacts
          ↓
Review Evidence Projection
├─ evidence state visibility
├─ coverage / blind spots
├─ verification availability
├─ independence state
└─ provenance
          │
     ┌────┴────┐
     ↓         ↓
Decision    Gate
Surface     derived signal
     │         │
     └────┬────┘
          ↓
      Host / Human
      execution authority
```

この図は storage hierarchy を意味しない。
Review Evidence Projection が canonical artifacts を所有することも、Decision Surface / Gate が同一 decision engine になることも意味しない。

## Relationship to Agent Team Topology

Evidence Architecture は Agent role taxonomy ではない。

```text
Agent Team Topology
= who performs work

Evidence Architecture
= what evidence / uncertainty / provenance is preserved and projected

Decision / Authority Architecture
= who derives recommendations and who owns execution authority
```

Model、Role、Evidence、Authority を1つの agent hierarchy に統合しない。

## Required invariants

Phase 1 以降の実装を検討する場合も最低限以下を守る。

1. Review Evidence Projection が既存 truth state を再計算しない
2. Semantic Precision disposition を再計算しない
3. Gate decision を再計算・上書きしない
4. blocking / critical / major finding を projection で消さない
5. partial / timeout / unknown coverage を clean と表示しない
6. provenance link を失わない
7. same / unknown execution independence を independent と表示しない
8. top-N 外 finding も canonical / L2-L3 surface に残る
9. missing state を optimistic default にしない
10. projection failure が review bypass にならない

## Rollout

### Phase 0—this ADR

- responsibility / ownership boundary
- terminology
- no behavior change
- no schema change

### Phase 1—existing surface mapping

既存 Review Artifact / sidecar / manifest と Decision Surface の mapping を文書化する。

runtime / schema の追加は必須ではない。

### Phase 2—machine-readable Review Evidence Projection, only if needed

具体的な consumer gap が実測された場合だけ、pure deterministic な derived projection を検討する。

条件:

- additive
- no new truth vocabulary
- no new Judge
- no new Gate
- no authority
- existing canonical artifacts remain canonical

### Phase 3—Decision Surface integration

Phase 2 が本当に必要だった場合だけ、既存 #2370 Decision Surface に additive に接続する。

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
- ADR-007—Semantic Precision Pass
- ADR-010—Security Audit Harness Integration
- ADR-011—Review Resolution Loop
- ADR-012—Human Attention Architecture
- #1760—Reviewer Identity
- #1857—Semantic Precision
- #1978—Finding Critic
- #2212—Review Coverage
- #2267—Security Audit integration
- #2322—Review Resolution Loop
- #2368—Human Attention Architecture
- #2370—Decision Surface renderer
