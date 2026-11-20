# ADR-017: QA Evidence Intake—利用者が実行した QA の証拠を受け取り、独立に監査する

## Status

Proposed.

次の 3 つがそろうまで、Accepted にしません（詳細は §Rollout）。

- ADR-004 の再参入条件 1・2（`docs/adr/004-diff-based-static-review-boundary.md:31-36`）の CI 検証が、入力の配線まで含めてマージされている
- 条件 1 に入力の配線を含めてよいという解釈（D2）を、承認者が明示的に認めている
- 条件 2 の「`NO_REVIEW` へ退避」を既存の skip と読む解釈（D2）を、承認者が明示的に認めている

起点となる issue はまだありません。本文の行番号（`:NN`）は main `e78b5234` 時点のものです。

本 ADR は責務境界と入力契約の方針だけを固定します。
runtime behavior、Gate semantics、skill 選択条件、merge / release authority は変更しません。

### 利用者向けの要約

- River Review は QA（テスト・E2E）を実行しない。実行は利用者が自分の CI や runner で行う
- 利用者は、実行した結果を、決まった形式の JSON（QA 証拠）として River Review に渡す
- 初版では、QA 証拠だけで受入条件が「検証済み」になることはない。River Review は、不足・矛盾・古い revision の指摘と、残余リスクを返す
- QA 証拠を渡さない利用者には、何も変わらない

ここでの「初版」は、§Rollout の手順 1〜6 をすべて終えた時点の機能を指します。

## 用語

| 用語                                                                                       | 意味                                                                                                |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| AC                                                                                         | 受入条件（acceptance criterion）。人間が確定する                                                    |
| Consumer（利用者）                                                                         | River Review を使うリポジトリの持ち主。QA を実行し、QA 証拠を作る                                   |
| Host                                                                                       | River Review を起動する実行環境（CI・ローカル CLI・エージェントの実行基盤）。ADR-015 の Host と同じ |
| QA 証拠                                                                                    | 利用者が実行した QA の結果を、§D3 の形式で記録した JSON                                             |
| verified / unverified（小文字）                                                            | completion-assessment の AC 件数の区分                                                              |
| `COMPLETE` / `INCOMPLETE` / `UNVERIFIED` / `BLOCKED` / `HUMAN_JUDGMENT_REQUIRED`（大文字） | completion-assessment の完了状態の 5 値（`schemas/completion-assessment.schema.json:508-511`）      |
| stale                                                                                      | 証拠が指す commit が、River Review が観測した commit と一致しない状態                               |
| fail-closed                                                                                | 判断できない入力を、合格側ではなく拒否・未検証の側に倒すこと                                        |

## Context

AI エージェントが書いたコードは、差分を読むだけでは要求どおりに動くことを保証できない、と River Review は考えます。
受入条件を実際に動かして確かめる QA が重要になる一方で、
「テストが通った」「エージェントが検証済みと書いた」という報告は、それ自体では品質の承認になりません。

River Review には、この判断に使える既存の資産があります。

- `schemas/completion-assessment.schema.json`: 完了状態（`:508-511`）と AC の件数（`:60-75`）。COMPLETE には unverified が 0 件で、diff と tests の evidence が `present` であることが必要（`:242-289`、`:343-386`）
- `flows/task-completion-review.flow.json` と `agents/contracts/completion-judge.agent.json`
- `src/lib/reviewer-independence.mjs`: finder と verifier の run ID の分離
- `schemas/execution-manifest.schema.json`: 実行構成と hash の記録
- `unknown-coverage-review` ほかの監査 skill

一方で、既存の決定は次の境界を置いています。

- ADR-004（`:24-29`）: 視覚評価・計測ベース比較は取り込まない。指摘は差分内のコードにアンカーする（`:19`）。再参入条件を `:31-36` に定める
- ADR-015 D1（`:38-58`）: command executor の権限は River Review core に持ち込まない。retry / stop / escalation の実行責務は Caller / Host に残す（`:91-92`）
- ADR-013 D11（`:300-320`）: Gate は recommendation であり、execution は Host の責務

本 ADR の目的は、QA を実行しないまま、利用者の実行した QA の証拠を River Review が受け取り、独立に監査できる形を決めることです。

## Decision

### D1. River Review は QA を実行しない

テスト・E2E・runner の実行は、利用者が自分の CI・runner・エージェントで行います。
River Review は、実行の結果を公開の入力契約で受け取ります。

River Review は、テストや runner を実行せず、同梱もしません。
retry の実行、自動修復、mutant の生成も行いません。
retry・flaky・初回失敗は、証拠に記録された事実として読むだけです。

### D2. ADR-004 は改訂せず、再参入条件を満たしてから受け入れる

QA 証拠は、ADR-004 の再参入条件（`:31-36`）を満たす形で受け取ります。

1. 条件 1: QA 証拠を読む skill は、`inputContext` に QA 証拠を opt-in で宣言し、入力が提供された場合だけ選ばれる
2. 条件 2: QA 証拠が無い実行環境（GitHub Action 経路を含む）で、当該 skill が選ばれず、その理由が出力に残ることを CI で検証する

条件 1 には、次の 2 つが必要です。

- `inputContext` の値を追加する schema 拡張。現状の値は閉じた enum で、QA 証拠に当たる値が無い（`schemas/skill.schema.json:61-74`）
- QA 証拠が提供されたときに、その context を available として渡す入力の配線

ADR-004 の条件 1 は「registry 追加とスキーマ拡張だけで成立する」ことを求めています。
入力の配線がこの範囲に含まれるかは、本 ADR の承認者が判断します。

条件 2 の「`NO_REVIEW` へ退避」は、既存の入力不足の skip（`runners/core/review-runner.mjs:86-91`、`:130-132`）で、当該 skill が選ばれず、理由が出力に残ることと読みます。
現状、`NO_REVIEW` という値はコードに存在しません（`src/`・`runners/core/`・`schemas/` で 0 件）。
この読み替えは River Review 側の解釈なので、ADR-004 に注記を加えるかを、本 ADR の承認者が判断します。

既存の skill に QA 証拠の context を足すと、`inputContext` の各要素は必要条件なので、QA 入力の無い従来経路でもその skill が外れます。
そのため、QA 証拠を読むのは新しく追加する skill に限り、既存 skill の `inputContext` は変えません。

skill の選択は `inputContext` のほかに `applyTo` でも絞られ、変更ファイルが 0 件だと `applyTo` を満たす skill はありません（`runners/core/review-runner.mjs:77-84`、`:127-128`）。
そのため QA Only（差分が無い場合）では、QA 証拠を読む skill は選ばれません。
QA Only でも、誤った合格を防ぐ決定論の検証と、completion-judge による判定は skill の選択と無関係に行います。
skill による補助の読み取りを QA Only でも行うかは、skill の選択条件を変えずに済む方法があるかを含めて、入力の配線を行う PR で決めます。

QA の所見は差分ではなく AC にアンカーします。
これは ADR-004 の「指摘は差分にアンカーする」（`:19`）の対象外です。
QA の所見はレビューの指摘（issues）としてではなく、completion-assessment と QA 証拠の監査結果として出力します。
completion-assessment が AC 単位の判断を扱う点は、既存の task-completion-review と同じです。

### D3. QA 証拠は River Review の新しい公開契約が Owner になる

QA 証拠の形式は、River Review が新しい公開 schema で定義します。
欄は Target（対象）、Execution（実行）、Environment（環境）、Verification（AC 別の結果）、Artifacts（ログ等の参照）、Gaps（不足・残余リスク）の 6 つです。
各欄の詳細は `docs/development/qa-evidence-contract.md` に定めます。

AC 別の結果は `PASS` / `FAIL` / `SKIP` / `NOT_RUN` で表します。
この語彙は、他の River Review 契約の語彙へ写し替えません（ADR-013 D8 `:254-257`）。
たとえば Fast Verification の `pass` / `unrunnable` へ正規化しません。

completion-assessment へは、AC の件数だけを部分的に投影します。
件数の投影は粗く、FAIL と確認不能をどちらも `unverified` に数えます。
FAIL と確認不能の区別は、QA 証拠の側に残します。

完了の state は completion-judge が決め、QA 証拠を扱うコードは決めません。
completion-judge は QA 証拠を参照し、確認した不成立と確認不能を区別します（`schemas/completion-assessment.schema.json:488`）。

- QA を求める評価（QA Only / Review + QA）では、QA 証拠の欠落・全体の拒否・AC の母集団の未確定のどれに当たっても `COMPLETE` を出さない。Review Only には適用しない
- schema が強制する state を優先する（人間の判断が要る場合の `HUMAN_JUDGMENT_REQUIRED`。`:402-422`）。判定に到達しない理由がある場合は、schema が許す範囲で `BLOCKED` を選べる（`:484-485` は許容するだけで、強制しない）
- それ以外は `UNVERIFIED` とする
- `INCOMPLETE` は、completion-assessment の evidence に `missing` / `unreadable` が無い場合だけ許される（`:464-488`）

QA 証拠の投影は、completion-assessment の tests の evidence を `present` にしません。
初版の独立性は常に `unknown` なので、初版の QA 証拠からは `COMPLETE` と `INCOMPLETE` のどちらも生じません。
利用者が報告した `FAIL` は、監査結果に「利用者が報告した不成立」として残します。

### D4. 実行の事実・観測・検証・承認を分ける

次の 4 階層を区別し、下の階層の結果を上の階層の承認に昇格させません。

```text
AC 別の実行事実（PASS / FAIL / SKIP / NOT_RUN、初回結果と retry）
      ↓
実動作の根拠（explore = 画面などを操作して観測しただけ / verified = assertion 付きの検証）
      ↓
独立した証拠の監査（River Review）
      ↓
全体のリスク判断・人間の承認
```

- 観測しただけの AC（explore）は、検証済みにしない
- 期待値の出所は 3 つに分ける: 出所が示されたもの、主張を再現したもの、検証する側が導いたもの。検証する側が導いた期待値による結果は参考結果であり、要件を満たした PASS に数えない
- テストが通ったことで、レビューの指摘を自動的に解消しない（ADR-011 の「finding が消えた ≠ 解決」と同じ考え方。`docs/adr/011-review-resolution-loop.md:42`）
- 監査の結果は observe（記録するだけで判定を強制しない）であり、Gate を上書きしない。Gate の入力は増やさない（ADR-013 D11 `:300-320`）

### D5. 証拠は信頼しない利用者入力として扱う

QA 証拠の JSON は、利用者が作る入力です。River Review はこれを信頼しません。

- 確定した AC の一覧と必須・任意の区分は、証拠とは別の入力（人間が確定した要求・タスクの記録）から取る。証拠の中の AC 一覧と `required` は照合の対象であり、正本ではない
- 確定した AC の一覧が、レビュー対象の PR と同じ作業ツリーにある場合、PR の作成者が同じ PR で書き換えられる。信頼できる母集団は、host が head とは別に用意した版（既存の `trusted_tree` と同じく base 側の checkout）から読んだ一覧に限る
- 独立性と provenance（対象 commit、run ID、実行者と監査者の分離）の根拠は、host が証拠 JSON とは別の経路で渡す情報に限る
- `execution-manifest` の hash（`schemas/execution-manifest.schema.json:5`、`:64`）は記録の改変を検出する自己整合の検査であり、鍵を持たないので書き手を認証しない
- `reviewer-independence` が保証するのは run ID の不一致だけである（`src/lib/reviewer-independence.mjs:59-62`）。証拠の中で利用者が自己申告した ID は、独立性の根拠にしない
- host の情報が無い場合、独立性は `unknown` であり、その AC は verified に数えない（ADR-013 D6 `:180-213`）
- 実行と監査が同じセッションで行われた場合も、独立性は `unknown`
- 終了コードは数値で記録する。パイプ越しなど取得経路が確かでない値は、不明として扱う
- 証拠はログの本文を持たず、参照と sha256 だけを持つ。River Review は artifact の本文を出力しない。trace やログの中の秘密情報を取り除くのは利用者の責務である
- 証拠の中の文字列（コマンドの引数、再現手順など）は、既存の redaction を通した写しだけを出力・保存する
- 参照されたファイルは、リポジトリ内の通常ファイルだけを読む。symlink、`.git/` 配下、既存の除外規則に当たるパスは読む前に拒否する
- サイズ、深さ、件数、文字列長の上限を超えた入力は、fail-closed で拒否する

確認した範囲（main `e78b5234`）では、利用者に偽造されない形で run と実行者を River Review に渡す既存の経路はありません（調査結果は `docs/development/qa-evidence-contract.md` §9）。
そのため初版では、独立性は全件 `unknown` とし、QA 証拠のどの AC も verified に数えません。
対象 commit は River Review が観測した HEAD と照合し、不一致を stale とします。これは整合性の検査であり、真正性の根拠ではありません。
独立性を `unknown` 以外にする経路（署名、host が渡す Action の input）は、本 ADR の範囲外とし、必要になった時点で別の ADR で判断します。
その ADR では、設計メモ §10 の残余リスク（head 側の AC 一覧、revision に結び付かない artifact、利用者が決められる HEAD、自己申告の試行記録）を先に解消します。

### D6. 3 つの利用モードを持ち、Review Only を変えない

| モード      | 内容                                                                                   |
| ----------- | -------------------------------------------------------------------------------------- |
| Review Only | 従来のレビュー。挙動を変えない                                                         |
| QA Only     | 確定した AC → QA 計画 → 利用者が実行 → River Review が監査。コード差分が無くても使える |
| Review + QA | AC から作る基本 QA に、レビュー所見から作る追加 QA を重ね、結果を統合する              |

- レビューの指摘が 0 件でも、基本 QA は省略しない
- QA を使わない利用者に、追加の設定を求めない
- 新しいトップレベルコマンドは作らない

新しく追加する schema と skill は Experimental とし、`pages/reference/stable-interfaces.md`（ja / en）に登録します。
Experimental の間は、予告なく形式を変えることがあります。
Review Only の出力・Gate・終了コードは変えません。
QA 証拠の渡し方（CLI の引数か、ファイルの規定位置か）は、入力の配線を行う PR で決めます。

## Ownership matrix

| 責務                                           | Owner                                                  |
| ---------------------------------------------- | ------------------------------------------------------ |
| 要求・AC の確定と意味の変更                    | Human                                                  |
| テストの実行、retry、環境の初期化・cleanup     | Consumer / Host                                        |
| 独立性・provenance の情報                      | Host（証拠 JSON とは別の経路）                         |
| QA 計画、QA 証拠の検証と監査、残余リスクの集約 | River Review                                           |
| 完了の state                                   | completion-judge（River Review の既存 Agent Contract） |
| merge・release・本番反映                       | Human / Host                                           |

## Rejected Alternatives

### A. River Review が QA を実行する

不採用。ADR-015 D1 が command executor の権限を River Review core に持ち込まないと決めており、実行・retry・cleanup の副作用と権限の管理が River Review に集中します。

### B. QA の結果を Gate の入力に加える

不採用。ADR-013 D11 は、すべての evidence が Gate に入るとは仮定しません。Gate の判定語彙と入力を変えると、Review Only の利用者にも影響します。

### C. 既存の Fast Verification の語彙に正規化する

不採用。ADR-013 D8 は、各状態を owning contract の語彙のまま保持し、横断の共通語彙へ正規化しないと定めています。AC 単位の結果と、検査 1 回ごとの結果は意味が違います。

### D. 証拠 JSON の中の ID と AC 一覧を信頼する

不採用。利用者は証拠を自由に書けるため、AC を省く、必須を任意に変える、ID を別々にして独立性を装う、といった操作で誤った合格を作れます（D5）。

## Failure modes

### 1. テストが通ったことを承認と誤認する

CI の exit 0、スクリーンショット、別 commit の PASS は、必須 AC の完了を意味しません。
commit の不一致は stale として扱い、PASS に数えません。

### 2. 未実行を合格と誤認する

0 件の実行、必須 AC の `SKIP` / `NOT_RUN` は、COMPLETE になりません（ADR-013 D8 `:233-252`）。
試行の途中の FAIL は flaky として数えません。
ただし、利用者が失敗した試行を証拠から省いた場合、River Review はそれを見分けられません。初版でこの場合に誤った合格が起きないのは、独立性が常に `unknown` だからです。

### 3. 自己申告を独立性や母集団の証拠にする

証拠の中の ID が別々でも、利用者が書いた値なら独立性の根拠になりません。
証拠の中の AC 一覧が短くても、確定した AC 一覧に無い分は未実行として扱います。

### 4. 証拠の取り込みで秘密情報を広げる

trace やログには、認証情報や個人情報が含まれ得ます。
River Review は本文を取り込まず、参照と hash だけを扱います。

## Rollout

実装は次の順に、PR を分けて進めます。各 PR は人間がマージします（ADR-016 の段階 1）。
階層は ADR-016 の階層表（`:125-164`）による見込みで、PR ごとに確認します。

| 手順 | 内容                                                                                                                          | 階層の見込み                                   |
| ---- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| 1    | 本 ADR と、入力契約の設計メモ（`docs/development/qa-evidence-contract.md`）                                                   | 崖（`docs/adr/**`）                            |
| 2    | QA 証拠の schema と、`pages/reference/stable-interfaces.md`（ja / en）への Experimental 登録                                  | 崖（stable-interfaces）                        |
| 3    | 合成の負例・正例 fixture と、決定論の検証モジュール                                                                           | 丘                                             |
| 4    | completion-assessment への部分投影、QA 証拠を読む新しい skill と `inputContext` の拡張（planner 層の単体テストまで）、QA 計画 | 丘（`deterministicGate.command` に触れれば崖） |
| 5    | 入力の配線、completion capability の実装、3 モードの Flow と GitHub Action への配布、条件 1・2 の CI 検証                     | 崖（`flows/**`、`agents/**`）                  |
| 6    | 利用者向けガイドと、公開リポジトリ 1 件での試行（PoC: proof of concept）                                                      | 原っぱ・丘                                     |

各段階で、Review Only の既存テストが変わらないことを確かめます。

条件 1・2 の CI 検証は、入力の配線の後（手順 5）に、次の 2 つを対にして行います。
配線の前に検証すると、QA の context が available になる経路が無いので、検証が常に成功してしまうためです。

- QA 証拠が無いとき: 当該 skill は選ばれず、その理由は GitHub Action 経路の出力（review の成果物）に残る
- QA 証拠があるとき: 当該 skill は選ばれる

本 ADR を Accepted にするかは、§Status の 3 つがそろった時点で判断します。
承認者が条件 1 または条件 2 の解釈を認めない場合は、ADR-004 の改訂を先に行います。

## Consequences

### Positive

- River Review が実行権限を持たないまま、QA の証拠を独立に監査できる
- 既存の完了判定・独立性・provenance の資産を再利用し、新しい役や Gate を作らない
- 未実行・不明・自己申告を合格に変換しない規則が、決定論のコードとテストで固定される

### Trade-offs

- 利用者が証拠を公開契約の形で出力する手間が増える
- 初版では独立性が常に `unknown` で、QA 証拠からは verified の AC が生まれない。得られるのは不足・矛盾・stale の指摘と残余リスクである
- host が base 側の AC 一覧を渡す経路を配線するまでは、AC の母集団は信頼できず、件数の投影も行われない
- 新しい公開 schema が 1 つ増え、Experimental から Stable へ昇格させる判断が後で必要になる

## Non-goals

- テスト・E2E・runner の実行と同梱
- retry・自動修復・mutant の生成
- 新しい Gate、stopCondition、Gate 入力の追加
- skill の選択条件の変更、既存 skill の `inputContext` の変更
- 必須 CI 化、自動マージ、権限の緩和
- 特定の QA ツールの出力形式への依存

## References

- `docs/adr/003-risk-tiered-human-supervision.md`
- `docs/adr/004-diff-based-static-review-boundary.md`
- `docs/adr/011-review-resolution-loop.md`
- `docs/adr/013-evidence-architecture.md`
- `docs/adr/015-action-review-boundary.md`
- `docs/adr/016-repo-operation-risk-tiers.md`
- `docs/development/qa-evidence-contract.md`
- `schemas/completion-assessment.schema.json`
- `schemas/execution-manifest.schema.json`
- `schemas/skill.schema.json`
- `src/lib/reviewer-independence.mjs`
- `runners/core/review-runner.mjs`
