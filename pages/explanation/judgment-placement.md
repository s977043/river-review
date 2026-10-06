---
id: judgment-placement
title: Judgment Placement（レビュー判断を適切な層へ配置する）
---

River Review は、レビューを PR 上の単一工程としてではなく、**判断を適切な評価層へ配置する分散した判断システム**として扱います。

この設計原則を **Judgment Placement** と呼びます。

> レビューの目的は、人間がすべてのコードを読むことではありません。  
> 判断を、最も再現可能・効率的・信頼できる層へ置き、人間には機械化できない責任ある判断を残すことです。

Judgment Placement は、River Review の中核思想である [Review Judgment as Code](./concept.md) を、**どこで実行するか**という観点から補完します。

## なぜ Judgment Placement が必要か

AI によって実装速度が上がると、人間がすべての差分を同じ深さで読む運用はスケールしません。一方で、人間レビューを単純に減らすだけでは品質と責任を維持できません。

必要なのは、「レビューをする / しない」という二択ではなく、レビューが担っていた責務を分解することです。

たとえば次の判断は、同じ方法で扱う必要がありません。

- 型エラーがないか
- 依存方向がアーキテクチャ規約に従っているか
- 一時対応コメントに撤去条件があるか
- Plan と Diff の意図が一致しているか
- 並行する変更と責務が競合していないか
- 認証境界の変更を受け入れてよいか

これらをすべて LLM レビューや人間レビューへ寄せると、コスト・再現性・説明可能性が悪化します。

Judgment Placement では、判断の性質に応じて評価層を選びます。

## 4つの判断層

4 層と判断ステップの定義は、本ページを SSoT とします。他ページでは要約とリンクにとどめます。

```text
Can it be proven?
  ↓ yes
Deterministic

Can it be reliably detected by explicit rules?
  ↓ yes
Heuristic

Does it require semantic or contextual judgment?
  ↓ yes
Agentic Review

Does it require responsibility or value judgment?
  ↓ yes
Human Judgment
```

- **Deterministic** — 機械的に証明・検査できる事実。例: type / test / schema / dependency boundary / architecture test
- **Heuristic** — 明示ルールで高精度に兆候を検出する。例: temporary code / suspicious pattern / known smell
- **Agentic Review** — 複数 Artifact や意味理解が必要な判断。例: Plan-Diff 整合、設計意図、責務、semantic conflict
- **Human Judgment** — 責任・価値・不可逆性を伴う最終判断。例: security boundary、個人情報、課金、不可逆 migration、事業妥当性

### 原則: 安くするのではなく、適切な層へ移す

Judgment Placement は「何でも deterministic にすればよい」という原則ではありません。

判断をより決定論的な層へ移すのは、**同等以上の安全性・説明可能性・保守性を維持できる場合だけ**です。

たとえば「この依存方向は禁止」は architecture test へ移せます。一方、「この変更でこの責務を新しい層へ移す設計判断は妥当か」は、単純な regex や dependency rule だけでは扱えません。

同様に、人間の責任が必要な判断を AI verdict で置き換えません。

## River Review での実装対応

River Review はすでに Skill の `evaluationType` として次の評価層を持ちます。

- `deterministic`
- `heuristic`
- `agentic`

各値の定義とスキーマ上の扱いは [スキルスキーマ概要](../reference/skill-schema.md) を参照してください。

Judgment Placement は新しい並立エンジンを作るものではなく、既存の評価層と Human Judgment Focus を同じ設計原則で接続します。

```text
Review Judgment
      ↓
Judgment Placement
      ↓
┌────────────────────────────────────┐
│ Deterministic                      │
│ Heuristic                          │
│ Agentic Review                     │
│ Human Judgment                     │
└────────────────────────────────────┘
      ↓
Finding / Evidence / Verdict
      ↓
Caller / Human
```

River Review は Findings / Evidence / Verdict を提供します。GO / NO-GO、反復、停止、承認、merge は Caller / PlanGate / Human の責務です。

## Action Review は成果物レビューと分ける

AI エージェントが command、repository write、network、deployment などを実行する場合、
「その action を実行してよいか」と「生成された成果物が妥当か」は別の判断です。

River Review では、次の 3 層を混同しません。

```text
Action Review
  = proposed action を今実行してよいか

Artifact Review
  = plan / design / diff / report 等が妥当か

Verification
  = claim / behavior / evidence が成立するか
```

Artifact Review と Verification は River Review の中核責務です。
Action Review は判断材料を提供できますが、permission broker や execution authority は Caller / PlanGate / Host / Human に残します。

Action Review 自体も Judgment Placement の対象です。
機械的な policy check は Deterministic、高文脈な risk judgment は Agentic Review、不可逆性や責任を伴う承認は Human Judgment へ配置できます。

deny 後は、同じ結果を別 tool で実現するだけの迂回を safer alternative と見なしません。
retry loop を持つ consumer は circuit breaker、stop reason、escalation target、reopen condition を明示します。
具体的な閾値は host / risk policy に依存するため、River Review core では固定しません。

関連: [Issue #2545](https://github.com/s977043/river-review/issues/2545)

## レビュー判断を promotion する

Judgment Placement は固定された分類ではありません。

Agentic Review や Human Review で繰り返し同じ判断が発生し、その条件を安定して明文化できるようになった場合、より再現可能な層へ **promotion** できます。

```text
Repeated Human / Agentic Judgment
  ↓
Can the condition be made explicit?
  ├─ no  → keep as semantic / human judgment
  └─ yes
       ↓
Can it be checked deterministically?
  ├─ yes → test / schema / checker / deterministic gate
  └─ no  → heuristic rule / skill
```

これは「AI を賢くする」だけでなく、**判断をシステムへ埋め込み、次回から人間や LLM が気付かなくても守れる状態を増やす**ことを意味します。

Riverbed、fixture、evaluation、Review Evolution Cycle は、この promotion が実際に品質を上げたかを検証するために使います。

## Architecture Invariant の扱い

River Review は architecture checker 自体を再実装しません。

既存の checker、compiler、test、lint、dependency rule などが機械的に判定できる場合、それらを source of truth とし、River Review は結果を Evidence / Finding として正規化します。

```text
Architecture / Policy
      ↓
Existing deterministic checker
      ↓
Machine result
      ↓
River Review
      ↓
Finding / Evidence / Verdict
```

これにより、意味的な判断を LLM に任せつつ、破ってはいけない不変条件は「気付ける仕組み」ではなく「機械的に検査できる仕組み」へ移せます。

## Semantic Conflict と Agent Trajectory

AI 並行開発では、最終 Diff だけでは判断材料が不足します。

River Review では Judgment Placement の拡張対象として、次を検討します。

### Semantic Change Conflict Review

Git conflict がなくても、並行変更間で次のような意味的衝突が起こり得ます。

- duplicate responsibility
- ownership conflict
- contract divergence
- duplicated abstraction
- incompatible assumption
- rationale conflict

このうち機械的に確認できる contract / ownership 違反は deterministic / heuristic へ、責務や設計意図の衝突は Agentic Review へ配置します。

関連: [Issue #1813](https://github.com/s977043/river-review/issues/1813)

### Agent Trajectory Review

Builder Agent の最終成果物だけでなく、構造化された実行履歴から次をレビューします。

- repeated failure
- ignored error
- unverified completion
- plan deviation
- ineffective recovery
- claim / evidence mismatch

ただし hidden chain-of-thought や raw session transcript は要求しません。レビュー対象は、**何を行い、何が起き、何を根拠に完了と主張したか**という監査可能なイベントです。

関連: [Issue #1814](https://github.com/s977043/river-review/issues/1814)

## Human Judgment との関係

Judgment Placement の目的は Human Review をゼロにすることではありません。

人間の注意力を、機械的に処理できる定型確認から、次のような判断へ移します。

- 事業価値と要求の妥当性
- セキュリティ境界
- 個人情報・課金
- 不可逆な変更
- 長期的なアーキテクチャ責任
- 複数の妥当な選択肢から何を選ぶか

Judgment Placement と、リスク階層型の監督（崖 / 丘 / 原っぱ）は直交する 2 軸です。前者は個々のレビュー判断を性質で分類し、どの評価層が実行するかを決めます。後者は変更そのもののリスクで分類し、人間監督の重さ（gateDecision）が決まります。2 軸が交わるのは Human Judgment と崖であり、Human Judgment へ配置した判断を含む変更は崖として扱い、人間承認を必須とします。逆に崖の変更でも、検出と判断材料の提示は Deterministic / Heuristic / Agentic Review が担います。

リスク階層の詳細は [Human Judgment Focus](./human-judgment-focus.md) を参照してください。

## 判断基準

新しいレビュー観点を追加するときは、次の順に検討します。

1. **既存の compiler / test / linter / checker で検査できないか**
2. **決定論的な rule / schema / command で検査できないか**
3. **heuristic detector で高精度に候補抽出できないか**
4. **複数 Artifact の意味理解が必要なら Agentic Review にする**
5. **責任・価値・不可逆性を伴うなら Human Judgment を残す**
6. **運用結果を Riverbed / fixture / eval へ戻し、配置が適切だったか再評価する**

## Non-goals

Judgment Placement は次を目的としません。

- コードレビューをゼロにすること
- Human approval を AI で置き換えること
- すべての判断を deterministic にすること
- architecture checker / linter / test runner を River Review 内に再実装すること
- semantic judgment を単純な regex へ落とすこと
- provider 固有の Agent 実行基盤へ River Review を依存させること

## まとめ

River Review のレビュー判断は、すべて同じ実行方法を取る必要はありません。

**Review Judgment as Code が「何を判断するか」を資産化する考え方なら、Judgment Placement は「その判断をどこで実行するか」を設計する原則です。**

人間・AI・ルール・テストを競合させるのではなく、それぞれが最も得意な判断を担当させることで、AI 支援開発の速度が上がっても判断品質を維持できる状態を目指します。

## 関連ページ

- [コンセプト](./concept.md) — Review Judgment as Code と Core Mechanism の全体像
- [Human Judgment Focus](./human-judgment-focus.md) — 人間監督・リスク階層・責任境界の詳細
- [設計哲学](./design-philosophy.md) — 設計原則とリスク階層型の人間監督
- [スキルスキーマ概要](../reference/skill-schema.md) — `evaluationType` を含むスキルメタデータのリファレンス
