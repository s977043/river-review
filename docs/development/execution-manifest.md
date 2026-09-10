# Execution Manifest（1 回の Review Run の実行証跡）

Review Run ごとに「何を使って判断したか」を再現可能な形で固定する契約です（#2015 / Epic #2011 Phase 4）。

- 契約スキーマ: `schemas/execution-manifest.schema.json`
- 実装: `src/lib/execution-manifest.mjs`
- 検証: `tests/execution-manifest.test.mjs`
- 決定的 fixture: `tests/fixtures/execution-manifest/complete.json` / `partial.json`

Skill は「何を判断するか」、Agent は「誰が責任を持つか」、Flow は「いつ・どう判断を実行するか」を担います。Execution Manifest はそれらの**実行時の版と hash** を 1 通の文書へ固定し、後から改竄を検出できるようにします。

## Experiment Manifest との違い

`buildExperimentManifest`（`src/lib/paired-replay.mjs`）を拡張せず、別文書として新設しました。理由は主語が違うためです。

| 観点         | Experiment Manifest（契約3）                        | Execution Manifest（#2015）             |
| ------------ | --------------------------------------------------- | --------------------------------------- |
| 主語         | baseline / candidate 2 構成の実験                   | 単一の Review Run                       |
| 必須ブロック | `baseline` / `candidate` / `dataset` / `acceptance` | `flow` / `agents` / `skills` / `policy` |
| 入力         | 既に生成済みの run record 群                        | 1 回の実行構成                          |
| id namespace | `RR-EXP-`                                           | `RR-EXM-`                               |

両者の必須ブロックは重ならないため、1 文書へ統合すると `kind` による条件付き required が十数フィールドに増えます。`additionalProperties: false` な文書を 2 通に分けるほうが契約として強くなります。

一方で**導出（derivation）は共有**します。`sha256Hex`・`canonicalJson`・`nonEmptyNfcString`・`deriveReviewRunId` は既存モジュールから import しており、本モジュールは 1 つも再実装していません。`sha256Hex` は本 PR で `src/lib/shadow-aggregate.mjs` から export し、`paired-replay.mjs` の private コピーも同じ関数へ寄せました。

## ブロックと解決ステータス

manifest は 9 ブロックを持ち、各ブロックが `status` を持ちます。

| status        | 意味                                                              |
| ------------- | ----------------------------------------------------------------- |
| `resolved`    | そのブロックが必要とする値がすべて揃っている                      |
| `missing`     | 情報源は存在するが、この run が記録していない                     |
| `unavailable` | 呼び出し側が「固定すべき対象が無い」と明示した（空の skill 選択） |

`null` を単独で置かない理由は、「記録し損ねた」と「そもそも無かった」が区別できなくなるためです。この区別を失うと、replay 不能な run を replay 可能と誤認する経路がそのまま開きます（AC 3）。

## Replay の 2 クラス

| クラス          | 必要ブロック                                          | 判定                                                     |
| --------------- | ----------------------------------------------------- | -------------------------------------------------------- |
| `deterministic` | `flow` / `skills` / `artifacts` / `policy` / `config` | routing・refs・coverage・hash・gate 導出は同一結果を要求 |
| `judgment`      | 上記 + `agents` / `runtime`                           | 意味的同等性で測る。byte-for-byte 一致は要求しない       |

`assessReplayability(manifest)` が両クラスの可否と欠損ブロックを返します。manifest が無い場合は空の結果ではなく、明示的な理由付きで `not replayable` を返します。

skill は id だけでは `resolved` になりません。checksum が無ければ run と replay の間で SKILL.md 本文が変わったことを検出できないためです。

### `resolved` は「pin 済み」を意味しない

`status` は「この run がそのブロックを記録したか」に答えるだけで、「記録した内容が replay に足りるか」には答えません。`flow` は `id` だけで、`policy` は `ref` と `riskMapDigest` だけで `resolved` に達します。したがって replay 可否を `status` だけで判定すると、hash が全部 `null` の manifest でも `deterministic: true` になり、#2015 の受入基準「manifest 欠損を replay 可能と誤認しない」を破ります。

そこで `REPLAY_PINS` が、必要ブロックごとに「非 `null` でなければならない識別子」を宣言します。`assessReplayability` は `status === 'resolved'` かつ pin がすべて埋まっているブロックだけを充足として数え、足りない場合は `flow.sha256 is null` のように欠けたフィールド名を理由に載せます。

| ブロック    | deterministic replay が要求する pin | 備考                                                                             |
| ----------- | ----------------------------------- | -------------------------------------------------------------------------------- |
| `flow`      | `sha256`                            | `id` だけでは flow 定義の書き換えを検出できない                                  |
| `policy`    | `sha256`                            | `riskMapDigest` は risk map の 16-hex 切り詰めであり policy 本文の hash ではない |
| `skills`    | （追加 pin なし）                   | `normalizeSkills` が全 entry の `sha256` を `resolved` の条件に畳み込み済み      |
| `artifacts` | （追加 pin なし）                   | `normalizeArtifacts` が同様に畳み込み済み                                        |
| `config`    | （追加 pin なし）                   | `normalizeConfig` が `sha256` からしか `resolved` を作らない                     |

`agents` と `runtime` は judgment replay だけが要求します。judgment は意味的同等性で測るため、roster の id と provider / model の組が比較キーであり、追加 pin は置きません。

## 情報源の実測（本リポジトリ現況）

| ブロック      | 情報源                                                            | 現況      |
| ------------- | ----------------------------------------------------------------- | --------- |
| `riverReview` | `package.json` の `version`                                       | 解決可能  |
| `plugin`      | `.claude-plugin/plugin.json` の `version`                         | 解決可能  |
| `skills`      | `docs/data/skill-manifest.json` の `skills[].checksum`            | 解決可能  |
| `runtime`     | Review Artifact の `usage.provider` / `usage.model`               | 解決可能  |
| `policy`      | Review Artifact の `gate.inputs.riskMapDigest`                    | 部分的    |
| `agents`      | `agents/contracts/*.agent.json`（id と version。checksum は無い） | 部分的    |
| `flow`        | caller が渡す flow 実体文書（`flowDocument`）                     | 条件付き  |
| `artifacts`   | 記録する producer が未実装                                        | `missing` |
| `config`      | 記録する producer が未実装                                        | `missing` |

resolver は情報源が無いブロックを捏造せず `missing` のまま返します。

### `flow` だけ caller 経由である理由（#2037）

flow の実体文書は #2016 で実在するようになりました。実測（2026-09-04、`ls flows/`）では `flows/*.flow.json` が 8 本、`flows/intents/*.intent.json` が 8 本、加えて `flows/entry-map.json` が 1 本あります。それでも `resolveExecutionManifestSpec` はこのディレクトリを読みません。#2016 が observe mode の保証を `tests/flow-definitions.test.mjs` に固定しているからです。保証の内容は「`src/` と `runners/` のどのモジュールも `flows/` を読まない」であり、これが「Flow 文書の追加は既存の gate / decision / finding を動かしていない」ことの証明にあたります。ただし #2054 PR-3 以降、`flows/` を読む runtime モジュールは `src/lib/flow-loader.mjs` のみであり、同テストは offenders がこの 1 件と一致することを検査します（#2103）。resolver 側の直読みはこの証明を壊します。

代わりに、呼び出し側が parse 済みの文書を渡します。resolver の入力は次のとおりです。

- `flowDocument`: parse 済みの Flow 定義文書。渡された run だけが `flow` ブロックを `resolved` にできる
- `expectedFlowVersion`: caller が entry 名から解決した version。文書側の `version` と食い違えば例外であり、誤った version で pin しない。`flowDocument` を伴わない指定も例外とする（検査できない期待を黙って捨てない）。空文字・空白のみ・非文字列も例外であり、`null` / `undefined` だけが「期待を述べない」を意味する
- `flow`: 既に導出済みの pin（`{id, version, sha256}`）。`flowDocument` との同時指定は例外であり、片方を黙って採らない

`sha256` は **`canonicalJson(document)` の digest であって、ファイルのバイト列の digest ではない**点に注意してください。key 順と空白は内容ではなく整形なので、prettier の再出力で pin が無効化されないほうが正しい振る舞いです。導出は `deriveFlowPin`（`src/lib/execution-manifest.mjs`）1 箇所にあり、`canonicalJson` と `sha256Hex` を import します。

entry-map と文書の version 整合は 2 箇所で見ます。repository 時点は `tests/flow-definitions.test.mjs`（各 entry の `flowVersion` が実文書の `version` と一致するか）、run 時点は上記 `expectedFlowVersion` です。

observe mode を解除できるのは Flow 実行エンジンが着地したときだけであり、そのとき当該テストを明示的に書き換える手続きを踏みます。

## secret / raw context を複製しない仕組み（AC 2）

2 段構えで担保します。

1. **構造的拒否**: `assertNoRawContext` が `prompt` / `rawLlmOutput` / `toolOutput` / `patch` / `reasoning` などのキーを spec 全体で拒否する。redaction はパターン検出であり、貼り付けられた diff や prompt は検出できないため、そもそも該当フィールドを持たせない
2. **値の redaction**: 残る文字列 leaf すべてに `redactText`（`src/lib/secret-redactor.mjs`）を適用し、category ごとの hit 数を `redaction.hits` に記録する

redaction は hash 計算の**前**に走ります。後から redact すると、保存済み manifest と再計算 hash が食い違い、全 manifest が `verifyExecutionManifest` に落ちます。

`spec.artifacts` のキーだけは拒否対象から外しています。artifact 名としての `diff` は #2015 の manifest 候補が明示的に挙げている正当な名前であり、値は `sha256` へ正規化されるためです。

なお `src/lib/result-store.mjs` の run record 書き出しは「上流で redact 済み」という前提に依存しています（`result.reviewDebug` のコメント参照）。本 manifest はその前提の外に出ないよう、自前で redaction を持ちます。

## 後方互換と既存 run record の移行方針（AC 4 / AC 6）

Review Artifact への連結は additive・optional です。`attachExecutionManifest` は manifest が `null` のとき artifact を**同一参照のまま**返し、キー集合を変えません。manifest がある場合だけ新しい object を作ります。いずれの場合も入力を破壊的に書き換えません。

配置は `debug` 配下ではなく**トップレベル** `executionManifest` を選びました。`debug` は「構造は版をまたいで保証されない」と自ら宣言しており、「この run は replay 可能か」を answer するブロックの置き場所としては契約が弱すぎます。トップレベルは `additionalProperties: false` のため `schemas/review-artifact.schema.json` の変更が必要です。ただしこれは同スキーマが過去に繰り返してきた optional 追加と同じ形であり、`pages/reference/stable-interfaces.md` の「optional 追加は同一ファイル内」に沿います。

既存 run record の移行方針は次のとおりです。

- **遡及生成しない**: manifest 未添付の過去 run へ後から manifest を書き足さない。実行時にしか観測できない値を後付けすると、`resolved` に見えて実際は推測という最悪の状態になる
- **欠損は欠損のまま扱う**: manifest を持たない run は `assessReplayability` が `not replayable` と答える。これが正しい答えであり、埋めるべき穴ではない
- **段階的に埋める**: producer 側が `flow` / `artifacts` / `config` を記録できるようになった時点から、新しい run だけが `resolved` になる。過去 run との比較は `manifestKey` の有無で分岐する

## パイプラインへの配線（#2054 PR-4、Epic #2011 AC6）

Issue #2015 が「範囲外」としていた review パイプラインへの配線は、#2054 PR-4 で入りました。producer は `src/lib/execution-manifest-producer.mjs` の 1 箇所です。読むのは `package.json` と `docs/data/skill-manifest.json` の 2 つです。そのうえで `resolveExecutionManifestSpec` → `buildExecutionManifest` → `attachExecutionManifest` の順に本モジュールを呼びます。hash の導出は 1 つも持ちません。配線先は次の 3 経路です。

| 経路                                        | 載る場所                                            | `flow`                                              | 備考                                                                                     |
| ------------------------------------------- | --------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `river run --save`（CI 自動保存を含む）     | `.river/runs/*.json` の末尾キー `executionManifest` | `missing`（`run` は `--entry` を受け付けない）      | gate / decision の導出後に生成するため、判断は manifest を読まない                       |
| `river review plan` / `review exec`         | Review Artifact の末尾キー `executionManifest`      | `--entry` 指定時のみ `resolved`、無指定は `missing` | loader が解決した Flow 文書を `flowDocument` として渡す。resolver は `flows/` を読まない |
| `river review exec --plan <file>`（replay） | replay 結果の Artifact（上と同じ）                  | `missing`                                           | 元 artifact に manifest があれば `verifyExecutionManifest` で照合する                    |

replay の照合結果は警告にとどめます。不一致は stderr に `Warning: the execution manifest in --plan ... does not verify` を出します。`--debug` 時は `debug.replay.sourceManifest` へ `verified` / `mismatches` を残します。replay は続行し、gate / decision / findings を変えません（ADR-009 RA-1）。manifest を持たない元 artifact は照合せず、警告も出しません。

3 経路とも manifest は既存キーの**後ろ**へ additive に付き、既存キーの値と順序は変わりません。`river run --save` は origin/main と本ブランチで同じ repo を回し、`executionManifest` / `timestamp` / `runId` を除いた record の一致を確認しました。`tests/cli-run-execution-manifest.test.mjs` は同じ不変条件を「manifest を外して `attachExecutionManifest` で付け直すと元の record へ戻る」形で固定します。既存 fixture と保存済み run record は書き換えません。

### 経路ごとの実測（2026-09-06、`river run --dry-run --save` と `river review plan --plan-only --entry review-task`）

GitHub Action（`runners/github-action/dist/index.mjs`、`RIVER_REPO_ROOT` 指定）の `run --save` も `run --save` 列と同じ結果です。producer は `RIVER_REPO_ROOT` を優先して `package.json` を探すため、bundle 内でも `riverReview` / `skills` が `resolved` になります。`tests/integration/dist-run-record-smoke.test.mjs` が committed dist に対してこれを固定します。

| ブロック      | `run --save` | `review plan --entry` | `review plan`（無指定） | 理由                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------- | ------------ | --------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `riverReview` | `resolved`   | `resolved`            | `resolved`              | `package.json` の `version`                                                                                                                                                                                                                                                                                                                                                                                     |
| `skills`      | `resolved`   | `unavailable`         | `unavailable`           | 選択 skill が 1 件以上なら `resolved`、0 件なら `unavailable`（checksum は `docs/data/skill-manifest.json`）。fixture の plan は `--phase upstream` で 0 件（dry-run で選べる heuristic 対応 skill 9 件は全部 midstream / downstream）。実測: `src/app.mjs` の diff を持つ mktemp repo に `--phase midstream --base HEAD~1` を回すと 5 件選択され、`--entry` の有無どちらも `resolved`（`skillSetHash` は同一） |
| `flow`        | `missing`    | `resolved`            | `missing`               | `--entry` で解決した Flow 文書だけが pin になる                                                                                                                                                                                                                                                                                                                                                                 |
| `plugin`      | `missing`    | `missing`             | `missing`               | host を知る経路が CLI に無い。推測で埋めない                                                                                                                                                                                                                                                                                                                                                                    |
| `agents`      | `missing`    | `missing`             | `missing`               | CLI 経路は agent roster を持たない                                                                                                                                                                                                                                                                                                                                                                              |
| `artifacts`   | `missing`    | `missing`             | `missing`               | 入力 artifact の hash を記録する producer が未実装                                                                                                                                                                                                                                                                                                                                                              |
| `policy`      | `missing`    | `missing`             | `missing`               | `policy.ref` を記録する producer が未実装（`riskMapDigest` だけでは `resolved` にならない）                                                                                                                                                                                                                                                                                                                     |
| `runtime`     | `missing`    | `missing`             | `missing`               | dry-run / no-key では LLM が走らず `usage` が無い。LLM 実行時は `usage` から `resolved`                                                                                                                                                                                                                                                                                                                         |
| `config`      | `missing`    | `missing`             | `missing`               | config の hash を記録する producer が未実装                                                                                                                                                                                                                                                                                                                                                                     |

`assessReplayability` は上記いずれの経路でも `deterministic: false` を返します。`flow` が pin されても `artifacts` / `policy` / `config` が欠けているためであり、これは「replay 可能と誤認しない」という AC 3 の要求どおりの答えです。

## 未実装

- replay の実行エンジン（deterministic replay の再実行、judgment replay の意味的比較）
- `artifacts` / `policy.ref` / `config` / `plugin` / `agents` を記録する producer（上表で `missing` のまま残るブロック）
- judgment replay dataset との連結
