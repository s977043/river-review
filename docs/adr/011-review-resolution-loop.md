# ADR-011: Review Resolution Loop—語彙の線引きと Phase 着手前提

## Status

Accepted for Phase 0 of #2322—本 ADR は語彙の所有権と各 Phase の着手前提だけを固定します。schema は作らず、コードも変更しません。Gate の挙動も変えません。

計測はすべて `origin/main` `dd1717fb` に対して 2026-09-20 に実施しました。件数は成長するディレクトリの観測値であり、契約値ではありません。

## Context

Epic #2322 は、Review Team が出した finding を PR 作者がどう扱い、その対応が後続 revision で本当に解消されたかを追跡する層（Review Resolution）を提案します。Epic 本文は責務境界を丁寧に切っていますが、着手前に確かめるべき前提が 3 系統あります。語彙の空き状況、Phase 2 / Phase 4 が参照先とする実装の到達状況、そして finding 消失を判定するために必要な情報の有無です。

### 観測 1—`disposition` は repo 内で 4 つの別々の意味を持つ

| #   | 意味                                                                                | 位置                                                                                                           | 実装状況                                                                      |
| --- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 1   | review system として finding をどう扱うか（`blocking` / `advisory` / `suppressed`） | [ADR-007](./007-semantic-precision-pass.md) / [ADR-008](./008-actionability-axis-absorbed-into-disposition.md) | docs のみ。`src/` にも `schemas/` にも当該 enum は存在しない                  |
| 2   | prefilter が付ける抑制理由（`SUPPRESS_REASONS` 由来）                               | [`src/lib/finding-factory.mjs`](../../src/lib/finding-factory.mjs) `:500` / `:577` / `:639` / `:642`           | 実装済み。`classifyFindings` の `suppressed` は「disposition のみ」を保持する |
| 3   | feedback taxonomy の 8 値                                                           | [`src/lib/feedback.mjs`](../../src/lib/feedback.mjs) `:12-25`                                                  | 実装済み。`:21` のコメントが `out_of_scope` を「8th disposition」と明記する   |
| 4   | evidence state が明示的に排除する上流概念としての言及                               | [`src/lib/finding-evidence-state.mjs`](../../src/lib/finding-evidence-state.mjs) `:8` / `:54`                  | 実装済み（否定形の参照）                                                      |

`schemas/` に `disposition` を名乗るフィールドは 1 件もありません（`git grep -n "disposition" origin/main -- 'schemas/'` が 0 件）。つまり **公開スキーマ上の `disposition` は現時点で未使用**であり、意味 1 は予約、意味 3 が実運用の所有者です。

意味 3 の値は次の 8 つです（`feedback.mjs:12-25`）。

```text
accepted / false_positive / missed_issue / not_actionable
duplicate / accepted_risk / unclear / out_of_scope
```

ADR-008 は `actionability` 軸を新設せず意味 1 の `disposition` へ吸収すると決めています。したがって意味 1 は将来さらに広がる方向にあり、空き語ではありません。

### 観測 2—`resolution` / `resolved` は 4 系統で先約がある

| #   | 値集合                                                             | 位置                                                                                                                                                                                                                                                                                                       | 指しているもの                                  |
| --- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| 1   | `resolved` / `missing` / `unavailable`                             | [`src/lib/execution-manifest.mjs`](../../src/lib/execution-manifest.mjs) `:73` / `:320-321`、[`schemas/execution-manifest.schema.json`](../../schemas/execution-manifest.schema.json) `:36`、[`schemas/cross-runtime-conformance.schema.json`](../../schemas/cross-runtime-conformance.schema.json) `:214` | provenance block を run が記録できたか          |
| 2   | `unresolvedRefs` / `UNRESOLVED_REFERENCE`                          | [`schemas/completion-assessment.schema.json`](../../schemas/completion-assessment.schema.json) `:151` / `:285` / `:527`、[`schemas/cross-artifact-consistency.schema.json`](../../schemas/cross-artifact-consistency.schema.json) `:96`                                                                    | 参照先が解決できない成果物                      |
| 3   | `established` / `unresolved` / `refuted`                           | [`src/lib/finding-evidence-state.mjs`](../../src/lib/finding-evidence-state.mjs) `:13` / `:71`、[`schemas/security-audit-run-record.schema.json`](../../schemas/security-audit-run-record.schema.json) `:57` / `:165`                                                                                      | finding の主張が証拠で接地したか                |
| 4   | `new` / `resolved` / `persisting` / `score_changed` / `oscillated` | [`src/lib/review-differ.mjs`](../../src/lib/review-differ.mjs) `:5` / `:47-58`                                                                                                                                                                                                                             | 前 run にあった fingerprint が今 run に無いこと |

系統 4 は本 Epic にとって最も重要です。`diffReviews` は fingerprint が現 run に無いだけで `changeStatus: 'resolved'` を付けます（`review-differ.mjs:48-57`）。Epic が「finding が消えた ≠ 解決」と決めたその誤りを、**既存コードが `resolved` という語で毎 run 実行している**という状態です。Epic 本文はこの衝突に触れていません。

### 観測 3—直近ウェーブで状態語彙がさらに 3 系統入った

- `pass` / `fail` / `unrunnable`—[`src/lib/deterministic-command-executor.mjs`](../../src/lib/deterministic-command-executor.mjs) `:107`
- `planned` / `covered` / `blocked` / `deferred` / `out_of_scope`—[`src/lib/security-audit-coverage.mjs`](../../src/lib/security-audit-coverage.mjs) `:16-22`
- `ALL_REQUIREMENTS_SATISFIED` / `REQUIREMENT_UNSATISFIED`—[`schemas/completion-assessment.schema.json`](../../schemas/completion-assessment.schema.json) `:522-523`

Epic が `authorResponse.state` に提案した値のうち 3 つが字面で衝突します。`accepted` と `accepted_risk` は観測 1 の意味 3 と重なります。`deferred` は上記 2 番目の `security-audit-coverage.mjs` の状態語彙と重なります。

### 観測 4—Phase 2 の参照先は恒等関数である

`adjudicateFindings`（`src/lib/finding-factory.mjs:561-563`）の本体は次の 1 行です。

```js
return { retained: [...findings], suppressed: [] };
```

直上の JSDoc（`:550`）は「In Phase 1 this is deliberately the identity function」と自ら明記しています。`blocking` / `advisory` / `suppressed` を算出する経路も、`finding.judgment` を書き込む経路も存在しません。Epic Phase 2 の「#1857 の `finding.judgment`（存在する場合）」は、**現時点で常に「存在しない場合」に落ちます**。

### 観測 5—Finding Critic はパイプライン未配線である

[`src/lib/finding-critic.mjs`](../../src/lib/finding-critic.mjs) `:12` が自ら「Nothing here is reachable from `src/cli/**` by design」と書いています。実際の import 元は `finding-critic-runner.mjs:42`、`finding-evidence-state.mjs:1`、`src/prompt/sections.mjs:26` の 3 つです。[`src/lib/review-engine.mjs`](../../src/lib/review-engine.mjs) からの import は 0 件でした（`:48` はコメントでの言及のみ）。[`schemas/review-artifact.schema.json`](../../schemas/review-artifact.schema.json) に `validation` プロパティはありません（`grep -n '"validation"'` が 0 件）。

つまり Epic Phase 4 の「#1978 の既存 contract を再利用」は、**#1978 を主経路へ配線するという別 Epic 規模の前提**を内包しています。

### 観測 6—finding 消失の判定に足りない情報が 3 つある

**区別できるもの**（[`schemas/review-coverage.schema.json`](../../schemas/review-coverage.schema.json)）。

- reviewer の timeout / failure / 未実行—`units[].status` の `completed` / `failed` / `timed_out`（`:81-84`）と `reasonCode` の `reviewer_timeout` / `reviewer_error`（`:85-89`）
- 実行全体の到達度—`complete` / `partial` / `not_executed`（`:20-22`）
- routing 変更—`skippedSkills`（[`schemas/review-artifact.schema.json`](../../schemas/review-artifact.schema.json) `:64`）
- scope 変更—`fileScope.excluded[].reasonCode` の `configured_exclusion` / `diff_optimization`（`review-coverage.schema.json:123-126`）

**足りないもの**。

1. **fingerprint が model variation で変わる。** `fingerprintKeyBase`（`src/lib/finding-factory.mjs:673-682`）は `ruleId::file::message先頭60字` を鍵とする。`ruleId` と `file` が同じでも、LLM の言い回しが先頭 60 字の範囲で変われば別 fingerprint になる。Epic は model variation を消失原因として列挙する一方、**fingerprint 設計そのものが原因である**ことには触れていない。
2. **`suppressed` / `overflow` に fingerprint が無い。** `classifyFindings`（`finding-factory.mjs:650-660`）は 3 段の出力をそのまま連結して返すだけであり、`annotateFingerprints` を通さない。run をまたいで「抑制されて消えた」を追跡する鍵が無い。
3. **`reviewCoverage` と finding の対応付けが無い。** `units[]` は `findingsCount`（`review-coverage.schema.json:91`）という件数しか持たず、どの finding がどの unit から出たかを記録しない。「timeout した unit が原因で消えた」を finding 単位で判定できない。

### 観測 7—dogfood の前提データが存在しない

2026-09-20 に `.river/` を実測しました。

| 指標                                                      | 実測値                                          |
| --------------------------------------------------------- | ----------------------------------------------- |
| 保存済み run record                                       | 6 件                                            |
| 全 run の finding 合計                                    | 6 件                                            |
| そのうち `ruleId: "unknown"`（スキル未マッチの fallback） | 6 件                                            |
| **LLM を通った finding**                                  | **0 件**                                        |
| `debug` を持つ run                                        | 0 件                                            |
| finding が持つ distinct fingerprint                       | 2 件                                            |
| feedback 行                                               | 43 件（`2026-06.jsonl` 1 / `2026-07.jsonl` 42） |
| `findingFingerprint` を持つ feedback 行                   | 1 件                                            |
| **run と join できる feedback 行**                        | **0 件**                                        |

feedback 行の型分布は `accepted` 30 / `false_positive` 9 / `out_of_scope` 3 / `not_actionable` 1 です。また feedback 行のキーは `timestamp, trigger, feedbackType, skillId, findingFingerprint, evidence, pr, reviewer, reversedBy` であり、**`reviewRunId` に相当するフィールドを持ちません**。run id 側からの join は語彙として成立しません。

ADR-007 末尾が記録した「43 件中 0 件」「6 件すべてに `debug` が無い」は、2026-09-20 時点でも同じです。唯一の差は ADR-008 が「43 件中 1 件」と書いた箇所で、これは `findingFingerprint` フィールドを持つ行が 1 件ある、という意味であり、その 1 件も保存済み run の 2 つの fingerprint とは一致しません。

## Decision

### D1—Epic が使う語は `Resolution` とし、`disposition` は使わない

Epic 本文の判断を追認します。加えて根拠を次のように固定します。

- `disposition` は観測 1 のとおり 4 義であり、うち意味 3（feedback 8 値）が実運用の所有者、意味 1 が ADR-007 / ADR-008 の予約語である。5 番目の意味を足さない
- `Resolution` は観測 2 のとおり 4 系統で先約があるが、**いずれも finding 単位の人間対応状態ではない**。系統 1 は provenance、系統 2 は参照解決、系統 3 は証拠接地、系統 4 は run 間の出現差である
- 代替案として検討した `authorAction` / `handling` は、いずれも「検証後の確定状態」を表せない。本 Epic の対象は author の行為（`authorResponse`）とその検証結果（`verification`）の両方を束ねる状態であり、行為だけを指す語では狭い

**ただし系統 4 との衝突は放置しない。** `review-differ.mjs` の `changeStatus: 'resolved'` は「前 run の fingerprint が今 run に無い」以上の意味を持たないことを、Phase 1 の契約テキストで明示します。本 ADR では `review-differ.mjs` の語をリネームしません（既存 consumer への波及が Phase 0 の範囲を超えるため）。~~リネームの要否は未決とします。~~ → リネームの要否は issue #2325 で決着しました（リネームせず qualification を足す）。

この明示は issue #2325 で実装しました。`resolved` という値は互換のため保ち、各エントリへ「何を測ったか」を示す `basis` と、現 run の `coverageStatus` を併記します。coverage が `complete` でない場合、`summary.absenceMayBeUnexecuted` が true になります。

### D2—`authorResponse.state` の値集合を feedback 8 値と字面で分離する

Epic 提案は `none | accepted | disputed | accepted_risk | deferred | needs_human` です。このうち `accepted` と `accepted_risk` は `feedback.mjs:12-25` と字面が一致します。`deferred` は `security-audit-coverage.mjs:19` と一致します。

Epic 自身が「`verified_resolved` → `accepted` の **proposal** は可能」「`human_dismissed` → `false_positive` と断定しない」という非 1:1 写像を要求している以上、両者が同じ字面を持つことは危険です。同じ語で違う母集団を数えるレポートが機械的に作れてしまいます。

したがって **Phase 1 の schema では `authorResponse.state` の値を feedback 8 値と 1 つも重ねない**ことを決定します。具体的な値集合は Phase 1 で決めます。本 ADR が固定するのは「重ねない」という制約だけです。候補としては動詞側へ寄せる形（`will_fix` / `wont_fix` / `disputes` / `accepts_risk` / `postpones` / `escalates`）を挙げますが、**採否は未決**です。

`resolution.state` と `verification.state` にも同じ制約を置きます。Epic 提案は次の 2 組です。

```text
resolution.state   : open / action_submitted / risk_accepted / human_dismissed / deferred / needs_human
verification.state : not_requested / pending / not_reproduced / verified_resolved / persists / inconclusive
```

このうち観測 3 と衝突するのは `deferred` だけであり、ここも Phase 1 で分離します。

### D3—語彙の所有権マトリクス

| 語                                                                 | 所有レイヤ                         | 位置                                                 | 本 Epic からの扱い                       |
| ------------------------------------------------------------------ | ---------------------------------- | ---------------------------------------------------- | ---------------------------------------- |
| `severity` / `confidence`                                          | finding の性質                     | `finding-factory.mjs` / `schemas/output.schema.json` | 参照のみ                                 |
| `disposition`（`blocking` / `advisory` / `suppressed`）            | Semantic Precision（予約、未実装） | ADR-007 / ADR-008                                    | 参照のみ。再計算しない                   |
| `suppressReason`                                                   | prefilter                          | `finding-factory.mjs:500` 周辺                       | 参照のみ                                 |
| `feedbackType`（8 値）                                             | Feedback                           | `feedback.mjs:12-25`                                 | proposal の生成先。append は明示承認のみ |
| `evidenceState`（`established` / `unresolved` / `refuted`）        | Finding Critic / security audit    | `finding-evidence-state.mjs:13`                      | 参照のみ                                 |
| `changeStatus`（`new` / `resolved` / …）                           | run 間の出現差                     | `review-differ.mjs:5`                                | **解決の証拠として使わない**             |
| `units[].status`（`completed` / `failed` / `timed_out`）           | Review Coverage                    | `review-coverage.schema.json:81-84`                  | verification の前提条件として読む        |
| `resolution.state` / `verification.state` / `authorResponse.state` | **本 Epic**                        | Phase 1 で新設                                       | 所有する                                 |

### D4—Review Artifact は immutable、Resolution は sidecar

Epic 本文の方針を追認します。根拠は観測 4 / 5 と独立で、`schemas/review-artifact.schema.json` の `$defs.finding` が `additionalProperties: false` であるという ADR-007 の既知事実です。finding へ人間対応状態を足すことは additive な no-op にならず、既存 Artifact の検証と後方互換性を毎回問い直すことになります。

### D5—GitHub コメントは projection であり SSoT ではない

Epic 本文の方針を追認します。そのうえで前提条件を 1 つ足します。Epic が「既存 Stable Contract」として挙げる `<!-- river-review -->` marker は、**現在 2 種類が混在しています**。

- `src/cli/render.mjs:26`—`<!-- river-review -->`
- `runners/github-action/post-comment.cjs:3` / `post-inline-comments.cjs:33`—`<!-- river-reviewer -->`

`pages/reference/stable-interfaces.md:136` が宣言しているのは前者だけです。issue #2323 がこの不整合を扱っています。Phase 3 は #2323 の結論を前提とします。

## 各 Phase の着手前提

本 ADR は Phase の順序を変えません。各 Phase の前に何が満たされている必要があるかだけを固定します。これは Epic 本文が誤っているという指摘ではなく、Epic が参照先として挙げた実装の到達状況が Phase 着手時に変わりうるため、着手判定を検証可能な形に降ろすものです。

| Phase             | 着手前提                                                                                                                                           | 2026-09-20 時点の充足                                                                                  | 未充足時の扱い                                                                                                                                                                 |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1 Contract        | `authorResponse.state` の値集合が feedback 8 値と重ならないこと（D2）                                                                              | 未確定（Phase 1 で決める）                                                                             | —                                                                                                                                                                              |
| 1 Contract        | 新 schema を `pages/reference/stable-interfaces.md`（ja / en）へ登録すること。issue #2316 が 30 中 20 の未登録を記録しており、新設分で穴を広げない | 未着手                                                                                                 | 登録を同一 PR の義務とする                                                                                                                                                     |
| 2 Organizer       | `finding.judgment` を産出する経路が存在すること                                                                                                    | **未充足。** `adjudicateFindings` は恒等関数（`finding-factory.mjs:561-563`）                          | `judgment` 欄を optional とし、欠落時は legacy policy を参照するだけにとどめる。Epic 本文の「#1857 未有効時は legacy policy を参照するだけで再判定しない」がそのまま適用される |
| 2 Organizer       | Review Coverage が run record に保存されていること                                                                                                 | 未確認（保存済み 6 run はいずれも `debug` を持たない）                                                 | blind spot 表示は coverage 欠落自体を 1 つの blind spot として出す                                                                                                             |
| 3 Host / PR       | PR コメント marker が 1 種に収束していること（#2323）                                                                                              | **未充足。** 2 種混在                                                                                  | #2323 の解決を待つか、Phase 3 が marker 収束を自身のスコープに含める。どちらにするかは**未決**                                                                                 |
| 4 Verification    | Finding Critic（#1978）が主経路から到達可能であること                                                                                              | **未充足。** `review-engine.mjs` からの import 0 件、`finding-critic.mjs:12` が自ら unreachable と明記 | #1978 の配線を Phase 4 の前提 issue として切り出す。Phase 4 の中で片手間に配線しない                                                                                           |
| 4 Verification    | `schemas/review-artifact.schema.json` に `validation` を置く場所があること                                                                         | **未充足。** 当該プロパティ無し                                                                        | 同上                                                                                                                                                                           |
| 4 Verification    | fail-safe の判定材料が揃うこと（`units[].status` / `reasonCode`）                                                                                  | 充足（`review-coverage.schema.json:81-89`）                                                            | —                                                                                                                                                                              |
| 5 Feedback bridge | feedback 行が run と join できること                                                                                                               | **未充足。** 43 行中 0 行。feedback のキーに `reviewRunId` 相当が無い                                  | proposal の provenance を `reviewRunId` + fingerprint で持つ設計自体は可能だが、既存 43 行は遡って join できない。Phase 5 の評価母集団は Phase 5 以降に生成された行のみとなる  |
| 6 Bootstrap       | Core Loop の dogfood が済んでいること                                                                                                              | **未充足。** LLM を通った finding が 0 件                                                              | Epic の dogfood ゲート（5〜10 PR）は provider API キー登録という人間作業に依存する。ADR-007 の `observe` 着手条件 1 と同一の前提であり、二重に待つ必要はない                   |

fail-safe の適用範囲について 1 点補足します。issue #2320 は、staging 不完全という同一事象を evidence 層では `unrunnable` と読み、gate 層では checker の exit code どおりに読む、という二重解釈を扱っています。Epic Phase 4 の「coverage partial は必ず `inconclusive`」は同型の設計判断です。**#2320 の結論が先例になります。** 片方の層だけを fail-safe にすると同じ形の乖離が再発します。

## 本 ADR が決めないこと

- `authorResponse.state` / `resolution.state` / `verification.state` の具体的な値。D2 は「feedback 8 値と重ねない」という制約だけを固定する
- ~~`review-differ.mjs` の `changeStatus: 'resolved'` をリネームするか~~ → issue #2325 で決着。リネームせず `basis` と `coverageStatus` の併記で qualification する
- Phase 3 が marker 収束（#2323）を自身のスコープに含めるか、#2323 の解決を待つか
- fingerprint 設計（先頭 60 字依存）を変更するか。変更は `.river/memory/index.json` に永続化済みの v1 値へ波及するため（`finding-factory.mjs:690-696`）、本 Epic の範囲では扱わない
- `suppressed` / `overflow` へ fingerprint を付けるか。付ければ観測 6 の 2 が解消するが、`classifyFindings` の戻り値の形が変わる
- `reviewCoverage.units[]` と finding を対応付けるか。観測 6 の 3 の解消手段だが、Review Coverage 側の契約変更になる
- Historical Team Knowledge Bootstrap の raw comment 永続化方針。Epic 本文の「既定で永続化しない」を覆す決定は本 ADR では行わない

## Consequences

- Phase 2 と Phase 4 は、Epic 本文が前提とした実装（`finding.judgment` / #1978 配線）が無い状態で着手されうる。上表はその場合の縮退動作を明示しており、Phase 2 は表示のみ、Phase 4 は `verified_resolved` へ上げられないまま `not_reproduced` と `inconclusive` だけを運用する形になる
- Phase 4 の前提として #1978 の配線が必要になるため、Epic 全体のクリティカルパスは Epic 本文の Phase 列より長い。Phase 1〜3 は前提が軽く、Phase 4 以降が重い、という非対称が残る
- 語彙を字面で分離する決定（D2）により、`resolution` と `feedback` の間の写像は必ず明示的な変換表を経由する。Epic が禁じた機械的 1:1 mapping は、字面が違う時点で書けなくなる
- 観測 6 の 3 つの不足は本 ADR で解消しない。したがって Phase 4 の `inconclusive` は当面広く出る。これは fail-safe として意図どおりだが、利用者から見れば「判定できない」が既定に見える
- dogfood の前提が provider API キー登録に依存する点は ADR-007 と共通である。この 1 点が未達である間、#2322 と #1857 の評価はどちらも開始できない

### 再参入条件

本 ADR の決定は、次のいずれかが成立した場合に再検討します。

1. `adjudicateFindings` が恒等関数でなくなり、`finding.judgment` が Artifact に載ること。Phase 2 の縮退動作が不要になる
2. #1978 が主経路へ配線され、`schemas/review-artifact.schema.json` に `validation` が載ること。Phase 4 の前提表が書き換わる
3. feedback 行が `reviewRunId` を持ち、run と join できる母集団が生まれること。D2 の分離が実データで検証可能になる

## 関連

- #2322—Review Resolution Loop（本 ADR の起点）
- #1857—Semantic Precision Pass / Finding Adjudicator（`disposition` 意味 1 の所有者）
- #1978—Finding Critic / Evidence-Grounded Adversarial Review（Phase 4 の前提）
- #2212—Review Coverage（verification の前提条件）
- #1568—Judgment Promotion Loop（Phase 5 の下流）
- #1574—Review Evolution Cycle（multi-run 集約）
- issue #2323—PR コメント marker の 2 種混在（Phase 3 の前提）
- issue #2320—staging 不完全の gate 側の扱い（Phase 4 fail-safe の先例）
- issue #2316—schemas の stable-interfaces 未登録 20 件（Phase 1 の登録義務）
- ADR-007—Semantic Precision Pass（`severity` / `confidence` / `disposition` の責務境界）
- ADR-008—`actionability` 軸を `disposition` へ吸収（軸を増やさない先例）
- ADR-010—Security Audit Harness Integration（既存面を接続する境界 ADR の先例）
