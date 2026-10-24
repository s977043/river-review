# ADR-016: リスク階層型の人間監督をリポジトリ運用へ適用する

## Status

Proposed

本 ADR は AGENTS.md / CLAUDE.md の承認境界を変える提案を含む。そのため、採択と各段階の着手はいずれも人間（メンテナ）の判断を要する（`CLAUDE.md:15` の Always ask）。

**読み方の前提**: ADR-003 の Non-Goal「auto-merge にはしない」（`docs/adr/003-risk-tiered-human-supervision.md:46`）は、**製品（River Review の Action / CLI）のスコープに限定して読む**。同項は「マージ / required check 化は host / branch protection の責務」と述べており、host 側の運用判断を禁じていない。本 ADR は、このリポジトリのメンテナが host として行うその判断を記録する。

## Context

ADR-003 は製品の責任境界を「リスク階層型の人間監督」（崖 / 丘 / 原っぱ）へ移した（`003:20-26`）。一方、AI エージェントが**このリポジトリ自体**を運用する際（編集・PR・マージ・リリース）の承認境界は、別々に定義されている。これらは階層の考え方に統合されていない。

- パス区分: Editable / Ask before editing / Never edit（`AGENTS.md:55-58`）
- 判断区分: Proceed autonomously / Ask before acting / Always ask（`CLAUDE.md:13-15`）
- マージ: 人間がマージ前チェックリストを実施する（`docs/governance.md` の「マージ前チェックリスト」節）。単独メンテナ体制ではレビュアーと PR 著者が同一アカウントになり、formal review を出せない。ラベルが唯一の阻止手段である（`docs/governance.md:104`, `:174`）
- 既存の自動マージ経路: `gh pr merge --auto` の使用は無い（`.claude/worktrees` と `node_modules` を除外して `.github` `.claude` `scripts` `docs` `src` を grep し、該当 0 件）。スクリプト化されたマージ経路は、人間が起動する `scripts/merge-chain.sh:358`（`gh pr merge --squash --delete-branch`）だけである
- gh アカウント: `.claude/hooks/gh-account-guard.sh` は gh の操作の前に `s977043` へ自動で切り替える（`CLAUDE.md` の gh active account guard）。つまり現状、エージェントは人間のアカウントの認証情報で動いている

2026-10-17 のセッションで次の摩擦が見つかった。【確認】は一次ソースで確認したもの、【観測（未検証）】は一次ソースで確かめていないものを表す。

1. 【観測（未検証）】PR ごとのマージ承認待ち（PR #2707 は確認後にマージ）
2. 【観測（未検証）】`runners/`・`docs/` 編集の ask-before 停止（区分の根拠は【確認】`AGENTS.md:56`）
3. 【確認】lockfile 規則の衝突: `AGENTS.md:49` は「手編集」を禁止し、`AGENTS.md:58` は「編集」を禁止する。一方 `CLAUDE.md:51` は、lock-file-only 422 のとき `npm install --package-lock-only` の結果を commit するよう指示する。両者の整理は方針変更であり、文言の統一ではない
4. 【観測（未検証）】`node_modules` の無い worker worktree で `tests/plugin-task-checkpoint-hook.test.mjs` が 4 件偽失敗。規律自体は【確認】`docs/development/worker-discipline-template.md:31`, `:77` にあり、`scripts/worker-bootstrap.sh` も存在する（同テンプレートの `:216`, `:271` が使用を指示）。問題は実行が強制されないこと
5. 【観測（未検証）】worker 間で共有 scratchpad が上書きされる
6. 【確認】`/preflight` は `.claude/commands/preflight.md` のコマンド定義だけで、スクリプトの実体が無い。【観測（未検証）】worker から実行できない
7. 【観測（未検証）】並行セッションの検知が手動

ADR-003 の自己批判（`003:13-14`）と同じ 2 つの失敗モードが、ここでも現れる。第一に、全件承認は形骸化する（1, 2）。第二に、無条件の自律は自己改変まで通してしまう。自己改変とは、設定・ガード・規則そのものの変更を指す。

## Decision

リポジトリ運用の承認境界を、製品と同じ語彙の 3 階層に再編する。崖の人間承認は一切緩めない。そのうえで、丘と原っぱで人間の注意を節約する。

| 階層                | 監督モデル                                                                                                           | マージの実行者                                                      |
| ------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| **崖（cliff）**     | 人間承認必須。PR ごとに人間が判断する                                                                                | 人間のみ                                                            |
| **丘（hill）**      | エージェントが PR 作成まで自律する。人間が digest からまとめてマージする。7 日未判断なら再掲してエスカレーションする | 人間（バッチ可）                                                    |
| **原っぱ（field）** | 許可リストに一致する PR は、エージェントが PR 作成まで自律する。digest と range review で事後監査する                | 段階 1: 人間。段階 2 以降: `tier-gate` が pass すれば auto-merge 可 |

### 強制の 2 段階

同一アカウントの PR では、崖の承認をサーバー側で強制できない（`docs/governance.md:104`, `:174`）。エージェントと人間が同じ認証主体で動く限り、GitHub 側では、ラベルや approve を付けたのが誰かを判別できない。そこで次の 2 段階で導入する。

#### 段階 1（本 ADR の採択時点）

- エージェントによるマージは、**階層を問わず全面禁止**とする。原っぱも例外にしない。
- PreToolUse hook は「どの経路でもエージェントのマージを止める補助」と位置づける。判断にラベルは一切参照しない。
- `tier-gate` チェックは advisory（ブロックしない）とし、階層を報告するだけにする。
- 段階 1 は ADR-003 rule 0 と同等の保証を**提供しない**。強制は運用ルールに依存する。

#### 段階 2（前提条件を満たした後）

- 前提条件（すべて満たすこと）:
  1. エージェントの実行環境が人間の認証情報を持たない。クラウド routine、または専用の OS ユーザーやコンテナで動かす。
  2. エージェント専用の GitHub App または machine user を用意する。権限は contents / pull-requests の write までとする。admin・変数・branch protection・ruleset の権限は与えない。作成はユーザーが行う外部作業である。
  3. エージェントの ID に `workflows` 権限が無いこと。この権限があると、エージェントは `.github/workflows/**` を書き換えた commit を push できる。
  4. 必須チェック `tier-gate` を、判定 workflow を実行する GitHub App の `app_id` で固定する（手順は `docs/governance.md:78-83`）。固定しないと、別の workflow や別の ID が同名の check を投稿して必須チェックを満たせてしまう。
  5. `gh auth switch`、`gh auth login`、`gh auth token` をエージェント環境で deny にする（崖）。
  6. 現行の `gh-account-guard.sh` は `s977043` へ自動で切り替える仕組みである。段階 2 では廃止するか、エージェント用アカウントを期待値とするよう見直す（崖）。
  7. 「エージェント環境から人間のトークンを取得できない」ことを sandbox で実走して確かめる。
- 承認の判定は branch protection の required reviews を**使わず**、必須チェック `tier-gate` 自身で行う。required reviews は全 PR に一律で効くため、原っぱまで承認必須になってしまうからである。
  - field: pass。
  - cliff / hill: 人間アカウントが **現在の head SHA** に対して approve していれば pass。reviews API で、レビュアーのアカウント・`state: APPROVED`・`commit_id == head SHA` を確認する。
  - approve の後に push があれば、その approve は無効とする（`require_last_push_approval` 相当）。後続の `CHANGES_REQUESTED` や dismiss された review も無効として扱う（`dismiss_stale` 相当）。
  - 条件を満たさない場合は fail ではなく pending（「人間待ち」）として報告する。
- `enforce_admins: true` は維持する。
- 段階 1 から段階 2 への移行は崖の変更である。

#### 段階 2 の未決設計: 承認後の再評価

approve が付いた時点で `tier-gate` を再評価する経路は、まだ決まっていない。`pull_request_review` イベントは PR head 側の workflow 定義で実行されるため、不変条件 1 に反する。そのため判定 workflow のトリガーには加えない。

候補として、権限を持たない stub workflow を置く案がある。stub は `pull_request_review` を受けて `repository_dispatch` または `workflow_run` を発火するだけにする。発火を受けた base 側の評価器が、PR 番号から改めて全入力を取得して判定する。stub は PR 側で書き換えられうるため、stub から渡された値は信用しない。この方式の採否と sandbox での実証は、段階 2 の着手前に人間が決める（実装計画 P2.5）。

#### 段階 2 で塞ぐべきマージ経路

hook では次のマージ経路をすべては塞げない。

- `gh pr merge`（`--auto` を含む）と `scripts/merge-chain.sh`
- `gh api -X PUT repos/{o}/{r}/pulls/{N}/merge`
- graphql の `mergePullRequest` と `enablePullRequestAutoMerge`
- `GH_REPO=` を前置した呼び出しと `env gh ...`
- `git push origin main`

そのため**強制はサーバー側で行う**。まず `tier-gate` を必須チェックにする。次に `main` への直 push を branch protection で禁じる。さらに、エージェントのアカウントに protection と admin の権限を与えない。hook は補助にとどめる。

### 判定 workflow の不変条件（信頼境界）

ADR-003 は、判定がエージェントの書き込み権限の外で導出されて初めて信頼できるとした（`003:39`）。本 ADR の階層判定も次を不変条件とする。

#### 実行定義

- **不変条件 1**: 起動は `pull_request_target`（opened / synchronize / reopened）と `merge_group` で行う。`pull_request_target` では、**base ブランチ上の workflow 定義**が実行される。PR が `tier-gate.yml` や判定器を書き換えても、その PR の判定には base 側の旧定義が使われる。書き換えそのものは rule 0 により崖と判定される。PR head 側の定義で動くイベント（`pull_request_review` など）からは、判定を直接実行しない。承認後の再評価は、段階 2 の未決設計（上記）として扱う。
- **不変条件 2**: checkout は base の SHA を明示する（`pull_request_target` では `github.event.pull_request.base.sha`、`merge_group` では `github.event.merge_group.base_sha`）。`persist-credentials: false` を付ける。PR のコードは checkout せず、実行もしない。
- **不変条件 3**: top-level は `permissions: {}` とし、権限はジョブ単位で付与する。判定ジョブは `pull-requests: read`、`contents: read`、`checks: write` を持つ。ラベルを更新する場合に限り、別ジョブで `pull-requests: write` を持たせる。
- **不変条件 4**: cache と `npm ci` は使わない。判定器は依存ゼロの Node スクリプトとする。
- **不変条件 5**: `${{ github.event.* }}` を `run:` 内に直接書かない。必ず `env:` 経由で渡す。
- **不変条件 6**: ファイル名を `$GITHUB_OUTPUT`、`$GITHUB_ENV`、ジョブサマリへ出すときはエスケープする。改行・`%`・制御文字を除去し、Markdown の特殊文字をエスケープする。
- **不変条件 7**: `merge_group` の PR 番号は、`blocked-label-guard.yml:85-103` と同じ方法で得る。`merge_group.head_ref` の `pr-<番号>-` から取り出し、取り出せなければ崖とする。
- **不変条件 8**: `concurrency` は付けない（`blocked-label-guard.yml` の concurrency の方針に倣う）。`paths:` フィルタも付けない。必須チェックが報告されずに止まる事態を避けるためである。
- **不変条件 9**: check-run の報告先 SHA はイベントごとに定める。`pull_request_target` では PR の head SHA（`github.event.pull_request.head.sha`）とする。`merge_group` では `github.event.merge_group.head_sha` とする。

#### 入力と判定

- **不変条件 10**: 変更ファイルは `GET repos/{o}/{r}/pulls/{N}/files?per_page=100` で全ページ取得する。PR の `changed_files` と取得件数を突き合わせ、一致しなければ崖とする。どのページの取得に失敗しても崖とする。files API の上限（3000 件）に達した場合も崖とする。
- **不変条件 11**: 判定入力は各ファイルの `filename`、`previous_filename`、`status`、`patch` の 4 つとする。
- **不変条件 12**: パスは判定前に正規化する。先頭の `./` を除去し、`..` を解決し、区切り文字を統一し、Unicode NFC に揃える。
- **不変条件 13**: `status` の既知値は `added`、`removed`、`modified`、`renamed`、`copied`、`changed`、`unchanged` の 7 つである。`renamed` と `copied` は、旧パスと新パスの階層の高い方を採る。`removed` は崖（rule 3）とする。未知の値は崖とする。
- **不変条件 14**: `patch` の欠落や解析不能、未分類のパスは崖とする（`003:40` の fail-safe 方向）。
- **不変条件 15**: `synchronize` のたびに再計算する。前回の判定結果は再利用しない。

### 判定規則

- **rule 0（自己改変は崖）**: 階層規則そのものと、判定・強制の仕組みを変える変更は無条件で崖とする。対象は判定器、判定 workflow、hook、settings、branch protection、保護対象一覧である。ADR-003 rule 0「`.river/**` は自らを unguard できない」（`003:30`）の類推である。段階 1 では運用ルールとして、段階 2 では必須チェックとして執行する。
- **rule 1（最大値）**: PR の階層は、変更ファイルの階層の最大値とする。
- **rule 2（原っぱは許可リスト）**: 明示的な許可リストに一致したものだけを原っぱとする。丘にも列挙されていないものは崖とする。
- **rule 3（削除は崖）**: ファイル削除と、`docs/development/guard-ledger.yaml` からのガード退役は崖とする。
- **rule 4（拡大はデータでのみ）**: 原っぱと丘の拡大は、拡大基準（実装計画 P4）を満たしたときに限る。拡大は崖の変更として行う。

### 階層表（初版）

#### 原っぱ（許可リスト・この 4 つだけ）

| 対象                                                                                                                                                     | 根拠                                                                                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `pages/**`。ただし `pages/reference/review-policy.md`（ja/en）、`pages/reference/stable-interfaces.md`、`pages/reference/stable-interfaces.en.md` を除く | `AGENTS.md:55`（Editable）。除外は SSoT（CLAUDE.md の Review-doc SSoT sync）と公開契約              |
| `AGENT_LEARNINGS.md`                                                                                                                                     | `AGENTS.md:55`                                                                                      |
| `tests/**` のうち `status: added` のファイル                                                                                                             | 既存テストの変更・削除は必須チェックの意味を変えうるため除外する                                    |
| `docs/development/worker-discipline-template.md` への 1 行追記（patch が追加行 1 行だけ）                                                                | `AGENTS.md:57` が既に事前確認不要としている。2 行以上の追記や既存行の変更は許可リスト外で、崖とする |

#### 丘

| 対象                                                                                                                                                                        | 根拠                                                           |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `src/**`、`runners/**`（`dist` を含む。下の崖の例外を除く）                                                                                                                 | `AGENTS.md:56`（ask）。緩和にあたる点は自己批判を参照          |
| `skills/**`（`deterministicGate.command` を含む変更は崖）                                                                                                                   | `AGENTS.md:55`。製品の表面（AGENTS.md の Project Conventions） |
| `scripts/**`（マージ・リリース・revert 系と判定用は崖）                                                                                                                     | `AGENTS.md:55`                                                 |
| `schemas/**`、`docs/**`（ADR、guard-ledger の退役、`docs/development/worker-discipline-template.md` の 1 行追記以外の変更を除く）、`README.md`、`README.en.md`、`assets/**` | `AGENTS.md:56`                                                 |
| `tests/**` の既存ファイルの変更                                                                                                                                             | 原っぱから除外したもの                                         |
| その他の `.github/workflows/**`（下の崖を除く）                                                                                                                             | `AGENTS.md:55` では Editable だが、CI の挙動を変える           |

#### 崖（明示列挙。加えて rule 2 により、未列挙のものもすべて崖）

| 対象                                                                                                                                                                                                                                                                               | 根拠                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `CLAUDE.md`、`AGENTS.md`、`GEMINI.md`、`.codex/**`、`.github/copilot-instructions.md`                                                                                                                                                                                              | 承認境界そのもの（`CLAUDE.md:15`）。rule 0                                              |
| `.claude/settings*.json`、`.claude/hooks/**`、`.claude/commands/**`、`.claude/rules/**`、`.claude/agents/**`                                                                                                                                                                       | 許可・ガード・常時読み込み規則の実体（`.claude/settings.json` の hooks :53-84）。rule 0 |
| `agents/**`、`commands/**`、`.claude-plugin/**`                                                                                                                                                                                                                                    | 配布される plugin の表面（CLAUDE.md の Custom Commands）                                |
| `.github/CODEOWNERS`、`.github/dependabot.yml`、`.github/actions/**`                                                                                                                                                                                                               | レビュー経路・依存更新・CI 部品                                                         |
| 階層判定器・`tier-gate.yml`・保護対象一覧（いずれも【提案】名）、`blocked-label-guard.yml`、`release-please*.yml`、`deploy.yml`                                                                                                                                                    | rule 0、公開経路                                                                        |
| `docs/adr/**`、guard-ledger のガード退役、ファイル削除（全パス）                                                                                                                                                                                                                   | 方針そのもの、rule 3                                                                    |
| `docs/development/worker-discipline-template.md` への 2 行以上の追記と既存行の編集                                                                                                                                                                                                 | `AGENTS.md:57` の例外の範囲外                                                           |
| `package.json`（すべての変更）、`package-lock.json`                                                                                                                                                                                                                                | `CLAUDE.md:14`（依存追加は ask）、`AGENTS.md:49`, `:58`                                 |
| lint 設定 9 本（`.lintstagedrc.json`、`.markdownlint-cli2.jsonc`、`.markdownlint.json`、`.markdownlintignore`、`.prettierignore`、`.prettierrc.json`、`.textlintignore`、`.textlintrc.json`、`commitlint.config.js`）。リポジトリ直下に eslint の設定ファイルは無い（`ls` で確認） | 検査の挙動を変える                                                                      |
| `release-please-config.json`、`.release-please-manifest.json`、`.nvmrc`、`.gitattributes`                                                                                                                                                                                          | リリース・実行環境・dist の決定性                                                       |
| `LICENSE*`、`CITATION.cff`                                                                                                                                                                                                                                                         | `AGENTS.md:58`                                                                          |
| `src/lib/gate-decision.mjs`、`src/lib/deterministic-*.mjs`（command-allowlist / executor / orchestrator / sandbox、exec-gate、gate の 6 本）、`src/lib/secret-redactor.mjs`、パス・コマンド実行に関わるその他の security 処理、`runners/github-action/action.yml`                  | 製品の信頼境界（`003:30`, `:39`）と配布契約                                             |
| マージ・リリース・revert 系スクリプト（`scripts/merge-chain.sh`、`scripts/pr-unstall.sh` 等）、`skills/**` の `deterministicGate.command`                                                                                                                                          | マージ実行経路、広い攻撃面（`003:39`）                                                  |
| 操作: リリース（release-please PR のマージ、tag）、`scripts/pr-unstall.sh --execute`、secrets・変数（`gh variable set` / `delete`、`actions/variables` への書き込み）・branch protection・ruleset の変更、`gh auth switch` / `login` / `token`                                     | 不可逆・信頼境界                                                                        |

### 丘の執行主体

ADR-003 は、丘の期限を壁時計で追跡するのは host の責務だとした（`003:41`）。本リポジトリでは、host 側の【提案】digest workflow が執行主体となる。

- 起点は、丘 PR が digest に初めて載った時刻とする。PR を更新しても起点はリセットしない。
- 7 日経っても人間が判断しなければ、digest の先頭に再掲し、`needs-human` ラベルでエスカレーションする。
- 期限切れの丘 PR は、段階を問わず自動マージされない。
- digest workflow が失敗した場合は、`main-ci-red-alert.yml` と同じ経路で Issue を起票して通知する【提案】。2 回連続して失敗した場合、丘の期限判定は止まったものとして人間に知らせる。

### キルスイッチ（fail-closed）

- 自律処理は、リポジトリ変数 `AUTONOMY_ENABLED` が文字列 `true` のときだけ動く。
- OFF、未設定、取得失敗のとき、`tier-gate` は**全 PR を cliff として判定する**。つまり人間の approve が必須になる。fail ではなく「人間待ち」として扱う。
- 停止中は、新規の auto-merge 設定と routine の起動を行わない。
- `gh variable set` / `delete` と `actions/variables` への書き込みは、エージェント環境で deny にする（崖）。
- **段階 1 のキルスイッチは誤操作を防ぐためのもので、敵対的なエージェントへの対策ではない。** 段階 1 のエージェントは人間の認証情報で動くため、変数を書き換えられる。

## 自己批判（この変更のリスクと反論）

- **段階 1 は強制ではない**: 段階 1 の保護は、運用ルールとローカル hook に依存する。エージェントが hook を迂回する経路（別シェル、`gh api`、クラウド実行）は塞げない。そのため段階 1 では、原っぱを含めてエージェントのマージを全面禁止にする。段階 2 まで ADR-003 rule 0 相当の保証は無い。
- **`src/` と `runners/` を丘にするのは緩和である**: 現行ルールでは、これらは編集前に ask が必要である（`AGENTS.md:56`）。丘ではエージェントが確認なしに編集して PR まで作る。マージは人間に残るが、確認の時点が着手前からマージ前へ後ろにずれる。信頼境界に関わるもの（gate・deterministic 系・secret-redactor・`action.yml`）は崖の例外として残した。ただし、例外の列挙漏れは丘として通ってしまう。
- **追加テストは CI 上で任意のコードとして実行される**: 原っぱの「`tests/**` の added」は、CI の `npm test` で実行される。テストは CI の権限で任意のコードを動かせる。test workflow の権限を最小にすること、secrets を渡さないことが前提になる。
- **許可リストの粒度**: 原っぱをパスと status で判定するため、内容の危険度は見ない（例: 追加テストが CI 時間を食い潰す）。だから初版は 4 つに絞った。
- **digest の形骸化**: 事後監査が読まれなければ、ラバースタンプが後ろへずれるだけになる。ADR-012 D2（`012:62-80`）に従い、digest は要約であって SSoT ではない。全 finding・失敗・provenance を参照できるようにする。
- **語彙**: ADR-003 の語彙ルール（`003:64-69`）に従い、見出し・告知に自己定義語を使わない。

## Non-Goals

- 崖の人間承認を緩めない。
- 製品（River Review）の挙動・既定値・マージ権限を変えない。製品の `gate` は既定で advisory のまま（`003:48`）。
- AGENTS.md の Safety（`AGENTS.md:44-51`。破壊的コマンドと force-push の禁止は `:48`）は、階層に関係なく維持する。原っぱでも例外にしない。
- 段階 2 に必要な GitHub App / machine user の作成と、実行環境の分離は、エージェントが行わない。

## Consequences

### Positive

- 原っぱと丘で、PR ごとの確認を digest でのまとめた判断に置き換えられる。段階 2 では、原っぱのマージも人間の手を離れる。
- パス区分と判断区分が 1 つの表に統合され、lockfile のような規則間の衝突が見える場所に出る。

### Negative

- 判定器・workflow・hook・digest という保守対象が増える。
- 段階 1 の期間は、マージの手間が減らない（エージェントのマージは全面禁止のため）。減るのは着手前の確認だけである。
- 原っぱの誤分類は、事後監査でしか見つからない。

## 参照

- `docs/adr/003-risk-tiered-human-supervision.md`（`:20-26` 階層、`:30` rule 0、`:39-41` 信頼境界・fail-safe・host 責務、`:46` Non-Goal）
- `docs/adr/012-human-attention-architecture.md`（D2 `:62-80`、D3 `:82-94`、D8 `:221-237`）
- `AGENTS.md:44-58`、`CLAUDE.md:13-15`, `:51`
- `docs/governance.md`（「マージ前チェックリスト」節、`:72-85` 必須チェックの context 名の変更手順、`:104`, `:174`）
- `.github/workflows/blocked-label-guard.yml`（`:85-103` merge_group の PR 番号の取り出し）、`scripts/merge-chain.sh:358`
- 実装計画: `docs/development/repo-operation-risk-tiers-plan.md`
