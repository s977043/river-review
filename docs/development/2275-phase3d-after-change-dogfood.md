# after-change Fast Verification Checkpoint の dogfood 測定（#2275 PR-3D）

Epic #2054 Phase 3 の after-change Fast Verification Checkpoint（PR-3A〜3C）を River Review 自身の履歴で動かし、昇格判断の材料となる数値を記録します。active 化と default-on はこの測定の範囲外で、別 decision として扱います。

- 測定コマンド: `node scripts/measure-after-change-checkpoint.mjs`（`--json` で全 run の生データ）
- 回帰ピン: `tests/after-change-dogfood.test.mjs`
- 0 LLM 呼び出しガード: `scripts/lib/llm-call-guard.mjs`
- 測定日: 2026-10-07 / base commit `b190b8f8`

## 測定方法

実 hook（`.claude/hooks/after-change-observe.sh`）を、Claude Code と同じ形の stdin（`tool_name: Edit`）で起動します。測定値は bash・jq・git・Node adapter・checkpoint core・`runDeterministicGates`（#1401）をすべて通したものです。

母集団は `git rev-list --first-parent -n 30 b190b8f8` の 30 commit です。範囲は `4277a1a0` から `b190b8f8` までです。使い捨ての `git clone --shared` 上で、各 commit C を HEAD = C^1、index = C^1 の状態に置いて再生します。これは agent の未 stage の Write / Edit が残す状態と同じで、新規ファイルは untracked になります。

各 commit で 3 つの event を発火させます。

| event     | 作業ツリーの状態                                  |
| --------- | ------------------------------------------------- |
| `partial` | C が変更した最初の 1 パスだけを C^1 に適用        |
| `full`    | C の変更をすべて適用                              |
| `repeat`  | `full` と同じ状態のまま hook をもう一度発火させる |

各 event を 2 つの host 設定で実行し、合計 180 run を測りました。

| 設定           | 内容                                                                                                                                     |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `repo-default` | このリポジトリが現在出荷している状態。trusted allowlist も選択 check も無い                                                              |
| `trusted-true` | trusted allowlist に `/usr/bin/true` を載せて選択した状態。checker のコストが 0 なので、測れるのは checkpoint 自身のオーバーヘッドである |

### 指標の定義

- hook wall: hook プロセスの起動から終了までの wall-clock 時間
- checkpoint: evidence の `totalDurationMs`（core が測る resolve から証跡生成まで）
- duplicate 率: check を実行した run のうち、同じ `occurrenceKey` と同じ作業ツリー digest の組を前の実行済み run が既に扱っていたものの割合
- occurrenceKey 衝突率: evidence を出した run のうち、同じ `occurrenceKey` が別の作業ツリー digest で既に出ていたものの割合。分母は各 commit の初回発火（`partial`）を含む全 run である
- unrunnable / skipped / bypassed 率: evidence の checkpoint status 別の割合
- not-run 率: evidence を残さず `not run (...)` だけを出した run の割合

## 測定結果

測定環境は darwin-arm64（10 CPU）、Node v22.22.2 です。他セッションと共有しているマシンで、終了時の load average は 8.52 / 11.98 / 12.99 でした。wall-clock 値はこの負荷を含んでいます。

| 指標                 | `repo-default`                         | `trusted-true`                         |
| -------------------- | -------------------------------------- | -------------------------------------- |
| run 数               | 90                                     | 90                                     |
| hook wall p50 / p95  | 466.8 ms / 728.2 ms                    | 505.1 ms / 761.9 ms                    |
| checkpoint p50 / p95 | 0 ms / 1 ms                            | 22 ms / 58 ms                          |
| status               | skipped 90                             | pass 90                                |
| reason               | `no-deterministic-check-selected` 90   | `check-executed` 90                    |
| unrunnable 率        | 0                                      | 0                                      |
| skipped 率           | 1.0                                    | 0                                      |
| bypassed 率          | 0                                      | 0                                      |
| not-run 率           | 0                                      | 0                                      |
| duplicate 率         | 該当なし（実行 0 件）                  | 0.422（38 / 90）                       |
| occurrenceKey 衝突率 | 0.244（22 / 90）                       | 0.244（22 / 90）                       |
| LLM / network        | provider 0、network 0（guard 90 / 90） | provider 0、network 0（guard 90 / 90） |

Epic #2054 の初期 SLO 候補（hard timeout 30 秒、dogfood p95 10 秒以下）に対し、記録時の負荷（load average 8.52 / 11.98 / 12.99）では hook 全体の p95 は 761.9 ms 以下でした。wall-clock 値は負荷で大きく動き、別の再実行では p95 が 3436.8 ms（repo-default）/ 3526.2 ms（trusted-true）でした。主張は「p95 10 秒以下を満たす」までとし、1 秒未満は主張しません。ただし `trusted-true` の checker は `/usr/bin/true` なので、実際の checker を allowlist に載せた場合はその実行時間が加算されます。

### 読み取り

現在の出荷状態では、checkpoint は 90 / 90 run とも `skipped`（`no-deterministic-check-selected`）でした。理由付きで記録されており、`pass` に畳まれていません。dogfood で実際に検査を走らせるには、trusted allowlist と選択 check の設定が別途必要です。

duplicate 率 0.422 の内訳は、`repeat` の 30 件と、単一ファイル commit で `partial` と `full` が同一状態になった 8 件です。hook は `seenOccurrences` を core に渡していないため、同じ状態での再発火はそのまま再実行されます。

occurrenceKey 衝突率 0.244 は、`partial` と `full` が別の作業ツリーなのに同じ `occurrenceKey` を持った 22 件です。分母 90 は初回発火を含みます。再発火（`full` と `repeat`）の 60 件だけを分母にすると 22 / 60 です。`occurrenceId` は HEAD の SHA から導出され、作業ツリーの内容を含みません。このため、`occurrenceKey` をそのまま dedup key にすると、内容の違う 2 回目の編集が `duplicate-occurrence` として skip されます。dedup の配線には、作業ツリー内容を key に含める設計判断が先に要ります。

## 0 LLM 呼び出しの機械検証

hook が環境変数を引き継いで起動する Node プロセスに、`NODE_OPTIONS=--import=scripts/lib/llm-call-guard.mjs` を読み込ませます。guard は次の 3 種類のイベントを記録します。

- `guard-loaded`: guard がそのプロセスに読み込まれた
- `provider-module`: model SDK（`openai`、`@anthropic-ai/sdk`、`@google/generative-ai`、`@google/genai`）が解決された
- `provider-module`（repo 内）: `src/ai/*`、`llm-pipeline`、`openai-planner`、`plan-review/llm-adjudicator` が解決された
- `network`: `fetch`、`http(s).request` / `get`、`net.connect` / `createConnection`、`net.Socket.prototype.connect`、`tls.connect` が呼ばれた。記録したうえで拒否する

provider の API キー環境変数には sentinel 値を入れます。provider に到達した場合、dry-run に落ちず network 拒否として記録させるためです。evidence を出したのに `guard-loaded` が無い run も失敗として扱います。guard が読み込まれていない 0 件を、0 件の証明として数えないためです。同じ理由で、evidence の有無によらず guard を読み込まなかった run が 1 件でもあれば失敗とします。

検査範囲は、guard を読み込んだプロセスのメインスレッドから出る標準ライブラリ経由の通信です。次は対象外です。

- worker thread（ネイティブの `fetch` と未パッチのモジュールを使う）
- `NODE_OPTIONS` を落とした環境で起動する子プロセス。deterministic checker の子プロセスは sandbox の環境変数 allowlist（`src/lib/deterministic-command-sandbox.mjs`）により該当する
- ネイティブアドオン経由の通信

ガードが失敗できることは次で確認しました。

- 陽性対照（テスト内）: `openai` の import、`src/ai/factory.mjs` の import、`fetch` / `http.get` / `net.connect` / `new net.Socket().connect()` がそれぞれ記録される
- 陰性対照（テスト内）: 何も呼ばないプロセスは `guard-loaded` だけを記録する
- 変異注入（測定時に手動、復元済み）: `.claude/hooks/after-change-observe.mjs` に `src/ai/factory.mjs` の import を足すと、e2e テストが `0-LLM guard failed` で失敗した。外部 URL への `fetch` を足した場合も同様に失敗した
- 変異注入（guard 不在）: 測定スクリプトの guard パスを存在しないファイルに向けると、`--count 1` の実行が `guardLoadedRuns 0` で exit 1 になった

## 母集団が含む入力帯域

hook の入力は unified diff の hunk ではなく、`git diff -z --name-status HEAD` と `git ls-files -z --others --exclude-standard` です。このため `--unified=0` の帯域はこの経路に存在しません。この入力に対して、母集団が実際に含んでいた帯域は次のとおりです。

| 帯域                                  | 含有                           |
| ------------------------------------- | ------------------------------ |
| tracked の変更（`M`）                 | 含む（114 パス）               |
| untracked の新規ファイル              | 含む（20 ファイル / 7 commit） |
| 削除（`D`）・rename（`R`）            | 含まない                       |
| 非 ASCII パス                         | 含まない                       |
| symlink                               | 含まない                       |
| merge commit / 未解決 conflict（`U`） | 含まない（merge commit 0 件）  |
| git 管理外ディレクトリ                | 含まない                       |

含まない帯域の挙動は、既存の `tests/after-change-adapter.test.mjs`、`tests/after-change-observe-hook.test.mjs`、`tests/fast-verification*.test.mjs` が個別に固定しています。この測定はそれらの帯域での latency や率を示しません。1 commit あたりのファイル数は p50 が 2、最大が 21 でした。

## この測定でやらないこと

- active 化・default-on（#2054 Phase 7 の別 decision）
- 実 checker（formatter や linter）を allowlist に載せた場合の latency
- `seenOccurrences` の hook 配線と dedup key の設計（読み取り 3 の判断が先に要る）
