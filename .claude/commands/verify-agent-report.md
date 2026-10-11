---
description: background 実装エージェントの完了報告 (branch / PR / commit / ファイル) が実在するか親側で検証する
argument-hint: '<branch name> [PR number] [commit SHA] [key files]'
allowed-tools: Bash(scripts/verify-agent-report.sh:*), Bash(git ls-remote:*), Bash(git fetch:*), Bash(git log:*), Bash(git show:*), Bash(git worktree:*), Bash(gh pr view:*), Bash(gh api:*), Bash(ls:*), Bash(npm test:*), Bash(npm run:*)
---

エージェント完了報告の検証: 「$ARGUMENTS」で報告された branch / PR / commit / ファイルが実在するか、親セッション側のコマンド実行で裏取りする。

このスキルは background 実装エージェントの完了報告を受け取った直後、その成果を merge・レビュー・次タスクの前提として**採用する前**に呼び出すことを想定している。報告の文面がどれほど具体的でも（PR 番号・テスト件数・コマンド出力ブロック付きでも）、報告品質は実行の証拠にならない。全項目を実コマンドで検証して判定まで行う。

## 前提

以下のシグナルがあれば `/verify-agent-report` を先に実行する:

- background 実装エージェントから「PR 作成済み」「commit 済み」「テスト green」の完了報告を受けた
- エージェント報告の branch / PR 番号を使って merge・rebase・レビューを始めようとしている
- 報告に「実コマンド出力」ブロックが含まれている（これも捏造され得る — 2026-07-02 セッションで 4 回観測）

read-only の調査・レビューエージェントの報告はこの failure mode を示していないため対象外。ただし成果物 (branch / PR / ファイル) を伴う報告は常に対象とする。

## 検証手順

報告から branch 名・PR 番号・commit SHA・主要ファイルを抽出し、以下を順に実行する。

### Step 0. script で Step 1〜4 を一括実行する

```bash
scripts/verify-agent-report.sh [--worktree <path>] <branch> [PR|-] [SHA|-] [files...]
```

Step 1〜4 を実行し、項目ごとの PASS / FAIL 表と `VERDICT` を出す。exit 0 は PASS、exit 1 は FABRICATION_SUSPECTED、exit 64 は引数誤りを表す。PR の読み取り失敗は gh アカウントの切り替わりでも起こるため、FAIL が `pr` 行だけなら `gh api user --jq .login` を確認してから再実行する。script が使えない場合は以下の Step 1〜4 を手で実行する。Step 5 は script の対象外である。

`WARN` は FABRICATION_SUSPECTED に数えない。報告された SHA が branch / PR の先端ではないが、先端の祖先である場合に `branch-head` と `pr` 行が `WARN tip advanced` になる。bot の dist push などで先端が進んだ状態で、`commit` 行が PASS なら報告は実在する。SHA が branch に無い場合は従来どおり FAIL である。SHA は大文字でも受け付ける。`git fetch` が失敗すると `commit` 行が FAIL になり、祖先関係とファイルは未確認のまま残る。

### Step 1. branch の実在確認

```bash
git ls-remote --exit-code --heads origin refs/heads/<branch>
```

**重要**: `--exit-code` を必ず付ける。素の `git ls-remote` は ref が存在しなくても空出力で exit 0 を返すため、`&&` 連鎖では不在を検出できない。exit 2 なら branch は存在しない → 即 FABRICATION_SUSPECTED。

### Step 2. PR の実在と head SHA の一致確認 (PR 番号が報告されている場合)

```bash
gh pr view <N> --json url,state,headRefOid
```

- PR が 404 → 捏造疑い
- `headRefOid` が報告された commit SHA と一致するか確認（先頭 7 桁の前方一致で可）
- `url` のリポジトリが作業対象リポジトリと一致するか確認（別リポジトリの実在 PR 番号を流用する捏造パターンがある）

### Step 3. commit SHA の branch 上の実在確認

```bash
git fetch origin <branch> && git log --oneline -5 FETCH_HEAD
```

報告された commit SHA が出力に含まれるか目視確認。含まれない場合は `git log --oneline -20 FETCH_HEAD` まで広げてから判定する。

### Step 4. 報告ファイルの実在確認

```bash
git show <commit SHA> --stat  # SHA 未報告の場合のみ FETCH_HEAD で代用
```

**重要**: commit SHA が報告されている場合は FETCH_HEAD でなく報告 SHA を直接指定する。FETCH_HEAD は branch 先頭であり、報告 SHA と別 commit を検証してしまうと一致確認にならない。報告された新規・変更ファイルが `--stat` の出力に全て含まれるか突合する。エージェント worktree が残っている場合は `ls <worktree>/<key file>` でも補強できる。

### Step 5. テスト実行主張の再実行 (テスト green の主張がある場合)

報告に「テスト N 件 pass」「lint green」等の主張がある場合、その検証コマンドを**最低 1 つ親側で再実行**する:

```bash
git fetch origin <branch>
git worktree add --detach /tmp/verify-agent-report-<branch> FETCH_HEAD
cd /tmp/verify-agent-report-<branch> && npm test  # 報告された検証コマンドをそのまま実行
```

**重要**: 親セッションの作業ツリーで `git switch --detach` してはならない。ダーティツリーと衝突し「Commit before branch switches」ガードに抵触する。`git worktree add --detach` で独立した検証用 worktree を作り、検証後に掃除する:

```bash
git worktree remove /tmp/verify-agent-report-<branch>
```

実行できない事情がある場合は「未検証」として判定に明記し、pass 扱いにしない。

## 判定

### A. PASS — 報告採用可能

条件: Step 1〜4 が全て一致し、Step 5（該当時）が再現した。

対応: 検証結果（branch SHA / PR URL / 一致確認したファイル数）を添えて報告を採用し、次工程（レビュー・マージ判断）へ進む。

### B. FABRICATION_SUSPECTED — 捏造疑い

条件: Step 1〜5 のいずれか **1 つでも**不一致（branch 不在 / PR 404 / SHA 不一致 / ファイル欠落 / テスト再現失敗）。

対応（CLAUDE.md「Verify agent completion reports」ガードの方針に従う）:

1. 不一致項目と実コマンド出力を提示し、報告を**採用しない**
2. 当該エージェントに**1 回だけ**是正の再指示を送る（不一致項目を具体的に列挙する）
3. 再指示後も捏造が再発したら、そのエージェントへの再委譲をやめ、タスクをインラインで引き取るか新規エージェントを起動する

## 禁止事項

- 報告の文面・具体性・「実出力」ブロックを検証の代替にしてはならない
- Step 1 で `--exit-code` を省略してはならない（不在でも exit 0 になる）
- 1 項目でも不一致のまま merge・レビュー・次タスクの前提に採用してはならない
- 捏造疑いのエージェントへ是正指示を 2 回以上繰り返してはならない（1 回で再発したら引き上げる）

## なぜこのスキルが必要か

2026-07-02 のセッションで、background 実装エージェントが完了報告を丸ごと捏造する事故を 4 回観測した。もっともらしい PR 番号・テスト件数・commit hash に加え、偽の「実コマンド出力」ブロックまで含まれていた。CLAUDE.md の AI Misoperation Guards「Verify agent completion reports」に散文で codify したが、報告受領のたびに能動参照される保証がないため、**実行可能な決定論チェックリストとして強制**する必要があると判断した。
