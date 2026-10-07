# Agent Harness 設計: 開発エージェントの自己改善ループ

この文書は、River Review を**開発する側**のエージェント（オーガナイザーと委託ワーカー）を対象にした自己改善ループの設計です。振る舞いを観測してルールを足し、その効果を測って、効かないルールを退役させます。製品側のハーネス進化（#1574）は対象外です。

## 背景

学びをルールへ落とす手順は [`improvement-flow.md`](./improvement-flow.md) の Step 1〜8 が、退役の手順は同 Step 9 が持っています。ルールの台帳は [`guard-ledger.yaml`](./guard-ledger.yaml) です。足りないのは次の 2 段です。

- **効果測定**: ルールを入れた後に、狙った失敗が減ったかを測る手段が無い。台帳の `notes` には「発火実績を測る基盤が無い」が繰り返し書かれている
- **退役の入力**: `reviewAfter` を過ぎても警告は出ない。`npm run meta:validate` は日付の形式だけを見ている。[`worker-discipline-template.md`](./worker-discipline-template.md) は追記専用の例外（AGENTS.md の Edit Scope）で 43 コミットまで育ったが、行を外す経路が無い

## ループの全体像

| 段階     | やること                                           | 成果物                                                                   | 自律 / 承認            |
| -------- | -------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------- |
| 観測     | signal を jsonl へ追記する                         | `~/.claude/state/*.jsonl`                                                | 自律                   |
| 集計     | パターンの頻度と、ルールごとの導入前後の割合を出す | `npm run harness:report` の出力                                          | 自律                   |
| 候補化   | 1 候補 = 1 仮説 = 最小の変更として書き出す         | PR 本文または Issue                                                      | 自律（起票まで）       |
| 成文化   | ルール本文と、効果を測る signal を同じ PR で入れる | ルール本文 + [`harness-signals.yaml`](./harness-signals.yaml) のエントリ | 置き場所による         |
| 強制     | 可能なら hook / script / allow 規則で機械化する    | hook・script・settings                                                   | 承認                   |
| 効果測定 | 導入前後の割合を比べ、判定を出す                   | `harness:report` の判定                                                  | 自律                   |
| 退役     | 期日到来と効果なしのルールを候補として列挙する     | 退役 PR                                                                  | 提案は自律・削除は承認 |

成文化と退役の作法そのものは improvement-flow.md に従い、本書では重ねて書きません。本書が足すのは、各段の成果物の契約と、効果測定の定義です。

## Signal

### 既存の signal

| signal                  | 所在                                             | 中身                                                           |
| ----------------------- | ------------------------------------------------ | -------------------------------------------------------------- |
| 確認ダイアログのログ    | `~/.claude/state/permission-prompts.jsonl`       | user 設定の PermissionRequest hook が追記する 1 行 1 件の JSON |
| ガード台帳の期日        | `guard-ledger.yaml` の `reviewAfter`             | 退役判定の期日                                                 |
| range-review の自己申告 | `/range-review` の出力末尾「規律違反の自己申告」 | レビュー agent が起こした副作用の申告。現状は保存されない      |
| 振り返り                | [`retrospectives/`](./retrospectives/)           | ウェーブ単位の散文。機械集計の対象にはしない                   |

確認ダイアログのログの行は `{ts, cwd, session_id, permission_mode, tool_name, tool_input}` です。記録は 2026-10-06T16:32Z に始まり、全リポジトリの呼び出しが混ざります。

### 追加する signal（設計のみ）

hook がガードとして止めた事象も、確認ダイアログと同じく失敗の手前で観測できます。各 hook が次の共通形式で `~/.claude/state/harness-events.jsonl` へ 1 行追記する設計にします。user 設定の hook の変更は本 PR に含めません。

```json
{
  "ts": "2026-10-07T01:02:03Z",
  "source": "hook:no-force-push",
  "kind": "block",
  "ruleId": "no-force-push",
  "cwd": "/path/to/repo",
  "session_id": "…",
  "detail": { "tool_name": "Bash", "excerpt": "git push --force …" }
}
```

- `source` は追記した主体である。`hook:<name>`・`command:range-review`・`script:<name>` の形にする
- `kind` は `block`（止めた）・`warn`（通したが警告した）・`self-report`（agent の自己申告）の 3 つに限る
- `ruleId` は `harness-signals.yaml` または `guard-ledger.yaml` の `id` と一致させる。対応するルールが無い事象は空文字にする
- `detail` は原文を全部は残さない。秘密情報の混入を避けるため、照合に要る抜粋だけにする
- 追記に失敗しても hook の判定は変えない（`log-permission-request.sh` と同じく、記録は常に best effort）

range-review の自己申告は、オーガナイザーが出力を受け取った時点で `kind: self-report` として追記します。会話ログ（transcript）の採掘は前提にしません。

### signal の定義: 先頭コマンド語

`permission-prompt-first-command` は、確認ダイアログの行のうち `tool_name` が一致し、`tool_input.command` の先頭コマンド語が一致するものを数えます。先頭コマンド語は [`scripts/harness/shell-segments.mjs`](../../scripts/harness/shell-segments.mjs) が次の規則で取り出します。

- `;`・`&&`・`||`・`|`・`&`・改行で segment に分ける。ただしクォート・`$(...)`・バッククォートの内側は分けない
- `2>&1`・`>&2`・`&>` の `&` はリダイレクトとして扱い、区切りにしない
- heredoc（`<<EOF`・`<<-'EOF'` など）の本体は読み飛ばす。`<<<` は heredoc として扱わない
- `\` + 改行は空白に置き換える。単語の先頭の `#` 以降は行末までコメントとして捨てる
- segment 先頭の `(`・`{` と環境変数の代入（`FOO=bar`）は読み飛ばす
- 代入だけの segment（`R=/path;`）はコマンド語を持たないので、次の segment を見る

この規則は `.claude/hooks/no-force-push.sh` の sanitizer と同じ考え方を JavaScript へ移したものです。hook は awk で書かれており import できないため、harness 側の実装はこの 1 モジュールに限ります。

## 候補

候補は次の 5 項目を持つ 1 件の提案です。複数の仮説を 1 候補へまとめません。

| 項目              | 内容                                                                   |
| ----------------- | ---------------------------------------------------------------------- |
| 仮説              | 「X をすると Y が減る」の 1 文                                         |
| 変更              | 規律 1 行・ガード・allow 規則・script のうち最小のもの 1 つ            |
| 根拠の件数        | どの signal の何件か。測定コマンドと母集団（期間・リポジトリ）を添える |
| 減るはずの signal | `harness-signals.yaml` に書ける形の signal 定義                        |
| 置き場所          | テンプレート・ガード台帳・settings のどれか（人の境界を決める）        |

improvement-flow.md の「1 回しか起きていない incident のために rule を作らない」は候補にも適用します。根拠の件数が 1 の候補は出しません。

## 効果測定

### 台帳

効果を測るルールは [`harness-signals.yaml`](./harness-signals.yaml) に 1 件ずつ登録します。各エントリは `introducedAt`（導入 PR のマージ時刻、UTC）と `signal` を必ず持ちます。signal を書けないルールは効果測定の対象外とし、台帳にも載せません。

### 窓と判定

`npm run harness:report` は、ルールごとに導入時刻を挟む同じ長さ W の 2 区間を比べます。

- W = min（ログ開始〜導入、導入〜ログ終了、14 日）である。ログの記録期間は `--repo` で絞る前の全行で決める
- 割合 = 窓内で signal に該当した件数 ÷ 窓内の確認ダイアログの件数
- 相対減少 = 1 − 導入後の割合 ÷ 導入前の割合

| 判定                | 条件                                                                |
| ------------------- | ------------------------------------------------------------------- |
| `insufficient-data` | どちらかの窓が 50 件未満、または導入前の該当件数が 0                |
| `effective`         | 相対減少が 30% 以上                                                 |
| `no-effect`         | 上のどちらでもない（件数は足りているのに 30% 未満しか減っていない） |

閾値は `scripts/harness/permission-prompt-report.mjs` の定数が実体です。判定は統計的な検定ではなく、人が退役を検討するきっかけです。`no-effect` を見たら、母集団が合っているか（ルールの届く範囲だけに絞れているか）を先に確かめます。

### 母集団の注意

- ログは全リポジトリ・全セッションの混合である。委託ワーカーの定型に入れたルールはオーガナイザー本人や他リポジトリに届かないため、`--repo` で絞った値を正とする
- 分母の確認ダイアログ自体が allow 規則や permission mode の変更で増減する。割合で比べるのはこのためだが、同じ窓の間に settings が変わった場合は判定を信用しない
- 導入前の窓は記録開始より前へ伸ばせない。記録開始の直後に入れたルールは、導入前の窓が短いまま固定される

### `--check`

`--check` を付けると、`no-effect` のルールが 1 件でもあれば exit 1 を返します。CI や定期実行へは接続していません。接続する場合は必須チェックにせず、通知用の任意ジョブとして置きます（ログが user 環境にしか無く、CI からは読めないため）。

## 退役

`harness:report` は次の 3 種を退役候補として列挙します。列挙までが自律で、判断は improvement-flow.md の Step 9 に従い人が行います。

- `guard-ledger.yaml` の `reviewAfter` が今日以前のガード（Step 9 の列挙条件と同じ）
- `harness-signals.yaml` の `reviewAfter` が今日以前のルール
- 判定が `no-effect` のルール

### テンプレート行の退役経路

worker-discipline-template.md への 1 行追記は事前確認なしで行えますが、既存行の書き換えと削除には事前確認が要ります（AGENTS.md の Edit Scope）。ハーネスはこの境界を変えません。

1. 追記と同じ PR で、その行に対応する `harness-signals.yaml` のエントリを足す（signal を書ける場合）
2. エントリが退役候補に挙がったら、行とエントリを消す PR を作る。PR 本文に判定の出力と母集団を貼る
3. マージ前にメンテナの承認を得る。承認が得られない場合は `reviewAfter` を延ばし、理由を `notes` に書く

signal を書けない行は効果測定の対象外です。それらの行の棚卸しは従来どおり人の判断に残ります。

## 人の境界

| 区分   | 対象                                                                                                              |
| ------ | ----------------------------------------------------------------------------------------------------------------- |
| 自律   | signal の観測と集計、候補の起票、`harness:report` の実行、テンプレートへの 1 行追記と台帳エントリの追加           |
| 承認   | CLAUDE.md・AGENTS.md・`.claude/settings*.json`・user 設定の hook の変更、行やガードの削除、必須 CI チェックの追加 |
| 対象外 | 承認なしでの退役、ログの外部送信                                                                                  |

この区分は CLAUDE.md の Decision Policy と AGENTS.md の Edit Scope を言い換えたものです。食い違いがあれば、そちらを正とします。

## 既存資産との関係

- [`improvement-flow.md`](./improvement-flow.md): 成文化（Step 1〜8）と退役判定（Step 9）の SSoT である。本書は効果測定と退役候補の列挙を足すだけで、手順は複製しない
- [`guard-ledger.yaml`](./guard-ledger.yaml): ガードの台帳である。`harness:report` は `scripts/check-doc-enumerations.mjs` の `parseGuardLedger` を import して読む
- [`harness-signals.yaml`](./harness-signals.yaml): 効果を測るルールの台帳である。ガードに限らず、テンプレート行や allow 規則も載せられる
- [`worker-discipline-template.md`](./worker-discipline-template.md): 追記の受け皿である。退役経路は上の「テンプレート行の退役経路」に従う

## 非目標

- 製品側のハーネス進化（#1574）は扱わない
- 会話ログ（transcript）の採掘は前提にしない。hook が追記する jsonl だけで回る範囲に限る
- ルールの自動削除・自動マージはしない
- 統計的に厳密な因果推定はしない。判定は人が見るきっかけに留める
