---
title: ループ収束コントラクト（自己修正ループの停止条件）
---

River Review は generate → review → revise ループの **review ステージ**として機能します。返すのは判定素材（`decision` / `summary.issueCountBySeverity` / `oscillated` / `suggestedLoopSignal` / exit code）のみです。反復・停止・エスカレーションの実行は **caller（呼び出し側エージェントまたはワークフロー）の責務**です（[#976 境界 — docs/ai/generate-review-revise-loop.md](https://github.com/s977043/river-review/blob/main/docs/ai/generate-review-revise-loop.md) 参照）。

本ドキュメントは caller がループ制御を実装するために必要な停止・収束・発散ガードの契約を 1 ページで定義します。

## `suggestedLoopSignal` — 3 層設計

River Review は各アーティファクトおよび `runs diff --output json` の出力に `suggestedLoopSignal` フィールドを付与します。これにより、caller が自前で導出ロジックを実装せずにループ判断を機械的に行えます。

**Layer 1** — 単一 `river run` アーティファクト（`suggestedLoopSignal` トップレベルフィールド）:

| 値                | 意味                                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------ |
| `NO_SIGNAL`       | ループ動作を特定できない（`decision` が未設定または `human-review-recommended` かつ blocking findings なし） |
| `REVISE_REQUIRED` | blocking findings（`critical` または `major`）が存在する。エージェントは修正して再実行すべき                 |
| `CONVERGED`       | blocking findings がなく、かつ `decision` が auto-approve 相当。エージェントはループを終了してよい           |
| `ESCALATE_HUMAN`  | `decision === 'human-review-required'`。エージェントは人間にエスカレーションしなければならない               |

導出順: ESCALATE_HUMAN → REVISE_REQUIRED → CONVERGED → NO_SIGNAL。決定論的（AI 呼び出しなし）。

**Layer 2** — `river runs diff --output json`（3 件以上の run）: `oscillated` が非空の場合に `STOP_OSCILLATED` を追加。振動検知は Layer 1 の全値より優先。

Layer 2 ではさらに、最新 run の `reviewCoverage`（[Review Coverage](https://github.com/s977043/river-review/blob/main/src/lib/review-coverage.mjs)）による qualification が入ります（PR #2335）。`river runs diff` の 2 run 経路と 3 run 以上の経路の両方が対象です。最新 run の coverage が `partial` または `not_executed` のとき、`CONVERGED` は `NO_SIGNAL` に降格します。レビュー単位がタイムアウトした run は「blocking findings 0 件 + auto-approve」という点で完走した run と区別がつかないため、そのまま `CONVERGED` を返すと caller は未完了のレビューを根拠にループを止めてしまいます。降格対象は `CONVERGED` のみで、他の値はもともと停止・受理の方向を示しません。`reviewCoverage` を持たない run record は `unknown` 扱いとし、降格しません（観測の欠落は不完全の観測ではないため）。

この降格により、`partial` / `not_executed` の run では `CONVERGED` を根拠とした停止が起きなくなります。不完全な run が続く限りループは終わらないので、**caller は Layer 3 の `STOP_MAX_ITERATIONS` など上限側の停止条件を必ず併せて持ってください**。

この降格が効く範囲は Layer 2 の signal だけです。artifact が `gate` ブロックを持つ場合、下記の参照実装は gate を signal より優先します。そのため既定では、Layer 1 由来の `GO` により `partial` の run でも停止しえます（#2337）。gate 側でも止めたい場合は、後述の `RIVER_GATE_COVERAGE=1` を有効にしてください。**Layer 2 の降格は既定で有効、gate 側の不完全性判定は opt-in** という非対称は意図したものです。

`oscillated` の判定側にも coverage の条件が入りました（PR #2365）。`oscillated` は present → absent → present という並びで検知しますが、この absent は「fingerprint がその run に無い」という測定でしかありません。reviewer がタイムアウトした run は finding を落とすため、完走した 2 つの run に挟まれた不完全な run 1 件だけで偽の振動が成立していました。そこで absent の run の coverage が `partial` / `not_executed` のときは、その absent を振動の根拠として数えません。coverage が `complete` または `unknown` の absent はこれまでどおり数えます。

この条件は、振動の判定を打ち消すのではなく保留します。absent 側の run が不完全なあいだ、その absent は根拠として数えられないままです。したがって coverage が恒常的に `partial` / `not_executed` な環境では `STOP_OSCILLATED` に到達しません。`coverage` の粒度も効きます。`reviewCoverage` は run 単位の観測であり、finding を担当した review unit 単位ではありません。そのため、その finding と無関係な unit だけがタイムアウトした run でも、absent は同じように割り引かれます。より細かい判定には finding 側の unit 帰属が必要で、現在の run record はそれを持ちません。本物の振動を確実にエスカレーションしたい caller は、Layer 3 の `STOP_MAX_ITERATIONS` など上限側の停止条件を併せて持ってください。

降格ではなく検知側の条件としました。理由は、`deriveLoopSignalFromRunsDiff` から読めるのが最新 run の coverage だけという点にあります。present → absent → present の最新 run は finding が present 側にあたり、疑うべき absent は手前の run にあります。したがって最新 run の coverage は振動の真偽を判定する観測値になりません。判定は run ごとの timeline を持つ `review-differ.mjs` 側に置いています。

**Layer 3** — 呼び出し元が合成（River Review は意図的に出力**しない**）:

| 値                     | 合成タイミング                                                      |
| ---------------------- | ------------------------------------------------------------------- |
| `STOP_MAX_ITERATIONS`  | `iteration_count >= max_iterations` になったとき                    |
| `STOP_POLICY_REQUIRED` | 外部ポリシー（コスト上限・HITL 必須ラベルなど）がトリガーされたとき |

`suggestedLoopSignal` は**追加フィールドかつ省略可能**です。`decision` / `verdict` を変更せず、GO/NO-GO ゲートとしては機能しません。旧アーティファクトでは省略されます。

## `gate` — リスク階層型のゲート信号（Epic #1347 S2）

`suggestedLoopSignal` の上位に、リスク階層（崖・丘・原っぱ）を合成した機械可読ゲート信号 `gate` があります（`river review` の Review Artifact と `river run --output json` の両方に付与、additive / 省略可能）。導出は `src/lib/gate-decision.mjs` の**決定論純関数**で行われ、LLM 出力はエスカレーション方向にのみ寄与します。

| `gate.decision`       | 階層（tier）                                                 | caller の期待挙動                                                                                                                                            |
| --------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GO`                  | 原っぱ                                                       | 自律継続してよい                                                                                                                                             |
| `GO_WITH_OBSERVATION` | 丘                                                           | 進行しつつ `observation.expiresInHours` 以内に非同期レビュー。**期限超過時は停止**し、`observation.files` 由来の変更を未レビュー扱い（re-review 必須）にする |
| `NO_GO`               | —（emit 値は `field`。監督階層ではなく enum 充足のための値） | revise へ回す（`reasonCode` が理由を示す。`NOT_EXECUTED` = レビュー未実行、`UNDETERMINED` = 判定不能など。全列挙は review-artifact.schema.json が正）        |
| `ESCALATE`            | 崖                                                           | 人間の事前承認まで停止                                                                                                                                       |

- **fail-safe**: 判定不能・未知の入力は常に `NO_GO` に写像され、`GO` 側には決して倒れない
- **ブートストラップ崖**: diff が `.river/**`（risk-map 等の gate 設定）に触れる場合は内容に関わらず `ESCALATE`（`GATE_CONFIG_CHANGED`）となる。gate 設定で gate 自身を無防備化する変更（risk-map の削除を含む）は必ず人間承認を通る
- **信頼境界**: risk-map / config / plan 文言は被レビューエージェントの書込権限内にある。gate ブロックは**エージェントの書込権限の外（host / CI 側チェックアウト）で導出されたときのみ**信頼できる。`.river/**` は CODEOWNERS / branch protection での保護を推奨する
- **replay check（正当性検証）**: 導出は純関数のため、caller は `gate.inputs` を `deriveGateDecision` に再投入して `decision` の一致を検証できる（`inputsHash` は S3 の回帰比較用サマリであり改竄防止ではない）。`inputs.riskMapDigest` は「YAML load → `JSON.stringify` → sha256 先頭16hex」で算出される
- **circuit breaker**: `gate.configSnapshot.maxConsecutiveAutoGo` は助言値である。連続 auto-GO のカウントと強制チェックポイントの執行は caller 責務であり、**caller 側に独自設定がある場合は厳しい方（min）が優先**される
- 執行のリファレンス実装と conformance fixture（`tests/fixtures/gate-conformance/`）で caller 側の振る舞いを検証できる
- **不完全性の持ち込みは opt-in（#2320 / #2337）**: 「レビューは走ったが対象を見ていない」という事実を gate へ渡すかは host が選ぶ。既定は off であり、既定の gate 出力は従来と 1 ビットも変わらない
  - `RIVER_GATE_STAGING_UNRUNNABLE=1`: 決定論ゲートの subject file が sandbox へ揃わなかった run を `deterministicUnrunnable` として扱い、`ESCALATE`（`DETERMINISTIC_UNRUNNABLE`）へ倒す。空の sandbox を渡された checker は自力で exit 0 するため、その exit code は変更に対する verdict ではない。`strictBlock` には決して寄せない
  - `RIVER_GATE_COVERAGE=1`: `reviewCoverage.status` が `partial` / `not_executed` の run を `NO_GO`（`COVERAGE_INCOMPLETE`）へ倒す。これは `suggestedLoopSignal` の降格ではなく gate の**独立入力**である。降格経路にすると結果が `decision` に依存するため、coverage gap は独立入力として一様に止める。**実効があるのは現時点で `river run --gate` 経路のみであり、`review exec` 経路は engine が `reviewCoverage` を返すまで no-op となる**
    - #2410 以降、`reviewCoverage` は `--reviewers` orchestration だけでなく単一 reviewer 経路でも、LLM call を**実際に試行した場合だけ**生成される。有効な応答（`NO_ISSUES` を含む）は `complete`、transport / response-envelope / model-output parse failure は required unit `failed` → `not_executed` になる
    - dry-run / offline / API key 未設定などの意図的 skip は coverage を生成しない。「LLM を試して失敗した」と「そもそも実行しなかった」を同一視しないためである
    - 発火条件は `RIVER_GATE_COVERAGE=1` + `river run --gate` + 不完全な coverage 観測の 3 つであり、`--reviewers` を必須としない。GitHub Action では `gate: true` と step の `env` に `RIVER_GATE_COVERAGE=1` を設定する。`reviewers` input は複数 reviewer coverage が必要な場合だけ指定する
  - coverage が**存在しない**ことは不完全とは読まない。「観測が無い」と「欠落を観測した」は別の事実であり、マージを止めてよいのは後者だけである

`gate` は advisory です。判定の執行（`--gate` モード、strict_block ルーティング）は Epic #1347 S4 で導入されます。

## 停止（収束）条件の複合式

### `decision == "auto-approve"` 単独では停止条件にならない理由

`auto-approve` は「HITL（Human-in-the-Loop）をバイパスする助言」です。minor / info finding が残存していても `auto-approve` になる場合があります。これを停止の唯一の基準にすると、重要度の高い finding が残ったままループを抜ける恐れがあります。

### 推奨する停止・続行判定

| 条件                                                 | 推奨アクション                                                                                          |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `summary.issueCountBySeverity.critical + .major > 0` | **続行（revise）**: blocking finding が残存しているため修正を継続する                                   |
| `critical == 0` かつ `major == 0`                    | **収束**: ループを抜けて次ステージへ進む。minor / info の許容は caller の policy に従う（既定では許容） |
| `decision == "human-review-required"`                | **即 escalate**: caller は人間レビュアーに引き渡す                                                      |
| `river runs diff` の `oscillated` が非空             | **即 escalate**: revise が別の問題を生み出す振動が発生している（詳細は「振動検知」を参照）              |

複合条件の擬似コード:

```text
if decision == "human-review-required":
    escalate_to_human(result)
    stop
if oscillated is non-empty:
    escalate_to_human(result, reason="oscillation")
    stop
if critical + major == 0:
    # 収束: minor / info の扱いは caller policy に委ねる
    break  # ループ終了
else:
    revise(result.issues)
    continue  # 次のイテレーションへ
```

### 監督ダイジェストと監査記録（Epic #1347 S3）

`--save` で保存された run record には `gate` と `decision` が含まれ、`river runs digest` が監督者向けサマリを集計する。GitHub Actions 上では save が自動になる（`RIVER_AUTO_SAVE=false` でオプトアウト可、書込み先は `.river/runs/`）。GitHub Actions 上では digest が **job summary に自動出力**される（「実行されない digest は存在しない digest と同じ」という設計判断による強制表示点）。

- **runs store の信頼境界**: `.river/runs/` は被レビューエージェントの書込権限内にあり、ランタイム改竄は gate の規則0（diff のみ検査）の対象外である。record は改竄検知性のない参考記録であり、append-only 化・署名・リポジトリ外永続化は caller / CI の責務となる
- **escape 候補は率ではない**: digest の escape 候補一覧は「GO 系 run の後、変更ファイルの交差する後続 run で新規 blocking finding の出た事例」の列挙である。fingerprint は LLM 生成文の表現ゆらぎに敏感で、後続 diff が持ち込んだ新問題も含まれるため、**帰責は人間が判断する。閾値・自動判断への使用は契約で禁止**する
- **override 記録は常に UNVERIFIED**: run record の `override`（`actor` / `timestamp` / `gateInputsHash` 必須）は caller が書く host-attested 記録であり、River Review は検証しない。digest は UNVERIFIED ラベルを強制付与し、`gateInputsHash` 不一致には警告を出す
- **circuit breaker は警告のみ**: 連続 auto-GO が `configSnapshot.maxConsecutiveAutoGo` を超えると digest が警告するが、停止の執行は caller 責務である（S4）

## 発散ガード

自律ループが収束しない場合の安全策を 2 つ設けます。

- **max iterations（推奨 3〜5 回）**: イテレーション数の上限。上限到達時は人間へエスカレーションし、ループを強制終了する。
- **loop-until-dry（新規 finding ゼロが連続 N 周）**: 前回と今回のレビューを `river runs diff` で比較し、`new` finding がゼロの状態が N 周（推奨 2 周）続いたら収束とみなす。同じ指摘が繰り返し出る場合はそれ以上 revise しても改善しないため、人間にエスカレーションする。

```bash
# --save で実行を保存し、diff で新規 finding を確認する
# run id は stderr に "Run saved: <id>" として出力される
result=$(river run . --base main --output json --save 2>/tmp/rr_stderr.txt)
curr_id=$(sed -n 's/^Run saved: \([^ ]*\).*/\1/p' /tmp/rr_stderr.txt)
river runs diff <prev_run_id> "$curr_id"
# 出力の new[] が空なら loop-until-dry の 1 周分としてカウントする
```

## 振動検知

revise によって解消した finding が次のイテレーションで再出現する場合、revise が別の問題を生み出している（振動）と判定します。

```bash
# 3 件以上の run id を渡すと oscillated が JSON 出力に含まれる
river runs diff <id1> <id2> <id3>
```

`oscillated` が非空であれば caller は即 escalate します。振動検知は `computeFingerprint`（`src/lib/finding-factory.mjs`、`ruleId + file + message` の先頭）に基づくため、修正で行番号が変化しても同一 finding を追跡できます。

## exit code 契約（実装準拠）

以下は `river run` の exit code 契約です。`river review` 系コマンドは別契約（exit 3 あり）であり、このページのスコープ外です。

findings に基づく exit code は `--fail-on` / `--warn-on` を指定した場合のみ 0 以外になります。**`--fail-on` を指定しない場合、findings があっても正常終了は exit 0 です。** なお usage error（未知オプション・値欠落など）と実行エラーは、`--fail-on` の指定と無関係に exit 1 へ統一済みです（#1709）。

| exit code | 条件                                                                     | 説明                                     |
| --------- | ------------------------------------------------------------------------ | ---------------------------------------- |
| `0`       | `--fail-on` 未指定 / `--advisory-only` / max severity < warn rank        | pass。findings の有無にかかわらず常に 0  |
| `1`       | `--fail-on <sev>` を指定し、max severity ≥ fail rank                     | fail。ブロック条件を満たした             |
| `2`       | `--warn-on <sev>` を指定し、max severity ≥ warn rank かつ fail rank 未満 | warn。閾値には達したが fail には至らない |
| `1`       | 入力不正 / git diff 取得失敗 / `--max-cost` 超過など                     | エラー終了                               |

severity の rank（低→高）: `info`=0 / `minor`=1 / `major`=2 / `critical`=3

> **CI / エージェントでの推奨設定**: `--fail-on critical --warn-on major` を明示的に付けることで、exit code ベースの分岐が有効になります。`--fail-on` を省略すると findings があっても exit 0 になるため、機械判断には `summary.issueCountBySeverity` を直接読む方式（後述の最小例を参照）が確実です。

## 機械消費の最小例

### JSON 出力から収束判定する（フラグなし）

`--fail-on` を使わず JSON を直接読んで判定する方式です。

```bash
#!/usr/bin/env bash
# run id は stdout JSON に含まれない。--save 時に stderr へ出力される "Run saved: <id>" から取得する
result=$(river run . --base main --output json --save 2>/tmp/rr_stderr.txt)
run_id=$(sed -n 's/^Run saved: \([^ ]*\).*/\1/p' /tmp/rr_stderr.txt)

critical=$(echo "$result" | jq '.summary.issueCountBySeverity.critical // 0' 2>/dev/null)
major=$(echo "$result" | jq '.summary.issueCountBySeverity.major // 0' 2>/dev/null)
decision=$(echo "$result" | jq -r '.decision // "unknown"' 2>/dev/null)

if [ "$decision" = "human-review-required" ]; then
  echo "ESCALATE: human review required" >&2
  exit 2
fi

if [ $(( ${critical:-0} + ${major:-0} )) -gt 0 ]; then
  echo "REVISE: critical=$critical major=$major" >&2
  exit 1  # caller がループを継続する
fi

echo "CONVERGED: proceed to next stage"
```

### 振動検知を組み込んだループ例

```bash
#!/usr/bin/env bash
# run ids を配列で保持し、3 つ以上たまったら直近 3 つで振動検知する
declare -a run_ids=()
max_iter=5

for i in $(seq 1 $max_iter); do
  result=$(river run . --base main --output json --save 2>/tmp/rr_stderr.txt)
  curr_id=$(sed -n 's/^Run saved: \([^ ]*\).*/\1/p' /tmp/rr_stderr.txt)
  run_ids+=("$curr_id")

  # 振動検知: 3 件以上の run id が蓄積されたら直近 3 つを渡す
  n=${#run_ids[@]}
  if [ "$n" -ge 3 ]; then
    id_a="${run_ids[$((n-3))]}"
    id_b="${run_ids[$((n-2))]}"
    id_c="${run_ids[$((n-1))]}"
    oscillated=$(river runs diff "$id_a" "$id_b" "$id_c" --output json \
                   | jq '.oscillated // [] | length' 2>/dev/null)
    if [ "${oscillated:-0}" -gt 0 ]; then
      echo "OSCILLATION DETECTED: escalate to human" >&2
      exit 3
    fi
  fi

  critical=$(echo "$result" | jq '.summary.issueCountBySeverity.critical // 0' 2>/dev/null)
  major=$(echo "$result" | jq '.summary.issueCountBySeverity.major // 0' 2>/dev/null)

  if [ $(( ${critical:-0} + ${major:-0} )) -eq 0 ]; then
    echo "CONVERGED after $i iteration(s)"
    exit 0
  fi

  # caller がここで revise を実行する
done

echo "MAX ITERATIONS reached: escalate to human" >&2
exit 4
```

## Claude Code loop 設計との対応（#1428）

Claude Code の loop 設計（Goal-based loop / review-fix cycle / stop condition / finding classification）が扱う概念は、River Review では新しい語彙を作らず既存の仕組みへ写像されます。対応関係は次のとおりです。

| Claude Code loop の概念                  | River Review の既存対応                                                                                              |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Goal-based loop の停止条件               | 本ドキュメントの「停止（収束）条件の複合式」（`critical + major == 0` かつ振動なし）が定義する                       |
| 最大 review-fix cycle                    | 「発散ガード」の `STOP_MAX_ITERATIONS`（`iteration_count >= max_iterations`）が上限を執行する                        |
| pass / needs_review / fail               | `gate.decision`（`GO` / `GO_WITH_OBSERVATION` は pass、`ESCALATE` は needs_review・要人間、`NO_GO` は fail・要修正） |
| 指摘分類 blocking / important / optional | severity の `critical` / `major` / `minor`（`info` は参考）が対応する                                                |
| 指摘分類 accepted-risk / deferred        | Riverbed Memory の suppression / WontFix が対応する                                                                  |
| 指摘分類 out-of-scope                    | 出力フォーマットの Follow-up Issues 節が対応する                                                                     |

review-fix cycle の既定回数は reference loop 実装の `resolveIterationLimit`（既定 5）が持ち、呼び出し側が調整します。3 回への固定は運用側の tunable であり、契約としては複合停止条件と上限の両立で過剰レビューを抑制します。Proactive loop（新規 PR のレビュー候補検出など）は本契約の対象外であり、安全境界は ADR-003 の Non-Goals（無承認の自動マージを行わない）が定めます。

### Unknown Coverage verdict の写像（#1470）

Unknown Coverage Review（#1470）が出力する verdict も、新しい語彙を作らず上表と同じ方針で既存信号へ写像されます。残存 Unknown の判定は `gate.decision` と finding の `severity` へ次のとおり対応し、Unknown の存在だけで自動的に `fail` にはしません。証拠不足や解消済みの根拠は [output-format.md](https://github.com/s977043/river-review/blob/main/docs/review/output-format.md) §4「Unverified / Residual Risk」節（Unknown Coverage 下位構造）で表現します。

| Unknown Coverage 出力                   | River Review 既存語彙                                 | 具体マッピング                                                                                                                    |
| --------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `verdict: pass`                         | `GO` / `GO_WITH_OBSERVATION`                          | Blocking Unknown なし・必要証拠あり。resolution が merge 後の観測で足りる非 Blocking Unknown のみ残る場合は `GO_WITH_OBSERVATION` |
| `verdict: needs_review`                 | `ESCALATE`（要人間）                                  | merge 前に解消すべき非 Blocking Unknown / 証拠不足 → `severity: major` finding ＋ §4 残リスク節に残懸念を明記                     |
| `verdict: fail`                         | `NO_GO`（要修正）                                     | セキュリティ / データ損失 / 互換性 / 不可逆の重大 Blocking Unknown → `severity: critical` finding                                 |
| `blocking: true / false`                | finding `severity`（critical / major）＋ `confidence` | blocking かつ高確信 → critical。非 blocking → §4 残リスク節（finding 化しづらいものは report 節）                                 |
| `evidence_checked` / `evidence_missing` | finding `evidence[]` ＋ §4 節本文                     | 不足証拠は §4 の残リスク文と `suggestion`（解消手順）で表現する                                                                   |
| `resolved`（解消済み Unknown）          | Good Points 節（§4）＋ 根拠 file / test 参照          | 「解消済みには根拠を関連付ける」受入条件を §4 で満たす。分量目安は観点ごとに代表 1 件・1 行に要約する                             |

`pass` と `needs_review` の境界は **resolution の実行タイミング（merge 前 / merge 後）** を判別軸とします。非 Blocking Unknown が1件でも残ることは、それだけで `needs_review` を意味しません。その resolution が merge 後の観測（次回 eval run・運用レビュー等）で足りるなら `pass`（`GO_WITH_OBSERVATION`）、merge 前に解消すべきものが残る場合のみ `needs_review`（`ESCALATE`）へ倒します（#1470 P1 受入後観測）。`GO_WITH_OBSERVATION` へ写像する非 Blocking Unknown を finding として出す場合、severity は `minor` / `info` に制限します。`major` 以上の finding を伴う `verdict: pass` は `gate.decision` の判定と矛盾するためです。

`gate.decision` の fail-safe 方向（判定不能・未決 → `NO_GO` / `ESCALATE`）は `src/lib/gate-decision.mjs` の決定論純関数が担い、`severity` × `confidence` × `blocking` の 3 軸で出し分けます。出力スキーマ（`severity: critical / major / minor / info`）は変更せず、後方互換を保ちます。

## 関連ドキュメント

- [AI 駆動開発プレイブック（Case 2 / Case 3）](../guides/ai-agent-playbook.md) — ケース別の呼び出し方
- [generate → review → revise ループ設計](https://github.com/s977043/river-review/blob/main/docs/ai/generate-review-revise-loop.md) — 収束制御の背景設計（#1150 S2a の元 doc）
- [安定インターフェース（CLI / GitHub Actions）](./stable-interfaces.md) — exit code を含む CLI 安定契約
