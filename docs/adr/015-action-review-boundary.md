# ADR-015: Action Review Boundary — Action / Artifact / Verification の分離

## Status

Accepted for Phase 0 of #2545.

本 ADR は責務境界だけを固定します。
runtime behavior、Gate semantics、merge / release authority は変更しません。

## Context

AI エージェントが実装だけでなく、command、network、repository write、deployment などの action を実行するようになると、
「成果物が良いか」と「この action を今実行してよいか」は別の判断になります。

OpenAI Auto-review は、Main Agent と action reviewer を分離し、権限境界を越える action を実行前に評価する設計例を示しています。
deny 後は同じ結果を workaround で迂回せず、より安全な代替経路か Human escalation へ進みます。

River Review には #1812 Judgment Placement、ADR-013 Evidence Architecture、Reviewer Independence、
Finding verification、Gate / enforcement adapter が既にあります。

ここへ Action Review を曖昧に足すと、次の責務が混ざります。

```text
Action Review
  = proposed action を実行してよいか

Artifact Review
  = plan / design / diff / report 等の成果物が妥当か

Verification
  = finding / claim / behavior / evidence が成立するか
```

この 3 層は相互に代替できません。

## Decision

### D1. Action Review / Artifact Review / Verification を別の責務として扱う

River Review の中核責務は Artifact Review と Verification です。

Action Review は review material や recommendation を生成する対象になり得ます。
一方、permission broker、sandbox manager、command executor の権限は River Review core に持ち込みません。

```text
Proposed Action
      ↓
Action Review material / recommendation
      ↓
Caller / PlanGate / Host policy
      ↓
allow | deny | escalate
      ↓
Execution authority
```

Artifact Review と Verification は実行許可を意味しません。
Action Review の allow も、成果物の品質保証を意味しません。

### D2. Execution と Judgment を分離する

Action を実行したい主体と、その action を評価する主体は論理的に分離します。

```text
Executor != Reviewer
Execution != Judgment
```

Reviewer Independence が利用可能な場合は、その evidence を再利用できます。
ただし別 execution ID であることは、別 actor / model / provider / process を証明しません。

Action Reviewer 自身が「独立している」と自己申告した情報だけを trust root にしません。

### D3. deny は同一結果の迂回許可ではない

deny を受けた consumer は、同じ結果を別 tool や別 command で達成するだけの workaround を
自動的な safer alternative と見なしません。

許可する recovery は、policy 上のリスクを実質的に下げるものに限定します。

```text
DENY
  ↓
reason / evidence
  ↓
materially safer alternative exists?
  ├─ yes -> policy が許す範囲で retry
  └─ no  -> Human / re-plan / stop
```

River Review は recovery を実行しません。
retry / stop / escalation の実行責務は Caller / PlanGate / Host に残します。

### D4. Review loop には circuit breaker contract が必要

Action Review を consumer が retry loop に組み込む場合、無制限反復を禁止します。

consumer は最低限、次を policy として定義します。

- consecutive denial threshold
- rolling-window denial threshold または retry budget
- stop reason
- escalation target
- reopen condition

具体的な閾値は risk、host、action class に依存します。
River Review core は universal threshold を hard-code しません。

閾値到達時は fail-open で実行せず、stop / escalation を優先します。

### D5. Judgment input は observable evidence を使う

Action Review の入力は、監査可能な情報を基本とします。

例:

- user intent
- proposed action
- tool / command class
- target resource
- policy context
- relevant tool result
- prior allow / deny result
- structured execution evidence

hidden chain-of-thought や raw private reasoning は要求しません。
secret や credential の全文保存も要求しません。

### D6. Human authority boundary を維持する

River Review の output は判断材料です。

次の authority は既存どおり Caller / PlanGate / Host / Human に残します。

- privileged action の実行許可
- production promotion
- merge / release
- irreversible operation
- policy override
- Human Judgment が必要な例外承認

既存 Gate は recommendation / enforcement adapter の意味を維持します。
この ADR により Gate が execution authority を獲得することはありません。

## Ownership matrix

| Layer | Primary owner | River Review |
| --- | --- | --- |
| Action Review | Caller / PlanGate / Host policy + reviewer | material / recommendation |
| Artifact Review | River Review | owner |
| Finding / claim Verification | River Review verifier / critic | owner |
| Retry / stop / escalation | Caller / PlanGate / Host | evidence provider only |
| Privileged execution | Host | none |
| Merge / release | Human / repository policy | none |

## Relationship to Judgment Placement

Judgment Placement と Action Review Boundary は別の軸です。

Judgment Placement は「判断をどの評価層へ置くか」を決めます。

```text
Deterministic
Heuristic
Agentic Review
Human Judgment
```

Action Review Boundary は「何について判断しているか」を分けます。

```text
Action
Artifact
Verification
```

たとえば Action Review 自体も deterministic / heuristic / agentic / human のいずれかへ配置できます。
高リスク action は Human Judgment を要求できます。

## Failure modes

### 1. Allow = correctness と誤認する

Action Review が allow でも、Artifact Review / Verification は別途必要です。

### 2. Verification = permission と誤認する

finding が正しいと検証できても、その修正 action の実行許可を自動的に意味しません。

### 3. deny 後に tool を変えて同じ action を行う

policy circumvention として扱います。
materially safer でない代替は retry 対象にしません。

### 4. Reviewer が自己発行した identity を独立性証拠にする

self-attestation になります。
host-owned provenance や外部 trust evidence を優先します。

### 5. review loop が収束しない

circuit breaker がない retry loop は禁止します。
閾値到達後は Human / re-plan / stop へ移ります。

## Rollout

Phase 0 は docs-only です。

次の条件を満たす concrete consumer が出るまで、新しい runtime Action Review engine を追加しません。

1. existing Gate / policy surface では表現できない action boundary がある
2. producer と consumer の ownership が明確である
3. allow / deny / escalate の semantics が testable である
4. fail-safe と circuit breaker が fixture で検証できる
5. Human / Host authority を増減させない

## Consequences

### Positive

- Action permission と成果物品質を混同しない
- Reviewer Independence を action authority と誤解しない
- deny loop の迂回と無限 retry を設計段階で防ぐ
- provider 固有の sandbox 実装を River Review core に持ち込まない
- Human authority を維持したまま Action Review を将来統合できる

### Trade-offs

- Action Review の実行 policy は River Review 単体では完結しない
- Caller / PlanGate / Host 側に retry / stop / escalation contract が必要になる
- host ごとの risk policy を共通化しすぎない設計判断が必要になる

## Non-goals

- OpenAI Auto-review の実装複製
- permission broker / sandbox manager の実装
- 全 tool call の同期レビュー
- hidden chain-of-thought の取得
- circuit breaker 閾値の universal hard-code
- automatic merge / release / production promotion
- #1978 Finding verification の再実装
- #1760 Reviewer Independence の再実装

## References

- #2545 — Action Review Boundary
- #1812 — Judgment Placement
- #1760 — Reviewer Independence
- #1978 — Finding verification
- #2322 — Review Resolution Loop
- ADR-013 — Evidence Architecture
- OpenAI, “Auto-review of agent actions without synchronous human oversight”
  - https://alignment.openai.com/auto-review/
