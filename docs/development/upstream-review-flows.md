# Upstream Review Flows（実装前の 4 レビュー）

実装着手より前に行う 4 つのレビューを Flow として定義しました（#2017 / Epic #2011 Phase 6）。

- Flow スキーマ: `schemas/flow.schema.json`（#2013 が所有。本 Issue では変更しない）
- Flow の実体: `flows/research-review.flow.json` ほか 3 本
- entry map の実体: `flows/entry-map.json`（#2016 の 4 入口へ追記）
- 検証: `tests/flow-definitions.test.mjs` の `upstream review Flow definitions (#2017)`
- 前提となる 4 つの core Flow: `docs/development/flow-contract.md`（#2016）
- 入口を起動する trigger registry と host 別の発火表面: [trigger-host-capability-matrix.md](./trigger-host-capability-matrix.md)（#2054 PR-1）

Skill は「何を判断するか」、Agent は「誰が責任を持つか」、Flow は「いつ・どう判断を実行するか」を担います。本ドキュメントは Flow 軸だけを説明し、判断基準は `skills/**` と `docs/review/**` に残します。

## 4 つの Flow

| Flow id               | purpose                  | 問い                                                   | 入口名                |
| --------------------- | ------------------------ | ------------------------------------------------------ | --------------------- |
| `research-review`     | `research-adequacy`      | この調査結果を要件・設計・計画の根拠として使ってよいか | `review-research`     |
| `requirements-review` | `requirements-soundness` | この要件から設計・実装へ進んでよいか                   | `review-requirements` |
| `design-review`       | `design-soundness`       | この設計から実装へ進んでよいか                         | `review-design`       |
| `technical-review`    | `technical-viability`    | 宣言された技術的前提は Evidence 上成立するか           | `review-technical`    |

## Review Intent と stage enum の additive 拡張

上流 4 本も core Flow（#2016）と同じく `flows/intents/*.intent.json` を伴います。

| Flow id               | Review Intent                                      | `stage`        | `phase`    |
| --------------------- | -------------------------------------------------- | -------------- | ---------- |
| `research-review`     | `flows/intents/research-adequacy.intent.json`      | `research`     | `upstream` |
| `requirements-review` | `flows/intents/requirements-soundness.intent.json` | `requirements` | `upstream` |
| `design-review`       | `flows/intents/design-soundness.intent.json`       | `design`       | `upstream` |
| `technical-review`    | `flows/intents/technical-viability.intent.json`    | `technical`    | `upstream` |

`schemas/review-intent.schema.json` の `stage` は当初 `plan` / `replan` / `task-completion` / `final` の 4 値でしたが、上流 4 stage を追加して 8 値へ拡張しました。既存値には削除と改名のどちらも加えていないため additive であり、旧 enum で valid だった Review Intent は無改変のまま valid です。`research-review` の subject である汎用 `artifacts` は `schemas/agent-contract.schema.json` の `inputKind` に既存の値であり、`artifactKind` へ追加しても #2014 の語彙の部分集合という関係は保たれます。

`stage` と `phase` は別軸です。`stage` は「どの局面の問いか」を表し、`phase` は skill 選択の語彙（`schemas/skill.schema.json` の `$defs.phase`）です。上流 4 本は 4 つの異なる `stage` を持ちながら `phase` はいずれも `upstream` であり、片方から他方を導出できません。

Review Intent の `evidence[]` が機械化する内容に加えて、`tests/flow-definitions.test.mjs` は `inputs[]` と `steps[]` からも次を検査します。

- required input はちょうど 1 本であり、それが判断対象そのものである
- required input を持つ Flow は `DETERMINISTIC_UNRUNNABLE` を宣言する
- optional input は `when.state: present` + `onUnsatisfied: skip` で条件付けるか、Flow が `degrade` step を宣言する
- どの Flow も `verify-findings` を `derive-gate` より前に置く

## artifact 欠損時の stop / degrade / skip

| Flow                  | stop（欠損で停止） | degrade（縮退実行） | skip（当該 step のみ省略） |
| --------------------- | ------------------ | ------------------- | -------------------------- |
| `research-review`     | `artifacts`        | `requirements`      | `design` / `plan`          |
| `requirements-review` | `requirements`     | `tests`             | `design` / `plan`          |
| `design-review`       | `design`           | `requirements`      | `plan` / `diff`            |
| `technical-review`    | `design`           | `tests`             | `requirements` / `diff`    |

上表の内容は各 Review Intent の `evidence[].onMissing` と一致します。両者の一致は `tests/flow-definitions.test.mjs` が Flow の `inputs[]` と突き合わせて機械的に検査します。

`requirements-review` において `tests` が skip ではなく degrade を選ぶ理由は次のとおりです。テスト証跡の不在それ自体も testability の答えの一部であり、判断ごと省略してはならないためです。

## research の freshness / missing を事実と断定しない仕組み

Web 検索の内蔵は #2017 の Non-goal です。したがって「出典が古い」「出典が存在しない」の 2 つは、供給された artifact だけでは決着しません。`research-review` と `technical-review` はこの 2 つを次の順序で扱います。

1. `verify-findings`—artifact 内の何かを引用しない候補指摘は、この step を通過できない
2. `human-escalation`—artifact だけで決着しない問いは、verdict ではなく open question として人へ渡す
3. `derive-gate`—上記 2 step を通過したものだけが gate へ届く

`stopConditions` に `HUMAN_APPROVAL_REQUIRED` と `UNDETERMINED` を宣言しているため、決着しない問いは停止条件として表現されます。

この規律は `tests/flow-definitions.test.mjs` の `evidenceDisciplineViolations` が機械的に検査します。

- positive fixture: `tests/fixtures/flow/research-review-evidence-happy.json`
- negative fixture: `tests/fixtures/flow/research-review-asserts-freshness.json`

negative fixture はスキーマ的には valid です。`verify-findings` と `human-escalation` を落とし、freshness の主張を gate へ直行させます。

## 既存 Skill 再利用マトリクス

Flow 文書は skill id を 1 つも持ちません。到達は Flow -> Agent -> Skill の 2 ホップであり、2 ホップ目は #2014 の Agent Contract が持つ `skills` フィールドをそのまま使います。下表は「#2017 の各判断を、既存のどの資産が担うか」の棚卸しです。

### research-review

| 判断                | 担う既存資産                                           | 根拠                                                     |
| ------------------- | ------------------------------------------------------ | -------------------------------------------------------- |
| claim / source 対応 | `impact-evidence-coverage`（証拠充足の meta 評価）     | `skills/midstream/impact-evidence-coverage/SKILL.md:2`   |
| 参照の実在確認      | `hallucinated-reference`（code_search による実在検証） | `skills/midstream/hallucinated-reference/SKILL.md:2`     |
| fact vs inference   | `logic-torturing`（前提の検証・確証バイアス排除）      | `skills/midstream/logic-torturing/SKILL.md:2`            |
| alternatives        | `adr-decision-quality`（alternatives / tradeoffs）     | `skills/upstream/adr-decision-quality/SKILL.md:2`        |
| unresolved unknowns | `unknown-coverage-review`                              | `skills/agent-skills/unknown-coverage-review/SKILL.md:2` |
| primary / freshness | 既存資産では判定不能。Flow 側で escalation へ回す      | 本ドキュメント「事実と断定しない仕組み」節               |

### requirements-review

| 判断                     | 担う既存資産                                             | 根拠                                                  |
| ------------------------ | -------------------------------------------------------- | ----------------------------------------------------- |
| scope / 用語定義の有無   | `requirements-acceptance`                                | `skills/upstream/requirements-acceptance/SKILL.md:2`  |
| acceptance / testability | `requirements-acceptance` + reviewer lens `test-gap`     | `skills/upstream/requirements-acceptance/SKILL.md:2`  |
| 非機能 / 依存 / 未決     | `requirements-acceptance`                                | 同上                                                  |
| contradiction            | `self-contradiction`（宣言と実態の乖離。`**/*.md` 対象） | `skills/midstream/self-contradiction/SKILL.md:2`      |
| constraint conflict      | `logic-torturing`（前提が成立するか）                    | `skills/midstream/logic-torturing/SKILL.md:2`         |
| terminology conflict     | `bounded-context-language`（ただし設計文書のみ）         | `skills/upstream/bounded-context-language/SKILL.md:8` |
| feasibility              | `plangate-plan-integrity` ほか consistency-judge の集合  | `agents/contracts/consistency-judge.agent.json`       |

### design-review

| 判断                   | 担う既存資産                   | 根拠                                                      |
| ---------------------- | ------------------------------ | --------------------------------------------------------- |
| 境界 / 責務            | `architecture-boundaries`      | `skills/upstream/architecture-boundaries/SKILL.md:2`      |
| 決定のトレーサビリティ | `architecture-traceability`    | `skills/upstream/architecture-traceability/SKILL.md:2`    |
| リスク台帳             | `architecture-risk-register`   | `skills/upstream/architecture-risk-register/SKILL.md:2`   |
| 検証計画               | `architecture-validation-plan` | `skills/upstream/architecture-validation-plan/SKILL.md:2` |
| 用語 / コンテキスト    | `bounded-context-language`     | `skills/upstream/bounded-context-language/SKILL.md:2`     |
| 失敗シナリオ           | `pre-mortem`                   | `skills/upstream/pre-mortem/SKILL.md:2`                   |

新しい巨大 Design Skill は追加しません。上記はすべて `select-skills` の既存経路から到達します。

### technical-review

| 判断           | 担う既存資産                    | 根拠                                                    |
| -------------- | ------------------------------- | ------------------------------------------------------- |
| library / 依存 | `external-dependencies`         | `skills/upstream/external-dependencies/SKILL.md:2`      |
| API / 互換性   | `api-versioning-compat`         | `skills/upstream/api-versioning-compat/SKILL.md:2`      |
| 連携契約       | `integration-contracts`         | `skills/upstream/integration-contracts/SKILL.md:2`      |
| performance    | `capacity-cost-design`          | `skills/upstream/capacity-cost-design/SKILL.md:2`       |
| 運用 / SLO     | `operability-slo`               | `skills/upstream/operability-slo/SKILL.md:2`            |
| security       | `security-privacy-design`       | `skills/upstream/security-privacy-design/SKILL.md:2`    |
| 移行 / 撤退    | `migration-rollout-rollback`    | `skills/upstream/migration-rollout-rollback/SKILL.md:2` |
| Evidence 要求  | `verify-findings`（決定論実装） | `src/lib/verifier.mjs`                                  |

## 新 Skill を追加しない判断

Issue #2017 は `requirements-consistency` と `technical-feasibility` を新 Skill 候補として挙げていますが、本 Issue ではどちらも追加しませんでした。上表の棚卸しの結果、残余は 1 判断だけだったためです。

- `technical-feasibility`: 「成立するか」の領域別判断は上表の 7 資産が担い、「Evidence を要求する」規律は `verify-findings` が既に決定論で担う。したがって誰にも割り当たらない判断は残らない
- `requirements-consistency`: contradiction は `self-contradiction`、constraint conflict は `logic-torturing`、feasibility は consistency-judge の集合が担う。残余は「要件文書内の用語衝突」の 1 判断のみである

残余 1 件について、`bounded-context-language` は用語衝突の判断を既に実装していますが、`applyTo` が設計文書に限られます（`skills/upstream/bounded-context-language/SKILL.md:8`）。要件文書へ広げる最小の手当ては既存 skill の `applyTo` 拡張であり、新 Skill の新設ではありません。ただし `applyTo` の拡張は既存レビューの発火範囲を変える挙動変更であり、Flow 定義だけを扱う本 Issue の範囲外です。後続 Issue として扱います。

## observe mode

本 Issue は定義と配線と観測までであり、Flow の実行エンジンは含みません。#2016 の時点では `src/**` と `runners/**` のどのモジュールも `flows/` を読まない、という形で observe mode を `tests/flow-definitions.test.mjs` が固定していました。

Issue #2054 の PR-3 でこの固定を 1 モジュールだけ解除しました。`flows/` を読む runtime モジュールは `src/lib/flow-loader.mjs` **のみ**で、同テストは offenders がこの 1 件と一致することを検査します（2 件目の読み手は引き続き拒否されます）。loader は entry 名から Flow の pin と必須入力を返すだけで、severity / gate / skill 選択の判断を持ちません。利用面は `river review plan --entry <name>`（Beta）だけであり、`--entry` を付けない出力は解除前と同じです。既存の gate / decision / finding は 1 つも変わりません。詳細は [Runner CLI リファレンス](../../pages/reference/runner-cli-reference.md#entry-acceptance-scope)を参照してください。Flow の実行エンジンは引き続き後続です。
