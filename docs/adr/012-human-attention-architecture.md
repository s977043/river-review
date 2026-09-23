# ADR-012: Human Attention Architecture—完全な可視性を保ちながら判断面を圧縮する

## Status

Proposed for Phase 0 of #2368.

本 ADR は Human-facing projection の原則と責務境界だけを固定する。schema、Judge、Gate、finding semantics、merge authority は変更しない。

## Context

River Review は、Reviewer、Review Coverage、Finding Critic、Semantic Precision、Review Resolution を段階的に分離しています。Feedback、Judgment Promotion、Review Evolution も別責務として扱います。

一方、AI 側の探索・レビュー・検証能力が増えるほど、raw output をそのまま人間へ渡した場合の読解・判断コストも増える。

本 ADR が扱う問題は「文章を短くすること」ではない。

```text
machine-side complexity
        ↓
review / validation / synthesis
        ↓
human-facing projection
        ↓
human decision
```

machine-side complexity の増加を human attention cost へ直接転嫁しないことが目的です。

## Existing ownership

本 ADR は既存の ownership を変更しない。

- finding discovery: Reviewer / Lens（参照のみ）
- evidence / schema / scope validity: Deterministic Verifier（参照のみ）
- finding truth / adversarial validation: Finding Critic（#1978、参照のみ）
- semantic disposition: Semantic Precision（#1857、参照のみ）
- review coverage / blind spots: Review Coverage（#2212、参照のみ）
- author / human handling + verification: Review Resolution（#2322 / ADR-011、入力として利用）
- human judgment / attention metrics: #1990（計測側の owner）
- repeated judgment promotion: #1568（後段）
- multi-run evolution: #1574（後段）
- human-facing projection principles: **本 ADR**（所有）

## Decision

### D1—AI Reasoning と Human Artifact を分離する

AI の探索過程、重複した分析、却下案、内部比較を Human-facing artifact へそのまま流さない。

Human-facing artifact は次へ最適化する。

- decision clarity
- information density
- actionability
- uncertainty visibility
- provenance traceability

これは hidden chain-of-thought の保存・表示を要求しない。

Human-facing artifact に必要なのは判断根拠と evidence であり、内部推論そのものではない。

### D2—Minimize human attention, not human visibility

Human Attention を減らすために finding の存在自体を隠してはならない。

```text
Visibility = complete
Attention = selective
```

特に以下は圧縮によって失ってはならない。

- blocking finding
- unresolved critical / major finding
- human decision required
- incomplete / partial coverage
- timeout / failure / unknown coverage
- verification uncertainty
- accepted risk / deferred state
- source provenance

### D3—Compression と Suppression を分離する

Compression は表示・優先順位・重複排除の projection です。

Suppression は finding semantics / policy の判断であり、本 ADR の責務外です。

```text
Compression != Suppression
Summary != SSoT
Projection != Judgment
```

Decision Surface が短くなっても、L2 / L3 の underlying state は失わない。

### D4—Human-facing output を 3 層へ分ける

```text
L1 — Decision Surface
     今、人間が判断・対応するもの

L2 — Resolution Summary
     finding / status / evidence / verification / coverage

L3 — Full Review Artifact
     完全な machine-readable evidence / provenance
```

#### L1 Decision Surface

最初に、人間が次に行う必要のある判断・対応を見せます。判断を妨げる uncertainty も明示します。

例:

```text
ACTION REQUIRED       2
HUMAN DECISION        1
AWAITING VERIFICATION 1
VERIFIED              5

Coverage:
1 review unit incomplete
```

L1 は全 finding の SSoT ではない。

#### L2 Resolution Summary

all findings の状態を追跡できる human-readable projection。

少なくとも以下を失わない。

- finding identity
- severity / system judgment when available
- author / human resolution
- verification state
- coverage / blind spot
- provenance link

#### L3 Full Review Artifact

既存 machine-readable artifact / sidecar / manifest を SSoT とする。

新しい Human Attention 専用 SSoT は作らない。

### D5—Organizer は deterministic projection のまま維持する

Human Attention 対策のために新しい LLM Judge / summarizer を mandatory path に追加しない。

Organizer は既存状態から表示カテゴリを導出するだけとする。

入力候補:

```text
findings
+ judgment
+ coverage
+ resolution
+ verification
```

出力候補:

```text
attention_required[]
awaiting_verification[]
completed[]
all_findings[]
blind_spots[]
```

Organizer は次を行わない。

- finding を新規発見しない
- severity を再評価しない
- disposition を生成しない
- finding truth を再判定しない
- GO / NO-GO を所有しない
- merge / release を判断しない

### D6—Attention Budget を固定文字数へ還元しない

「500文字以内」「top 3 だけ」などの hard character / item limit を runtime contract にしない。

固定制限は、重要 finding や uncertainty の欠落を最適化してしまうためです。

評価対象は decision-relevant information density とする。

例として、Human が短時間で以下を回答できるかを eval できる。

- What changed
- What requires action
- What requires human judgment
- What is uncertain
- What is awaiting verification

これは runtime gate ではなく eval rubric として扱う。

### D7—Human Attention metrics は #1990 を再利用する

本 ADR は独自 metrics schema を新設しない。

最低限の観測候補:

- human attention seconds
- human intervention count
- findings presented
- findings auto-resolved
- time to human required

計測不能値を 0 に変換しない。

```text
explicit measurement
or bounded approximation
or null
```

を許容する。

### D8—Attention reduction 単独では成功と判定しない

Human Attention の減少と safety / visibility を同時に評価する。

採用条件の方向性:

```text
Human Attention decreases

AND

Critical/Major visibility >= baseline
False suppression = 0
Provenance loss = 0
Incomplete coverage visibility = 100%
Human reverse rate <= baseline
```

単に読ませる量が減っただけでは成功ではない。

### D9—PR comment / Markdown は projection のまま

ADR-011 D5 を継承する。

- PR comment は SSoT にしない
- canonical `<!-- river-review -->` marker を再利用する
- Decision Surface 専用の top-level summary comment を増やさない
- rerun は既存 comment を idempotent に更新する

### D10—PlanGate への適用は River Review の dogfood 後に行う

PlanGate 側では Human Attention Architecture を「生成原則」として適用できる。

候補原則:

> Think deeply. Materialize selectively. Optimize the artifact for human decision-making.

ただし s977043/PlanGate#1337 が #1335 の paired evaluation を実施中であるため、その candidate SHA を汚染してはならない。

順序を固定する。

```text
River Review Decision Surface
        ↓
River Review dogfood / eval
        ↓
PlanGate #1337 result fixed
        ↓
PlanGate Human Decision Surface candidate
        ↓
separate paired evaluation
```

## Consequences

### Positive

- Reviewer を増やしても human-facing output の複雑度を線形増加させない
- Human が「今何をすべきか」を先に判断できる
- all-findings visibility と compact summary を両立できる
- #2322 Review Resolution の Organizer 責務と整合する
- #1990 の Human Attention metrics を再利用できる
- 新しい Judge / Gate / schema を増やさずに開始できる

### Costs

- L1 / L2 / L3 の整合性テストが必要になる
- projection category の deterministic mapping を明文化する必要がある
- attention reduction と information loss を別々に評価する必要がある
- #2322 の Resolution / Verification が未到達な箇所では、利用可能な既存状態だけで fail-safe に投影する必要がある

## Required invariants

Phase 1 以降は最低限、以下を contract test で固定する。

1. blocking finding が Decision Surface から消えない
2. unresolved critical / major が hidden にならない
3. partial / timeout / unknown coverage が明示される
4. top-N 外 finding も L2 / L3 に残る
5. Organizer が upstream judgment 不在時に独自 judgment を生成しない
6. dedupe 後も source provenance を維持する
7. summary shortening で unresolved finding count が変わらない
8. Decision Surface と all-findings projection の件数関係が説明可能である
9. PR rerun で duplicate top-level comment を増やさない
10. attention metric 欠測を 0 と扱わない

## Rollout

### Phase 0—this ADR

- principle / ownership boundary
- no behavior change

### Phase 1—Decision Surface renderer

- JSON projection
- Markdown projection
- display-only change
- no judgment / gate change

### Phase 2—Organizer integration

- deterministic category mapping
- all-findings visibility
- blind spot / incomplete coverage projection

### Phase 3—Human Attention metrics

- #1990 reuse
- no independent metrics subsystem

### Phase 4—Dogfood / evaluation

River Review 自身の 10〜20 PR 程度から開始する。

比較:

```text
current summary
vs
Decision Surface
```

primary metrics:

- human attention seconds
- human intervention count
- time to human required
- decision extraction success

safety metrics:

- missed critical / major
- false suppression
- human reverse
- provenance loss
- incomplete coverage visibility

### Phase 5—Learning loop

確定結果だけを既存 loop へ接続する。

```text
Decision
  ↓
Resolution
  ↓
Verification
  ↓
Feedback proposal
  ↓
#1568 Judgment Promotion
  ↓
#1574 Review Evolution
```

### Phase 6—PlanGate follow-up

PlanGate#1337 完了後に別 candidate として評価する。

## Non-goals

- 新しい Judge Agent
- 新しい Gate
- 新しい semantic disposition
- hidden CoT の保存
- 全 reasoning trace の Human 表示
- hard character limit
- top-N だけを唯一の表示とすること
- critical / major finding の非表示
- Review Artifact の mutable 化
- PR comment の SSoT 化
- auto merge / release
- automatic Skill / Rule promotion
- #1990 / #2322 / #1568 / #1574 の再実装

## Rejected alternatives

### A. LLM summarizer を新しい必須レイヤにする

却下。

新たな semantic judgment と nondeterminism を Human-facing safety path に追加するため。

### B. top 3 finding だけ表示する

却下。

attention reduction と visibility reduction を混同し、未解決 finding を隠すため。

### C. 固定文字数で summary を制約する

却下。

重要度ではなく長さを最適化するため。

### D. Human Attention 専用 schema / memory を作る

却下。

Issue `#1990` / `#2322` / existing artifacts と責務が重複するため。

## References

- #2368—Human Attention Architecture
- #2322—Review Resolution Loop
- ADR-011—Review Resolution Loop
- #1990—Human Judgment Learning Loop
- #1857—Semantic Precision
- #1978—Finding Critic
- #2212—Review Coverage
- #1568—Judgment Promotion
- #1574—Review Evolution
- s977043/PlanGate#1335—Plan Design Principles
- s977043/PlanGate#1337—paired evaluation
