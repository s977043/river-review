---
description: docs/governance.md の「マージ前チェックリスト」を PR 番号 1 つに対して実行し、MERGE_OK / BLOCKED を判定する
argument-hint: '<PR number>'
allowed-tools: Bash(gh pr checks:*), Bash(gh pr view:*), Bash(gh pr diff:*), Bash(gh pr edit:*), Bash(gh issue view:*), Bash(gh api:*), Bash(git fetch:*), Bash(git log:*), Bash(npm run check:comment-disposition:*)
---

マージ前チェック: PR #$ARGUMENTS が `gh pr merge` 可能な状態か、`docs/governance.md` § 「PR レビューとマージ」>「マージ前チェックリスト」(SSoT) の全項目を実コマンドで検証して判定する。

このスキルは `gh pr merge` を実行する **直前** に呼び出すことを想定している。抽象的な確認でなく、以下の検証コマンドを実際に実行して MERGE_OK / BLOCKED の判定まで行う。詳細な背景・pagination の落とし穴・disposition ルールの正は `docs/governance.md` にあり、本コマンドは実行手順の具体化のみを担う。

## 検証手順

### Step 1. CI green の確認

```bash
gh pr checks $ARGUMENTS --json name,bucket,startedAt --jq 'group_by(.name) | map(if any(.[]; .bucket == "pending") then (map(select(.bucket == "pending")) | first) else max_by(.startedAt) end) | .[] | select(.bucket != "skipping")'
```

- 全チェックが `pass` バケットであることを確認する（`skipping` は除外可）
- `group_by(.name)` 以降は同名 check のうち `pending` があればそれを、無ければ `startedAt` が最新の run を残す。queued の run は `startedAt` がゼロ時刻（`0001-01-01T00:00:00Z`）で並ぶため、`max_by` だけでは古い `cancel` / `pass` を最新と誤って採り、`pending` を隠す。`gh pr checks` は同じ head に対する全 run（concurrency で `cancel` された古い run を含む）を並べるため、これが無いと再実行済みの `cancel` を `fail` と読む（2026-09-04..05 に 3 回発生）
- `pending` が残る場合はマージせず、完了まで待ってから再実行する
- `fail` がある場合はマージ不可。pre-existing の main 失敗でも本 PR を直接マージせず、先に main を green に戻す（governance.md § 1 参照）

### Step 2. レビュアーコメントの全件列挙と disposition 確認

**2 つのエンドポイントを両方実行する。** `pulls/<N>/comments` は line comments（差分の行に紐づくレビューコメント）しか返さず、PR 本体に投稿された通常コメント（issue comment）は `issues/<N>/comments` からしか取得できない。

まず、列挙そのものはスクリプトで実行する。2 系統の `--paginate` 取得と bot の切り分けを決定論で行い、disposition の作業リストを出力する（refs #1827）。

```bash
npm run check:comment-disposition -- $ARGUMENTS
```

- 終了コード 0 = 人間由来のコメントなし（Step 2 は pass）、1 = 人間由来のコメントあり（出力された各件の disposition を確定するまで pass にしない）、2 = 使い方の誤りまたは `gh` の失敗
- exit 1 は「マージ禁止」ではなく「確認せよ」を意味する。disposition 済みかどうかをスクリプトは判定しない（判定できないため。理由は下記「なぜスクリプトは disposition の完了まで見ないか」）
- 人間 / bot の切り分けは GitHub API の `user.type`（`Bot` / `User`）で行い、bot 名の除外リストは持たない。ただし PAT で動く自動化は `user.type: "User"` を返すため、bot が人間として列挙されることがある。その場合は投稿者名で判断する
- スクリプトが `gh` の失敗などで exit 2 になった場合は、下記の生コマンドへフォールバックする

生コマンド（スクリプトが使えない場合、または本文全体を読みたい場合）:

```bash
gh api --paginate "repos/:owner/:repo/pulls/$ARGUMENTS/comments?per_page=100" \
  --jq '.[] | {id, in_reply_to_id, user: .user.login, path, line, commit: .commit_id, body}'
```

```bash
gh api --paginate "repos/:owner/:repo/issues/$ARGUMENTS/comments?per_page=100" \
  --jq '.[] | {id, user: .user.login, created_at, body}'
```

- `--paginate` は両方で必須である（デフォルトは 1 ページ 30 件で打ち切られ、多コメント PR で見落としが発生する）
- `per_page=100` は URL クエリに直接埋め込む（`-F per_page=100` は verb が POST になり HTTP 422 が返る）
- `--jq` に `.user.login` を含めるのは必須である。issue comments には `gemini-code-assist[bot]` / `vercel[bot]` / `github-actions[bot]` の定型コメントが混ざるため、投稿者で bot の定型と人間レビュアーの指摘を切り分ける
- 列挙した各コメントについて disposition を 1 つずつ確定する:
  1. 追従コミットで適用済み
  2. 不適用（reply で理由を明記済み、または bot 自身が resolved 宣言済み）
  3. follow-up Issue で追跡（Issue 番号を reply に明記）
- disposition 未確定のコメントが 1 件でも残る場合はマージ中止。詳細は governance.md § 「レビュアーコメントの扱い」を参照

#### なぜスクリプトは disposition の完了まで見ないか

スクリプトが担うのは「確認すべきコメントの全件列挙」までであり、各件が処理済みかは判定しない。返信や reaction の有無で処理済みと見なす方式は、「返信したが対応していない」を見逃し、逆に「返信不要な賛辞コメント」を未処理として誤検出する。`pulls/<N>/reviews` の `state`（`CHANGES_REQUESTED`）も、レビュアーと PR オーサーが同一アカウントの体制では formal review 自体が使えないため機能しない（Step 4 と governance.md § 2.1 を参照）。

同じ理由でこのチェックは CI の必須チェックにしていない。人間のコメントが 1 件付いた時点で恒久的に落ちる gate になり、`docs/development/improvement-flow.md` が求める「止めるべきでないものを止めない」を満たせないためである。

### Step 3. マージ阻止ラベルの確認

```bash
gh pr view $ARGUMENTS --json labels --jq '[.labels[].name]'
```

- `blocked` など、マージ阻止を意図したラベルが 1 つでも付いていればマージ中止である
- レビュアーと PR オーサーが同一アカウントの場合、GitHub の formal review（Request changes）を使えない。この体制ではラベルと通常コメントが唯一のマージ阻止手段であり、ラベルは Request changes と同等の重みを持つ
- 阻止ラベルを外すのは指摘した側である。マージする側が対応完了を自己判断して外してはならない

### Step 4. review state の確認

```bash
gh pr view $ARGUMENTS --json reviews,reviewDecision --jq '{reviewDecision, reviews: [.reviews[] | {author: .author.login, state}]}'
```

- `gemini-code-assist[bot]` / `Copilot` は非同期で review を投稿するため、PR 作成直後は review 未着の可能性がある。着弾を待ってから Step 2 を再実行する
- review state はレビュー単位のサマリであり、これ単体でマージ可否を判断してはならない（`reviewDecision` が空でもコメントが存在し得る）
- レビュアーと PR オーサーが同一アカウントの場合、`reviewDecision` は常に空になる。Step 2 と Step 3 の結果で判断する

### Step 5. dist freshness の確認（該当 PR のみ）

```bash
gh pr diff $ARGUMENTS --name-only | grep '^runners/github-action/src/' || echo "not applicable"
```

- `runners/github-action/src/**` を触らない PR はこの Step をスキップする
- 該当する場合、`.nvmrc` の Node バージョンで `npm run build:action` 済みであることを確認する。Step 1 で `Action dist freshness` チェックが green ならビルド済みとみなしてスキップ可
- 失敗時のトラブルシュートは `docs/development/dist-check-rebuild-guide.md` を参照

### Step 6. PR 本文の closing keyword 確認

squash merge では **PR 本文**の closing keyword（`closes` / `fixes` / `resolves` + issue 番号）が効き、マージと同時に該当 issue が close される。コミット本文に `refs #N` と書いてあっても、PR 本文が `closes #N` なら閉じる。

```bash
gh api "repos/:owner/:repo/pulls/$ARGUMENTS" --jq .body | grep -i 'closes\|fixes\|resolves'
```

grep はコードブロックや引用の中の言及も拾うため、ヒットしても実際に紐付いているとは限らない。ヒットした場合は、GitHub が実際に close 対象として解決した issue を確認する。

```bash
gh api graphql -f query='query($o:String!,$r:String!,$n:Int!){repository(owner:$o,name:$r){pullRequest(number:$n){closingIssuesReferences(first:20){nodes{number title state}}}}}' \
  -F o=:owner -F r=:repo -F n=$ARGUMENTS --jq '.data.repository.pullRequest.closingIssuesReferences.nodes'
```

- `-F o=:owner` / `-F r=:repo` のプレースホルダは `gh api graphql` でも現在のリポジトリへ展開される（本 PR で #1830 に対して実行し、`[{"number":1827}]` が返ることを確認済み）
- 空配列ならこの Step は pass。1 件以上返った場合は、下記の基準で **それぞれが「閉じてよい issue」か**を判定する

#### 閉じてよい issue かの判定基準

列挙するだけでは素通りする。返ってきた issue ごとに `gh issue view <issue番号>` で本文を読み、次の 3 点を確認する。**1 つでも該当すれば「閉じてはいけない issue」**である。

1. **その PR のスコープが issue の全体をカバーしていない** — issue が要求する変更のうち、この PR に入っていないものがある
2. **Epic / 追跡用 issue である** — 複数 PR にまたがる傘 issue、または他 issue を子として持つもの。この種は最後の子 PR がマージされたあとに人間が閉じる
3. **本文に未完了のチェックボックス（`- [ ]`）または「残り」「follow-up」「後続」等の記述がある**

判定が付かない場合は「閉じてはいけない」側に倒す。誤って開けたままにするのは後から閉じられるが、事故で閉じた issue は「判断して閉じた」記録との区別が付かなくなる。

#### 閉じてはいけない issue がある場合

マージの前に PR 本文を書き換え、closing keyword を非 closing の語（`refs`）へ変える。

```bash
gh pr edit $ARGUMENTS --body "$(gh api "repos/:owner/:repo/pulls/$ARGUMENTS" --jq .body | sed 's/closes \[#/refs [#/g')"
```

- 実際の本文の書式（`closes [#N](URL)` / `Closes #N` 等）を確認してから置換対象を決める。上の `sed` は release-please が生成する `closes [#N](...)` 形式に対する例である
- 書き換え後、上記 GraphQL を再実行して `closingIssuesReferences` が空になったことを確認してからマージへ進む

release-please が生成するリリース PR は、コミット本文が `refs #N` でも PR 本文では `closes [#N]` へ変換される。**リリース PR ではこの Step が必ず該当する**ため省略してはならない（`/release-kick` の Step 7 からも本 Step を参照している）。

### Step 7. 複数 PR 並行時の追加確認

複数 PR を連続マージする作業の一部としてこのコマンドを実行している場合:

- `/preflight <PR numbers>` で対象 PR が obsolete / 並行作業中でないことを先に検証する
- `/plan-merge-order <PR numbers>` でマージ順序を事前計画する（本 PR がその順序の先頭であることを確認する）

### Step 8. strict mode の注意

branch protection が `strict: true` の場合（このリポジトリの main は該当）、PR が最新 main よりも遅れているとマージできない。

```bash
gh api "repos/:owner/:repo/pulls/$ARGUMENTS" --jq '{mergeable_state}'
```

- `behind` なら `gh api "repos/:owner/:repo/pulls/$ARGUMENTS/update-branch" -X PUT` で更新する。**CI が再実行されるため Step 1 からやり直す**
- update-branch の 422 (lock-file conflict) は新 PR を作らず、ローカルで `git merge origin/main` → `npm install --package-lock-only` → merge commit → 通常 push（fast-forward なので force 不要）で解消する（`/plan-merge-order` の strict mode 節を参照）

## 判定

### A. MERGE_OK

条件: Step 1〜6 が全て pass（Step 5 は該当時のみ）、Step 7〜8 の該当事項なし。

対応: 各 Step の確認結果（CI チェック数 / 2 エンドポイントのコメント件数と disposition / ラベル一覧 / review state / closing keyword で閉じる issue の一覧と可否判定）を添えて報告し、`gh pr merge` に進んでよい。

### B. BLOCKED

条件: いずれかの Step で未達がある。

対応: BLOCKED の理由を Step 番号付きで**全件列挙**し（最初の 1 件で打ち切らない）、それぞれの解消アクション（fix commit / reply / follow-up Issue / update-branch / CI 待ち）を提示する。解消後に本コマンドを再実行する。

## 禁止事項

- Step を省略したまま MERGE_OK と判定してはならない
- `--paginate` なしの列挙結果で「コメントなし」と判定してはならない
- `pulls/<N>/comments` だけ、または `issues/<N>/comments` だけの列挙結果で「指摘なし」と判定してはならない
- review state（`reviewDecision`）のみでコメントの確認を省略してはならない
- disposition 未確定のコメントを残したまま `gh pr merge` に進んではならない
- 阻止ラベルが付いたまま `gh pr merge` に進んではならない。マージする側がラベルを外して進めることも禁止である
- closing keyword が閉じる issue を確認しないまま `gh pr merge` に進んではならない。リリース PR でもこの Step を省略してはならない
- 本コマンドの手順と governance.md が食い違う場合、governance.md を正としてこちらを修正する

## なぜこのスキルが必要か

マージ前チェックリスト（CI green / コメントの全件 disposition / 阻止ラベル / preflight / dist Node 整合）は `docs/governance.md` に SSoT として整備されたが、完全手動運用のため実行漏れが起きやすい。レビュアーコメントは CI を失敗させないため見落とされ、`--paginate` 忘れによる部分列挙も観測されている。2026-08-04 には PR #1746 で `pulls/<N>/comments` のみを列挙して 0 件だったため「指摘なし」と判定し、`issues/<N>/comments` にあった指摘 3 件と `blocked` ラベルを見落としてマージ、v1.72.0 で回帰をリリースした。`/preflight` / `/verify-agent-report` と同様に、**実行可能な決定論チェックリストとして 1 コマンド化**することで、マージのたびに確実に全項目を通す。

2026-08-12 には Issue #1827 が release PR #1830 のマージで自動 close された。閉じる判断は誰もしていない。コミット本文は `refs #1827` だったが、release-please が PR 本文を `closes [#1827]` としてレンダリングしていた。当時この確認手順はセッションを跨がない carry-over 台帳にしかなく、`/merge-check` にも `/release-kick` にも存在しなかった。Step 6 はこの再発防止である（`docs/development/retrospectives/2026-08-12.md` の O5 が SSoT）。
