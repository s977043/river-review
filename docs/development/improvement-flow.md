# Improvement Flow: 学びをプロセスに反映する

セッションで得た学びを再現可能な形に codify するための運用フロー。このドキュメント自体も過去のセッションで「暗黙の振り返りループ」を回していた結果を明文化したもの。

## 背景

River Review の運用で同じミスを繰り返し、そのたびに「次回から気をつける」で終わっていた時期があった。以下のような incident がセッションを跨いで再発した:

- Issue 作成時にコードベースを調査せず、既に実装済みの機能に対して Issue を作成（8件）
- パイプライン関数に新パラメータを追加する際、`local-runner.mjs` への転送漏れが2 PR連続で発生
- 複数 PR のマージ順序を計画せずに `review-engine.mjs` でコンフリクト
- `git stash`/`git checkout` の誤操作で作業ファイルを2回失う
- git コマンド出力の branch 名を読み飛ばし、意図と異なるブランチに commit

こうした再発を防ぐため、学びを必ず形にする Improvement Flow を導入する。

## いつ使うか

以下のいずれかに該当する場合に適用する:

- 同じクラスのミスが2回以上発生した
- Guardrail があれば防げたミスが起きた
- 再利用可能なパターンを発見した（新しいコマンドや checklist のネタになる）

一度しか起きていないミスのためにルールを作らない（過剰な形式化を避ける）。

## フロー

### Step 1: 学びの整理

以下を言語化する:

- **What**: 何が起きたか
- **How many**: 何回発生したか
- **Cost**: 失われた時間・作業量
- **Root cause**: 根本原因（トリガーは何だったか）

言語化した What / How many / Cost / Root cause は、それ自体を一次ソースで裏取りする。件数や率には分子と分母を併記し、測定コマンドも残す。再現できない集計値は載せず、`git diff` などで追える具体例へ置き換える。

**測定対象の断面も併記する。** 集計値には測定時刻に加えて、どの ref・コミット・状態を測ったかを書く。同じファイルでも、変更の前後どちらを測ったかで値が変わるためです。実例として 2026-08-12 の退役判定では、`guard-ledger.yaml` の `reviewAfter` 到来件数を判定の**後**の台帳で数えて 0 件と報告した。方法は正しく、断面だけが誤っていた（正しい値は判定前の `ea2842ab` 時点で 13 件）。再測定は前の値を疑うが、測った断面までは疑わない。

### Step 2: 成果物の分類

学びをどの形で固定化するかを決める:

| 形                                 | 使いどき                                                           | 例                                                                                                           |
| ---------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| CLAUDE.md の AI Misoperation Guard | リポジトリ固有の行動ルール（全セッションに適用）                   | "Commit before branch switches"                                                                              |
| `.claude/commands/*.md`            | 繰り返し実行する手順で、step-by-step のガイドが必要                | `/propose-issue`, `/plan-merge-order`                                                                        |
| `docs/development/*.md`            | コードベース固有のリファレンス / チェックリスト                    | `pipeline-params-checklist.md`, このドキュメント                                                             |
| Auto-memory (`feedback_*.md`)      | リポジトリ非依存で cross-session な習慣（git/editor の reflex 等） | `feedback_git_wip_commit.md`                                                                                 |
| `scripts/*.mjs` + 必須 CI チェック | 宣言と実体の一致を決定論で検証できるもの（件数・列挙・参照の整合） | `scripts/check-doc-enumerations.mjs`（`npm run meta:validate` 経由で必須チェック `Meta consistency` に接続） |

まず「mechanical に検証できるか」を確認する。決定論で検証できるなら、手順ではなく検証を書く（script + 必須 CI チェック）。散文のチェックリストは守られない前提で設計する。機械検証されている参照はほとんど壊れないが、CI 非対象の人手の列挙は実測でずれていた（実測値・分母・測定コマンドは [doc-enumeration-checks.md](./doc-enumeration-checks.md) が SSoT。ここに数値を複製しない）。検証へ落とせない場合だけ「mechanical に実行できるか」で分類する。実行手順なら command、判断を要する行動原則なら guard、call site リストなら docs。一部だけ決定論で検証できる場合は、検証できる部分を script + CI に切り出したうえで、残余を guard / command に落とす（どちらか一方に寄せない）。

CLAUDE.md の AI Misoperation Guard を新設する場合は、同じ PR で [`guard-ledger.yaml`](./guard-ledger.yaml) にもエントリを足します。台帳が SSoT であり、`mechanized` / `verifiedBy` / `addedAt` / `reviewAfter` をここで宣言することが、後述の Step 9（退役判定）の入力になります。台帳と CLAUDE.md がずれた状態は必須チェック `Meta consistency` が落とします。

#### gate を作る対策

対策がマージやリリースを止める gate である場合、上の基準に加えて次の 3 点を適用する。

第一に、文書ではなく機構（workflow + 必須ステータスチェック）を優先する。読む側が読むことを前提とした仕組みは、読まない経路が 1 つでも残っていれば破れる。実例として、`blocked` ラベルの確認手順を `docs/governance.md` へ足した #1752 は、そのマージの 5 時間 19 分後に同じ見落とし（#1761）で破られた。ラベルの有無を CI の成否へ写像した #1770 で初めて止まっている。

第二に、その gate が**誤って止めるケース**を設計時に洗い、必要なら同じ PR で塞ぐ。gate は「止めるべきものを止める」だけでなく「止めるべきでないものを止めない」ことまで満たして初めて機能する。#1770 の `concurrency: cancel-in-progress: true` は、同一 head SHA で 2 run が発火した際に `cancelled` の check-run を残し、必須チェックとして無関係な PR のマージを止めた（#1778）。最低限、リトライ・並行実行・キャンセル・skip の 4 経路で、判定が pass / fail のどちらとしても報告されない状態が生じないかを確認する。

第三に、その gate が**止めるべきものを止められるか**を実測する。機構化しても、機構の動作環境と欠陥の発現環境が違えば検出できない。実例として、`scripts/count-in-clean-tree.sh` の SIGPIPE 欠陥は #1828 で同時に追加した `tests/count-in-clean-tree.test.mjs` の対象であり、そのテストは必須チェック `Unit tests (22.x)` にも載っていた。それでも検出できていない。CI の runner が ubuntu-latest である一方で、欠陥は macOS でのみ現れる。そのため、当時の 6 件中 4 件が macOS ローカルでのみ fail する状態が #1839 の修正まで残った（`git archive 12f97eaa` で取り出した修正前のテストを macOS で実行すると `# fail 4`）。#1828 のマージ 2026-08-12T15:39Z から #1839 のマージ 22:41Z まで約 7 時間です。テストがあることと、テストが失敗を捕まえることは別です。gate を作ったら意図的に違反状態を作って落ちることを確認し、その確認を gate が実際に動く環境で行う。プラットフォーム依存の挙動に依存する検証は、依存しない実装へ倒してからテストする。

### Step 3: ドラフト作成

- 既存パターン（frontmatter, tone, 構造）に揃える
- 具体コマンドを併記する（抽象的な指示は避ける）
- 動機となった incident を PR 本文や commit message に含める（ルール本体には含めない）
- 早めに中間コミットして work を保護する
- 段落を `#NNNN`（issue / PR 番号）で始めない。markdownlint が ATX 見出しと誤検出し、pre-commit の lint-staged が commit を止める。`PR #NNNN は …` のように番号の前に語を置き、commit 前に `grep -n '^#[0-9]' <file>` が 0 件であることを確認する（2026-09-05..06 の振り返り doc 3 本で毎回再発）

### Step 4: セルフレビュー

`/review-local` または手動で以下を確認:

- **Clarity**: 未来のセッションが mechanical に実行できるか
- **Consistency**: 既存の成果物と tone/format が揃っているか
- **Correctness**: ツール・コマンドの挙動が実態と一致しているか
- **Scope**: 特定の incident に寄りすぎず、class of errors をカバーしているか

### Step 5: Multi-agent Review（3観点）

`river-review` サブエージェントを **1メッセージ内で3つの Task invocation として同時発行** する（serialize させないため）:

- **Quality Review**: rule の明確さ、actionability、既存ルールとの整合性
- **Code Reuse Review**: AGENTS.md / CLAUDE.md / `.claude/rules/` / 既存 docs との重複
- **Efficiency/Accuracy Review**: 参照するコマンド・ファイル・行番号の正確性、隠れた gotcha

この3観点は経験則として指摘が集まりやすいカテゴリ。

### Step 6: 指摘の適用

- **Major**: 必ず修正（AGENTS.md との矛盾、fabricated references、scope creep など）
- **Minor**: 判断して適用（tone drift、オーバースペック、重複注意など）
- **Info**: 記録のみ or 将来の改善ネタとして保留

指摘が誤っている場合（ソースを verify して誤指摘が判明した場合）は受け入れず、PR 本文で経緯を説明する。

### Step 7: PR 作成・マージ

`/pr` コマンドで PR 本文を下書きし、以下を含める:

- 背景となる incident
- 追加したルール・コマンド・docs の列挙
- レビュー指摘と対応サマリ

マージは squash merge を使う（リポジトリ convention）。

### Step 8: メモリ保存

セッション間で持続させたい学びは `feedback_*.md` として auto-memory に保存し、`MEMORY.md` インデックスを更新する。

### Step 9: 退役判定

Step 1〜8 はすべて追加の手順です。追加だけを繰り返した結果、CLAUDE.md は 2026-04-11 の 4,085 バイトから、#1821 適用前の 2026-08-12 時点で 25,977 バイトへ 6.4 倍に増えました。AI Misoperation Guards は 28 件になりました（#1821 自身が +366 バイトを足しているため、同 PR 適用後は 26,343 バイト・6.45 倍にあたります）。同じ期間に明示的な退役は 1 回（「Merge-time checks」が旧 4 ガードを吸収した例）しかありません。追加と退役の非対称は、この Step が無かったことに起因します。

退役の対象は [`guard-ledger.yaml`](./guard-ledger.yaml) が管理します。台帳が SSoT であり、CLAUDE.md は `scripts/check-doc-enumerations.mjs` の spec `claude-md-guard-ledger` で台帳と照合される従属側です。台帳側を正にしているのは、CLAUDE.md の編集が「Always ask」に分類されており、正を CLAUDE.md に置くと退役の運用のたびに承認待ちがブロッカーになるためです。

台帳はガード（`guards:`）に加えて、ガード以外の期限付きの決定（`decisions:`）も扱います。deprecate した資産・観測中の workflow・暫定的な除外設定が対象で、いずれも同じ `reviewAfter` の棚卸しに載ります（#1843）。

#### 発動条件と判断者

- **発動条件**: 台帳の `reviewAfter`（ガードの既定は `addedAt` + 90 日）が到来していること。日付の到来だけが条件であり、ミスの再発や体感は条件に含めない
- **判断者**: リポジトリのメンテナ（`s977043`）。判断は PR として提出し、通常のレビュー経路に載せる
- **棚卸しの起点**: セッション開始時の sanity check、またはリリース直後。`guards:` と `decisions:` の両方を次のコマンドで列挙する。対象は `reviewAfter` が今日以前のエントリと、`reviewAfter: undecided` のエントリである

```bash
node -e "const y=require('js-yaml'),f=require('node:fs');const t=new Date().toISOString().slice(0,10);
const d=y.load(f.readFileSync('docs/development/guard-ledger.yaml','utf8'));
for(const g of d.guards) if(g.reviewAfter<=t) console.log('guard',g.reviewAfter,g.mechanized,g.id);
for(const e of d.decisions??[]) if(e.reviewAfter==='undecided'||e.reviewAfter<=t)
  console.log('decision',e.reviewAfter,e.kind,e.id);"
```

#### 3 択の判断

`reviewAfter` が到来したガードは、次の 3 つのいずれかへ必ず分類します。「今回は保留」は選択肢に含めません。保留する場合も `reviewAfter` を新しい日付へ更新し、その理由を `notes` に書きます。

| 判断                   | 条件                                                                    | 実行内容                                                                                                   |
| ---------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| (a) 散文を削除する     | `mechanized: full`（違反が決定論のチェックで必ず失敗になる）            | CLAUDE.md の当該 bullet を削除し、台帳のエントリは `mechanized: full` のまま残す。台帳が退役後の記録を担う |
| (b) ガードごと削除する | `addedAt` 以降に発火実績が無い（該当のミスが再発していない）            | CLAUDE.md の bullet と台帳のエントリを同じ PR で削除する。照合 spec があるため片方だけ消すと CI が落ちる   |
| (c) 機械化を起票する   | `mechanized` が `full` でなく、`addedAt` 以降に同種のミスが再発している | 機械化の Issue を `/propose-issue` で起票し、`reviewAfter` を延長したうえで `notes` に Issue 番号を書く    |

(a) で散文だけを削除するのは、機械検証が代替になっているためです。読む側の負荷を減らしても、違反はチェックが止めます。(b) の「発火実績が無い」は、振り返り記録（`docs/development/retrospectives/`）と `git log` で確認します。判断できないときは (c) を選び、確認そのものをタスクとして残します。

#### 期限付きの決定（`decisions:`）の判断

ガード以外の決定は、`reviewAfter` の到来時に次の 3 つのいずれかへ分類します。ガードの 3 択と同じく「今回は保留」は選べず、保留する場合も `reviewAfter` を新しい日付へ更新して理由を `notes` に書きます。

| 判断           | 実行内容                                                                                                  |
| -------------- | --------------------------------------------------------------------------------------------------------- |
| 予定どおり実行 | deprecate した資産を削除し、台帳のエントリも同じ PR で消す（`decision-ledger-target` が片方漏れを落とす） |
| 撤回して再採用 | deprecation を取り消し、対象の DEPRECATED 表示を消したうえで台帳のエントリを消す                          |
| 期日を延ばす   | `reviewAfter` を新しい日付へ更新し、延長の理由と観測内容を `notes` に書く                                 |

`reviewAfter: undecided` のエントリは、この 3 択の前段として「期日を決める」ことが判断対象です。undecided のまま棚卸しを 2 回通したら、期日を決めるか対象を削除するかのどちらかを選びます。

#### 退役 PR の作法

- 台帳と CLAUDE.md は必ず同じ PR で更新する（別 PR に分けると、先にマージされたほうで必須チェック `Meta consistency` が落ちる）
- CLAUDE.md の「Improvement Flow」節はガード名を列挙しているため、削除したガード名をこの列挙からも外す
- 削除したガードの根拠（発火実績の有無、機械化の所在）を PR 本文に書く。台帳の `notes` には結論だけを残す

## Dogfooding

このフロー自体を Improvement Flow に従って改善する。

- フロー適用後、**このドキュメント**に改善点がないか振り返る
- 新しい incident class が見つかったら、このドキュメントに追記する
- 過剰形式化の簡素化は「兆候が見えたら」ではなく Step 9 の `reviewAfter` を発動条件とする（兆候ベースの記述は発動条件・担当のいずれも定まらず、実績として機能しなかった）

## アンチパターン

- 1回しか起きていない incident のために rule を作らない（過剰形式化）
- AGENTS.md の内容を CLAUDE.md に重複させない（メンテナンス負荷）
- Multi-agent review をスキップしない（経験則として Major 指摘が毎サイクル出る）
- CLAUDE.md の bullet に incident narrative を書かない（imperative tone が崩れる。narrative は PR 本文へ）
- レビュー指摘を鵜呑みにしない（誤指摘もある、要ソース検証）

## 過去の適用実績

最新の状況は `git log CLAUDE.md` および `git log docs/development/` で確認すること。以下は初回 codification 時点のスナップショット。

| マージ日   | 学び                         | 成果物                                          |
| ---------- | ---------------------------- | ----------------------------------------------- |
| 2026-04-11 | Issue 作成前の調査不足       | `/propose-issue` コマンド                       |
| 2026-04-11 | パラメータ伝播漏れ           | `docs/development/pipeline-params-checklist.md` |
| 2026-04-11 | マージ順序未計画             | `/plan-merge-order` コマンド                    |
| 2026-04-11 | `git stash` 事故             | CLAUDE.md "Commit before branch switches"       |
| 2026-04-11 | git 出力 branch 名読み飛ばし | CLAUDE.md "Verify git output before chaining"   |
| 2026-04-09 | main の Lint failure 波及    | CLAUDE.md "Verify CI green before merge"        |

## 関連

- `CLAUDE.md`—AI Misoperation Guards
- `AGENTS.md`—全 agent 共通ルール（Safety, Edit Scope）
- `.claude/commands/`—カスタムコマンド
- `docs/development/pipeline-params-checklist.md`—具体的な checklist 例
- [`guard-ledger.yaml`](./guard-ledger.yaml)—AI Misoperation Guards の台帳（Step 9 の SSoT）
- [`doc-enumeration-checks.md`](./doc-enumeration-checks.md)—台帳と CLAUDE.md を照合する spec の登録先
