---
description: ウェーブ完了時に git 範囲の diff を 3 視点（ロジック敵対 / 公開契約 / 設計・テスト品質）の読み取り専用 agent で並列レビューし、finding を再現確認のうえ disposition 案まで出す
argument-hint: '[<from>..<to>]'
allowed-tools: Bash(git log:*), Bash(git diff:*), Bash(git show:*), Bash(git rev-parse:*), Bash(gh pr view:*), Bash(gh pr diff:*), Bash(gh release view:*), Bash(gh api:*), Read, Agent
---

範囲レビュー: git 範囲「$ARGUMENTS」に含まれる全 PR の diff を 1 つの単位として、3 視点の読み取り専用 agent で並列レビューし、finding をオーガナイザーが一次ソースで再現してから disposition 案を出す。

このスキルは複数 PR のウェーブ（1 リリース分、または 1 セッション分）が main にマージされた直後に呼び出すことを想定している。per-PR レビューは「その PR 単独で正しいか」しか見ず、同じ範囲の複数 PR が同じ関数・同じ概念を触った結果の相互作用や、複数 PR を跨いで初めて実態と食い違う公開契約の文言は素通りする。本コマンドは **issue も PR も作らない**。案を出すところで止め、実行はオーガナイザーがユーザー確認のうえ行う。

## 引数

- `<from>..<to>` の git 範囲（例: `c4453812..3ac089e1`）
- 省略時の既定は「1 つ前の release commit → HEAD」。次で求める:

```bash
git log --grep='chore(main): release' -2 --format='%h %s'
```

出力の **2 行目**（1 つ前の release）を `<from>`、`HEAD` を `<to>` にする。HEAD 自体が release commit なら、そのリリースに含まれた PR 群をレビューすることになる（1 行目が HEAD と一致する場合も 2 行目を `<from>` にすればよい）。release commit が 1 件しか無い場合はユーザーに範囲を明示するよう求めて終了する。

## 手順

### Step 1. 範囲の確定と要約

```bash
git log --oneline <from>..<to>
git diff --stat <from>..<to>
git log --format='%s' <from>..<to> | grep -oE '\(#[0-9]+\)$' | tr -d '(#)' | sort -n | uniq
```

- 1 つ目が空なら「範囲が空」と報告して終了する
- 3 つ目で PR 番号を列挙する。squash merge の subject 末尾 `(#N)` から取るため、それ以外の形式の commit は `git log` の目視で補う
- 列挙した PR ごとに `gh pr view <N> --json title,body --jq '.title'` で題名を控える。Step 2 のプロンプトに **PR 番号と題名の一覧**、`git diff --stat` の出力、範囲文字列をそのまま貼る

### Step 2. 3 視点の並列レビュー

Agent ツールで 3 本を **1 メッセージで同時に**起動する。`subagent_type: general-purpose`、全て**読み取り専用**の指示で走らせる。各 agent に渡すプロンプトは、下の「共通規律」ブロックの後ろに視点別ブロックを 1 つ足したものである。共通規律は 3 本とも省略せず全文入れる。

#### 3 本が同時に立ち上がらないとき: Codex CLI で直列に回す

並列起動は失敗する日がある。2026-09-04 から 09-08 までの 5 日連続で、メモリ逼迫による background task の kill とレート上限がログに残っている。**視点を減らして 2 本で済ませてはならない**（後掲「禁止事項」）。並列が通らないなら、同じプロンプトを Codex CLI へ渡して 1 本ずつ直列に回す。

準備は 1 回だけ行う。作業ツリーは全視点で共有してよい（読み取り専用のため）。

```bash
R=$(mktemp -d) && echo "$R" > /tmp/rr-base.txt
git worktree add --detach "$R/wt" <to>
# 共通規律を 1 ファイルに置き、視点別ブロックを後ろへ結合する
cat > "$R/common.txt" <<'EOF'
<共通規律の全文>
EOF
cat "$R/common.txt" "$R/pa-body.txt" > "$R/pa.txt"
```

各視点はこの形で起動する。`--sandbox workspace-write` は変異注入（規律 3）に要る。

```bash
export PATH=/opt/homebrew/opt/node@22/bin:$PATH
codex exec -C "$R/wt" --sandbox workspace-write --skip-git-repo-check - < "$R/pa.txt" > "$R/out-a.md" 2> "$R/err-a.log"
```

前提と後始末は次のとおり。

- **Codex のサンドボックスはネットワークを持たない。** `npm ci` は `ENOTCACHED` で落ちるので、起動前にオーガナイザーが worktree で `npm ci` を済ませておく。
- **Codex は commit できない**（`index.lock` が拒否される）。finding に基づく修正 PR はオーガナイザーが作る。
- 3 本が終わったら `git worktree remove --force "$R/wt"` で撤去する。
- 直列で回した事実と、その理由（並列が落ちた／レート上限）を報告に書く。

#### 共通規律（3 本すべてのプロンプト冒頭に貼る）

```text
あなたは読み取り専用のレビュー agent です。対象リポジトリ: <repo path>（作業ツリーを書き換えない）。
レビュー対象: git 範囲 <from>..<to>。含まれる PR: <PR 番号と題名の一覧>。
差分の概要:
<git diff --stat の出力>

## 規律（厳守）
1. 主張は実測で裏付ける。指摘には必ず `file:line`（<to> 時点の内容）を書き、コマンドを実行したなら exit code を転記する。
   パイプ越しの `$?` は末尾コマンド（`tail` 等）の値なので、exit code を測るときはパイプを外す。
2. CLI（`node src/cli.mjs` / `river`）を実行するときは、必ず `mktemp -d` で作った使い捨て git repo の中で行う。
   `skills import` / `feedback add` / `suppression add` は作業ツリーへファイルを書くため、対象リポジトリ内で実行してはならない。
   使い捨て repo の作り方: `d=$(mktemp -d) && cd "$d" && git init -q && git commit -q --allow-empty -m init`
3. 変異注入（既存テストの検出力を測るために実装を一時的に壊す）を行う場合は、
   `git worktree add --detach <mktemp -d の path> <to>` で自分専用の worktree を作り、その中だけで行う。
   終了前に `git worktree remove --force <path>` で必ず消す。対象リポジトリ本体の作業ツリーには一切触れない。
   その worktree で `npm test` や `npm run build:action` を走らせるなら、`node_modules` は
   **その worktree の中で `npm ci` して用意する**。対象リポジトリの `node_modules` を symlink してはならない。
   親の `node_modules` はレビュー対象の版の lockfile と一致している保証が無く、`npm run build:action` の
   出力が committed dist とズレて「dist が再現しない」という偽の finding になる（2026-09-07、v1.104.0 の
   範囲レビューで視点 B が major として報告し、隔離 worktree の `npm ci` 後は
   `git diff --exit-code runners/github-action/dist/` が exit 0 で再現したため反証した）。
4. 破棄系 git コマンド（`reset --hard` / `checkout -- <file>` / `clean` / `stash drop` / `push --force`）と `rm -rf` を対象リポジトリで実行しない。
5. 修正は提案に留める。ファイル編集・commit・push・issue / PR コメントの投稿を行わない。
6. 差分に無いコードへの推測、一般論だけの指摘、範囲の目的と無関係な指摘は書かない。
7. 出力は 1500 tokens 以内。次の 3 節で構成する:
   - 判定: PASS / FINDINGS（blocker・major・minor の件数）
   - finding: 1 件ごとに「重大度 / file:line / 再現手順（実行したコマンドと出力の要点、exit code）/ 提案」
   - no-finding の根拠: 調べたが問題なしと判断した箇所を、確認方法つきで箇条書き
8. 途中で副作用（意図しない書き込み、前提の誤り）を起こしたら、隠さず出力末尾の「規律違反の自己申告」に書く。
```

#### 視点 A: ロジック敵対

```text
## 視点: ロジック敵対
この範囲に含まれる PR 同士の相互作用を敵対的に探す。
- 同じ関数・同じ概念（同じメッセージ文言、同じ候補順、同じ正規化）を 2 つ以上の PR が触っていないか。
  触っているなら、後の PR が前の PR の前提を壊していないか、`git log -p <from>..<to> -- <file>` で確かめる。
- SSoT の二重実装: 既存の SSoT（CLAUDE.md「Import the SSoT, never re-derive it」の一覧、およびこの範囲で新設された関数）と
  同じ知識を別の場所に手書きしていないか。例: ある関数が返す候補列を、エラーメッセージや doc が独自の順序で書き直している。
- 境界条件: 空入力・空白のみ・NFC 未正規化・先頭ハイフン・引数の前後順など、この範囲の変更が新たに受け付けた入力の端。
- 変異注入: この範囲で追加・変更されたテストが実装の変化を本当に検出するか、規律 3 の worktree で実装を 1 箇所壊して
  `npm test -- <対象テスト>` を走らせ、赤くなるかを確かめる。緑のままなら finding。
```

#### 視点 B: 公開契約

```text
## 視点: 公開契約
利用者から見える契約が、この範囲の後も文書どおりか。**文書を読んで終わりにせず、必ず実測で突き合わせる。**
- `pages/reference/stable-interfaces.md`（ja / en）の免責・保証文言が実態か。範囲に含まれる変更が触った面
  （CLI オプション、exit code、出力スキーマ、GitHub Action の inputs / outputs）について、
  規律 2 の使い捨て repo で実際に CLI を叩き、文書の「受理する / 拒否する / 順序を問わない」等の主張が成り立つかを exit code つきで確かめる。
- `pages/reference/*.md` の他のリファレンス（CLI reference 等）で、この範囲の PR が直した箇所の**近傍**に、同じ主張を無条件に書いた文が
  直し残っていないか。1 箇所直した PR は同じ文書の別段落を見落としやすい。
- semver: 契約の変更（受理範囲の縮小、出力の変更、既定値の変更）が Conventional Commits の type（fix / feat / BREAKING）と釣り合っているか。
- 移行情報: CHANGELOG.md と `gh release view <tag>` の本文に、利用者が知るべき変更が漏れていないか。
- bilingual parity: ja と en の該当ページ（`pages/**` と `pages/i18n/**` または `*.en.md`）で主張が一致しているか。
- GitHub Action 経路: `runners/github-action/` を経由したときも同じ契約が成り立つか（dist の再ビルド漏れを含む）。
- `.claude/commands/*.md` / `docs/**` に書かれた手順で、この範囲で挙動が変わったコマンドを使うものがあれば、
  その手順を実行して文書どおりの結果になるか確かめる（例: jq のフィルタが新しい入力形を落とさないか）。
```

#### 視点 C: 設計・テスト品質

```text
## 視点: 設計・テスト品質
この範囲で追加・変更されたテストが「何を守っていないか」を明らかにする。
- 自己整合テスト: テストが実装と同じ関数・同じ定数を import して期待値を作っていないか。
  その場合、実装を壊してもテストは緑のまま通る。期待値はリテラルまたは既存の別経路から取るべき。
- リポジトリ実体を期待値に固定したテスト（`docs/development/heuristic-detector-checklist.md` §7）:
  fixture ではなく実リポジトリのファイルや `git log` の結果を期待値にしていると、無関係な変更で落ちるか、逆に何も検出しない。
- 1 層内側を呼ぶテスト: テスト名は配線（CLI → ハンドラ → ライブラリ）を検査しているように読めるのに、
  実際にはライブラリ関数を直接呼んでいて、配線層（オプションの受け渡し、既定値の適用）が無検査になっていないか。
  疑わしければ規律 3 の worktree で配線層を 1 箇所壊し、テストが緑のままか確かめる。
- テストの pin 範囲: `tests/cli-usage-error-exit-codes.test.mjs` のような「受理形 / 拒否形」の pin に、
  この範囲で受理・拒否が変わった入力形の行が追加されているか（CLAUDE.md「Check what the previous change pinned」）。
- 設計: 新設した関数の責務が既存モジュールと重なっていないか、エラーメッセージが実装の内部事情を利用者に押し付けていないか。
```

3 本が返ったら、各出力末尾の「規律違反の自己申告」を先に読む。副作用の申告があれば `git status --short` で対象リポジトリの作業ツリーが汚れていないかを確認してから Step 3 に進む。

### Step 3. 統合と再現

3 本の finding を重大度順（blocker → major → minor）に 1 表へまとめ、同じ `file:line` または同じ原因を指す finding は 1 行に畳む（どの視点が出したかは列に残す）。

**採用する前に、各 finding のうち少なくとも 1 点はオーガナイザー自身が一次ソースで再現する。** 読み取り専用 agent は実行を捏造しないが、結論は間違える（CLAUDE.md「Verify agent completion reports」）。再現の最小単位:

- 文書の食い違い → `git show <to>:<file> | sed -n '<line>p'` で該当行を自分で読む
- 挙動の主張 → agent が書いた再現コマンドを、自分で `mktemp -d` の使い捨て repo で再実行し exit code を見る
- テストの検出力 → agent が壊した箇所と結果を読み、疑わしければ自分の worktree で 1 回だけ追試する

再現できなかった finding は表から落とさず「未再現」列に印を付けて残す。捨てるのはオーガナイザーが反証できたものだけである。

```markdown
<!-- 出力テンプレート -->

## 範囲レビュー結果: <from>..<to>（PR #… / #… / #…）

| #   | 重大度 | file:line | 内容 | 視点 | 再現 |
| --- | ------ | --------- | ---- | ---- | ---- |
| 1   | major  | …         | …    | B    | 済   |
```

### Step 4. disposition の提案

表の各行に対応を 1 つ付ける。**ここでは issue も PR も作らない。**

| 重大度  | 提案                                                                                                                                      |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| blocker | 即修正。修正 PR の scope（触るファイル、追加するテスト行）を 3 行で書く                                                                   |
| major   | フォローアップ issue。`/propose-issue` の型（既存実装の有無の確認結果 / 一次ソースの `file:line` / 対応候補とその検証状況）で本文案を書く |
| minor   | まとめて 1 つの issue にするか、記録のみ（本コマンドの出力に残す）かをオーガナイザーが選ぶ。既定は記録のみ                                |

major の本文案には、Step 3 で自分が再現したコマンドと結果を「一次ソース」として貼る（CLAUDE.md「Fact-check what you author」）。agent の出力を引き写さない。

### Step 5. 規律還流のチェック

Step 2 の自己申告、または Step 3 の再現中に見つけたワーカーの失敗（副作用・前提誤り・規律の抜け）を 1 行ずつ列挙し、それぞれについて `docs/development/worker-discipline-template.md` の「作業規律（厳守）」へ足すべき 1 行の候補を書く。該当が無ければ「還流なし」と明記する。ここでも編集は行わない。

## 判定

### A. PASS

条件: 3 本とも FINDINGS が 0 件、または全 finding をオーガナイザーが反証した。

対応: 3 本の「no-finding の根拠」を要約して報告する。反証した finding があれば、その反証手順も残す。

### B. FINDINGS

条件: 再現済み、または未再現のまま残った finding が 1 件以上ある。

対応: Step 3 の表、Step 4 の disposition 案、Step 5 の還流候補を報告し、実行（修正 PR / issue 作成）はユーザー確認のうえオーガナイザーが行う。

## 禁止事項

- 3 視点のいずれかを省略してはならない。2 回の実走（v1.99.2 / v1.99.3 の範囲）で major を出したのはいずれも視点 B であり、視点を減らすと再現性が落ちる
- 共通規律を省いたプロンプトで agent を起動してはならない（省いた 1 回目の実走で、読み取り専用のはずの agent が `skills import` により作業ツリーへ 141 件書き込んだ）
- agent の finding を再現せずに disposition 表へ載せてはならない
- 本コマンドから issue 作成・PR 作成・コメント投稿を行ってはならない。起動した agent にも行わせない
- 範囲に無い変更への指摘を採用してはならない

## なぜこのコマンドが必要か

2026-09-04..05 のセッションで、リリース単位の範囲レビューを 2 回実施した。2 回とも、per-PR レビュー 2 本と PlanGate を通過した PR 群から **major** を検出している（v1.99.2: `--base` の免責文言が実態と逆、v1.99.3: doc の無条件文の直し残しと `/merge-check` の jq が queued run を落とす）。per-PR レビューは PR 単独の正しさしか見ないため、複数 PR が同じ概念を触った結果や、文書の別段落に残った古い主張は、範囲を 1 つにして初めて見える。

一方で、毎回プロンプトを手で書いていたため、規律（CLI は使い捨て repo で、変異注入は戻す、主張は実測で）を書き漏らすと事故になる。1 回目の実走では読み取り専用のはずの agent が対象リポジトリ内で CLI を実行し、作業ツリーへ 141 件のファイルを書き込んだ。`/merge-check` / `/verify-agent-report` と同じく、視点と規律をテンプレートとして固定し、毎回同じ手順で走らせるために 1 コマンド化した。
