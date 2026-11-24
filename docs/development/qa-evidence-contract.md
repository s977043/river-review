# QA 証拠の入力契約（設計メモ）

## Status

**Stability: Experimental.** 本メモが正本で、`schemas/qa-evidence.schema.json` はその構造の検査にあたる。schema は `pages/reference/stable-interfaces.md`（ja / en）に Experimental として登録済み。決定論の検証モジュールと writer はまだ無い。
本文の行番号（`:NN`）は main `e78b5234` 時点の値を示す。

ADR-017（`docs/adr/017-qa-evidence-intake.md`）の D3・D5 を具体化する。用語は ADR-017 の「用語」節に従う。

## 1. 位置づけ

- 利用者が自分で実行した QA の結果を、River Review に渡すための形式
- 証拠の JSON は信頼しない利用者入力。確定した AC の一覧と、独立性・provenance の根拠は、証拠とは別の入力から取る（§4、§6）
- River Review はこの証拠を決定論のコードで検証し、監査結果を出す。completion-assessment には件数だけを部分投影する。完了の state は completion-judge が決める
- ファイルの検査・hash の計算・git による HEAD と `dirty` の観測は、host 側で動く決定論のモジュールが行う。skill と completion-judge はその結果を読むだけとする。Agent が要求できる能力は全 runtime の共通部分だけで、Codex は `run-command` を持たないため（`agents/contracts/adapter-map.json:10-14`、`schemas/agent-contract.schema.json:46-50`）
- 読み取りだけの環境、git を実行できない環境、artifact を読めない環境でも、検証は安全側に倒れる（`QA_TARGET_REVISION_UNOBSERVED`、`QA_ARTIFACT_UNRESOLVED`）。権限の拡張は前提にしない
- 初版では、独立性が全件 `unknown` になるため、どの AC も verified に数えない（§5 条件 8、§9）。QA 証拠から `COMPLETE` や `INCOMPLETE` は生じない（§8）

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

欠けたとき・不正なときは fail-closed とし、次の 3 つの扱いを区別する。

| 扱い             | 意味                                                 |
| ---------------- | ---------------------------------------------------- |
| 全体を拒否       | 証拠を受理しない。§7 の段階 1〜4 で判定する          |
| 全 AC を数えない | 証拠は受理するが、すべての AC を unverified に数える |
| 数えない         | 該当する AC を unverified に数える                   |

schema では、すべてのオブジェクトを `additionalProperties: false` とし、すべての文字列欄に最大長、すべての配列に最大件数を置く。
定義に無い欄と型の誤りは、全体を拒否する（`QA_EVIDENCE_MALFORMED`）。
最大長を超える文字列と最大件数を超える配列も、全体を拒否する（`QA_EVIDENCE_TOO_LARGE`。本文の埋め込みもこれで止める）。
上限ちょうどと上限 + 1 の検査は `tests/qa-evidence-schema.test.mjs` に置く。

schema が `required`・`pattern`・`enum`・`const` で拒否するのは、本メモが「全体を拒否」とする欄だけとする。
「数えない」「全 AC を数えない」とする欄（`basis`、`expected.source`、`execution.runner`、`environment.os`、試行の `command`・`exitCode`、`refs[].sha256` など）は、schema では型と最大長だけを検査する。
欠落や値の誤りで証拠全体を拒否してしまうと、その AC を unverified に数える扱いと食い違うため。
値の判定は決定論のモジュールが行う。

### 2.1 上限値

| 対象                                               | 上限                              | 根拠                                                                                                                                                                                                          |
| -------------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 証拠 JSON 全体のバイト数（UTF-8）                  | 1,048,576（1 MiB）                | 証拠は参照と hash だけを持ち本文を持たない。AC 200 件に各 2 KB の記述を付けても 0.4 MB に収まる                                                                                                               |
| ネストの深さ                                       | 16                                | schema が許す最大の深さは 8（root → verification → 結果 → subcases → サブケース → attempts → 試行 → assertions）。正しい証拠はこれを超えないので、その 2 倍を上限とし、深い入れ子による解析の負荷だけを止める |
| `target.acceptanceCriteria`、`verification` の件数 | 200                               | 1 つの PR やタスクで人間が確定する AC の数として十分に多く、件数による処理量を抑える                                                                                                                          |
| 1 件の AC の `attempts` の件数                     | 20                                | retry と再実行の記録には十分。flaky の判定は 2 件あれば足りる                                                                                                                                                 |
| 1 件の AC の `subcases` の件数                     | 20                                | 正常系・異常系・権限・境界値などの分岐として十分。1 件のサブケースの `attempts` も 20 件まで。全体は 1 MiB の上限で抑える                                                                                     |
| 1 件の AC の `controls` の件数                     | 10                                | 変更前の revision での対照は 1 件で足り、再実行を含めても十分                                                                                                                                                 |
| `artifacts.refs` の件数                            | 1,000                             | AC 200 件それぞれに、ログ・trace・スクリーンショット・期待値の出所など 5 件までの成果物を付けられる。ログは試行どうしで共有できる。ファイルごとの hash 計算の回数を抑える                                     |
| `environment.runtimes` の件数                      | 20                                | 1 回の実行で使う処理系の数として十分                                                                                                                                                                          |
| `gaps.items` の件数                                | 100                               | 不足・残余リスクの列挙として十分                                                                                                                                                                              |
| id（AC・artifact）                                 | 正規化後 128 文字（生の値は 160） | §4.2。schema は生の値の型と長さだけを検査し、文字種と 128 文字は正規化後の値を決定論のモジュールが判定する。生の値は正規化で除かれる前後の空白の分だけ余裕を持たせる                                          |
| `target.repository`                                | 140                               | 初版は GitHub の `owner/name` だけを対象とする。owner の最大 39 文字 + `/` + リポジトリ名の最大 100 文字（目安）                                                                                              |
| `target.subjectRevision`                           | 64                                | SHA-256 の commit id の桁数                                                                                                                                                                                   |
| `expected.value`                                   | 4,096                             | 期待結果は固定した短い記述。長い仕様は `sourceRef` で artifact を参照する                                                                                                                                     |
| 試行の `command`、`artifacts.reproduction`         | 8,192                             | 引数を含むコマンド行として十分。超えると証拠全体を拒否する（`QA_EVIDENCE_TOO_LARGE`）。長いコマンドや手順はファイルにして artifact として参照する                                                             |
| `refs[].path`                                      | 1,024                             | macOS の `PATH_MAX`（目安）。これより長い相対パスは実運用で想定しない                                                                                                                                         |
| `gaps.items[]`                                     | 2,048                             | 1 件の不足・リスクの記述として十分                                                                                                                                                                            |
| `execution.ciRun`                                  | 512                               | CI の run の URL として十分                                                                                                                                                                                   |
| `exitCodeSource`                                   | 256                               | 取得経路の短い説明                                                                                                                                                                                            |
| `runner`、`os`、`browser`                          | 128                               | 名前と版の表記として十分                                                                                                                                                                                      |
| `runtimes[].name`・`version`、`locale`、`timezone` | 64                                | 名前と版の表記、BCP 47 の言語タグ、IANA のタイムゾーン名として十分                                                                                                                                            |
| `notRunReason`                                     | 64                                | 定義済みの 5 値の最長は 23 文字                                                                                                                                                                               |
| `basis`、`expected.source`、`viewport`             | 32                                | 定義済みの値、`1280x720` 形式の表記として十分                                                                                                                                                                 |
| `refs[].sha256`                                    | 64                                | SHA-256 の 16 進表記の桁数                                                                                                                                                                                    |
| 試行の `startedAt`                                 | 64                                | RFC 3339 の日時表記として十分                                                                                                                                                                                 |
| 試行の `exitCode`                                  | -2,147,483,648〜4,294,967,295     | POSIX の終了ステータスは 0〜255 だが、Windows の終了コードは 32 ビット値で、符号付き（例: -1073741819）でも符号なし（例: 3221225477）でも表記される。両方の表記を受け付ける範囲にする                         |
| `assertions.total`・`passed`                       | 1,000,000                         | 1 回の試行の assertion 数として十分に大きく、整数の扱いで精度を失わない                                                                                                                                       |
| artifact 1 件のバイト数                            | 104,857,600（100 MiB）            | E2E の trace や動画を含められる大きさの目安。GitHub が 1 ファイルに許す上限と同程度                                                                                                                           |
| artifact の合計バイト数                            | 536,870,912（512 MiB）            | hash の計算にかかる時間を 1 回の監査で数秒程度に抑える                                                                                                                                                        |

バイト数と深さの上限は JSON Schema で表せないため、決定論のモジュールが schema の検証より前に検査する（§7 段階 1）。
件数と文字列長の上限は schema に書く。

## 3. 各欄

### 3.1 target

| 項目                                      | 必須（欠落時の扱いは右欄） | 規則                                                                          | 欠落・不正時                                                                               |
| ----------------------------------------- | -------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `repository`                              | 必須                       | `owner/name` 形式。初版は GitHub のリポジトリだけを対象とする                 | 全体を拒否（`QA_TARGET_REPOSITORY_INVALID`）                                               |
| `subjectRevision`                         | 必須                       | 40 桁または 64 桁の hex。小文字に正規化して受理する。短縮 SHA は拒否する      | 全体を拒否（`QA_TARGET_REVISION_INVALID`）                                                 |
| `acceptanceCriteria[]`                    | 必須（1 件以上）           | §4 の AC 規則                                                                 | 全体を拒否（`QA_TARGET_AC_EMPTY`、`QA_TARGET_AC_ID_INVALID`、`QA_TARGET_AC_ID_DUPLICATE`） |
| `acceptanceCriteria[].expected.value`     | 必須                       | 固定した期待結果                                                              | 数えない（`QA_TARGET_EXPECTED_MISSING`）                                                   |
| `acceptanceCriteria[].expected.source`    | 必須                       | `sourced` / `reproduced` / `derived`（§5）                                    | 数えない（`QA_TARGET_EXPECTED_SOURCE_MISSING`）                                            |
| `acceptanceCriteria[].expected.sourceRef` | `sourced` のとき必須       | 出所となる artifact の id（§3.5）。§5 条件 6 で信頼できる版にあるかを確かめる | 数えない（`QA_TARGET_EXPECTED_SOURCE_UNRESOLVED`）                                         |

証拠の `acceptanceCriteria[].required` は読まない。必須・任意は確定した AC 一覧から取る（§4）。

### 3.2 execution

| 項目     | 必須（欠落時の扱いは右欄） | 規則                                             | 欠落・不正時                                      |
| -------- | -------------------------- | ------------------------------------------------ | ------------------------------------------------- |
| `runner` | 必須                       | 実行に使った runner の名前                       | 全 AC を数えない（`QA_EXECUTION_RUNNER_MISSING`） |
| `ciRun`  | 任意                       | CI の run の参照。独立性の根拠には使わない（§6） | —                                                 |

AC ごとに別のコマンドで判定する運用があるため、実行したコマンドと終了コードは、実行全体ではなく試行ごとに持つ（§3.4）。

### 3.3 environment

| 項目                                        | 必須（欠落時の扱いは右欄） | 規則                                                                          | 欠落・不正時                                    |
| ------------------------------------------- | -------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------- |
| `os`                                        | 必須                       | —                                                                             | 全 AC を数えない（`QA_ENVIRONMENT_INCOMPLETE`） |
| `runtimes`                                  | 任意                       | 使った処理系と版（例: `node` の版）。実行環境の差を後から追えるよう記録を推奨 | —                                               |
| `browser`、`viewport`、`locale`、`timezone` | 任意                       | E2E では記録を推奨                                                            | —                                               |

### 3.4 verification

確定した AC 1 件につき、結果を 1 件だけ持つ。

| 項目           | 必須（欠落時の扱いは右欄）                                              | 規則                                                                                                                                                                                                                                 | 欠落・不正時                                                                      |
| -------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| `acId`         | 必須                                                                    | §4 の id 規則                                                                                                                                                                                                                        | 全体を拒否（`QA_VERIFICATION_AC_UNKNOWN`、`QA_VERIFICATION_AC_DUPLICATE`）        |
| `status`       | 必須                                                                    | `PASS` / `FAIL` / `SKIP` / `NOT_RUN`。試行があるときは、最後の試行の status と一致しなければならない                                                                                                                                 | 全体を拒否（`QA_VERIFICATION_STATUS_INVALID`、`QA_VERIFICATION_STATUS_MISMATCH`） |
| `basis`        | 必須                                                                    | `verified`（assertion 付きの検証）または `explore`（観測のみ）。1 件の結果に 1 つ。サブケースを持つ AC は自身の `basis` を持たないので、この reasonCode は AC 自身では発生しない（サブケースで判定する。§3.4.1）                     | 数えない（`QA_VERIFICATION_BASIS_MISSING`）                                       |
| `attempts[]`   | `PASS` / `FAIL` のとき必須（1 件以上）。`SKIP` / `NOT_RUN` では空でよい | すべての試行（下表）。サブケースを持つ AC は自身の `attempts` を持たないので、この reasonCode は AC 自身では発生しない（サブケースで判定する。§3.4.1）                                                                               | 数えない（`QA_VERIFICATION_ATTEMPTS_EMPTY`）                                      |
| `notRunReason` | `SKIP` / `NOT_RUN` のとき必須                                           | 確定しなかった理由。`criteria-ambiguous`（条件が曖昧）/ `environment-unavailable`（環境が無い）/ `out-of-scope`（許可範囲外）/ `execution-failed`（実行したが確定しない）/ `requires-human-judgment`（期待値を人が決める必要がある） | 理由を記録できない（`QA_VERIFICATION_REASON_MISSING`。AC はもともと数えない）     |
| `subcases[]`   | 任意                                                                    | AC の中のサブケース（§3.4.1）                                                                                                                                                                                                        | §3.4.1                                                                            |
| `controls[]`   | 任意                                                                    | 対照条件（§3.4.2）                                                                                                                                                                                                                   | §3.4.2                                                                            |

`notRunReason` は、`SKIP` / `NOT_RUN` の理由を表す唯一の語彙とする。
外部のツールが独自の理由コードを持つ場合は、利用者側でこの語彙に写してから渡す。River Review は外部の理由コードを読まない。

各試行は次の欄を持つ。

| 項目             | 規則                                                                                                                                        | 欠落・不正時                                                                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `startedAt`      | RFC 3339 の日時（タイムゾーンの指定が必須。小数秒は可）。比較は解析した時刻（epoch ミリ秒）で行う。配列は厳密な昇順とし、同じ時刻は認めない | 欠落・解析できない値は全体を拒否（`QA_VERIFICATION_ATTEMPT_INVALID`）。順序の逆転・同時刻は全体を拒否（`QA_VERIFICATION_ATTEMPTS_UNORDERED`） |
| `status`         | `PASS` / `FAIL` だけ                                                                                                                        | 全体を拒否（`QA_VERIFICATION_ATTEMPT_INVALID`）                                                                                               |
| `logRef`         | §3.5 の artifact の id                                                                                                                      | 欠落は全体を拒否（`QA_EVIDENCE_MALFORMED`）。存在しない id は全体を拒否（`QA_ARTIFACT_REF_UNKNOWN`）                                          |
| `assertions`     | `total` と `passed` の 0 以上の整数。`passed ≤ total`                                                                                       | 全体を拒否（`QA_VERIFICATION_ATTEMPT_INVALID`）                                                                                               |
| `command`        | 実行したコマンド（引数を含む）。出力・保存の前に redaction を通す（§7）                                                                     | 該当 AC を数えない（`QA_EXECUTION_COMMAND_MISSING`）                                                                                          |
| `exitCode`       | -2147483648〜4294967295 の整数（§2.1。Windows の終了コードを含む）。取得経路が確かでない値（パイプ越しなど）は `null`                       | `null` なら該当 AC を数えない（`QA_EXECUTION_EXIT_CODE_UNKNOWN`）。整数でない値・範囲外は全体を拒否（`QA_EVIDENCE_MALFORMED`）                |
| `exitCodeSource` | `exitCode` を取った経路（例: ラッパーで数値を取った、runner の結果ファイルから読んだ）。`exitCode` が `null` のときは理由                   | —                                                                                                                                             |

試行の `status` と `exitCode` が食い違う場合（`exitCode` が 0 以外なのに `PASS`、0 なのに `FAIL`）は、該当 AC を数えない（`QA_EXECUTION_EXIT_CODE_MISMATCH`）。
teardown やカバレッジの閾値など、判定と無関係な理由で終了コードだけが 0 以外になる運用があるため、証拠全体は拒否しない。

- 結果全体の `assertions`・`flaky` などの自己申告は schema に置かない。flaky は River Review が `attempts` から判定する（§5 条件 3）
- `assertions` も利用者の自己申告であり、将来 host 経路が加わっても、それだけでは信頼の根拠にならない

#### 3.4.1 サブケース

1 つの AC の中に複数のケース（例: 正常系と権限エラー）がある運用のために、AC の結果に任意の `subcases[]` を置ける。

| 項目           | 必須（欠落時の扱いは右欄）    | 規則                                                          | 欠落・不正時                                                                      |
| -------------- | ----------------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `id`           | 必須                          | §4.2 と同じ id 規則。同じ AC の中で一意                       | 欠落・違反・重複は全体を拒否（`QA_VERIFICATION_SUBCASE_ID_INVALID`）              |
| `status`       | 必須                          | AC の `status` と同じ語彙と規則（最後の試行の status と一致） | 全体を拒否（`QA_VERIFICATION_STATUS_INVALID`、`QA_VERIFICATION_STATUS_MISMATCH`） |
| `basis`        | 必須                          | AC の `basis` と同じ                                          | 該当 AC を数えない（`QA_VERIFICATION_BASIS_MISSING`）                             |
| `attempts[]`   | `PASS` / `FAIL` のとき必須    | AC の `attempts[]` と同じ欄と規則                             | 該当 AC を数えない（`QA_VERIFICATION_ATTEMPTS_EMPTY`）                            |
| `notRunReason` | `SKIP` / `NOT_RUN` のとき必須 | AC の `notRunReason` と同じ語彙                               | 理由を記録できない（`QA_VERIFICATION_REASON_MISSING`）                            |

- サブケースを持つ AC は、AC 自身の `basis`・`attempts`・`notRunReason` を持たない。持つ場合は全体を拒否する（`QA_EVIDENCE_MALFORMED`。schema で検査する）
- AC の `status` は、サブケースの最も悪い結果と一致しなければならない。悪い順は `FAIL` → `NOT_RUN` → `SKIP` → `PASS` とする。不一致は全体を拒否する（`QA_VERIFICATION_SUBCASE_STATUS_MISMATCH`）
- サブケースを持つ AC は、すべてのサブケースが §5 の条件 1〜4 を満たし、AC として条件 5〜8 を満たすときだけ verified に数える。条件 4 の実行証拠（`command`・`exitCode`）の検査もサブケースの全試行に適用し、1 件でも不備があれば AC 全体を unverified に数える。満たさない条件の reasonCode は、サブケースごとに監査結果へ残し、AC の配列にはその和集合を条件の番号順に残す
- `subcases[]` が空の配列のときは、サブケースが無いものとして扱う

#### 3.4.2 対照条件

AC の結果に任意の `controls[]` を置ける。対照は、変更前の revision で同じ検証を実行し、`FAIL` することを確かめた試行を指す。
テストが変更と無関係に常に `PASS` する（変更を検出できない）ことを見分ける材料になる。

| 項目       | 必須（欠落時の扱いは右欄） | 規則                                           | 欠落・不正時                                                                                         |
| ---------- | -------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `revision` | 必須                       | 対照を実行した commit。40 桁または 64 桁の hex | 全体を拒否（`QA_EVIDENCE_MALFORMED`）                                                                |
| `status`   | 必須                       | `PASS` / `FAIL` だけ                           | 全体を拒否（`QA_EVIDENCE_MALFORMED`）                                                                |
| `logRef`   | 必須                       | §3.5 の artifact の id                         | 欠落は全体を拒否（`QA_EVIDENCE_MALFORMED`）。存在しない id は全体を拒否（`QA_ARTIFACT_REF_UNKNOWN`） |

- 初版では、対照は verified の条件に入れない。監査結果に記録するだけとする
- 対照が無い AC は、監査結果の Gaps に残す（`QA_CONTROL_MISSING`。記録のみ）
- 対照の `status` が `PASS` だった AC も、監査結果の Gaps に残す（`QA_CONTROL_PASSED`。記録のみ）。変更前でも通る検証は、変更を検出できていないおそれがあるため
- 対照の `revision` が `target.subjectRevision` と同じ（小文字に正規化して比較）AC も、監査結果の Gaps に残す（`QA_CONTROL_SAME_REVISION`。記録のみ）。変更後の revision で実行したものは対照にならないため
- 対照の `logRef` が解決できない場合（ファイルが無い・hash の不一致・上限超過）は、AC を数えない対象にせず、監査結果の Gaps に残す（`QA_CONTROL_LOG_UNRESOLVED`。記録のみ）。対照は verified の条件に入らないので、その記録の不備で AC の判定を変えない。`QA_ARTIFACT_UNRESOLVED` などの既存の reasonCode は「数えない」の扱いを持つ。同じ reasonCode に 2 つの扱いを持たせないため、対照には専用の reasonCode を使う。同じ artifact を試行の `logRef` も指している場合は、試行の側の検査（§5 条件 4）で AC を数えない
- 対照の `logRef` が `artifacts.refs` に無い id を指す場合は、試行と同じく全体を拒否する（`QA_ARTIFACT_REF_UNKNOWN`）
- 対照は AC 単位で持ち、どのサブケースの対照かは表さない
- `revision` が実際に変更前の commit かどうかを River Review は確かめない。自己申告として §10 の残余リスクに含める

### 3.5 artifacts

| 項目                 | 必須（欠落時の扱いは右欄） | 規則                                                                                                                                                                                                                                  | 欠落・不正時                                                                                                                                                                                   |
| -------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `refs[].id`          | 必須                       | §4 と同じ id の文字種・最大長。証拠内で一意                                                                                                                                                                                           | 全体を拒否（`QA_ARTIFACT_ID_INVALID`）                                                                                                                                                         |
| `refs[].root`        | 必須                       | `repository`（対象リポジトリ）または `artifacts`（host が渡す artifact ディレクトリ）                                                                                                                                                 | 全体を拒否（`QA_ARTIFACT_PATH_REJECTED`）                                                                                                                                                      |
| `refs[].path`        | 必須                       | `root` からの相対パス（下記の読み取り規則）。URL は受け付けない（River Review はネットワークから取得しない）。schema は `英字:` で始まる値を URL の scheme やドライブ名とみなして拒否するため、`trace:1.zip` のような名前も拒否される | 全体を拒否（`QA_ARTIFACT_PATH_REJECTED`）                                                                                                                                                      |
| `refs[].sha256`      | 必須                       | 64 桁の hex。小文字に正規化して比較する                                                                                                                                                                                               | 参照する AC を数えない（`QA_ARTIFACT_HASH_MISMATCH`。ファイルが無ければ `QA_ARTIFACT_UNRESOLVED`、上限超過なら `QA_ARTIFACT_TOO_LARGE`）。対照の `logRef` からの参照を除く（§3.4.2。記録のみ） |
| `refs[].sensitivity` | 任意                       | `restricted` / `public`。欠落時は `restricted`                                                                                                                                                                                        | —                                                                                                                                                                                              |
| `reproduction`       | 任意                       | 再実行の手順。出力・保存の前に redaction を通す                                                                                                                                                                                       | —                                                                                                                                                                                              |

CI のログや trace は、CI の artifact ストアや作業ツリーの外に置かれることが多い。
そのため、対象リポジトリのほかに、host が明示的に渡したディレクトリを 2 つ目のルート（`artifacts`）として認める。
host が渡していない場合、`root: artifacts` の参照は `QA_ARTIFACT_UNRESOLVED` とする。

読み取り規則（hash を計算するときに River Review が守る。どちらのルートにも同じ規則を適用する）:

- パスは NFC に正規化し、絶対パス・`..` を含むパスは拒否する
- パスのすべての成分を実体まで解決し、指定したルートの中に収まることを確かめる。途中の成分を含め、symlink は拒否する
- `.git/` 配下と、既存の除外規則（`src/lib/repo-context.mjs:82` が使う `shouldExcludeForContext`）に当たるパスは、読む前に拒否する。除外規則は再実装せず import する
- 通常ファイルだけを読む。FIFO・デバイス・ディレクトリは拒否する。ハードリンク（リンク数 2 以上）も拒否する
- 開いたファイル記述子から種類とリンク数を確かめ、同じ記述子から hash を計算する（検査と読み取りの間の差し替えを防ぐ）
- 成分ごとの検査を終えてから開くまでの間に、途中のディレクトリを symlink に差し替えられると、リポジトリの外のファイルを開けてしまう。開く時点まで symlink を拒否できる方式（ルートから成分ごとに symlink を辿らずに開く、など）を実装の要件とし、差し替えの競合を再現する fixture を置く。そうした方式を実装できない環境では、artifact を読まずに `QA_ARTIFACT_UNRESOLVED` とする。初版の実装（`src/lib/qa-evidence.mjs`）でこの要件を満たすのは、macOS 11 以降の `O_NOFOLLOW_ANY` だけである。Node 22 には Linux でこれに当たる方式が無いので、Linux を含むほかの環境では artifact を開かない
- 1 ファイルあたりと合計のバイト数に上限を置く（§2.1。1 ファイル 100 MiB、合計 512 MiB）
- 未追跡のファイル（CI の成果物など）も読んでよい。そのため artifact は対象 revision に結び付かない。これは §10 の残余リスクとして扱う

artifact は、River Review の監査が終わるまで残す。
監査の前に削除・移動された artifact は `QA_ARTIFACT_UNRESOLVED` になり、その artifact を参照する AC は数えない（対照の `logRef` からの参照を除く）。
対照のログが失われた場合は `QA_CONTROL_LOG_UNRESOLVED` を記録するだけとする（§3.4.2）。
CI の artifact ストアの保存期間が監査より短い場合も同じ扱いになる。

`sensitivity: restricted` の artifact は、出力に id だけを出し、パスとサイズを出さない。
River Review は artifact の本文を出力しない。trace やログの中の秘密情報は、利用者が取り除く。

### 3.6 gaps

| 項目      | 必須 | 規則                                                                                            |
| --------- | ---- | ----------------------------------------------------------------------------------------------- |
| `items[]` | 任意 | 未確定の要求、環境の障害、証拠の不足、残余リスク、再開の条件。出力・保存の前に redaction を通す |

`gaps` が空でも、River Review が §5・§7 の検証で見つけた不足は出力の Gaps に加える。

## 4. AC の規則

### 4.1 確定した AC 一覧の出所と信頼

- 確定した AC の一覧（id、必須・任意、期待結果）は、証拠とは別の入力から取る。task-completion-review が読む要求・タスクの記録と同じ入力を使う
- 一覧は、参照（リポジトリ内のパス）と sha256 で版を固定する。人間が確定したことの根拠（承認の記録の参照）も持つ
- 一覧・hash・承認記録が、レビュー対象の PR と同じ作業ツリー（head 側）にある場合、PR の作成者が同じ PR で書き換えられる。この場合の一覧は「信頼できない母集団」として扱う
- 信頼できる母集団は、host が head とは別に用意した版（既存の `trusted_tree` と同じく base 側の checkout。`runners/github-action/action.yml:65-74`）から読んだ一覧に限る。初版でこの経路を配線しない場合、母集団は常に信頼できない
- 一覧が無い、参照・hash・承認記録のどれかが欠ける、または信頼できない場合は、母集団を確定できないものとする（`QA_AC_POPULATION_UNKNOWN`。全 AC を数えない）。この場合も §4.3 の照合は診断として行い、結果を監査結果に残す

### 4.2 id の規則

- id の正規化は `nonEmptyNfcString`（`src/lib/promotion-candidates.mjs:424-427`。前後の空白を除いて NFC にする）に一本化し、再実装しない。正規化の結果が `null` なら全体を拒否（`QA_TARGET_AC_ID_INVALID`）
- 正規化した id は `[A-Za-z0-9._-]` の文字だけからなり、最大 128 文字とする。違反は全体を拒否（`QA_TARGET_AC_ID_INVALID`）。PR コメントなどへの出力で Markdown や @メンションを注入させないため
- 重複判定と一覧との照合は、正規化した値で行う

### 4.3 3 つの集合の照合

確定した一覧（C）、証拠の `target.acceptanceCriteria`（T）、証拠の `verification`（V）の有無の組み合わせごとに扱いを決める。

| C    | T    | V          | 扱い                                                                 |
| ---- | ---- | ---------- | -------------------------------------------------------------------- |
| あり | あり | あり       | §5 で判定する                                                        |
| あり | あり | なし       | `NOT_RUN` として数えない（`QA_VERIFICATION_AC_MISSING`）             |
| あり | なし | あり       | 全体を拒否（`QA_TARGET_AC_MISSING`。期待値が無い結果を受け付けない） |
| あり | なし | なし       | `NOT_RUN` として数えない（`QA_VERIFICATION_AC_MISSING`）             |
| なし | あり | どちらでも | 全体を拒否（`QA_TARGET_AC_UNKNOWN`）                                 |
| なし | なし | あり       | 全体を拒否（`QA_VERIFICATION_AC_UNKNOWN`）                           |

母集団を確定できない場合（§4.1）は、T を C の代わりに使って照合し、結果を診断として残す。

## 5. verified に数える条件

AC を verified に数えるのは、次をすべて満たす場合だけとする。
満たさない AC は unverified に数える。満たさない条件の reasonCode は、短絡評価せず、すべて条件の番号順に配列で残す。

1. `status` が `PASS`（`QA_VERIFICATION_NOT_PASS`）
2. `basis` が `verified`（`QA_VERIFICATION_EXPLORE_ONLY`）で、すべての試行の `assertions` が `total ≥ 1` かつ `passed = total`（`QA_VERIFICATION_ASSERTIONS_MISSING`）
3. すべての試行が `PASS`。途中に `FAIL` がある AC は flaky とし、数えない（`QA_VERIFICATION_FLAKY`）
4. すべての試行の `logRef` が解決でき、hash が一致する（§3.5）。hash の一致は改変が無いことだけを示し、ログの内容が正しいことは示さない。ログの内容の検証は本契約の範囲外とする。あわせて、すべての試行が実行証拠を持つ（§3.4）。`command` がある（`QA_EXECUTION_COMMAND_MISSING`）。`exitCode` が数値で取れている（`QA_EXECUTION_EXIT_CODE_UNKNOWN`）。`exitCode` が試行の `status` と一致する（`QA_EXECUTION_EXIT_CODE_MISMATCH`）。サブケースを持たない AC は自身の全試行に、サブケースを持つ AC は全サブケースの全試行に適用し、1 件でも満たさなければ AC を数えない
5. `target.subjectRevision` が、River Review が観測した HEAD と一致し、追跡中のファイルに未コミットの変更が無い（既存の `dirty` の判定を使う。`src/lib/result-store.mjs:74-78`）。HEAD の不一致は stale（`QA_TARGET_REVISION_STALE`）。HEAD を取得できない、または `dirty` が `true` か不明なら `QA_TARGET_REVISION_UNOBSERVED`。`dirty` は River Review が監査する時点で判定する。依存の導入やスナップショットの更新で追跡中のファイルが変わると `dirty` になるため、変わったファイルの一覧を監査結果の Gaps に残す。利用者には、追跡中のファイルを変えない手順で証拠を作るよう、利用者向けガイドで案内する
6. 期待値の出所が `sourced` で、`sourceRef` が解決でき hash が一致し、その出所が変更前から在る（§4.1 と同じく、host が head とは別に用意した版にある）。`derived` は `QA_TARGET_EXPECTED_DERIVED`、`reproduced` は `QA_TARGET_EXPECTED_REPRODUCED`、出所が head 側にしか無い場合は `QA_TARGET_EXPECTED_SOURCE_UNTRUSTED`
7. §3 の実行全体に関わる必須欄がそろい、証拠の `expected.value` が確定した AC 一覧の期待結果と一致する（`QA_TARGET_EXPECTED_MISMATCH`）。比較は redaction の前の値で行う
8. 独立性が `unknown` ではない（`QA_INDEPENDENCE_UNKNOWN`）。初版では、この条件を満たす経路が無い（§9）

期待値の出所は 3 区分とする。

| 区分         | 意味                                               | verified に数えるか                                                                    |
| ------------ | -------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `sourced`    | 要求・仕様など、変更前から在る出所が示された期待値 | 数える（`sourceRef` が信頼できる版にあることの検証が必要）                             |
| `reproduced` | 主張された挙動を再現して得た期待値                 | 数えない（参考結果。「主張どおり動いた」ことしか示さず、要件を満たした根拠にならない） |
| `derived`    | 検証する側が導いた期待値                           | 数えない（参考結果）                                                                   |

`sourced` でも、変更自身が加えた文書（head 側にしか無い出所）から取った期待値は、要件を満たした根拠にならないので数えない。

テストの方針:

- 独立性の判定は、検証モジュールの外から注入できる形にする。本番の経路では常に `unknown` を渡すことを、別のテストで固定する
- 独立性を `known` と仮定した正例 1 件で、verified になることを確かめる
- 条件 1〜7 を 1 つずつ外した負例で、期待する reasonCode の配列を完全一致で固定する
- 本番の経路で verified が常に 0 になることを固定する（「初版の verified は常に 0」）

## 6. 独立性と provenance

- 独立性・provenance の根拠は、証拠 JSON とは別の経路で host が River Review へ渡す情報だけとする
- 証拠の中で利用者が書いた run ID・実行者・監査者は、記録として読むが、独立性の根拠にしない。証拠の中の run ID を書き換えても独立性の判定が変わらないことを、負例で固定する
- 比較の基準になる commit は、River Review が観測した HEAD とする
- GitHub Action の `pull_request` では、checkout した HEAD が merge commit になることがある。PR head と merge commit のどちらと照合するかは、入力の配線を行う PR で決める
- 実行と監査が同じセッションで行われた場合も `unknown` とする
- 初版では独立性は常に `unknown` である。次の写像は、将来 host 経路が加わったときのためのもので、初版では使わない

| reviewer-independence の入力 | QA での対応                         |
| ---------------------------- | ----------------------------------- |
| `finderRunId`                | 実行した run の ID（host が渡す値） |
| `verifierRunId`              | River Review が監査を行う run の ID |

## 7. 検証の段階と、上限・redaction

§4.1 の母集団の確定は、証拠とは別の入力だけで決まるので、証拠の検証とは独立に、最初に行う（段階 0）。
証拠の検証は段階 1 から順に行う。全体を拒否する段階では、その段階で見つかった違反をすべて報告し、証拠の検証の次の段階へは進まない。
証拠を全体で拒否した場合も、段階 0 で母集団が確定していれば、§8.1 の投影は行う。

| 段階 | 内容                                                                                    | 不合格のとき                                                                                  |
| ---- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 0    | §4.1 の母集団の確定（証拠とは独立）                                                     | 確定できなければ全 AC を数えない（`QA_AC_POPULATION_UNKNOWN`）。§4.3 の照合は診断として続ける |
| 1    | JSON として解釈する。サイズ・深さ・件数・文字列長の上限、定義に無い欄                   | 全体を拒否（`QA_EVIDENCE_MALFORMED`、`QA_EVIDENCE_TOO_LARGE`）                                |
| 2    | すべての文字列欄に redaction を掛けた写しを作る（照合は元の値、出力と保存は写しを使う） | redaction が失敗したら全体を拒否（`QA_EVIDENCE_REDACTION_FAILED`）                            |
| 3    | §3 の形式と整合（全体を拒否する reasonCode）                                            | 全体を拒否                                                                                    |
| 4    | §4.3 の照合（全体を拒否する組み合わせを含む）                                           | 表のとおり                                                                                    |
| 5    | §5 の AC ごとの判定                                                                     | 数えない                                                                                      |

- 段階 1 と 3 の構造の検査には `schemas/qa-evidence.schema.json` を使う。検証モジュールは Ajv 2020（`ajv/dist/2020.js`）と `ajv-formats` を `strict: true` で使う。`startedAt` が `format: date-time` を使うので、`ajv-formats` が無いと strict の Ajv は schema をコンパイルできない
- schema の一括検査は、段階 1 の違反（定義に無い欄、型、長さ、件数）と段階 3 の違反（必須欄の欠落、パターン、enum）を 1 回で同時に返すことがある。その場合は、両方の段階の違反をすべて報告してよい。どちらの場合も全体を拒否する扱いは変わらない

- redaction には既存の `redactText`（`src/lib/secret-redactor.mjs`。import 例は `src/lib/review-engine.mjs:21`）を使い、再実装しない。文字列単位で適用できるかは、schema の PR で確かめる（本メモの作成時点では、リポジトリの読み取り制限によりこのファイルを確認していない）
- 秘密情報らしい値が見つかっても、証拠は拒否しない。置換した写しで処理を続け、置換した件数だけを監査結果に記録する
- reasonCode・エラーの文言・監査結果には、一致した値やその前後の文字列を含めない
- 出力では、id 以外の利用者が書いた文字列の Markdown 記法をエスケープし、`@` を無害化する

## 8. completion-assessment への投影と state

### 8.1 投影

- AC の母集団が確定しているときは、投影を必ず行う。§5 を満たす AC を verified、それ以外を unverified とする。初版では常に `verified = 0`、`unverified = total`
- 証拠を全体で拒否した場合も、母集団が確定していれば `verified = 0`、`unverified = total` を投影する
- 母集団を確定できない場合は、`total` を決められないので投影しない
- completion-judge が投影を省いたり、件数を上書きしたりすることは認めない
- QA 証拠の投影は、completion-assessment の tests の evidence を `present` にしない
- reasonCode は既存の `ACCEPTANCE_CRITERION_UNVERIFIED` に対応付ける。QA 固有の reasonCode（本メモの `QA_*`）は監査結果の側に残す

### 8.2 state

`state` は completion-judge が決め、QA 証拠を扱うコードは出さない。

- QA を求める評価（QA Only / Review + QA）では、次のどれに当たっても completion-judge は `COMPLETE` を出さない。Review Only には適用しない
  - QA 証拠が無い
  - 証拠を全体で拒否した
  - 母集団を確定できない
- schema が別の state を強制する場合は、そちらを優先する（人間の判断が要る場合の `HUMAN_JUDGMENT_REQUIRED`。`schemas/completion-assessment.schema.json:402-422`）
- 判定に到達しない理由がある場合は、schema が許す範囲で `BLOCKED` を選べる（`:484-485` は許容するだけで、強制はしない）
- それ以外は `UNVERIFIED` とする
- `INCOMPLETE`（確認した不成立）は、completion-assessment の evidence に `missing` / `unreadable` が無い場合だけ許される（`:464-488`）。QA の投影は tests の evidence を `present` にせず、初版の独立性は常に `unknown` なので、初版では QA 証拠から `INCOMPLETE` は生じない。利用者が報告した `FAIL` は、監査結果に「利用者が報告した不成立」として残す
- 初版で QA 証拠から `COMPLETE` と `INCOMPLETE` が生じないことを、テストで固定する

### 8.3 completion capability

`src/lib/qa-completion.mjs` が、§8.1 の投影に state を補った completion-assessment を組み立てる。
組み立てた文書は `schemas/completion-assessment.schema.json` で検証し、適合しなければ例外を投げる。
Flow には `executeFlow` の `capabilities['evaluate-completion']` として注入する。gate の入力は増やさない。

入力は次の 4 つとする。

| 入力                    | 内容                                                                                                                                                             |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 監査結果                | `auditQaEvidence` の戻り値。QA 証拠が無いときは `null`                                                                                                           |
| 投影                    | `projectQaEvidence` を import して監査結果から得る。件数と reasonCode を再計算しない                                                                             |
| QA artifact             | 保存した監査結果のパスと sha256（`serializeQaArtifact` の出力）。sha256 が監査結果と一致しなければ拒否する。確認済みの `FAIL` の一覧は、この artifact の側に残す |
| completion-judge の部分 | scope ごとに下表。tests・diff などの evidence も completion-judge が渡す。acceptanceCriteria の evidence は本モジュールだけが書く                                |

| scope   | completion-judge が渡すもの                                                                                                                             |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `task`  | `tasks`（schema `:211-225`）。AC の件数があれば `requirements` も渡す                                                                                   |
| `final` | `validation` と `requirements`（schema `:228-239`）。母集団を確定できず投影が無いときは、AC の件数も渡す。この件数の `verified` は 0 でなければならない |

判定表（監査結果の区分と state）:

| 区分                      | 条件                                             | state        |
| ------------------------- | ------------------------------------------------ | ------------ |
| `evidence-absent`         | QA 証拠が無い                                    | `UNVERIFIED` |
| `evidence-rejected`       | 証拠を全体で拒否した                             | `UNVERIFIED` |
| `population-undetermined` | 母集団を確定できない（初版の本番経路は常にこれ） | `UNVERIFIED` |
| `all-verified`            | unverified が 0                                  | `UNVERIFIED` |
| `unconfirmed-only`        | unverified がすべて確認不能                      | `UNVERIFIED` |
| `failed-only`             | unverified がすべて確認済みの `FAIL`             | `INCOMPLETE` |
| `mixed`                   | 確認済みの `FAIL` と確認不能が混在               | `INCOMPLETE` |

- 確認済みの `FAIL` は、`status` が `FAIL` で、§5 の不成立が `QA_VERIFICATION_NOT_PASS` と `QA_VERIFICATION_ASSERTIONS_MISSING` だけの AC を指す。独立性が `unknown` の初版では、どの `FAIL` もこれに当たらない
- 表は `COMPLETE` を持たない。全 AC が verified でも、QA 証拠だけでは `COMPLETE` にしない（§8.2）
- evidence に `missing` / `unreadable` があれば、`INCOMPLETE` は `UNVERIFIED` に倒す。schema（`:464-488`）が禁じるのは `missing` だけだが、§8.2 に合わせて `unreadable` も含める
- `validation.state` が `REQUIRES_HUMAN_JUDGMENT` なら `HUMAN_JUDGMENT_REQUIRED`、completion-judge が `blockedBy` を渡せば `BLOCKED` を、表より優先する

## 9. host 経路（既存経路の調査結果）

確認した範囲（main `e78b5234`）では、利用者に偽造されない形で「どの run か」「実行者と監査者が別か」を River Review に渡す既存の経路は無い。

| 経路                                                                   | 既存コード                                                                                      | 利用者が偽造できるか                                                            | 本契約での扱い                                                                                 |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `GITHUB_ACTIONS`                                                       | `src/lib/result-store.mjs:72`、`:90-99`                                                         | できる（同ファイル `:72` に明記）                                               | 使わない                                                                                       |
| `GITHUB_EVENT_PATH`（PR の labels・body）                              | `src/lib/pr-context.mjs:8-33`                                                                   | できる（環境変数で上書きでき、優先される）                                      | 使わない                                                                                       |
| `GITHUB_SHA` / `GITHUB_RUN_ID` / `GITHUB_RUN_ATTEMPT` / `GITHUB_ACTOR` | 参照箇所なし（`git grep` で 0 件）                                                              | 同じジョブの中では子プロセスへ別の値を渡せる（一般仕様。未検証）                | 使わない                                                                                       |
| ローカルの git HEAD                                                    | `src/lib/git.mjs`（`getHeadSha` = `git rev-parse HEAD`）                                        | できる（対象リポジトリは利用者の管理下）                                        | 照合の基準値としてだけ使う（下記）                                                             |
| run record の `runId`                                                  | `src/lib/result-store.mjs`、`src/lib/shadow-aggregate.mjs:70`（`P1_TRUST_LEVEL = 'untrusted'`） | できる                                                                          | 使わない                                                                                       |
| River Review 内部の execution ID                                       | `src/lib/reviewer-orchestrator.mjs`（プロセス内で採番）                                         | 外部入力からは注入できない                                                      | River Review 内部の LLM 実行どうしの分離にだけ有効。外部の QA 実行者との区別には使えない       |
| `trusted_tree`（base 側の checkout）                                   | `runners/github-action/action.yml:65-74`                                                        | PR の作成者は偽造できない。ワークフローを書くリポジトリ所有者は任意の値を渡せる | 確定した AC 一覧の信頼できる出所の候補（§4.1）。初版で配線するかは入力の配線を行う PR で決める |
| Ed25519 の detached attestation                                        | `src/lib/replay-verification.mjs:98`、`:161`                                                    | 秘密鍵を持たない人は偽造できない                                                | 唯一の先例。本契約の初版では使わない（下記）                                                   |

決定:

- 初版では、独立性は全件 `unknown` とする。QA 証拠の AC は、§5 の他の条件を満たしても verified に数えない
- `target.subjectRevision` は、River Review が観測した HEAD（`git rev-parse HEAD`）と照合する。一致しなければ stale として扱う。この照合は「証拠が別の revision を指していないか」の整合性検査であり、真正性の根拠ではない
- 独立性を `unknown` 以外にするには、新しい host 経路が要る。候補は次の 2 つで、どちらも本契約の範囲外とし、必要になった時点で別の ADR で判断する
  - 署名: 既存の Ed25519 attestation（`src/lib/replay-verification.mjs`）と同じ形で、実行側が証拠に署名し、公開鍵を host が渡す。守れる相手は鍵の持ち主で決まる
  - Action の input: 既存の `trusted_tree` と同じ形で、base 側の値を host が渡す。守れる相手は PR の作成者であり、ワークフローを書くリポジトリ所有者ではない

## 10. 残余リスク

初版では §5 条件 8 によって verified が常に 0 になるため、次のリスクは誤った合格に直結しない。
将来、独立性の host 経路を加えるときは、その前に次をすべて解消する。

- 確定した AC 一覧を head 側から読む限り、PR の作成者が母集団を書き換えられる（§4.1）
- artifact は作業ツリーや host が渡すディレクトリから読むため、対象 revision に結び付かない。どちらのルートも利用者が中身を決められる（§3.5）
- HEAD は利用者が任意に決められる（§5 条件 5）
- `assertions`・試行の記録・期待値の出所は自己申告である（§3.4、§5）。試行を省いた証拠は見分けられない
- 対照条件の `revision` が変更前の commit であることは自己申告である（§3.4.2）
- サブケースの分け方は自己申告である。サブケースは期待値を持たず、確定した AC 一覧にもサブケースの一覧が無いので、省かれたサブケースは見分けられない（§3.4.1）。サブケースごとの期待値と、確定した一覧によるサブケースの照合は将来の課題とする
- artifact は監査が終わるまで利用者の手元や CI に残っている必要がある。監査の前に削除・移動されたものは `QA_ARTIFACT_UNRESOLVED` になり、その AC は数えない（§3.5）
- Linux で artifact を読む方式（例: ネイティブの openat2 / `RESOLVE_NO_SYMLINKS`）は将来の課題とする。初版では verified が常に 0 なので、判定は変わらない（§3.5）

利用者向けガイド（ADR-017 Rollout 手順 6）には、artifact を River Review の監査が終わるまで残す（CI の artifact の保存期間を監査より長くする）ことを書く。

## 11. QA 計画の出力形式

- 基本 QA: 確定した AC ごとに 1 件以上。レビューの指摘が 0 件でも作る
- 追加 QA: レビューの所見から作る。由来の所見 ID（既存 finding の ID）を持つ
- 各項目は由来（`acceptance-criterion` / `review-finding`）、優先度、重複先の項目 ID を持つ

構造は `schemas/qa-plan.schema.json` で検査し、組み立ては `src/lib/qa-plan.mjs` の `buildQaPlan` が行う（writer は未配線）。

```text
qa-plan
├── schemaVersion … "1"
├── basic         … 基本 QA（1 件以上）
└── additional    … 追加 QA（0 件でもよい）
```

| 欄            | 基本 QA                                  | 追加 QA                                                                                   |
| ------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------- |
| `id`          | `ac:<acId>`                              | `finding:<findingId>`                                                                     |
| `origin`      | `acceptance-criterion`                   | `review-finding`                                                                          |
| `acId`        | 確定した AC の id（§4.2 で正規化した値） | —                                                                                         |
| `findingId`   | —                                        | 所見の既存の `id`（例: `rr-1`）。`nonEmptyNfcString` を通すだけで再導出しない             |
| `priority`    | 必須の AC は `P1`、任意の AC は `P3`     | 所見の severity を `normalizeSeverity` → `severityToPriority` で写した値                  |
| `duplicateOf` | `null`                                   | 所見の `criterionRefs` のうち、確定した AC に一致する最初の id の基本 QA。無ければ `null` |

- すべての欄は必須とする。QA 計画は River Review が出力するもので、利用者入力ではないため
- 項目は id だけを持ち、AC や所見の本文を写さない。本文を写すと、redaction と文字列の上限が QA 計画にも要るため
- 優先度の語彙は `src/lib/finding-factory.mjs` の `severityToPriority`（`P1`〜`P4`）に合わせる。severity が不明な所見は `normalizeSeverity` の fail-safe により `P2` になる
- AC の `required` が `false` のときだけ任意とし、欠落は必須として扱う（安全側）
- `duplicateOf` は記録だけとし、重複とした項目も計画から消さない
- `:` は正規化した AC の id に現れない（§4.2）ので、2 種類の項目の id は衝突しない。項目の id が計画内で一意であることと、`duplicateOf` が同じ計画の項目を指すことは `buildQaPlan` が保証し、schema では検査しない
- AC の id が §4.2 に違反する場合、所見の id が空または上限を超える場合、id が重複する場合、件数が上限を超える場合は、`buildQaPlan` が例外を投げる。AC や所見を黙って落とさない

上限値:

| 対象                                    | 上限  | 根拠                                                                          |
| --------------------------------------- | ----- | ----------------------------------------------------------------------------- |
| `buildQaPlan` が受け取る AC の件数      | 200   | §2.1 の `target.acceptanceCriteria` と同じ                                    |
| `basic` の件数                          | 1,000 | AC 200 件それぞれに 5 件まで。`buildQaPlan` は AC 1 件につき 1 件を作る       |
| `additional` の件数、受け取る所見の件数 | 500   | 1 回のレビューの所見として十分。超えたら例外を投げ、切り捨てない              |
| `acId`、`findingId`                     | 160   | §2.1 の id の生の値と同じ。AC の id は正規化後 128 文字の規則（§4.2）も満たす |
| `id`、`duplicateOf`                     | 168   | `finding:` の 8 文字 + 160                                                    |

## 12. reasonCode 一覧

テストでは、本表の reasonCode の集合と、負例 fixture が実際に出した reasonCode の集合が一致することを、両方向で確かめる。表の行数も定数で固定する。

| reasonCode                                | 扱い                  | 節       |
| ----------------------------------------- | --------------------- | -------- |
| `QA_TARGET_REPOSITORY_INVALID`            | 全体を拒否            | 3.1      |
| `QA_TARGET_REVISION_INVALID`              | 全体を拒否            | 3.1      |
| `QA_TARGET_AC_EMPTY`                      | 全体を拒否            | 3.1      |
| `QA_TARGET_AC_ID_INVALID`                 | 全体を拒否            | 3.1、4.2 |
| `QA_TARGET_AC_ID_DUPLICATE`               | 全体を拒否            | 3.1、4.2 |
| `QA_TARGET_AC_MISSING`                    | 全体を拒否            | 4.3      |
| `QA_TARGET_AC_UNKNOWN`                    | 全体を拒否            | 4.3      |
| `QA_TARGET_EXPECTED_MISSING`              | 数えない              | 3.1      |
| `QA_TARGET_EXPECTED_SOURCE_MISSING`       | 数えない              | 3.1      |
| `QA_TARGET_EXPECTED_SOURCE_UNRESOLVED`    | 数えない              | 3.1      |
| `QA_TARGET_EXPECTED_DERIVED`              | 数えない              | 5        |
| `QA_TARGET_EXPECTED_REPRODUCED`           | 数えない              | 5        |
| `QA_TARGET_EXPECTED_SOURCE_UNTRUSTED`     | 数えない              | 5        |
| `QA_TARGET_EXPECTED_MISMATCH`             | 数えない              | 5        |
| `QA_TARGET_REVISION_STALE`                | 数えない              | 5        |
| `QA_TARGET_REVISION_UNOBSERVED`           | 数えない              | 5        |
| `QA_EXECUTION_RUNNER_MISSING`             | 全 AC を数えない      | 3.2      |
| `QA_EXECUTION_COMMAND_MISSING`            | 数えない              | 3.4      |
| `QA_EXECUTION_EXIT_CODE_UNKNOWN`          | 数えない              | 3.4      |
| `QA_EXECUTION_EXIT_CODE_MISMATCH`         | 数えない              | 3.4      |
| `QA_ENVIRONMENT_INCOMPLETE`               | 全 AC を数えない      | 3.3      |
| `QA_VERIFICATION_AC_UNKNOWN`              | 全体を拒否            | 3.4、4.3 |
| `QA_VERIFICATION_AC_DUPLICATE`            | 全体を拒否            | 3.4      |
| `QA_VERIFICATION_AC_MISSING`              | 数えない（`NOT_RUN`） | 4.3      |
| `QA_VERIFICATION_STATUS_INVALID`          | 全体を拒否            | 3.4      |
| `QA_VERIFICATION_STATUS_MISMATCH`         | 全体を拒否            | 3.4      |
| `QA_VERIFICATION_BASIS_MISSING`           | 数えない              | 3.4      |
| `QA_VERIFICATION_ATTEMPTS_EMPTY`          | 数えない              | 3.4      |
| `QA_VERIFICATION_REASON_MISSING`          | 記録のみ              | 3.4      |
| `QA_VERIFICATION_ATTEMPTS_UNORDERED`      | 全体を拒否            | 3.4      |
| `QA_VERIFICATION_ATTEMPT_INVALID`         | 全体を拒否            | 3.4      |
| `QA_VERIFICATION_SUBCASE_ID_INVALID`      | 全体を拒否            | 3.4.1    |
| `QA_VERIFICATION_SUBCASE_STATUS_MISMATCH` | 全体を拒否            | 3.4.1    |
| `QA_CONTROL_MISSING`                      | 記録のみ              | 3.4.2    |
| `QA_CONTROL_PASSED`                       | 記録のみ              | 3.4.2    |
| `QA_CONTROL_SAME_REVISION`                | 記録のみ              | 3.4.2    |
| `QA_CONTROL_LOG_UNRESOLVED`               | 記録のみ              | 3.4.2    |
| `QA_VERIFICATION_NOT_PASS`                | 数えない              | 5        |
| `QA_VERIFICATION_EXPLORE_ONLY`            | 数えない              | 5        |
| `QA_VERIFICATION_ASSERTIONS_MISSING`      | 数えない              | 5        |
| `QA_VERIFICATION_FLAKY`                   | 数えない              | 5        |
| `QA_ARTIFACT_ID_INVALID`                  | 全体を拒否            | 3.5      |
| `QA_ARTIFACT_REF_UNKNOWN`                 | 全体を拒否            | 3.4      |
| `QA_ARTIFACT_PATH_REJECTED`               | 全体を拒否            | 3.5      |
| `QA_ARTIFACT_HASH_MISMATCH`               | 数えない              | 3.5      |
| `QA_ARTIFACT_UNRESOLVED`                  | 数えない              | 3.5      |
| `QA_ARTIFACT_TOO_LARGE`                   | 数えない              | 3.5      |
| `QA_AC_POPULATION_UNKNOWN`                | 全 AC を数えない      | 4.1      |
| `QA_INDEPENDENCE_UNKNOWN`                 | 数えない              | 5        |
| `QA_EVIDENCE_MALFORMED`                   | 全体を拒否            | 3.2、7   |
| `QA_EVIDENCE_TOO_LARGE`                   | 全体を拒否            | 2、7     |
| `QA_EVIDENCE_REDACTION_FAILED`            | 全体を拒否            | 7        |
