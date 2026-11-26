# ADR-004 再参入条件 1・2 の検証対応表（QA 証拠）

ADR-017 を Accepted にする条件の 1 つ目「ADR-004 の再参入条件 1・2 の CI 検証が、入力の配線まで含めてマージされている」（`docs/adr/017-qa-evidence-intake.md:9`）を扱います。
条件の文言を観測できる形に落とし、どのテストで確かめるかを対応させます。

テストは `tests/adr-004-reentry-conditions.test.mjs` にあり、既存の `npm test`（`.github/workflows/test.yml`）で走ります。新しい CI ジョブは足していません。
表の結果と変異の結果は、配線の PR #2952 が入った main（`0e1645d8`）にこのブランチを合わせた状態で測ったものです。

## この文書を分けた理由

`docs/development/qa-evidence-contract.md` は QA 証拠の入力契約（欄の意味・上限・拒否の規則）の正本です。
この表は ADR-004 の条件とテストの対応であり、契約が変わらなくても配線やテストの変更で更新されます。
変更の理由が違う 2 つを 1 つの文書に混ぜないため、別の文書にしました。

## 前提にした解釈

ADR-017 D2（`docs/adr/017-qa-evidence-intake.md:73-98`）の次の 2 つの解釈で表を作っています。
どちらも ADR-017 の承認者が判断する事項で（`:85-90`）、2026-11-20 にリポジトリの持ち主（承認者）が承認しました（承認は PR #2934 の本文に記録）。
ADR-017 の Status（`:7-11`）は、この 2 つの承認を明示的に求めています。
承認を ADR-017 の本文へ反映すること（Status の更新）と、ADR-004 に注記を加えるかの判断は、`docs/adr/**` が崖（ADR-016）なので人間が行います。この文書は ADR の本文を変えません。

- 条件 1 は「registry 追加とスキーマ拡張」に加えて、QA 証拠を available にする入力の配線を含む
- 条件 2 の「`NO_REVIEW` へ退避」は、既存の入力不足の skip で skill が選ばれず、その理由が利用者の見る出力に残ることを指す。理由の文字列は `runners/core/review-runner.mjs` の `missingInputContexts`（`:86-91`）をもとに `:130-132` で作られる `missing inputContext: qaEvidence`

## 対応表

対象の skill は `qa-evidence-consistency`、実行は `river run <repo> --phase downstream` です。
API キーは使いません。LLM を呼ぶ経路は、プレースホルダの値を `OPENAI_API_KEY` に入れて計画を「キーあり」にし、`globalThis.fetch` を差し替えて、送られたプロンプトを記録するだけにしています。

| 条件 | ADR の文言                                         | 観測                                                                                                                                                                                         | テスト名                                                                                    | 結果   |
| ---- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------ |
| 1    | 入力が提供された場合のみ Pre-execution Gate を通過 | 監査で受理された証拠を `--qa-evidence` で渡すと、`Selected skills` に skill が出て、LLM へ送られたプロンプトに `### QA Evidence` 節と証拠の本体（目印の文字列）が入る                        | `accepted evidence goes from river run through the plan to the prompt the LLM receives`     | pass   |
| 1    | 同上（Prompt Compiler の経路）                     | `review.promptCompiler.mode: active` のとき、送られる compiled プロンプトにも同じ節と本体が入る                                                                                              | `with the Prompt Compiler active, the compiled prompt sent to the LLM carries the evidence` | pass   |
| 1    | 入力が無ければ通過しない                           | 拒否された証拠（JSON として読めない）では skill が `missing inputContext: qaEvidence` で skip され、どのプロンプトにも節と本体が入らない                                                     | `rejected evidence: the QA skill is skipped and no prompt carries the evidence`             | pass   |
| 1    | 同上                                               | 証拠なしでも同じ                                                                                                                                                                             | `none evidence: the QA skill is skipped and no prompt carries the evidence`                 | pass   |
| 2    | 視覚入力が無い環境で `NO_REVIEW` へ退避            | 証拠なしの既定の text 出力に `- qa-evidence-consistency: missing inputContext: qaEvidence` が出て、`Selected skills` には出ない                                                              | `the default text output lists the skip and its reason`                                     | pass   |
| 2    | 同上（理由が出力に残る）                           | `--output json --debug` では、stderr の `Skipped skills detail:` に同じ行が出る。stdout の JSON 成果物には skip の一覧が無い                                                                 | `--debug with --output json writes the skip and its reason to stderr`                       | pass   |
| 2    | 同上（キーなし）                                   | キーが無いと LLM 必須の skip が先に効き、CLI に出る理由は `LLM disabled: ...` になる。入力不足の理由は計画の層（同じリポジトリをキーありで `planLocalReview` した `plan.skipped`）で確かめる | `without an API key the CLI shows the LLM-only skip, and the plan layer the missing input`  | pass   |
| 2    | GitHub Action 経路など                             | Action 経路は未配線。`runners/github-action/action.yml` に QA 証拠の入力が無い                                                                                                               | なし（T12 で配線し、そのとき同じ観測のテストを Action 経路に足す）                          | 未検証 |

キーなしの行は、CLI からは入力不足の理由が見えないという事実を記録するものです。
キーなしの実行で利用者に見えるのは `LLM disabled` の skip で、QA の skill が選ばれない点は同じです。

## GitHub Action 経路

ADR-017 は条件 2 に GitHub Action 経路を含め（`docs/adr/017-qa-evidence-intake.md:78`）、Rollout で「理由は GitHub Action 経路の出力（review の成果物）に残る」ことを検証の対に挙げています（`:262`）。
現状の Action 経路には QA 証拠を渡す入力が無く、`action.yml` は崖（ADR-016）なので、この変更では触っていません。
Action 経路は T12 で配線し、そのとき次の 2 つを Action の成果物について足します。

- QA 証拠の無いとき: skill は選ばれず、その理由は review の成果物に残る
- QA 証拠のあるとき: skill は選ばれる

それまで、条件 2 の CI 検証はローカル CLI の経路についてだけ成立しています。

## 配線の各段を外す変異

配線を 1 段ずつ外し、`tests/adr-004-reentry-conditions.test.mjs` が落ちることを確かめました（落ちたテストの件数）。
どの変異でも、7 件のうち少なくとも 1 件が落ちました。

| 外した段                                                                                       | 落ちたテスト                             |
| ---------------------------------------------------------------------------------------------- | ---------------------------------------- |
| CLI → `planLocalReview`（`src/cli/commands/run.mjs` が `qaEvidence` を渡さない）               | 条件 1 の受理 2 件                       |
| `planLocalReview` が `qaEvidence` を available にしない（`src/lib/local-runner.mjs`）          | 条件 1 の受理 2 件                       |
| `runLocalReview` → `generateReview`（`qaEvidenceForReview` を通さない）                        | 条件 1 の受理 2 件                       |
| QA の skill を見分ける判定（`src/lib/utils.mjs` の `readsQaEvidence` が常に false）            | 条件 1 の受理 2 件                       |
| `generateReview` → 従来のプロンプト（`src/lib/review-engine.mjs`）                             | 条件 1 の受理（従来の経路）1 件          |
| `generateReview` → compiled プロンプト（同）                                                   | 条件 1 の受理（Prompt Compiler）1 件     |
| プロンプトの節（`src/prompt/sections.mjs` の `buildQaEvidenceSection` が常に空）               | 条件 1 の受理 2 件                       |
| 拒否された監査結果も skill の入力にする（`src/lib/qa-evidence.mjs` の `qaEvidenceSkillInput`） | 条件 1 の拒否 1 件                       |
| 計画の入力不足の判定（`runners/core/review-runner.mjs` の `missingInputContexts` が常に空）    | 条件 1 の拒否・なし 2 件、条件 2 の 3 件 |
| text 出力の skip 理由（`src/cli/render.mjs` の `printPlan`）                                   | 条件 1 の拒否・なし 2 件、条件 2 の 2 件 |
| `--debug` の skip 理由（同 `printDebugInfo`）                                                  | 条件 2 の `--debug` 1 件                 |

## 関連するテスト

- `tests/qa-evidence-skill-input.test.mjs`: 計画とプロンプトの層で、redaction、制限された path、`--reviewers` の経路、QA の所見を issues から外すことを確かめる
- `tests/cli-qa-evidence-intake.test.mjs`: 監査結果のファイル、`--context qaEvidence` を無視すること、出力先の検査、`review exec --plan` の再生を確かめる
