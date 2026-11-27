# Agent Contract（logical Agent の契約）

River Review の Agent を runtime primitive から切り離し、論理的な責務として宣言するための契約です（#2014 / Epic #2011）。

- 契約スキーマ: `schemas/agent-contract.schema.json`
- adapter マッピングのスキーマ: `schemas/agent-adapter-map.schema.json`
- 契約の実体: `agents/contracts/*.agent.json`（5 本）と `agents/contracts/adapter-map.json`
- 検証: `tests/agent-contract.test.mjs`

Skill は「何を判断するか」、Agent は「誰が責任を持つか」、Flow は「いつ・どう判断を実行するか」を担います。本契約は Agent 軸だけを定義し、判断基準は `skills/**` と `docs/review/**` に残します。

> 注意: `agents/spec/agent.schema.json` は「AI Agent Knowledge Pack」を記述する別体系のスキーマであり、本契約とはフィールド構成が異なります。両者を混同しないでください。

## 用語の 3 軸

| 軸            | 語彙の SSoT                                             | 例                      |
| ------------- | ------------------------------------------------------- | ----------------------- |
| logical Agent | `schemas/agent-contract.schema.json` の `agentId`       | `consistency-judge`     |
| reviewer lens | `REVIEWER_ROLES`（`src/lib/reviewer-orchestrator.mjs`） | `bug-hunter`            |
| lens skill    | `skills/agent-skills/river-review-*`                    | `river-review-security` |

この 3 つは別軸です。#2013 の Flow スキーマは `reviewer:` に lens role のみを受理し、`agent:` キーを本契約の語彙のために予約しています。

## 5 つの Agent と既存実装の対応

| Agent                 | 責務                                            | 既存実装の有無 | 参照先                                                                                                                                                                                                                                      |
| --------------------- | ----------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `review-orchestrator` | resolve-intent / plan-execution / select-agents | 既存を参照     | `src/lib/reviewer-orchestrator.mjs`（`runReviewerOrchestration`）、`src/lib/review-mode-router.mjs`（`routeReviewMode`）                                                                                                                    |
| `specialist-reviewer` | generate-candidate-findings                     | 既存を参照     | `src/lib/reviewer-orchestrator.mjs`（`REVIEWER_ROLES`）、`src/lib/review-engine.mjs`（`generateReview`）                                                                                                                                    |
| `finding-verifier`    | verify-findings                                 | 既存を参照     | `src/lib/verifier.mjs`（`verifyFinding` / `resolveFindingScope`）                                                                                                                                                                           |
| `consistency-judge`   | judge-cross-artifact-consistency                | 新設           | 実装なし。既存 skill 6 本の合成として宣言する                                                                                                                                                                                               |
| `completion-judge`    | evaluate-completion                             | 部分既存       | `src/lib/gate-decision.mjs`（`deriveGateDecision`）、`src/lib/team-lead-synthesizer.mjs`（`synthesizeTeamLeadReport`）、`src/lib/qa-completion.mjs`（`createQaCompletionCapability`。どの呼び出し元からも未注入で、ADR-017 T12 で配線する） |

責務語彙は 1 つの Agent だけが所有します。重複と欠落はテストが機械的に検査します。

`specialist-reviewer` は lens ごとに Agent を分割せず、`instantiatedPer: reviewer-role` を宣言して reviewer lens ごとに実体化します。lens の台帳は `REVIEWER_ROLES` のままであり、スキーマ側へ複製しません。

## authority boundary

`authority` の 4 フィールドはスキーマ上 `const: false` です。契約ファイルを編集しても権限を付与できず、付与にはスキーマ変更というレビュー可能な行為が必要になります。

- `canModifySource`—レビュー対象のソースを書き換えない
- `canApproveMerge`—merge を承認しない。gate decision の導出は River Review、実行はホストの責務
- `canApproveRelease`—release を承認しない
- `canRewritePolicy`—自分が判断される側のポリシー（`.river/**` / `skills/**` / `docs/review/**`）を書き換えない

これは新規発明ではなく既存慣行の形式化です。`agents/river-review.md` は write 系ツールを宣言せず、`auto-approve` も merge 権限の委譲ではないと明記されています。さらに `.river/**` の変更は `src/lib/gate-decision.mjs` の bootstrap cliff により無条件で ESCALATE されます。

## adapter マッピングと judgment 差の遮断

判断に関わる宣言（responsibilities / inputs / outputs / skills / authority）は契約側にだけ置き、runtime 固有の情報は `agents/contracts/adapter-map.json` に分離します。この分離により「adapter 差が judgment 差へ漏れない」を検査可能にしています。

| 項目                  | Claude                                                    | Codex                                   |
| --------------------- | --------------------------------------------------------- | --------------------------------------- |
| agent primitive       | native subagent（`agents/river-review.md`）               | 無し（manifest に `agents` キーが無い） |
| 共通サーフェス        | `skills/agent-skills/`                                    | `skills/agent-skills/`                  |
| capability の実測値   | `tools: Read, Grep, Glob, Bash`                           | `interface.capabilities: ["Read"]`      |
| 中立名での capability | read-artifact / read-source / search-source / run-command | read-artifact / read-source             |

5 本の契約が要求する capability は両 runtime の積集合（read-artifact / read-source）に収まります。テストは積集合を adapter マップから計算して検査するため、片方にしか無い capability を判断の前提に格上げできません。

fallback の語彙は `not-needed` / `skill-only` / `escalate` の 3 つです。`skill-only` は agent primitive を持たない runtime で共通 skill サーフェスが Agent を担うことを意味し、配送手段だけが変わります。「判断を縮小して続行する」を表す値は意図的に存在しません。

## unknown / missing Agent の fail-safe

- 未知の Agent id はスキーマの閉じた enum で load 時に reject される
- 実行できない Agent は `onUnavailable` に従い `stop` か `escalate` へ倒す。省略時は `escalate`
- どちらの値も安全側であり、Agent が出力を返したかのように続行する経路は無い

## Agent 増殖ルール

1. Agent 軸を増やす前に、まず lens skill か reviewer lens として表現できないかを検討する
2. 新しい観点の追加は lens 側で行う。lens を増やしても Agent は増えない
3. Agent を増やせるのは、既存 5 責務のいずれとも重ならない責務が必要な場合だけである
4. 追加は `agentId` enum の変更を伴う。契約ファイルを置くだけでは検証が通らない
5. 追加時は責務の非重複と `implementedBy` の実在をテストで示す

## 検証

```sh
node --test tests/agent-contract.test.mjs
```

契約ファイルが宣言する skill id と `implementedBy` のパス・シンボルは、実在をテストが確認します。issue 本文の例示に登場する `traceability-coverage` のように本リポジトリへ存在しない skill を契約へ書くと、この検査で落ちます。
