# QA 証拠の入力契約（設計メモ）

ADR-017（`docs/adr/017-qa-evidence-intake.md`）の D3・D5 を、schema を書く前の設計として具体化する。
schema（`schemas/qa-evidence.schema.json`）は本メモを正本として別 PR で作る。
用語は ADR-017 の「用語」節に従う。

## 1. 位置づけ

- 利用者が自分で実行した QA の結果を、River Review に渡すための形式
- 証拠の JSON は信頼しない利用者入力。確定した AC の一覧と、独立性・provenance の根拠は、証拠とは別の入力から取る（§4、§6）
- River Review はこの証拠を読み、決定論のコードで検証し、completion-assessment へ件数だけを部分投影する。完了の state は completion-judge が決める
- 初版では、独立性が全件 `unknown` になるため、どの AC も verified に数えない（§5 条件 8、§9）

## 2. 全体の構造

```text
qa-evidence
├── schemaVersion
├── target          … 対象（§3.1）
├── execution       … 実行（§3.2）
├── environment     … 環境（§3.3）
├── verification    … AC 別の結果（§3.4）
├── artifacts       … 参照（§3.5）
└── gaps            … 不足・残余リスク（§3.6）
```

欠けたとき・不正なときは fail-closed とする。
証拠全体を拒否する場合（「全体を拒否」）と、該当 AC を verified に数えない場合（「数えない」）を区別する。
実行全体に関わる必須欄（`target.subjectRevision`、`execution` の必須欄）が欠けたときは、全 AC を数えない。

## 3. 各欄

### 3.1 target

| 項目                                      | 必須                 | 規則                                                                     | 欠落・不正時                                                                               |
| ----------------------------------------- | -------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `repository`                              | 必須                 | `owner/name` 形式                                                        | 全体を拒否（`QA_TARGET_REPOSITORY_INVALID`）                                               |
| `subjectRevision`                         | 必須                 | 40 桁または 64 桁の hex。小文字に正規化して受理する。短縮 SHA は拒否する | 全体を拒否（`QA_TARGET_REVISION_INVALID`）                                                 |
| `acceptanceCriteria[]`                    | 必須（1 件以上）     | §4 の AC 規則で、確定した AC 一覧と照合する                              | 全体を拒否（`QA_TARGET_AC_EMPTY`、`QA_TARGET_AC_ID_INVALID`、`QA_TARGET_AC_ID_DUPLICATE`） |
| `acceptanceCriteria[].expected.value`     | 必須                 | 固定した期待結果                                                         | 数えない（`QA_TARGET_EXPECTED_MISSING`）                                                   |
| `acceptanceCriteria[].expected.source`    | 必須                 | `sourced` / `reproduced` / `derived`（§5）                               | 数えない（`QA_TARGET_EXPECTED_SOURCE_MISSING`）                                            |
| `acceptanceCriteria[].expected.sourceRef` | `sourced` のとき必須 | 出所の artifact の id（§3.5）                                            | 数えない（`QA_TARGET_EXPECTED_SOURCE_UNRESOLVED`）                                         |

証拠の `acceptanceCriteria[].required` は読まない。必須・任意は確定した AC 一覧から取る（§4）。

### 3.2 execution

| 項目       | 必須 | 規則                                                                                        | 欠落・不正時                                                    |
| ---------- | ---- | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `runner`   | 必須 | 実行に使った runner の名前                                                                  | 全 AC を数えない（`QA_EXECUTION_RUNNER_MISSING`）               |
| `command`  | 必須 | 実行したコマンド（引数を含む）                                                              | 全 AC を数えない（`QA_EXECUTION_COMMAND_MISSING`）              |
| `exitCode` | 必須 | 整数。取得経路が確かでない値（パイプ越しなど）は `null` とし、`exitCodeSource` に理由を書く | `null` なら全 AC を数えない（`QA_EXECUTION_EXIT_CODE_UNKNOWN`） |
| `ciRun`    | 任意 | CI の run の参照。独立性の根拠には使わない（§6）                                            | —                                                               |

`exitCode` が 0 以外なのに、すべての AC が `PASS` の証拠は、全体を拒否する（`QA_EXECUTION_EXIT_CODE_MISMATCH`）。

### 3.3 environment

| 項目                                        | 必須 | 規則               | 欠落・不正時                                    |
| ------------------------------------------- | ---- | ------------------ | ----------------------------------------------- |
| `os`                                        | 必須 | —                  | 全 AC を数えない（`QA_ENVIRONMENT_INCOMPLETE`） |
| `browser`、`viewport`、`locale`、`timezone` | 任意 | E2E では記録を推奨 | —                                               |

### 3.4 verification

確定した AC 1 件につき、結果を 1 件だけ持つ。

| 項目         | 必須                                                                    | 規則                                                                                                                                                                       | 欠落・不正時                                                                                                 |
| ------------ | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `acId`       | 必須                                                                    | 確定した AC 一覧の id のいずれか                                                                                                                                           | 全体を拒否（`QA_VERIFICATION_AC_UNKNOWN`）                                                                   |
| `status`     | 必須                                                                    | `PASS` / `FAIL` / `SKIP` / `NOT_RUN`。試行があるときは、最後の試行の status と一致しなければならない                                                                       | 全体を拒否（`QA_VERIFICATION_STATUS_INVALID`、`QA_VERIFICATION_STATUS_MISMATCH`）                            |
| `basis`      | 必須                                                                    | `verified`（assertion 付きの検証）または `explore`（観測のみ）。1 件の結果に 1 つ                                                                                          | 数えない（`QA_VERIFICATION_BASIS_MISSING`）                                                                  |
| `assertions` | 使わない                                                                | 結果全体の自己申告は読まない。試行ごとの `assertions` を使う（§5 条件 2）                                                                                                  | —                                                                                                            |
| `attempts[]` | `PASS` / `FAIL` のとき必須（1 件以上）。`SKIP` / `NOT_RUN` では空でよい | すべての試行。各試行は `startedAt`（ISO 8601）、`status`、`logRef`（§3.5 の artifact の id）、`assertions`（`total` と `passed` の整数）を持つ。`startedAt` の昇順に並べる | 数えない（`QA_VERIFICATION_ATTEMPTS_EMPTY`）。順序の逆転は全体を拒否（`QA_VERIFICATION_ATTEMPTS_UNORDERED`） |

- 同じ `acId` の結果が 2 件以上ある証拠は、全体を拒否する（`QA_VERIFICATION_AC_DUPLICATE`）
- 確定した AC 一覧にあって `verification` に無い AC は `NOT_RUN` として扱う（`QA_VERIFICATION_AC_MISSING`）
- 証拠は `flaky` を自己申告しない。River Review が `attempts` から判定する（§5 条件 3）

### 3.5 artifacts

| 項目                 | 必須 | 規則                                                                                                                      | 欠落・不正時                                                                                       |
| -------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `refs[].id`          | 必須 | 証拠内で一意                                                                                                              | 全体を拒否（`QA_ARTIFACT_ID_INVALID`）                                                             |
| `refs[].path`        | 必須 | リポジトリ内の相対パス。リポジトリ外・symlink は拒否する。URL は受け付けない（River Review はネットワークから取得しない） | 全体を拒否（`QA_ARTIFACT_PATH_REJECTED`）                                                          |
| `refs[].sha256`      | 必須 | 64 桁の hex。River Review がファイルを読んで計算した値と一致しなければならない                                            | 参照する AC を数えない（`QA_ARTIFACT_HASH_MISMATCH`。ファイルが無ければ `QA_ARTIFACT_UNRESOLVED`） |
| `refs[].sensitivity` | 任意 | 秘密情報・個人情報を含み得る場合は `restricted`                                                                           | —                                                                                                  |
| `reproduction`       | 任意 | 再実行の手順                                                                                                              | —                                                                                                  |

証拠はログの本文を持たない。本文が埋め込まれていたら全体を拒否する（`QA_ARTIFACT_INLINE_CONTENT`）。

### 3.6 gaps

| 項目      | 必須 | 規則                                                         |
| --------- | ---- | ------------------------------------------------------------ |
| `items[]` | 任意 | 未確定の要求、環境の障害、証拠の不足、残余リスク、再開の条件 |

`gaps` が空でも、River Review が §5・§7 の検証で見つけた不足は出力の Gaps に加える。

## 4. AC の規則

- 確定した AC の一覧（id、必須・任意、期待結果）は、証拠とは別の入力から取る。task-completion-review が読む要求・タスクの記録と同じ入力を使う
- 確定した AC の一覧は、参照（リポジトリ内のパス）と sha256 で版を固定する。人間が確定したことの根拠（承認の記録の参照）も持つ。参照・hash・根拠のどれかが欠けたら、母集団は不明とする
- 確定した AC の一覧が無い場合、AC の母集団は不明とし、全 AC を数えない（`QA_AC_POPULATION_UNKNOWN`）
- id は空でない文字列。NFC 正規化した値で比較する（`src/lib/promotion-candidates.mjs` の `nfc` / `nonEmptyNfcString` を使い、再実装しない）
- 証拠の `target.acceptanceCriteria` に同じ id が 2 件以上ある場合は、全体を拒否する
- 確定した AC 一覧に無い id を証拠が含む場合は、全体を拒否する
- 確定した AC 一覧にあって証拠に無い AC は、`NOT_RUN` として扱う

## 5. verified に数える条件

AC を verified に数えるのは、次をすべて満たす場合だけとする。
満たさない AC は unverified に数え、理由の reasonCode を QA 証拠の監査結果に残す。

1. `status` が `PASS`（`QA_VERIFICATION_NOT_PASS`）
2. `basis` が `verified`（`QA_VERIFICATION_EXPLORE_ONLY`）で、すべての試行の `assertions` が `total ≥ 1` かつ `passed = total`（`QA_VERIFICATION_ASSERTIONS_MISSING`）
3. `attempts` のすべてが `PASS`。途中に `FAIL` がある AC は flaky とし、数えない（`QA_VERIFICATION_FLAKY`）
4. すべての試行の `logRef` が解決でき、hash が一致する（§3.5）。hash の一致はログが改変されていないことだけを示し、ログの内容が正しいことは示さない。ログの内容の検証は本契約の範囲外とする
5. `target.subjectRevision` が、River Review が観測した HEAD と一致する。不一致は stale（`QA_TARGET_REVISION_STALE`）。HEAD を取得できない場合も数えない（`QA_TARGET_REVISION_UNOBSERVED`）
6. 期待値の出所が `sourced`（`sourceRef` が解決でき hash が一致する）または `reproduced` である（`QA_TARGET_EXPECTED_DERIVED`）
7. §3 の実行全体に関わる必須欄がそろっている。証拠の `expected.value` が、確定した AC 一覧の期待結果と一致する（`QA_TARGET_EXPECTED_MISMATCH`）
8. 独立性が `unknown` ではない（`QA_INDEPENDENCE_UNKNOWN`）。初版では、この条件を満たす経路が無い（§9）

期待値の出所は 3 区分とする。

| 区分         | 意味                                 | verified に数えるか                |
| ------------ | ------------------------------------ | ---------------------------------- |
| `sourced`    | 要求・仕様など、出所が示された期待値 | 数える（`sourceRef` の検証が必要） |
| `reproduced` | 主張された挙動を再現して得た期待値   | 数える                             |
| `derived`    | 検証する側が導いた期待値             | 数えない（参考結果）               |

初版では条件 8 により、すべての AC が unverified になる。
この結果をテストで固定する（「初版の verified は常に 0」）。

## 6. 独立性と provenance

- 独立性・provenance の根拠は、証拠 JSON とは別の経路で host が River Review へ渡す情報だけとする
- 証拠の中で利用者が書いた run ID・実行者・監査者は、記録として読むが、独立性の根拠にしない
- 比較の基準になる commit は、River Review が観測した HEAD とする。run ID の信頼できる出所は現状無い（§9）
- 実行と監査が同じセッションで行われた場合も `unknown` とする
- 初版では独立性は常に `unknown` である。次の写像は、将来 host 経路が加わったときのためのもので、初版では使わない

| reviewer-independence の入力 | QA での対応                         |
| ---------------------------- | ----------------------------------- |
| `finderRunId`                | 実行した run の ID（host が渡す値） |
| `verifierRunId`              | River Review が監査を行う run の ID |

## 7. 入力の上限と fail-closed

- JSON として解釈できない入力は、全体を拒否する（`QA_EVIDENCE_MALFORMED`）
- サイズ・深さ・件数の上限を超えた入力は、全体を拒否する（`QA_EVIDENCE_TOO_LARGE`）。上限値は schema の PR で定める
- 秘密情報らしい値を含む証拠は、既存の redaction（`src/lib/secret-redactor.mjs`、`schemas/redaction-config.schema.json`）を通してから扱う。redaction できない場合は全体を拒否する（`QA_EVIDENCE_SECRET_DETECTED`）

## 8. completion-assessment への投影

- 件数だけを部分投影する。§5 を満たす AC を verified、それ以外を unverified とする。初版では常に `verified = 0`、`unverified = total`
- AC の母集団が確定しているときは、投影を必ず行う。completion-judge が投影を省いたり、件数を上書きしたりすることは認めない
- 母集団が不明（§4）なときは、`total` を決められないので投影しない。QA 証拠の監査結果に `QA_AC_POPULATION_UNKNOWN` を残し、completion-judge には「QA 証拠からは判断材料が得られない」ことだけを渡す
- QA 証拠の投影は、completion-assessment の tests の evidence を `present` にしない
- reasonCode は既存の `ACCEPTANCE_CRITERION_UNVERIFIED` に対応付ける。QA 固有の reasonCode（本メモの `QA_*`）は QA 証拠の監査結果の側に残す
- `state` は出さない。completion-judge が QA 証拠を参照して決める
  - schema が別の state を強制する場合は、そちらを優先する。たとえば人間の判断が要る場合の `HUMAN_JUDGMENT_REQUIRED`（`schemas/completion-assessment.schema.json:402-422`）や、判定に到達しない場合の `BLOCKED`（`:484-485`）
  - それ以外で、確認不能（`SKIP` / `NOT_RUN` / 数えない PASS / 証拠の欠落）が 1 件でもあれば `UNVERIFIED`
  - evidence に `missing` があると `INCOMPLETE` は許されないため（`schemas/completion-assessment.schema.json:464-488`）
  - すべての証拠がそろい、`FAIL` がある場合は `INCOMPLETE`
  - どちらの場合も、確認した `FAIL` は QA 証拠の監査結果に残す

## 9. host 経路（既存経路の調査結果）

確認した範囲（main `e78b5234`）では、利用者に偽造されない形で「どの run か」「実行者と監査者が別か」を River Review に渡す既存の経路は無い。

| 経路                                                                   | 既存コード                                                                                      | 利用者が偽造できるか                                             | 本契約での扱い                                                                           |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `GITHUB_ACTIONS`                                                       | `src/lib/result-store.mjs:72`、`:90-99`                                                         | できる（同ファイル `:72` に明記）                                | 使わない                                                                                 |
| `GITHUB_EVENT_PATH`（PR の labels・body）                              | `src/lib/pr-context.mjs:8-33`                                                                   | できる（環境変数で上書きでき、優先される）                       | 使わない                                                                                 |
| `GITHUB_SHA` / `GITHUB_RUN_ID` / `GITHUB_RUN_ATTEMPT` / `GITHUB_ACTOR` | 参照箇所なし（`git grep` で 0 件）                                                              | 同じジョブの中では子プロセスへ別の値を渡せる（一般仕様。未検証） | 使わない                                                                                 |
| ローカルの git HEAD                                                    | `src/lib/git.mjs`（`getHeadSha` = `git rev-parse HEAD`）                                        | できる（対象リポジトリは利用者の管理下）                         | 照合の基準値としてだけ使う（下記）                                                       |
| run record の `runId`                                                  | `src/lib/result-store.mjs`、`src/lib/shadow-aggregate.mjs:70`（`P1_TRUST_LEVEL = 'untrusted'`） | できる                                                           | 使わない                                                                                 |
| River Review 内部の execution ID                                       | `src/lib/reviewer-orchestrator.mjs`（プロセス内で採番）                                         | 外部入力からは注入できない                                       | River Review 内部の LLM 実行どうしの分離にだけ有効。外部の QA 実行者との区別には使えない |
| Ed25519 の detached attestation                                        | `src/lib/replay-verification.mjs:98`、`:161`                                                    | 秘密鍵を持たない人は偽造できない                                 | 唯一の先例。本契約の初版では使わない（下記）                                             |

決定:

- 初版では、独立性は全件 `unknown` とする。QA 証拠の AC は、§5 の他の条件を満たしても verified に数えない
- `target.subjectRevision` は、River Review が観測した HEAD（`git rev-parse HEAD`）と照合する。一致しなければ stale として扱う。この照合は「証拠が別の revision を指していないか」の整合性検査であり、真正性の根拠ではない
- 独立性を `unknown` 以外にするには、新しい host 経路が要る。候補は次の 2 つで、どちらも本契約の範囲外とし、必要になった時点で別の ADR で判断する
  - 署名: 既存の Ed25519 attestation（`src/lib/replay-verification.mjs`）と同じ形で、実行側が証拠に署名し、公開鍵を host が渡す。守れる相手は鍵の持ち主で決まる
  - Action の input: 既存の `trusted_tree`（`runners/github-action/action.yml`）と同じ形で、base 側の値を host が渡す。守れる相手は PR の作成者であり、ワークフローを書くリポジトリ所有者ではない

## 10. QA 計画の出力形式

- 基本 QA: 確定した AC ごとに 1 件以上。レビューの指摘が 0 件でも作る
- 追加 QA: レビューの所見から作る。由来の所見 ID（既存 finding の ID）を持つ
- 各項目は由来（`acceptance-criterion` / `review-finding`）、優先度、重複先の項目 ID を持つ

## 11. reasonCode 一覧

本メモで定義した `QA_*` の reasonCode は、合成の負例 fixture のテストで、すべて本表に載っていることを確かめる。

| reasonCode                             | 扱い                  | 節     |
| -------------------------------------- | --------------------- | ------ |
| `QA_TARGET_REPOSITORY_INVALID`         | 全体を拒否            | 3.1    |
| `QA_TARGET_REVISION_INVALID`           | 全体を拒否            | 3.1    |
| `QA_TARGET_AC_EMPTY`                   | 全体を拒否            | 3.1    |
| `QA_TARGET_AC_ID_INVALID`              | 全体を拒否            | 3.1    |
| `QA_TARGET_AC_ID_DUPLICATE`            | 全体を拒否            | 3.1、4 |
| `QA_TARGET_EXPECTED_MISSING`           | 数えない              | 3.1    |
| `QA_TARGET_EXPECTED_SOURCE_MISSING`    | 数えない              | 3.1    |
| `QA_TARGET_EXPECTED_SOURCE_UNRESOLVED` | 数えない              | 3.1    |
| `QA_TARGET_EXPECTED_MISMATCH`          | 数えない              | 5      |
| `QA_TARGET_EXPECTED_DERIVED`           | 数えない              | 5      |
| `QA_TARGET_REVISION_STALE`             | 数えない              | 5      |
| `QA_TARGET_REVISION_UNOBSERVED`        | 数えない              | 5      |
| `QA_EXECUTION_RUNNER_MISSING`          | 全 AC を数えない      | 3.2    |
| `QA_EXECUTION_COMMAND_MISSING`         | 全 AC を数えない      | 3.2    |
| `QA_EXECUTION_EXIT_CODE_UNKNOWN`       | 全 AC を数えない      | 3.2    |
| `QA_EXECUTION_EXIT_CODE_MISMATCH`      | 全体を拒否            | 3.2    |
| `QA_ENVIRONMENT_INCOMPLETE`            | 全 AC を数えない      | 3.3    |
| `QA_VERIFICATION_AC_UNKNOWN`           | 全体を拒否            | 3.4、4 |
| `QA_VERIFICATION_AC_DUPLICATE`         | 全体を拒否            | 3.4    |
| `QA_VERIFICATION_AC_MISSING`           | 数えない（`NOT_RUN`） | 3.4、4 |
| `QA_VERIFICATION_STATUS_INVALID`       | 全体を拒否            | 3.4    |
| `QA_VERIFICATION_STATUS_MISMATCH`      | 全体を拒否            | 3.4    |
| `QA_VERIFICATION_BASIS_MISSING`        | 数えない              | 3.4    |
| `QA_VERIFICATION_ASSERTIONS_MISSING`   | 数えない              | 3.4    |
| `QA_VERIFICATION_ATTEMPTS_EMPTY`       | 数えない              | 3.4    |
| `QA_VERIFICATION_ATTEMPTS_UNORDERED`   | 全体を拒否            | 3.4    |
| `QA_VERIFICATION_NOT_PASS`             | 数えない              | 5      |
| `QA_VERIFICATION_EXPLORE_ONLY`         | 数えない              | 5      |
| `QA_VERIFICATION_FLAKY`                | 数えない              | 5      |
| `QA_ARTIFACT_ID_INVALID`               | 全体を拒否            | 3.5    |
| `QA_ARTIFACT_PATH_REJECTED`            | 全体を拒否            | 3.5    |
| `QA_ARTIFACT_HASH_MISMATCH`            | 数えない              | 3.5    |
| `QA_ARTIFACT_UNRESOLVED`               | 数えない              | 3.5    |
| `QA_ARTIFACT_INLINE_CONTENT`           | 全体を拒否            | 3.5    |
| `QA_AC_POPULATION_UNKNOWN`             | 全 AC を数えない      | 4      |
| `QA_INDEPENDENCE_UNKNOWN`              | 数えない              | 5      |
| `QA_EVIDENCE_MALFORMED`                | 全体を拒否            | 7      |
| `QA_EVIDENCE_TOO_LARGE`                | 全体を拒否            | 7      |
| `QA_EVIDENCE_SECRET_DETECTED`          | 全体を拒否            | 7      |
