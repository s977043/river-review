# `--reviewers` フラグリファレンス

> **スコープ注意**: このページは `river run` の `--reviewers` フラグと検証コマンドのみを扱います。
>
> - `river run` の全フラグ（`--phase` / `--planner` / `--dry-run` / `--output` / `--max-cost` / `--debug` / `--estimate` など）は **[stable-interfaces.md](./stable-interfaces.md)** を参照してください。
> - W-check で使用する `river review exec` のフラグ（`--artifact`, `--ensemble`, `--phase`）は **[W-check ガイド](../guides/w-check.md)** および **[cli-review-exec-spec.md](./cli-review-exec-spec.md)** を参照してください。

Runner CLI を使用して、River Review のエージェントとスキルをローカルまたは CI で検証します。
軽量な Python ランナーが `schemas/output.schema.json` に従う構造化されたレビュー結果を出力します。
Python の例を実行する前に、`pip install jsonschema` で必要な依存関係をインストールしてください。

## `--reviewers` フラグ

`river run` の `--reviewers` フラグにはロール名のリスト（カンマ区切り）または特殊キーワード `auto` を指定できます。

### `auto` キーワード

`--reviewers auto` を指定すると、diff の内容を解析してレビュアーロールを自動選択します。`bug-hunter` は常に含まれ、以下のシグナルに基づいて追加ロールが加わります。

| シグナル                                                                                                                      | 追加されるロール      |
| ----------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| config / schema / migration / infra ファイルが変更されている、またはリスク評価済みファイルが存在する                          | `security-scanner`    |
| test ファイルが変更されている、または app ファイルが 3 件以上ある                                                             | `test-gap`            |
| package manifest / lockfile（`package.json` / `package-lock.json` / `pnpm-lock.yaml` / `yarn.lock`）が変更されている          | `dependency-reviewer` |
| UI / コンポーネント / スタイル（`.tsx` / `.jsx` / `.css` / `.scss` / `.sass` / `.less` / `.vue` / `.svelte`）が変更されている | `frontend-reviewer`   |
| `.github/workflows/` 配下のワークフローが変更されている                                                                       | `ci-cd-reviewer`      |

シグナルが何もない場合は `bug-hunter` のみが使われます。

JSON 出力の `autoSelectedRoles` フィールドで選択されたロールを確認できます。

```json
{
  "autoSelectedRoles": ["bug-hunter", "security-scanner"]
}
```

### 大きな diff の分割と findings の重複排除

複数のロール（`auto` を含む）でレビューする場合、大きな diff は自動的にチャンクに分割され、ロール × チャンクで並列実行されます。各実行から得られた findings は、最終 ID を割り当てる前にチャンク・ロール間で重複排除されます（実装: `src/lib/reviewer-orchestrator.mjs` の `splitDiffIntoChunks` / `deduplicateFindings`）。このため、同一箇所の重複指摘は 1 件に統合されます。

### 進捗出力とロール単位タイムアウト

並列ロール実行では、ロールの開始・完了・失敗を 1 行ずつ **stderr** に出力します。成果物は stdout に出るため、進捗行が JSON / YAML / Markdown を汚すことはありません。

```text
Reviewer bug-hunter: start
Reviewer security-scanner: start
Reviewer bug-hunter: done in 6.2s (3 findings)
Reviewer security-scanner: timeout after 120.0s (other chunks/roles continue)
Reviewers: 1/2 roles succeeded, 0 failed, 120.0s total (timed out: security-scanner)
```

関連するフラグと環境変数は次のとおりです。

| 名前                     | 種別   | 既定値                                | 説明                                                                                                                                           |
| ------------------------ | ------ | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `--quiet`                | flag   | `false`                               | 上記のロール進捗行だけを抑止する。`river run` が出す他のログ（実行ヘッダーや `Run saved:` など）には作用しない                                 |
| `RIVER_REVIEWER_TIMEOUT` | env    | 未設定                                | ロール 1 件あたりの上限ミリ秒。`1`〜`3600000` の整数のみ受理し、範囲外・非整数は警告のうえ無視する（`review.orchestrator.timeoutMs` より優先） |
| `review.orchestrator.*`  | config | `timeoutMs` 未設定 / `progress: true` | `.river-review.json` 側の同等設定。詳細は [コンフィグ / スキーマ概要](./config-schema.md) を参照                                               |

ロール単位のタイムアウトは既定で無効（無制限）です。**既定のままなら待ち時間は従来と変わりません**。この PR で変わるのは観測性だけであり、上限を明示的に設定した場合にのみ打ち切りが働きます。

タイムアウトは fail-soft であり、上限に達したロールを失敗として記録したうえで、残りのロールの findings で処理を続行します。全体を中断しません。**成功ロールが 1 件も無い場合は「レビュー未実行」として扱い**、gate は GO になりません（`decision` は `human-review-required`、`--gate` の終了コードは 0 以外）。

打ち切りの事実は次の場所から観測できます。

| 経路                                 | 見える場所                                                                                                |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `--output json`                      | top-level の `timedOutRoles`（打ち切られたロール名の配列。1 件も無ければキー自体が出ない）                |
| run record（`--save` / CI 自動保存） | `reviewDebug.timeoutMs` / `reviewDebug.timedOutRoles` / `reviewDebug.durationMs`                          |
| ライブラリとして呼ぶ場合             | `reviewerResults[].timedOut` / `reviewerResults[].durationMs`、および `debug.*`（上記 run record と同じ） |

`--output yaml` と `--output html` には打ち切り情報を載せていません。機械可読な判定には JSON 出力を使ってください。

> **注意**: タイムアウトはオーケストレーション層の待ち時間を打ち切るだけであり、進行中の LLM 呼び出しを cancel しません。放置されたリクエストは `src/lib/llm-pipeline.mjs` 側の上限（1 回 15 秒 + 上限付きリトライ、最大およそ 45 秒）が尽きるまで走り続けるため、`timeout` 行を出した後もプロセスはその間だけ生存します。真のキャンセルには `generateReview()` への `AbortSignal` 導入が必要であり、本 PR のスコープ外です。

## コマンド

- Agents: `npm run agents:validate` (または `node scripts/validate-agents.mjs`)
- Skills: `npm run skills:validate` (または `node scripts/validate-skills.mjs`)
- 構造化出力 (Python): `python scripts/rr_runner.py --input tests/fixtures/structured-output/sample_llm_response.json`

## 終了コード

### `river run` / `src/cli.mjs`

| コード | 意味                                                                                      |
| ------ | ----------------------------------------------------------------------------------------- |
| `0`    | 正常終了                                                                                  |
| `1`    | 実行エラー・スキーマエラー・引数エラー（不明コマンド / オプション値の欠落・不正値を含む） |
| `2`    | `--warn-on` の警告しきい値超過                                                            |
| `3`    | `--gate` の ESCALATE 判定、`review` ハンドラの設定エラー、`review` の未実装サブコマンド   |

引数エラー（usage error）の exit code は #1709 で exit 1 + stderr 要約へ統一されました。不明コマンドとオプション値の欠落・不正値は Slice 2 で統一済みです。未知オプション・余剰 positional・残っていた値欠落経路（例: `--from` / `--cases`）も Slice 3 で統一されました。help 全文の stdout 出力と exit 0 の組み合わせは、明示的な `--help` と引数なし起動だけが維持します。

`river review` のサブコマンド欠落・未知サブコマンドも #1755 で exit 1 へ移しました。exit 3 が残るのは、引数の書き方ではなく次の 3 系統です。

- `--gate` の ESCALATE 判定
- `review` ハンドラが検出する設定エラー（`--output html` など）
- `review` の未実装経路（`river review verify` と、`--plan-only` を付けない `river review plan` は「Phase 3 では未実装」として exit 3 を返す）

この統一により、オプション名の typo・余剰 positional・値の欠落は `$?` の exit 1 として検知できます。**値の妥当性**は、次のオプションについて parse 層で検証します。

- 列挙値: `--phase` / `--severity` / `--planner` / `--depth` / `--output` / `--format` / `--fail-on` / `--warn-on` / `--source` / `--fingerprint-algo`
- 数値: `--pr` / `--threshold` / `--min` / `--max-cost`
- 日付: `--expires` / `--month`

usage error のときにデータ書き込み（feedback / suppression のエントリ追加など）が先行することはありません。

#### `--base` の受理範囲と移行手順 {#base-acceptance-scope}

`--base <ref>` を受理するのは、実際に差分を読む次の 5 面だけです（#2065）。他の面へ渡すと parse 層の usage error として exit 1 になります。

- `river run`
- `river skills`（サブコマンドを付けない形）
- `river review plan` / `river review exec` / `river review route`

対象外の面（`doctor` / `runs` / `eval` / `feedback` / `suppression` / `skills` のサブコマンド / `review verify` など）では、値が解決できる ref であっても受理しません。値の解決を試みる前に落ちるため、拒否の理由は「その面が差分をレビューしない」ことであり、ref の妥当性ではありません。`review` / `evolve` / `skills` ではサブコマンドをオプションの前後どちらに書いても判定は変わりません（#2081）。`runs` / `feedback` / `suppression` は後置のサブコマンドを解決しないため、サブコマンドをオプションより前に書いてください。

値そのものの検証は parse 層ではなくハンドラ層で行い、受理する 5 面が同じ解決経路を共有します。いずれも前後の空白は除去され、`git rev-parse` によって解決可否が検査されます（#2051 / #2057）。

- 空白のみの値と、解決できない ref は exit 1 の usage error にあたる
- merge base が HEAD になる ref は exit 1 とせず、stderr の警告として告知する。共有履歴が無い場合と、HEAD より先へ進んでいる場合とで文言を分ける（#2067）。ref の解決と merge base の探索は `origin/<ref>` → `<ref>` の同じ候補順を歩くが述語が違うため別候補に着地しうる。その場合の文言の分岐は merge base が出た候補で判定する（#2071）。ただし base 自身と merge base が同じ commit を指す `--base HEAD` では警告を出さない
- `--base` 未指定のときの基準は面ごとに異なる。`river run` / `river skills` は自動検出したデフォルトブランチを基準とし、この検査の対象外である。`river review plan` は git を実行せず、`diff` artifact だけが差分の供給元となる（[CLI review plan 仕様](./cli-review-plan-spec.md)を参照）

`river skills` は以前 `--base` を受理しながら値を読まず、常に自動検出のデフォルトブランチとの差分をレビューしていました（#2051）。値を読むようになったため、`--base` を渡していた呼び出し側ではレビュー対象ファイルと findings が変わります。従来と同じ範囲を維持したい場合は `--base` を外してください。`river run` は値を読んでいたものの解決可否を検査せず、解決できない ref を無警告で HEAD へ落としていました（#2057）。従来 exit 0 で通っていた typo は exit 1 になります。

`--base` を読まない面は、以前この flag を受理して値を捨てていました（#2065）。次の面へ渡していた呼び出しは exit code が変わります。

- exit 0 から exit 1 へ: `doctor` / `runs`（サブコマンド無し。`runs list` として動く形）/ `runs list` / `runs summary` / `runs digest` / `eval`
- 同じく exit 0 から exit 1 へ: `feedback add` / `suppression add` / `skills list` / `skills resolve` / `skills export` / `skills import`
- exit 3 から exit 1 へ: `review verify`（従来の exit 3 は `#802 Phase 3` の未実装経路であり、`--base` を処理した結果ではない）
- `runs diff` も受理しなくなる。指定した run が両方とも存在する呼び出しでは exit 0 から exit 1 へ変わる（run が見つからない呼び出しは元から exit 1 のため、終了コードとしては変化しない）

サブコマンドを持たない面では語順を問いません。`doctor --base main .` のようにフラグを先に書いた形も、`doctor . --base main` と同じく拒否されます。`--base` を 2 回以上書いた形も単発と同じ扱いです。

サブコマンドを持つ面のうち `review` / `evolve` / `skills` は後置のサブコマンドを解決します（#2081。後述の「対象パスの位置」の説明を参照）。したがって `river skills --base main import` は `river skills import --base main` と同じ usage error になります。v1.99.3 以前の `skills` は後置の `import` を対象パスとして解釈して検査を素通りし、`import/` が存在すればレビューが走り exit 0 でした。この形は flag を外しても従来の結果に戻りません。`skills import` はサブコマンドとして動くためです。`--base` を伴わない `river skills --output json import` も同じで、以前は `import/` をレビューしていましたが、現在は import サブコマンドとして動きます（exit code はどちらも 0 のため、外す flag はありません）。`import/` のレビューを続けたい場合は `river skills ./import` と書いてください。`runs` / `feedback` / `suppression` では後置のトークンが `unexpected argument` となるため、exit code は 1 のまま変わりません。

一方、**サブコマンド語が未知の場合はこの検査を行いません**。存在しない面について `--base` の可否を論じないためです。次のように従来どおりのメッセージを返します。

- `river runs nosuch --base main` → `Unknown runs subcommand: nosuch`
- `river feedback --base main` → ``only `river feedback add` is supported``

いずれの面も値を一度も読んでいなかったため、呼び出しから **flag を外せば従来と同じ結果が得られます**。ただし flag を残したままでは、その面の実行自体が行われず usage error になります。拒否メッセージの末尾でも `Drop --base to get the previous behavior.` として同じ案内を出します（#2076）。usage error の exit code は [Stable Interfaces](./stable-interfaces.md) の Stable Contract の対象外であり、この変更はその方針に従ったものです。

#### `--entry` の受理範囲（Beta） {#entry-acceptance-scope}

`river review plan --entry <name>` は、出力する Review Artifact をレビュー Flow の entry に固定します（#2054 PR-3）。`<name>` は `flows/entry-map.json` の `entries` キーです。現在の 8 件は `review-plan` / `review-task` / `review-final` / `review-replan` / `review-research` / `review-requirements` / `review-design` / `review-technical` です。指定すると artifact の末尾に次の 2 フィールドが**追加**されます。

- `flow`: `{ entry, id, version, sha256 }`。`sha256` は Flow 文書の正規化 JSON のハッシュで、`src/lib/execution-manifest.mjs` の `deriveFlowPin` が算出する
- `evidenceRequirements`: その Flow が `required: true` で宣言する入力名の一覧（ソート済み）

2 フィールドが出るのは JSON 出力（`--output json` / `--format json`）だけで、markdown の出力には現れません。pin は読み込んだ文書のハッシュであり、同梱 `flows/` の文書との一致は検証しません。`--entry` を付けない場合の出力は、この flag が存在しなかったときと同じです。skill 選択・`decision`・`gate` は `--entry` を読まないため、pin の有無で判断は変わりません（ADR-009 D3、RA-1〜RA-4）。この flag と 2 フィールド、および後述の `steps[]` は **Beta** であり、[Stable Interfaces](./stable-interfaces.md) の Stable Contract に含まれません。

受理するのは `review plan` と `review exec` です。`review exec --entry <name>`（Epic #2011 AC7 P2、Beta）は上の 2 フィールドに加えて、pin した Flow を `src/lib/flow-runner.mjs` で走らせた結果を `steps[]` として追加します。要素は runner の step record そのもの（`{ index, id, kind, parallel, parallelRun, outcome, reason?, result? }`）です。`index` は Flow 文書の `steps` の位置、`kind` は `primitive` / `reviewer` です。`outcome` は `executed` / `skipped` / `degraded` / `stopped` / `not-implemented` の閉集合です。P2 では capability を 1 つも配線しないため記録のみで、`outcome` は `not-implemented` / `skipped` / `stopped` のいずれかになります。runner へ渡す入力は artifact 自身が証明できるものだけです。具体的には `context.changedFiles` があれば `diff` を渡します。あわせて、解決済み artifact のうち Flow 入力名と同名で存在するものを渡します。**`--debug` は解決結果を `debug.resolvedArtifacts` として出力に見せる診断フラグであり、入力解決の条件ではありません**（#2011 AC7 P3-1）。`plan` は既定のファイル名で自動的に解決されます。`tests` は `junit` → `coverage` → `test-cases` の順で最初に見つかった artifact が既定で束縛されます。**必須入力（`tasks` / `requirements` / `baseline` / `design`）には既定束縛を置いていません。** 作業ツリーに `todo.md` が置いてあるだけで「タスクとその受入条件が供給された」と宣言してしまうためです。これらは `--artifact tasks=todo.md` のように明示して供給します。明示は常に既定より優先します。必須入力を供給できない Flow でも要素数は Flow の step 数のままで、全 step が `stopped` として列挙されます（observe mode）。`steps[]` は `gate` / `decision` / `findings` に影響しません（RA-1）。`review plan --entry`、`exec --dry-run --entry`、`exec --plan <file> --entry`（replay）は pin のみで `steps[]` を付けません。`doctor --entry x` のように他の面へ渡すと、`--base` と同じコマンド別 allowlist（#2065）により parse 層の usage error として exit 1 になります。未知の entry 名は許容値を列挙して exit 1、値欠落も exit 1 です。いずれの拒否形も、この flag の導入前は `unknown option --entry` の exit 1 だったため、exit code は動いていません。

Flow 文書は `src/lib/flow-loader.mjs` だけが読みます。読み込み先は既定でパッケージ同梱の `flows/` で、環境変数 `RIVER_FLOWS_DIR` で上書きできます（npm 配布の CLI で `flows/` を別置きする場合の手段です）。GitHub Action の dist は `flows/` と schema 3 本（`flow-entry-map` / `flow` / `review-intent`）を bundle の隣に同梱し、loader はその同梱コピーを先に読みます（#2054 PR-5、#2105 (b)）。したがって dist でも `--entry` は使え、Action では `entry` input から渡します（[Stable Interfaces](./stable-interfaces.md)）。`RIVER_FLOWS_DIR` が差し替えるのは `flows/` だけです。schema は同梱のものを使い上書きできないため、別置きの `flows/` と同梱 schema の版ズレに注意してください。見つからない場合は pin なしの artifact を黙って出さず、`Error: flows directory not found` の exit 1 で止まります。

`--expires` が受理するのは RFC 3339 の `YYYY-MM-DD` 形式と date-time 形式だけです。日付のみの入力は UTC の深夜として解釈し、保存時に date-time へ正規化します（`schemas/suppression-context.schema.json` の `expiresAt` が `format: date-time` のため）。

ただし値の検証は全オプションには及びません。次の 3 経路は現在も exit 0 のまま通るため、`$?` だけでは検知できません。

- 存在しないパスを `--baseline` に渡した場合（回帰比較が黙って行われない）
- 未知の語彙を `--context` / `--dependency` に渡した場合
- コマンドを付けずに `river --base main` と打った場合、および `-h` / `--help` を併記した場合（いずれも help を表示するだけでレビューを実行しないため、コマンド別 allowlist の対象外にしている）

環境変数 `RIVER_PHASE` は #1759 C2 で `--phase` と同じ語彙・同じ大小文字無視の検証を通るようになりました。不正値は `--phase` と同じ形の `Error: RIVER_PHASE must be one of: ...` を stderr へ出して exit 1 です。未設定・空文字は既定の `midstream` へフォールバックする挙動を維持します。

オプションの値は**スペース区切り**で渡します。`--output=json` のような `=` 連結形式は受理せず、未知オプションとして exit 1 になります（互換のため `--run-id=<id>` だけは例外的に受理します）。なお `--artifact plan=./plan.md` のように、**値の内部**に `=` を含む形式は有効です。

対象パスの位置をオプションの前後どちらにも書けるのは、次の面だけです。

- `run` / `doctor`
- `skills`（サブコマンドを付けない形）
- `review`（`plan` / `exec` / `verify` / `route`）
- `evolve aggregate`（`evolve replay` は入力を `--spec` から取るため対象外）

この範囲では `river run . --dry-run` と `river run --dry-run .` が同じ意味になります。対象パスとして解釈できる非オプションのトークンは 1 つだけで、2 つ目以降は余剰 positional として exit 1 です。

`review` のサブコマンド（`plan` / `exec` / `verify` / `route`）も、オプションの前後どちらにも書けます。`river review plan --plan-only` と `river review --plan-only plan` は同じ意味です。サブコマンドを打ち忘れた場合と、語彙に無いトークンを渡した場合は exit 1 になります。

`evolve` のサブコマンド（`aggregate` / `replay`）も、同じく前後どちらへも書けます（#1759 B1）。`skills` のサブコマンド（`import` / `export` / `list` / `resolve`）も同様です（#2081）。語彙に一致する後置のトークンは常にサブコマンドとして解決されるため、サブコマンド語と同名のディレクトリをレビューしたい場合は `river skills ./import` のように `./` を付けて書いてください。サブコマンドの語順を問わないのはこの 3 面だけです。`runs` / `feedback` / `suppression` は後置のサブコマンドを解決しないため、これらの面ではサブコマンドをオプションより前に書いてください。

`review` ではサブコマンド語が上記の positional 勘定に入りません。`river review --plan-only plan ./sub` は、サブコマンド 1 つとパス 1 つの組として受理されます。3 つ目の非オプションから余剰 positional です。

POSIX の `--` 終端も使えます。`--` の後ろに置いたトークンは、オプションやサブコマンド名ではなく、パスとして読みます。ここでも受け取るのは 1 つ目だけで、2 つ目以降は余剰 positional として exit 1 です。`river run -- .` は `river run .` と同じ意味になります。`river run -- --dry-run` は `--dry-run` という名前のパスを指定した扱いになるため、`--dry-run` フラグは有効になりません。

`--` の後ろのトークンは実在するパスでなければならず、存在しない場合は exit 1 です。これは `river evolve aggregate -- ./typo` のような打鍵ミスが「データ 0 件の正常な集計」として exit 0 になるのを防ぐためです。後ろにトークンを置かない裸の `--` は、どのコマンド面でも何もしない指定として受理されます。

上記以外の面（`skills list` / `runs list` / `promote list` / `eval` など）は末尾のパスを受け取らず、余剰 positional として exit 1 になります。なお `runs diff <id1> <id2> [<id3>...]` や `promote approve <id>` のように、非オプションのトークンを仕様として複数受け取るサブコマンドは別扱いです。

### `river review` / `river eval`（`runners/cli`）

`runners/cli` のコマンドは現時点ではすべてのエラーをコード `1` に集約します。コード `3` は発生しません。

| コード | 意味                                             |
| ------ | ------------------------------------------------ |
| `0`    | 正常終了                                         |
| `1`    | 実行エラー・スキーマエラーを含むすべての異常終了 |

### 検証スクリプト（Python）

- `0`: 検証が正常に完了した。
- `1`: スキーマチェックが通過しなかったか、スキーマエラーが発生した。

## 例

```bash
# すべてのエージェントを検証
npm run agents:validate

# すべてのスキルを検証
npm run skills:validate

# 構造化されたレビュー出力をビルド（artifacts/river-review-output.json に書き込み）
python scripts/rr_runner.py --input tests/fixtures/structured-output/sample_llm_response.json
```
