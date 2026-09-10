# Core Review Entry Flows（4 つの入口 Flow）

River Review でもっとも利用頻度が高い 4 レビューを Flow として定義した最初の vertical slice です（#2016 / Epic #2011）。

- Flow スキーマ: `schemas/flow.schema.json`（#2013 が所有。本 Issue では変更しない）
- Review Intent スキーマ: `schemas/review-intent.schema.json`（本 Issue で追加）
- entry map スキーマ: `schemas/flow-entry-map.schema.json`（本 Issue で追加）
- Flow の実体: `flows/*.flow.json`（core 4 本 + #2017 の上流 4 本 = 計 8 本）
- Review Intent の実体: `flows/intents/*.intent.json`（本 Issue で core 4 本。#2017 の上流 4 本を加えて計 8 本）
- entry map の実体: `flows/entry-map.json`
- 検証: `tests/flow-definitions.test.mjs`
- 上流 4 Flow（#2017）: `docs/development/upstream-review-flows.md`。**本ドキュメントの表は core 4 Flow だけを載せる**。上流 4 入口を含む全 8 入口の正本は `flows/entry-map.json` であり、上流側の表は上記の別ドキュメントにある

Skill は「何を判断するか」、Agent は「誰が責任を持つか」、Flow は「いつ・どう判断を実行するか」を担います。本ドキュメントは Flow 軸だけを説明し、判断基準は `skills/**` と `docs/review/**` に残します。

## 配置規則

Flow の instance は `flows/` に置きます。ADR-009 D4 の表は runtime-independent 資産の置き場所を列挙していますが、Flow instance 用の行をまだ持ちません。#2014 が Agent Contract の instance を `agents/contracts/` へ置いた前例に倣い、Flow instance も軸ごとの top-level ディレクトリへ置きます。判断基準は 1 つも持たないため、D4 の「Review Judgment の正本を持つ」区分には入りません。

## 4 つの Flow

| Flow id                  | purpose             | 問い                                                    | phase      |
| ------------------------ | ------------------- | ------------------------------------------------------- | ---------- |
| `plan-review`            | `plan-readiness`    | この計画で安全に実行を開始できるか                      | upstream   |
| `replan-review`          | `replan-integrity`  | 計画変更は合理的で、上流の契約を壊していないか          | upstream   |
| `task-completion-review` | `task-completion`   | この Task を DONE と宣言できる Evidence があるか        | midstream  |
| `final-review`           | `final-convergence` | 全 Task の終了ではなく、Goal / Requirement を満たしたか | downstream |

## Review Intent（additive contract）

`schemas/flow.schema.json` の `intent` は `purpose` だけを受理する閉じたオブジェクトです。Review Intent はそのスキーマを変更せず、`purpose` を結合キーにした別文書として `stage` / `phase` / `subject` / `baseline` / `evidence` を宣言します。既存の Flow 文書は 1 文字も変わらないため、additive です。

`phase` は skill 側の語彙（`schemas/skill.schema.json` の `$defs.phase`）をそのまま再利用します。これにより Review Intent は既存の skill 選択経路（`runners/core/review-runner.mjs` の `selectSkills`）へ接続され、新しい routing 機構は増えません。

`stage` と `phase` は別軸であり、片方から他方を導出できません。`stage` はレビューの局面（`review-<stage>` 入口に対応）を、`phase` は skill 選択の段階を表します。実例として #2017 の上流 4 本は `stage` が 4 種類ある一方、`phase` はいずれも `upstream` です。`stage` の enum は #2017 の 4 stage を追加して 8 値へ拡張済みであり、既存値には削除と改名のどちらも加えていないため、旧 enum で valid だった Review Intent はそのまま valid です。

## missing artifact の degrade / stop

`evidence[].onMissing` が artifact 欠損時の挙動を明示します。語彙は Flow step の `onUnsatisfied` と同一の 3 値です。

| Flow                     | stop（欠損で停止）      | degrade（縮退実行） | skip（当該 step のみ省略） |
| ------------------------ | ----------------------- | ------------------- | -------------------------- |
| `plan-review`            | `plan`                  | `requirements`      | `design`                   |
| `replan-review`          | `plan` / `baseline`     | `requirements`      | なし                       |
| `task-completion-review` | `tasks` / `diff`        | `tests`             | `plan`                     |
| `final-review`           | `requirements` / `diff` | `tasks` / `tests`   | `baseline`                 |

規律は次のとおりです。

- `requirement: required` の artifact は `onMissing: stop` 以外を取れない（スキーマの `if/then` で強制する）
- stop を持つ Flow は `stopConditions` に `DETERMINISTIC_UNRUNNABLE` を宣言する
- `when.state: present` で条件付けた step は `onUnsatisfied: skip` を宣言する
- 上記 3 点は `tests/flow-definitions.test.mjs` が機械的に検査する

`tests` が欠けたとき `task-completion-review` が skip ではなく degrade を選ぶのは、「テスト証跡が無い」こと自体が問いへの答えの一部であり、判断ごと省略してはならないためです。

## Flow から既存 Skill への到達経路

Flow 文書は skill id を 1 つも持ちません。到達は Flow -> Agent -> Skill の 2 ホップで行い、2 ホップ目は #2014 の Agent Contract が既に持つ `skills` フィールドをそのまま使います。本 Issue は新しい専門 Skill を追加しません。

| step primitive          | 責務（Agent Contract）             | 担当 Agent            | Agent が宣言済みの skill                                                            |
| ----------------------- | ---------------------------------- | --------------------- | ----------------------------------------------------------------------------------- |
| `resolve-intent`        | `resolve-intent`                   | `review-orchestrator` | `river-review` / `review-team`                                                      |
| `select-skills`         | `plan-execution`                   | `review-orchestrator` | 同上                                                                                |
| `select-agents`         | `select-agents`                    | `review-orchestrator` | 同上                                                                                |
| `reviewer:` （lens）    | `generate-candidate-findings`      | `specialist-reviewer` | `river-review-*` 7 本（`instantiatedPer: reviewer-role`）                           |
| `cross-artifact-review` | `judge-cross-artifact-consistency` | `consistency-judge`   | `requirements-acceptance` ほか 6 本                                                 |
| `verify-findings`       | `verify-findings`                  | `finding-verifier`    | なし（`src/lib/verifier.mjs` の決定論実装）                                         |
| `evaluate-completion`   | `evaluate-completion`              | `completion-judge`    | `plangate-tdd-evidence` / `plangate-verification-audit` / `unknown-coverage-review` |

`resolve-artifacts` / `deterministic-check` / `compare-baseline` / `detect-semantic-drift` / `derive-gate` / `persist-artifact` は判断ではなく機構であり、Agent 責務へは写像しません。

## 入口の同一性（Claude Code / Codex）

`flows/entry-map.json` は利用者向けの入口名を Flow id と version へ束ねます。runtime による分岐を文書構造として持たないため、両 host が同じ入口から別 Flow へ落ちる余地がありません。入口の表面化（native subagent と skill のどちらを使うか）は `agents/contracts/adapter-map.json` の担当であり、本 map は関与しません。

| 入口名          | Flow id                  |
| --------------- | ------------------------ |
| `review-plan`   | `plan-review`            |
| `review-replan` | `replan-review`          |
| `review-task`   | `task-completion-review` |
| `review-final`  | `final-review`           |

入口 skill は新設せず、両 runtime で共有済みのエントリ skill（`skills/agent-skills/river-review/SKILL.md`）へ入口表を追記する形で配線します。エントリ skill は Flow id を引くだけであり、判断ロジックを持ちません。

## selection reason / provenance

選定理由は本 Issue で新設せず、既存の記録経路をそのまま使います。

- skill の採否理由: `selectSkills` が返す `skipped[]` の `{skill, reasons}`（`runners/core/review-runner.mjs`）
- reviewer lens の採否理由: `src/lib/reviewer-orchestrator.mjs` の role 解決と `plannerFallback`
- gate 理由コード: `GATE_REASON_CODES`（`src/lib/gate-decision.mjs`）。Flow の `stopConditions` は同じ語彙を再利用する

実行 1 回分を Plugin / Flow / Agent / Skill / Artifact / Policy として固定する Execution Manifest は #2015 の担当であり、本 Issue の時点では未マージです。したがって本 Issue は manifest へ書き出しません。

## observe mode

本 Issue は定義と配線と観測までであり、Flow の実行エンジンは含みません。`src/**` と `runners/**` のどのモジュールも `flows/` を読まないことを `tests/flow-definitions.test.mjs` が検査します。ただし #2054 PR-3 以降、`flows/` を読む runtime モジュールは `src/lib/flow-loader.mjs` のみであり、同テストは offenders がこの 1 件と一致することを検査します（#2103）。既存の gate / decision / finding は 1 つも変わらず、変えるにはこのテストを明示的に書き換える必要があります。

## 実行エンジン（P1 骨格、Epic #2011 AC7）

`src/lib/flow-runner.mjs` の `executeFlow({ document, capabilities, inputs, judgment, mode })` は `resolveFlowEntry().document` を受け取ります。`steps[]` を index 順に歩き、1 step につき 1 record を返します。record の `outcome` は `executed` / `skipped` / `degraded` / `stopped` / `not-implemented` の閉集合です。`skipped` / `degraded` / `stopped` は schema の `onUnsatisfied` 3 値（`skip` / `degrade` / `stop`、省略時は `stop`）にそのまま対応します。required input が `inputs` に無い場合は最初の step の前で停止し、`stopReason` は `GATE_REASON_CODES` から import した `DETERMINISTIC_UNRUNNABLE` です。capability の不在または失敗で停止した場合の `stopReason` は同じ語彙の `NOT_EXECUTED` です。runner 自身は `flows/` を読まず、判断語彙（severity / gate / 閾値）も持ちません。

`mode` は `observe`（既定）と `execute` の 2 値です。観測モードは「どの step が何を実行するはずだったか」を全 step で記録するためのモードであり、capability が注入されていない step を `not-implemented` として記録し停止しません。required input が欠けていても観測モードは `steps` を空にせず、全 step を Flow 順に `stopped`（reason: `required input missing: <names>`）で列挙します。実行モードは最初の step の前で停止し `steps: []` を返します。実行モードでは capability の不在と失敗も `onUnsatisfied` に従い、`stop` なら `stopped: true` で歩みを終えます。capability の例外はどちらのモードでも捕捉し、`reason` に `error.message` を記録します。`degrade` の step は capability に `{ degraded: true, reason }` を渡して dispatch します。

`judgment` は P4 のために予約した引数です。予約 primitive `derive-gate` は `judgment.deriveGate` が注入されたときだけ dispatch する設計であり、`capabilities` 経由では決して到達しません。P1 では未実装のため `derive-gate` は `not-implemented` のままです。`human-escalation` は常に記録のみです。
